/**
 * Cinderwake 真实油猴脚本端到端模拟测试
 *
 * 加载 cinderwake-zh.user.js 并注入由 fake-dom-tree.js 提供的沙箱环境，
 * 验证：
 * 1. document.documentElement.lang 变为 zh-Hans，document.title 被汉化
 * 2. 静态现有 DOM 树全量汉化（UI 按钮、专有名词、装备文案、图鉴长描述）
 * 3. 占位符数值插值匹配（如 "+15% move speed" -> "+15% 移动速度"）
 * 4. Stoker 人称变体与装备词条映射（如 "The lantern she set out with." 和 Stoker Firebox 变体）
 * 5. MutationObserver 监听动态插入（模拟 #hud 动态弹出技能卡、Codex 图鉴弹窗、小贴士切换）
 * 6. 安全排除项（<script>, <style>, <canvas>, .notranslate 不受侵入）
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createFakeEnvironment } from "./fake-dom-tree.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptSource = readFileSync(resolve(__dirname, "../cinderwake-zh.user.js"), "utf8");

// 剔除油猴元数据头后转为可在沙箱中执行的函数
const cleanCode = scriptSource.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/, "");

describe("Cinderwake User Script End-to-End Tests", () => {
  let env;
  let document;
  let window;

  function runScript() {
    const fn = new Function("window", "document", "MutationObserver", cleanCode);
    fn(window, document, window.MutationObserver);
  }

  beforeEach(() => {
    env = createFakeEnvironment();
    document = env.document;
    window = env.window;
  });

  describe("1. 文档元数据汉化", () => {
    test("更新 document.title 与 html lang", () => {
      document.title = "Cinderwake – Free Browser Survivors Action RPG";
      document.documentElement.lang = "en";

      runScript();

      assert.equal(document.documentElement.lang, "zh-Hans");
      assert.ok(document.title.includes("免费网页版肉鸽幸存者 ARPG"));
    });
  });

  describe("2. 静态 DOM 节点全量翻译", () => {
    test("UI 菜单与按钮翻译", () => {
      const container = document.createElement("div");
      container.id = "menu";

      const btn1 = document.createElement("button");
      btn1.textContent = "Settings";
      const btn2 = document.createElement("button");
      btn2.textContent = "Resume";
      const btn3 = document.createElement("button");
      btn3.textContent = "Abandon Run";
      const btn4 = document.createElement("button");
      btn4.textContent = "Select Character";

      container.appendChild(btn1);
      container.appendChild(btn2);
      container.appendChild(btn3);
      container.appendChild(btn4);
      document.body.appendChild(container);

      runScript();

      assert.equal(btn1.textContent, "设置");
      assert.equal(btn2.textContent, "继续游戏");
      assert.equal(btn3.textContent, "放弃本次游戏");
      assert.equal(btn4.textContent, "选择角色");
    });

    test("装备与图鉴长文案翻译", () => {
      const gearCard = document.createElement("div");
      gearCard.className = "gear-card";

      const nameEl = document.createElement("h3");
      nameEl.textContent = "Gravewick Lantern";
      const descEl = document.createElement("p");
      descEl.textContent = "Kills leave a soul-wisp that drifts to the nearest foe and ignites it.";

      gearCard.appendChild(nameEl);
      gearCard.appendChild(descEl);
      document.body.appendChild(gearCard);

      runScript();

      assert.equal(nameEl.textContent, "墓芯提灯");
      assert.equal(descEl.textContent, "击杀敌人会留下一缕游魂，飘向最近的敌人并将其点燃。");
    });
  });

  describe("3. 占位符模式与动态数值插值", () => {
    test("单参数与多参数百分比插值", () => {
      const p1 = document.createElement("div");
      p1.textContent = "+15% move speed";
      const p2 = document.createElement("div");
      p2.textContent = "+30% pickup range";

      document.body.appendChild(p1);
      document.body.appendChild(p2);

      runScript();

      assert.equal(p1.textContent, "+15% 移动速度");
      assert.equal(p2.textContent, "+30% 拾取范围");
    });

    test("HUD 动态文案、角色状态与多行帮助文本翻译", () => {
      const kills = document.createElement("div");
      kills.textContent = "Kills 11075";

      const bossTimer = document.createElement("div");
      bossTimer.textContent = "The Hollow Warden in 1:34";

      const titleLine = document.createElement("p");
      titleLine.textContent = "Playing as The Emberwright · Difficulty: Medium";

      const keepButton = document.createElement("button");
      keepButton.textContent = "Keep The Emberwright";

      const beginButton = document.createElement("button");
      beginButton.textContent = "Begin";

      const help = document.createElement("p");
      help.textContent = "WASD / arrows to move. Your skills cast on their own.\nLevel up to learn new ones. Esc to pause, C for your kit, K for the codex.";

      for (const el of [kills, bossTimer, titleLine, keepButton, beginButton, help]) {
        document.body.appendChild(el);
      }

      runScript();

      assert.equal(kills.textContent, "击杀 11075");
      assert.equal(bossTimer.textContent, "空洞守卫 还有 1:34");

      // 暖炉双段属性与高阶罗马数字升级测试
      const hearthStat = document.createElement("div");
      hearthStat.textContent = "+29% damage → +31% damage";
      document.body.appendChild(hearthStat);

      const hearthRoman = document.createElement("div");
      hearthRoman.textContent = "Vitality VII";
      document.body.appendChild(hearthRoman);

      const hearthUpgrade = document.createElement("div");
      hearthUpgrade.textContent = "Upgrade Vitality VII needed 105 Cinders";
      document.body.appendChild(hearthUpgrade);

      // 结算复杂嵌套与单位测试
      const settlement = document.createElement("div");
      settlement.textContent = "Survived 23:19 · Level 61 · 16111 kills · Medium Total damage 3,259,026 · 2.33k per second";
      document.body.appendChild(settlement);

      runScript();

      assert.equal(hearthStat.textContent, "+29% 伤害 → +31% 伤害");
      assert.equal(hearthRoman.textContent, "生命力 VII");
      assert.equal(hearthUpgrade.textContent, "升级 生命力 VII 还需 105 余烬");
      assert.equal(settlement.textContent, "生存 23:19 · 等级 61 · 击杀 16111 · 普通 总伤害 3,259,026 · 每秒 2.33k");
      assert.equal(titleLine.textContent, "当前角色：灰烬使者 · 难度：普通");
      assert.equal(keepButton.textContent, "保留灰烬使者");
      assert.equal(beginButton.textContent, "开始游戏");
      assert.equal(
        help.textContent,
        "WASD / 方向键移动。技能会自动施放。\n升级可学习新技能。Esc 暂停，C 打开装备，K 打开图鉴。"
      );
    });
  });

  describe("4. 人称代词变体与司炉工装备变体映射", () => {
    test("通用装备在 Stoker 下的 Firebox 和代词变体翻译一致", () => {
      // 灰烬使者提灯版本
      const el1 = document.createElement("div");
      el1.textContent = "Gravewick Lantern";
      // 司炉工火箱变体
      const el2 = document.createElement("div");
      el2.textContent = "Gravewick Firebox";

      // 灰烬使者人称描述 (her)
      const el3 = document.createElement("div");
      el3.textContent = "Every 100 shards collected, a golden pulse pulls every shard to her.";
      // 司炉工人称描述 (him)
      const el4 = document.createElement("div");
      el4.textContent = "Every 100 shards collected, a golden pulse pulls every shard to him.";

      document.body.appendChild(el1);
      document.body.appendChild(el2);
      document.body.appendChild(el3);
      document.body.appendChild(el4);

      runScript();

      assert.equal(el1.textContent, "墓芯提灯");
      assert.equal(el2.textContent, "墓芯火箱");
      assert.equal(el3.textContent, "每收集 100 枚晶片，释放一道金色脉冲将所有晶片吸附过来。");
      assert.equal(el4.textContent, "每收集 100 枚晶片，释放一道金色脉冲将所有晶片吸附过来。");
    });
  });

  describe("5. MutationObserver 动态插入节点响应", () => {
    test("高塔播报和技能卡更新后保留动态数值并转为中文", () => {
      runScript();
      const banner = document.createElement("p");
      banner.textContent = "A Turnkey: it steals your shards. Kill it to get them back";
      document.body.appendChild(banner);
      assert.match(banner.textContent, /狱吏.*碎片/);

      banner.firstChild.nodeValue = "Hurls 3 bolts at the nearest foes for 22 damage.";
      assert.match(banner.textContent, /3 枚飞弹.*22 点伤害/);

      banner.textContent = "Tap its button to roll the way you're heading. Nothing touches him as he goes. Every 8.0s.";
      assert.match(banner.textContent, /翻滚.*无敌.*8\.0 秒/);

      banner.textContent = "Q: roll towards the cursor. Nothing touches him as he goes. Every 8.0s.";
      assert.match(banner.textContent, /^Q：.*翻滚.*8\.0 秒/);
    });

    test("汉化动态反馈占位提示，不修改输入值和排除区的属性", () => {
      runScript();
      const feedback = document.createElement("textarea");
      feedback.setAttribute("placeholder", "What happened? What were you doing when it did?");
      feedback.value = "Settings";
      document.body.appendChild(feedback);
      assert.match(feedback.getAttribute("placeholder"), /发生了什么/);
      feedback.setAttribute("placeholder", "What would you like to see?");
      assert.match(feedback.getAttribute("placeholder"), /改进/);
      assert.equal(feedback.value, "Settings");

      const excluded = document.createElement("div");
      excluded.className = "notranslate";
      const input = document.createElement("input");
      input.setAttribute("title", "Settings");
      excluded.appendChild(input);
      document.body.appendChild(excluded);
      assert.equal(input.getAttribute("title"), "Settings");
      input.setAttribute("title", "Sound Density");
      assert.equal(input.getAttribute("title"), "Sound Density");
    });

    test("脚本初始化后动态向 #hud 插入弹窗，能自动被即时翻译", () => {
      const hud = document.createElement("div");
      hud.id = "hud";
      document.body.appendChild(hud);

      runScript();

      // 动态插入弹窗
      const dialog = document.createElement("div");
      dialog.className = "modal";

      const title = document.createElement("h2");
      title.textContent = "The Hearth";

      const btnRefund = document.createElement("button");
      btnRefund.textContent = "Refund all";

      const stat = document.createElement("span");
      stat.textContent = "+20% move speed";

      const tip = document.createElement("p");
      tip.textContent = "Ranking up a skill you already have often beats learning a new one.";

      dialog.appendChild(title);
      dialog.appendChild(btnRefund);
      dialog.appendChild(stat);
      dialog.appendChild(tip);

      hud.appendChild(dialog);

      assert.equal(title.textContent, "暖炉");
      assert.equal(btnRefund.textContent, "重置所有升级");
      assert.equal(stat.textContent, "+20% 移动速度");
      assert.equal(tip.textContent, "集中升级已有的技能，往往比盲目学习新技能更为有效。");
    });
  });

  describe("6. 排除项保护", () => {
    test("脚本不修改 script, style, canvas 或 notranslate 容器", () => {
      const script = document.createElement("script");
      script.textContent = "const Settings = 'Settings';";

      const style = document.createElement("style");
      style.textContent = ".Settings { color: red; }";

      const safeBox = document.createElement("div");
      safeBox.className = "notranslate";
      const inner = document.createElement("span");
      inner.textContent = "Settings";
      safeBox.appendChild(inner);

      document.body.appendChild(script);
      document.body.appendChild(style);
      document.body.appendChild(safeBox);

      runScript();

      assert.equal(script.textContent, "const Settings = 'Settings';");
      assert.equal(style.textContent, ".Settings { color: red; }");
      assert.equal(inner.textContent, "Settings");
    });
  });
});

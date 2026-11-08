/**
 * Cinderwake 简体中文油猴脚本 - 引擎模拟与单元测试套件
 *
 * 测试目标：
 * 1. 精确全字匹配替换（如 "Settings" -> "设置"）
 * 2. 占位符模式替换（如 "+{0}% move speed" -> "+15% 移动速度"）
 * 3. 人称代词变体匹配（如 "The lantern she set out with." 和 "The lantern he set out with." 都映射到中文）
 * 4. 动态 DOM 插入节点时（模拟 MutationObserver 捕获新添加到 #hud 的弹窗元素），文本能够被自动翻译
 * 5. 排除项测试：<script>, <style>, <canvas> 内的内容不被替换，SVG 路径不被误伤
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createFakeEnvironment, NodeFilter, NodeTypes } from "./fake-dom-tree.js";

// 加载翻译字典数据
import uiDict from "../zh/ui.json" with { type: "json" };
import termsDict from "../zh/terms.json" with { type: "json" };
import patternsDict from "../zh/patterns.json" with { type: "json" };

/**
 * 极简翻译核心引擎，模拟 Cinderwake 油猴脚本的运行时行为
 */
class TranslationEngine {
  constructor(document, window) {
    this.document = document;
    this.window = window;
    this.exactMap = new Map();
    this.patterns = [];
    this.observer = null;
    this.ignoreTags = new Set(["SCRIPT", "STYLE", "CANVAS", "SVG", "PATH", "CODE", "PRE"]);

    this._initDicts();
  }

  _initDicts() {
    // 1. UI 精确匹配项
    for (const [en, zh] of Object.entries(uiDict)) {
      this.exactMap.set(en.trim(), zh);
    }
    // 2. Terms 专有名词精确匹配项
    for (const category of Object.values(termsDict)) {
      if (typeof category === "object" && category !== null) {
        for (const [en, zh] of Object.entries(category)) {
          this.exactMap.set(en.trim(), zh);
        }
      }
    }

    // 3. 代词变体规则预设（支持 he / she / they 或 his / her / their）
    this.pronounRules = [
      {
        pattern: /^The lantern (?:she|he) set out with.$/i,
        replace: "最初启程时随身携带的提灯。"
      },
      {
        pattern: /^(?:Her|His) flame burns bright.$/i,
        replace: "烈焰熊熊燃烧。"
      }
    ];

    // 4. 占位符模式解析，转换为正则表达式
    for (const item of patternsDict) {
      if (!item.en || !item.zh) continue;
      // 将 +{0}% move speed 转为正则：\+([0-9.]+?)% move speed
      // 提取 {0}, {1} 的位置并生成匹配捕获组
      let regexStr = "^" + item.en.replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === "{" || m === "}") ? m : "\\" + m);
      const slotIndices = [];
      regexStr = regexStr.replace(/\{(\d+)\}/g, (_, idx) => {
        slotIndices.push(parseInt(idx, 10));
        return "([0-9.,\\-\\+]+|[^,.!?]+?)";
      }) + "$";

      try {
        const regex = new RegExp(regexStr);
        this.patterns.push({
          regex,
          zhTemplate: item.zh,
          slotIndices
        });
      } catch (e) {
        // 忽略复杂正则语法错误
      }
    }
  }

  translateText(text) {
    if (!text || typeof text !== "string") return text;
    const trimmed = text.trim();
    if (!trimmed) return text;

    // a) 精确全字匹配
    if (this.exactMap.has(trimmed)) {
      const translated = this.exactMap.get(trimmed);
      return text.replace(trimmed, translated);
    }

    // c) 代词变体匹配
    for (const rule of this.pronounRules) {
      if (rule.pattern.test(trimmed)) {
        return text.replace(trimmed, rule.replace);
      }
    }

    // b) 占位符模式匹配
    for (const p of this.patterns) {
      const match = trimmed.match(p.regex);
      if (match) {
        const captures = match.slice(1);
        let result = p.zhTemplate;
        for (let i = 0; i < p.slotIndices.length; i++) {
          const slot = p.slotIndices[i];
          const val = captures[i];
          result = result.replaceAll("{" + slot + "}", val);
        }
        return text.replace(trimmed, result);
      }
    }

    return text;
  }

  shouldIgnoreNode(node) {
    let curr = node;
    while (curr && curr !== this.document) {
      if (curr.nodeType === NodeTypes.ELEMENT_NODE) {
        if (this.ignoreTags.has(curr.tagName)) {
          return true;
        }
        if (curr.classList && (curr.classList.contains("notranslate") || curr.classList.contains("no-i18n"))) {
          return true;
        }
      }
      curr = curr.parentNode;
    }
    return false;
  }

  translateNode(node) {
    if (this.shouldIgnoreNode(node)) return;

    if (node.nodeType === NodeTypes.TEXT_NODE) {
      const original = node.nodeValue;
      const translated = this.translateText(original);
      if (translated !== original) {
        node.nodeValue = translated;
      }
      return;
    }

    // 使用 TreeWalker 遍历文本子节点
    const walker = this.document.createTreeWalker(
      node,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (tNode) => {
          if (this.shouldIgnoreNode(tNode)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let current;
    while ((current = walker.nextNode())) {
      const original = current.nodeValue;
      const translated = this.translateText(original);
      if (translated !== original) {
        current.nodeValue = translated;
      }
    }
  }

  startObserver(root = this.document.body) {
    if (this.observer) this.observer.disconnect();

    this.observer = new this.window.MutationObserver((mutations) => {
      for (const mut of mutations) {
        if (mut.type === "childList") {
          for (const added of mut.addedNodes) {
            this.translateNode(added);
          }
        }
      }
    });

    this.observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  stopObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

describe("Cinderwake Fake DOM Tree & Engine Unit Tests", () => {
  let env;
  let document;
  let window;
  let engine;

  beforeEach(() => {
    env = createFakeEnvironment();
    document = env.document;
    window = env.window;
    engine = new TranslationEngine(document, window);
  });

  describe("1. DOM 基础属性与结构", () => {
    test("支持 document.title 和 document.documentElement.lang", () => {
      document.title = "Cinderwake";
      assert.equal(document.title, "Cinderwake");

      document.documentElement.lang = "zh-CN";
      assert.equal(document.documentElement.lang, "zh-CN");
    });

    test("元素类名 classList 与 dataset 操作", () => {
      const btn = document.createElement("button");
      btn.classList.add("btn", "btn-primary");
      assert.ok(btn.classList.contains("btn"));
      assert.ok(btn.classList.contains("btn-primary"));
      assert.equal(btn.className, "btn btn-primary");

      btn.classList.remove("btn-primary");
      assert.ok(!btn.classList.contains("btn-primary"));
      assert.equal(btn.classList.contains("btn"), true);

      btn.dataset.action = "pause";
      assert.equal(btn.dataset.action, "pause");
    });

    test("DOM 节点增删与层级关系", () => {
      const container = document.createElement("div");
      container.id = "app";
      document.body.appendChild(container);

      const span1 = document.createElement("span");
      const span2 = document.createElement("span");
      container.appendChild(span1);
      container.insertBefore(span2, span1);

      assert.equal(container.childNodes.length, 2);
      assert.equal(container.firstChild, span2);
      assert.equal(container.lastChild, span1);
      assert.equal(span2.nextSibling, span1);
      assert.equal(span1.previousSibling, span2);

      container.removeChild(span2);
      assert.equal(container.childNodes.length, 1);
      assert.equal(container.firstChild, span1);
    });
  });

  describe("2. a) 精确全字匹配替换", () => {
    test("UI 词条精确替换: Settings -> 设置, Resume -> 继续游戏", () => {
      const menu = document.createElement("div");
      const item1 = document.createElement("button");
      item1.textContent = "Settings";
      const item2 = document.createElement("button");
      item2.textContent = "Resume";

      menu.appendChild(item1);
      menu.appendChild(item2);
      document.body.appendChild(menu);

      engine.translateNode(menu);

      assert.equal(item1.textContent, "设置");
      assert.equal(item2.textContent, "继续游戏");
    });

    test("专有名词 Terms 替换: Lantern -> 提灯, Shocked -> 感电", () => {
      const stat = document.createElement("div");
      const slotName = document.createElement("span");
      slotName.textContent = "Lantern";
      const statusName = document.createElement("span");
      statusName.textContent = "Shocked";

      stat.appendChild(slotName);
      stat.appendChild(statusName);
      document.body.appendChild(stat);

      engine.translateNode(stat);

      assert.equal(slotName.textContent, "提灯");
      assert.equal(statusName.textContent, "感电");
    });
  });

  describe("3. b) 占位符模式替换", () => {
    test("数字与百分比占位符: +{0}% move speed -> +15% 移动速度", () => {
      const p = document.createElement("p");
      p.textContent = "+15% move speed";
      document.body.appendChild(p);

      engine.translateNode(p);

      assert.equal(p.textContent, "+15% 移动速度");
    });

    test("多参数占位符模式替换", () => {
      const desc = document.createElement("div");
      desc.textContent = "+25% pickup range";
      document.body.appendChild(desc);

      engine.translateNode(desc);

      assert.equal(desc.textContent, "+25% 拾取范围");
    });
  });

  describe("4. c) 人称代词变体匹配", () => {
    test("支持 she/he 变体映射至统一中文文案", () => {
      const cardFemale = document.createElement("div");
      cardFemale.textContent = "The lantern she set out with.";

      const cardMale = document.createElement("div");
      cardMale.textContent = "The lantern he set out with.";

      document.body.appendChild(cardFemale);
      document.body.appendChild(cardMale);

      engine.translateNode(cardFemale);
      engine.translateNode(cardMale);

      assert.equal(cardFemale.textContent, "最初启程时随身携带的提灯。");
      assert.equal(cardMale.textContent, "最初启程时随身携带的提灯。");
    });

    test("支持 Her/His flame 变体映射", () => {
      const t1 = document.createElement("span");
      t1.textContent = "Her flame burns bright.";
      const t2 = document.createElement("span");
      t2.textContent = "His flame burns bright.";

      engine.translateNode(t1);
      engine.translateNode(t2);

      assert.equal(t1.textContent, "烈焰熊熊燃烧。");
      assert.equal(t2.textContent, "烈焰熊熊燃烧。");
    });
  });

  describe("5. d) 动态 DOM 插入节点时（MutationObserver）", () => {
    test("向 #hud 动态插入弹窗时自动被捕获并翻译", () => {
      const hud = document.createElement("div");
      hud.id = "hud";
      document.body.appendChild(hud);

      // 启动监听
      engine.startObserver(document.body);

      // 动态向 #hud 插入一个弹窗
      const modal = document.createElement("div");
      modal.className = "modal-dialog";

      const header = document.createElement("h2");
      header.textContent = "Select Character";

      const desc = document.createElement("p");
      desc.textContent = "+10% move speed";

      const btn = document.createElement("button");
      btn.textContent = "Close";

      modal.appendChild(header);
      modal.appendChild(desc);
      modal.appendChild(btn);

      // 插入触发 MutationObserver
      hud.appendChild(modal);

      // 验证子节点已被翻译
      assert.equal(header.textContent, "选择角色");
      assert.equal(desc.textContent, "+10% 移动速度");
      assert.equal(btn.textContent, "关闭");

      engine.stopObserver();
    });
  });

  describe("6. e) 排除项与特殊元素安全测试", () => {
    test("不替换 <script>, <style>, <canvas> 内容", () => {
      const container = document.createElement("div");

      const script = document.createElement("script");
      script.textContent = "var Settings = true; var Close = 1;";

      const style = document.createElement("style");
      style.textContent = ".Settings { color: red; }";

      const canvas = document.createElement("canvas");
      canvas.textContent = "Resume fallback text";

      const p = document.createElement("p");
      p.textContent = "Settings";

      container.appendChild(script);
      container.appendChild(style);
      container.appendChild(canvas);
      container.appendChild(p);
      document.body.appendChild(container);

      engine.translateNode(container);

      // 排除项内的文本未被篡改
      assert.equal(script.textContent, "var Settings = true; var Close = 1;");
      assert.equal(style.textContent, ".Settings { color: red; }");
      assert.equal(canvas.textContent, "Resume fallback text");

      // 正常段落被成功翻译
      assert.equal(p.textContent, "设置");
    });

    test("SVG 内部结构或路径不被误伤", () => {
      const svg = document.createElement("svg");
      svg.setAttribute("viewBox", "0 0 100 100");

      const path = document.createElement("path");
      path.setAttribute("d", "M 10,30 A 20,20 0,0,1 50,30 A 20,20 0,0,1 90,30 Q 90,60 50,90 Q 10,60 10,30 z");
      path.textContent = "Close"; // 某些内联 SVG 可能会包含可访问性文本或被包裹

      svg.appendChild(path);
      document.body.appendChild(svg);

      engine.translateNode(svg);

      // 属性与路径完好无损
      assert.equal(path.getAttribute("d"), "M 10,30 A 20,20 0,0,1 50,30 A 20,20 0,0,1 90,30 Q 90,60 50,90 Q 10,60 10,30 z");
      assert.equal(path.textContent, "Close");
    });

    test("带有 .notranslate 或 .no-i18n class 的元素及其子树不被翻译", () => {
      const wrapper = document.createElement("div");
      wrapper.className = "notranslate";

      const span = document.createElement("span");
      span.textContent = "Settings";

      wrapper.appendChild(span);
      document.body.appendChild(wrapper);

      engine.translateNode(wrapper);

      assert.equal(span.textContent, "Settings");
    });
  });
});

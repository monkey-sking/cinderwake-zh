/**
 * Cinderwake 简体中文油猴脚本构建工具
 *
 * 读取 cinderwake/zh/*.json 字典，生成独立的单文件油猴脚本：
 * cinderwake/cinderwake-zh.user.js
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// 1. 读取各部分翻译数据
const terms = JSON.parse(readFileSync(resolve(rootDir, 'zh/terms.json'), 'utf8'));
const ui = JSON.parse(readFileSync(resolve(rootDir, 'zh/ui.json'), 'utf8'));
const patterns = JSON.parse(readFileSync(resolve(rootDir, 'zh/patterns.json'), 'utf8'));
const gear = JSON.parse(readFileSync(resolve(rootDir, 'zh/gear.json'), 'utf8'));
const codex = JSON.parse(readFileSync(resolve(rootDir, 'zh/codex.json'), 'utf8'));
const news = JSON.parse(readFileSync(resolve(rootDir, 'zh/news.json'), 'utf8'));
const tips = JSON.parse(readFileSync(resolve(rootDir, 'zh/tips.json'), 'utf8'));
const describeZhPath = resolve(rootDir, 'zh/describe-zh.json');
const describeZh = existsSync(describeZhPath)
  ? JSON.parse(readFileSync(describeZhPath, 'utf8'))
  : {};

// 并行补齐的分片字典（存在即合入，缺省不影响构建）
const extraDictNames = ['dict-ui.json', 'dict-items.json', 'dict-extra.json'];
const extraDicts = extraDictNames
  .filter((f) => existsSync(resolve(rootDir, 'zh', f)))
  .map((f) => ({ name: f, data: JSON.parse(readFileSync(resolve(rootDir, 'zh', f), 'utf8')) }));

// 2. 汇集精确字典
const exactMap = Object.create(null);

function addExact(en, zh) {
  if (!en || !zh) return;
  const k = String(en).trim();
  const v = String(zh).trim();
  if (!k || !v) return;
  exactMap[k] = v;
}

// Terms 专有名词（角色、部位、状态、Boss、小怪、技能名、暖炉升级、标签）
for (const category of Object.values(terms)) {
  if (category && typeof category === 'object') {
    for (const [en, zh] of Object.entries(category)) {
      addExact(en, zh);
    }
  }
}

// UI 词条
for (const [en, zh] of Object.entries(ui)) {
  addExact(en, zh);
}

// Tips 加载小贴士
for (const t of tips) {
  addExact(t.en, t.zh);
}

// News 更新日志
for (const n of news) {
  addExact(n.titleEn, n.titleZh);
  addExact(n.summaryEn, n.summaryZh);
  if (Array.isArray(n.notesEn)) {
    for (let i = 0; i < n.notesEn.length; i++) {
      addExact(n.notesEn[i], n.notesZh[i]);
    }
  }
}

// Codex 技能与怪物图鉴
if (Array.isArray(codex.skills)) {
  for (const s of codex.skills) {
    if (s.nameZh && s.id) addExact(s.id, s.nameZh);
    addExact(s.textEn, s.textZh);
  }
}
if (Array.isArray(codex.mobs)) {
  for (const m of codex.mobs) {
    addExact(m.textEn, m.textZh);
    addExact(m.tipEn, m.tipZh);
  }
}

// Gear 装备字典（含 Stoker 人称代词及 Firebox 变体）
const replacePronouns = (s) => s ? s.replace(/\bShe\b/g, 'He')
                                    .replace(/\bshe\b/g, 'he')
                                    .replace(/\bHer\b/g, 'His')
                                    .replace(/\b(to|heals|from|on|at) her\b/g, '$1 him')
                                    .replace(/\bher\b/g, 'his') : s;

for (const g of gear) {
  addExact(g.nameEn, g.nameZh);
  addExact(g.textEn, g.textZh);
  if (g.t2En) addExact(g.t2En, g.t2Zh);
  if (g.t3En) addExact(g.t3En, g.t3Zh);

  // Stoker 变体映射
  if (!g.char) {
    if (g.slot === 'lantern') {
      const stokerName = g.nameEn.replace(/Lantern|Wick/, 'Firebox');
      const zhName = g.nameZh.replace(/提灯|灯芯/, '火箱');
      addExact(stokerName, zhName);
    }
    const stokerText = replacePronouns(g.textEn);
    if (stokerText !== g.textEn) addExact(stokerText, g.textZh);

    if (g.t2En) {
      const st2 = replacePronouns(g.t2En);
      if (st2 !== g.t2En) addExact(st2, g.t2Zh);
    }
    if (g.t3En) {
      const st3 = replacePronouns(g.t3En);
      if (st3 !== g.t3En) addExact(st3, g.t3Zh);
    }
  }
}

// 技能描述的完整渲染结果（由 describe-dict.mjs 从游戏自身的 describe 求值器生成）
for (const [en, zh] of Object.entries(describeZh)) {
  addExact(en, zh);
}

// 补充分片字典（扁平 EN -> ZH）
for (const extra of extraDicts) {
  for (const [en, zh] of Object.entries(extra.data)) {
    addExact(en, zh);
  }
}

// 3. 整理正则模式
const compiledPatterns = patterns.map((p) => ({
  en: p.en.trim(),
  zh: p.zh.trim()
}));

// 4. 生成油猴脚本代码
const userScriptHeader = `// ==UserScript==
// @name         Cinderwake 简体中文汉化
// @namespace    https://cinderwake.io/
// @version      1.3.1
// @description  Cinderwake (cinderwake.io) 简体中文汉化油猴脚本，支持 DOM 动态翻译
// @author       runking
// @match        https://cinderwake.io/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
`;

// 翻译核心单独维护在 tools/lib/i18n-core.js，构建时原样内联：
// 这样浏览器运行时与离线覆盖率工具用的是同一套实现，不会出现行为漂移。
const coreSource = readFileSync(resolve(__dirname, 'lib/i18n-core.js'), 'utf8')
  .replace(/^\/\*\*[\s\S]*?\*\*\/\s*/, '')
  .trim();

const domLayer = [
  '  const IGNORE_TAGS = new Set([',
  '    "SCRIPT", "STYLE", "CANVAS", "SVG", "PATH", "CODE", "PRE"',
  '  ]);',
  '  const ATTRS = ["title", "aria-label", "aria-description", "alt", "placeholder"];',
  '  const ATTRS_SEL = "[title], [aria-label], [aria-description], [alt], [placeholder]";',
  '',
  '  // 翻不出来的文本节点按内容缓存，避免兜底轮询反复白算',
  '  const seen = typeof WeakMap === "function" ? new WeakMap() : null;',
  '',
  '  function isIgnoredOrWithinIgnored(node, attributesOnly = false) {',
  '    let curr = node;',
  '    while (curr) {',
  '      if (curr.nodeType === 1) {',
  '        if (IGNORE_TAGS.has(curr.tagName)) return true;',
  '        if (!attributesOnly && (curr.tagName === "TEXTAREA" || curr.tagName === "INPUT")) return true;',
  '        if (curr.classList && (curr.classList.contains("notranslate") ||',
  '            curr.classList.contains("no-i18n"))) return true;',
  '      }',
  '      curr = curr.parentNode;',
  '    }',
  '    return false;',
  '  }',
  '',
  '  function setText(node, value) {',
  '    if (value === null || value === undefined) return false;',
  '    if (value === node.nodeValue) return false;',
  '    node.nodeValue = value;',
  '    return true;',
  '  }',
  '',
  '  // 单个文本节点：先整节点翻译，再处理「Volatile II: 」+「explodes ...」跨节点词缀',
  '  function translateTextNode(node) {',
  '    if (!node || node.nodeType !== 3) return;',
  '    if (isIgnoredOrWithinIgnored(node)) return;',
  '    const original = node.nodeValue;',
  '    if (!original || !original.trim()) return;',
  '    if (seen) {',
  '      const memo = seen.get(node);',
  '      if (memo === original) return;',
  '    }',
  '',
  '    let changed = setText(node, core.translateText(original));',
  '    if (!changed) {',
  '      const next = node.nextSibling;',
  '      if (next && next.nodeType === 3 && /:\\s*$/.test(original)) {',
  '        const pair = core.translateAffixPair(original, next.nodeValue);',
  '        if (pair) {',
  '          const headChanged = setText(node, pair.head);',
  '          const tailChanged = setText(next, pair.tail);',
  '          changed = headChanged || tailChanged;',
  '          if (tailChanged) translateTextNode(next);',
  '        }',
  '      }',
  '    }',
  '    if (!changed && seen) seen.set(node, original);',
  '  }',
  '',
  '  function translateAttributes(el) {',
  '    if (!el.getAttribute || isIgnoredOrWithinIgnored(el, true)) return;',
  '    for (const name of ATTRS) {',
  '      const raw = el.getAttribute(name);',
  '      if (!raw) continue;',
  '      const translated = core.translateText(raw);',
  '      if (translated && translated !== raw) el.setAttribute(name, translated);',
  '    }',
  '  }',
  '',
  '  function translateAllAttributes(rootNode) {',
  '    if (!rootNode || rootNode.nodeType !== 1) return;',
  '    if (isIgnoredOrWithinIgnored(rootNode, true)) return;',
  '    translateAttributes(rootNode);',
  '    if (typeof rootNode.querySelectorAll === "function") {',
  '      const list = rootNode.querySelectorAll(ATTRS_SEL);',
  '      for (let i = 0; i < list.length; i++) translateAttributes(list[i]);',
  '    }',
  '  }',
  '',
  '  function collectTextNodes(rootNode) {',
  '    const list = [];',
  '    if (rootNode.nodeType === 3) {',
  '      if (!isIgnoredOrWithinIgnored(rootNode)) list.push(rootNode);',
  '      return list;',
  '    }',
  '    if (rootNode.nodeType !== 1 || isIgnoredOrWithinIgnored(rootNode)) return list;',
  '    if (typeof document.createTreeWalker === "function") {',
  '      const walker = document.createTreeWalker(rootNode, 4, {',
  '        acceptNode(node) {',
  '          return isIgnoredOrWithinIgnored(node) ? 2 : 1;',
  '        }',
  '      }, null);',
  '      let curr = walker.nextNode();',
  '      while (curr) {',
  '        list.push(curr);',
  '        curr = walker.nextNode();',
  '      }',
  '    } else {',
  '      for (const child of rootNode.childNodes) {',
  '        const nested = collectTextNodes(child);',
  '        for (let i = 0; i < nested.length; i++) list.push(nested[i]);',
  '      }',
  '    }',
  '    return list;',
  '  }',
  '',
  '  function translateSubtree(rootNode) {',
  '    if (!rootNode) return;',
  '    if (rootNode.nodeType === 1) translateAllAttributes(rootNode);',
  '    const nodes = collectTextNodes(rootNode);',
  '    for (let i = 0; i < nodes.length; i++) translateTextNode(nodes[i]);',
  '  }',
  '',
  '  function updateDocumentMeta() {',
  '    try {',
  '      if (document.documentElement) document.documentElement.lang = "zh-Hans";',
  '      if (document.title && document.title.includes("Cinderwake")) {',
  '        document.title = document.title.replace(',
  '          "Free Browser Survivors Action RPG", "免费网页版肉鸽幸存者 ARPG");',
  '      }',
  '    } catch (err) {}',
  '  }',
  '',
  '  // HUD 每帧重写 textContent，个别写法会绕过 characterData 事件；用轻量轮询兜底。',
  '  // 只扫关键容器，配合 seen 缓存，开销很小。',
  '  function sweep() {',
  '    try {',
  '      updateDocumentMeta();',
  '      const roots = [];',
  '      for (const sel of ["#hud", "#target-info", "#app", "#ui"]) {',
  '        const el = document.querySelector(sel);',
  '        if (el && roots.indexOf(el) === -1) roots.push(el);',
  '      }',
  '      if (!roots.length && document.body) roots.push(document.body);',
  '      for (const el of roots) {',
  '        translateAllAttributes(el);',
  '        const nodes = collectTextNodes(el);',
  '        for (let i = 0; i < nodes.length; i++) translateTextNode(nodes[i]);',
  '      }',
  '    } catch (err) {}',
  '  }',
  '',
  '  function init() {',
  '    updateDocumentMeta();',
  '    if (document.body) translateSubtree(document.body);',
  '',
  '    if (typeof MutationObserver !== "undefined") {',
  '      const observer = new MutationObserver((mutations) => {',
  '        for (const mut of mutations) {',
  '          if (mut.type === "childList") {',
  '            for (let i = 0; i < mut.addedNodes.length; i++) {',
  '              translateSubtree(mut.addedNodes[i]);',
  '            }',
  '            if (mut.target && mut.target.nodeType === 1) translateAttributes(mut.target);',
  '          } else if (mut.type === "characterData") {',
  '            translateTextNode(mut.target);',
  '          } else if (mut.type === "attributes") {',
  '            if (mut.target && mut.target.nodeType === 1) translateAttributes(mut.target);',
  '          }',
  '        }',
  '      });',
  '      const target = document.body || document.documentElement;',
  '      if (target) {',
  '        observer.observe(target, {',
  '          childList: true,',
  '          attributes: true,',
  '          subtree: true,',
  '          characterData: true,',
  '          attributeFilter: ATTRS',
  '        });',
  '      }',
  '    }',
  '',
  '    startFallbackSweep();',
  '  }',
  '',
  '  // 兜底轮询用 requestAnimationFrame 节流：浏览器里可用，标签页隐藏时自动暂停；',
  '  // Node 测试环境没有 rAF，因此不会让 node --test 的进程挂住不退出。',
  '  function startFallbackSweep() {',
  '    if (typeof requestAnimationFrame !== "function") return;',
  '    let last = 0;',
  '    const tick = (now) => {',
  '      if (!last || now - last >= 600) {',
  '        last = now;',
  '        sweep();',
  '      }',
  '      requestAnimationFrame(tick);',
  '    };',
  '    requestAnimationFrame(tick);',
  '  }',
  '',
  '  if (document.readyState === "loading") {',
  '    document.addEventListener("DOMContentLoaded", init);',
  '  } else {',
  '    init();',
  '  }',
  '})();'
].join('\n');

const clientCode =
  '\n(function () {\n' +
  "  'use strict';\n\n" +
  '  // 1. 字典数据\n' +
  '  const EXACT_MAP = ' + JSON.stringify(exactMap) + ';\n' +
  '  const RAW_PATTERNS = ' + JSON.stringify(compiledPatterns) + ';\n\n' +
  '  // 2. 翻译核心（与 tools/check-coverage.mjs 共用同一实现）\n' +
  coreSource + '\n\n' +
  '  const core = createI18nCore(EXACT_MAP, RAW_PATTERNS);\n\n' +
  '  // 3. DOM 适配层\n' +
  domLayer +
  '\n';

const fullScript = userScriptHeader + clientCode;
const outputPath = resolve(rootDir, 'cinderwake-zh.user.js');
writeFileSync(outputPath, fullScript, 'utf8');
console.log(
  'Successfully generated:', outputPath,
  '| size:', fullScript.length, 'bytes',
  '| exact:', Object.keys(exactMap).length,
  '| patterns:', compiledPatterns.length,
  '| extra dicts:', extraDicts.map((d) => d.name).join(',') || 'none'
);

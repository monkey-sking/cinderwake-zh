/**
 * 从美化版源码中提取「可能进入 DOM 的英文文案」，并与构建产物字典比对，输出漏译清单。
 * 用法: node tools/extract-dom-gaps.mjs [--src /tmp/cinderwake-formatted.js] [--start 22816]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i === -1 ? dflt : process.argv[i + 1];
}
const srcPath = arg('--src', '/tmp/cinderwake-formatted.js');
const startLine = parseInt(arg('--start', '22816'), 10);

const full = readFileSync(srcPath, 'utf8');
const lines = full.split('\n');
const game = lines.slice(startLine - 1).join('\n');

// ---- 手写扫描器：正确解析字符串/模板字面量（含嵌套 ${}）----
const literals = [];      // {value, template, hasSlot, slotCount}
let i = 0;
const n = game.length;

function scanString(quote, pos) {
  // returns [endPosAfterQuote, text, isTemplate, slots]
  let out = '';
  let slots = 0;
  let p = pos + 1;
  while (p < n) {
    const ch = game[p];
    if (ch === '\\') {
      const nx = game[p + 1];
      if (nx === 'u') {
        const hex = game.slice(p + 2, p + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); p += 6; continue; }
      }
      if (nx === 'n') out += '\n'; else if (nx === 't') out += ' '; else if (nx === 'r') out += '';
      else out += nx === undefined ? '' : nx;
      p += 2; continue;
    }
    if (ch === quote) return [p + 1, out, quote === '`', slots];
    if (quote === '`' && ch === '$' && game[p + 1] === '{') {
      // skip balanced braces, recursing into nested strings
      let depth = 0, q = p + 1;
      while (q < n) {
        const c = game[q];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (!depth) break; }
        else if (c === '"' || c === "'" || c === '`') {
          const r = scanString(c, q); q = r[0] - 1;
        }
        q++;
      }
      slots++; out += '\u0000'; p = q + 1; continue;
    }
    out += ch; p++;
  }
  return [n, out, quote === '`', slots];
}

while (i < n) {
  const ch = game[i];
  if (ch === '/' && game[i + 1] === '/') { const e = game.indexOf('\n', i); i = e === -1 ? n : e + 1; continue; }
  if (ch === '/' && game[i + 1] === '*') { const e = game.indexOf('*/', i); i = e === -1 ? n : e + 2; continue; }
  if (ch === '"' || ch === "'" || ch === '`') {
    const [end, text, isTemplate, slots] = scanString(ch, i);
    literals.push({ value: text, template: isTemplate, slots });
    i = end; continue;
  }
  i++;
}

// ---- 过滤：只保留「像人类文案」的字面量 ----
const CODEY = /[{}<>=;\\|]|=>|function|const |var |\.js|\.css|\.png|\.svg|https?:|\/\/|#[0-9a-fA-F]{3,8}\b|^\s*$/;
const IDENT_RE = /^[a-z_$][a-zA-Z0-9_$-]*$/;
const KEBAB_RE = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]*)*$/;
function looksLikeProse(s) {
  const t = s.replace(/\u0000/g, 'x').trim();
  if (t.length < 3) return false;
  if (!/[A-Za-z]{2,}/.test(t)) return false;
  if (CODEY.test(s)) return false;
  if (!/\s/.test(t)) {
    // 单个词：只保留首字母大写的（UI 标签常见），排除标识符/资源名
    if (/^[a-z0-9_$]+$/.test(t)) return false;
    if (KEBAB_RE.test(t)) return false;
    if (/^[a-z][a-zA-Z0-9]*$/.test(t)) return false; // camelCase
    return /^[A-Z]/.test(t);
  }
  // 含空格：排除明显代码/资源
  if (/^[a-z0-9_\-./ ]+$/.test(t) && !/[A-Z]/.test(t) && !/[.!?]$/.test(t)) return false;
  if (/\bdiv\b|\bspan\b|\bpx\b|\bvh\b|\bvw\b|translate|keyframe/i.test(t)) return false;
  return true;
}

const uniq = new Map();
for (const l of literals) {
  if (!looksLikeProse(l.value)) continue;
  uniq.set(l.value, l);
}

// ---- 载入构建产物字典 ----
const prodPath = resolve(rootDir, 'cinderwake-zh.user.js');
if (!existsSync(prodPath)) { console.error('没有构建产物'); process.exit(1); }
const prod = readFileSync(prodPath, 'utf8');
function extractJson(prefix) {
  const start = prod.indexOf(prefix);
  if (start === -1) throw new Error('找不到 ' + prefix);
  const from = start + prefix.length;
  const open = prod[from];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  let depth = 0, inStr = false, esc = false;
  for (let k = from; k < prod.length; k++) {
    const ch = prod[k];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) { depth--; if (!depth) return JSON.parse(prod.slice(from, k + 1)); }
  }
  throw new Error('未闭合 ' + prefix);
}
const EXACT_MAP = extractJson('const EXACT_MAP = ');
const RAW_PATTERNS = extractJson('const RAW_PATTERNS = ');
const coreCode = readFileSync(resolve(__dirname, 'lib/i18n-core.js'), 'utf8');
const core = new Function(coreCode + '\nreturn createI18nCore(arguments[0], arguments[1]);')(EXACT_MAP, RAW_PATTERNS);

// 试翻译：把 \u0000 插槽填成不同样本，任一命中即认为可翻
const SAMPLES = [
  ['Warden', 'Kills'], ['2:57', '3'], ['12', '34%', '6', '8'],
  ['Volatile', 'II'], ['Cinders', 'Hearth'], ['Rare', 'Branded'],
  ['0.6', '1.2'], ['The Emberwright', 'Ember Rain'],
];
function coverable(s) {
  if (core.translateText(s)) return true;
  if (s.indexOf('\u0000') === -1) return false;
  const cnt = (s.match(/\u0000/g) || []).length;
  for (const set of SAMPLES) {
    let k = 0;
    const filled = s.replace(/\u0000/g, () => set[(k++) % set.length] ?? 'X');
    if (core.translateText(filled)) return true;
  }
  return false;
}

const missing = [...uniq.keys()].filter((s) => !coverable(s));
const statics = missing.filter((s) => !s.includes('\u0000'));
const dyn = missing.filter((s) => s.includes('\u0000'));

console.log(`扫描字面量 ${literals.length} 个，人读文案 ${uniq.size} 条，漏译 ${missing.length} 条（静态 ${statics.length} / 动态 ${dyn.length}）\n`);
console.log('=== 静态漏译（可直接加 exact） ===');
for (const s of statics.sort()) console.log(JSON.stringify(s));
console.log('\n=== 动态漏译骨架（需 pattern） ===');
for (const s of dyn.sort()) console.log(JSON.stringify(s));

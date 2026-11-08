/**
 * 从格式化后的 Cinderwake 主程序提取所有 describe() 的真实英文文案变体。
 *
 * 用法:
 *   node cinderwake/tools/extract-describe-corpus.mjs [formattedJs] [--dry]
 * 输出:
 *   cinderwake/zh/describe-corpus.json  ->  { skillId: [英文变体, ...] }
 *
 * 原理：定位全部 `describe:` 函数，抽取它们引用的顶层数值表
 * （DW/LW/zW/eK/…），在沙箱中按 等级 × Kindred Flame 叠加 × 触屏分支 逐一求值，
 * 得到游戏实际可能显示的每一条字符串。这份语料就是汉化模式的验收基准。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const bundlePath = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : '/tmp/cinderwake-formatted-new.js';
const src = readFileSync(bundlePath, 'utf8');
const lineOf = (pos) => src.slice(0, pos).split('\n').length;

// ---------------- 扫描器：字符串 / 模板字面量 / ${} 嵌套感知 ----------------
// 返回从 start 起的表达式源码。literal 模式下在顶层 `,` `;` `}` 处结束；
// bracket 模式（表达式以 { 或 [ 开头）在配对的闭括号处结束。
function scanExpr(start, mode = 'literal') {
  const stack = [];
  let i = start, depth = 0;
  while (i < src.length) {
    const c = src[i];
    const top = stack[stack.length - 1];
    if (!top) {
      if (depth === 0 && i > start && mode === 'literal' && (c === ',' || c === ';')) return src.slice(start, i);
      if (c === '"' || c === "'") { stack.push({ kind: 'str', quote: c }); i++; continue; }
      if (c === '`') { stack.push({ kind: 'tpl' }); i++; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; i++; continue; }
      if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) {
          // 顶层闭括号：literal 模式说明表达式到此结束；bracket 模式说明字面量闭合
          return mode === 'bracket' ? src.slice(start, i + 1) : src.slice(start, i);
        }
        depth--;
        if (mode === 'bracket' && depth === 0) return src.slice(start, i + 1);
        i++;
        continue;
      }
      i++; continue;
    }
    if (top.kind === 'str') {
      if (c === '\\') { i += 2; continue; }
      if (c === top.quote) stack.pop();
      i++; continue;
    }
    if (top.kind === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); i++; continue; }
      if (c === '$' && src[i + 1] === '{') { stack.push({ kind: 'code', depth: 0 }); i += 2; continue; }
      i++; continue;
    }
    if (c === '"' || c === "'") { stack.push({ kind: 'str', quote: c }); i++; continue; }
    if (c === '`') { stack.push({ kind: 'tpl' }); i++; continue; }
    if (c === '{' || c === '(' || c === '[') { top.depth++; i++; continue; }
    if (c === ')' || c === ']') { top.depth--; i++; continue; }
    if (c === '}') { if (top.depth === 0) { stack.pop(); i++; continue; } top.depth--; i++; continue; }
    i++;
  }
  return src.slice(start);
}

// 仅收集“代码区”里的标识符：跳过字符串与模板文本，跳过属性访问与对象键
function identifiersOf(code) {
  const found = new Set();
  const stack = []; // 'tpl' | 'str' | 'code'
  let i = 0, depth = 0;
  const prevWordChar = (k) => k > 0 && /[\w$]/.test(code[k - 1]);
  while (i < code.length) {
    const c = code[i];
    const top = stack[stack.length - 1];
    if (!top) {
      if (c === '"' || c === "'") { stack.push({ kind: 'str', quote: c }); i++; continue; }
      if (c === '`') { stack.push({ kind: 'tpl' }); i++; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; i++; continue; }
      if (c === ')' || c === ']' || c === '}') { depth--; i++; continue; }
      if (/[\w$]/.test(c)) {
        let j = i; while (j < code.length && /[\w$]/.test(code[j])) j++;
        const word = code.slice(i, j);
        const before = code.slice(0, i).replace(/\s+$/, '');
        const after = code.slice(j).replace(/^\s*/, '');
        const isProp = before.endsWith('.');
        const isKey = after.startsWith(':');
        if (!isProp && !isKey) found.add(word);
        i = j; continue;
      }
      i++; continue;
    }
    if (top.kind === 'str') { if (c === '\\') { i += 2; continue; } if (c === top.quote) stack.pop(); i++; continue; }
    if (top.kind === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); i++; continue; }
      if (c === '$' && code[i + 1] === '{') { stack.push({ kind: 'code', depth: 0 }); i += 2; continue; }
      i++; continue;
    }
    if (c === '"' || c === "'") { stack.push({ kind: 'str', quote: c }); i++; continue; }
    if (c === '`') { stack.push({ kind: 'tpl' }); i++; continue; }
    if (c === '{' || c === '(' || c === '[') { top.depth++; i++; continue; }
    if (c === ')' || c === ']') { top.depth--; i++; continue; }
    if (c === '}') { if (top.depth === 0) { stack.pop(); i++; continue; } top.depth--; i++; continue; }
    if (/[\w$]/.test(c)) { let j = i; while (j < code.length && /[\w$]/.test(code[j])) j++; const w = code.slice(i, j); const bef = code.slice(0, i).replace(/\s+$/, ''); const aft = code.slice(j).replace(/^\s*/, ''); if (!bef.endsWith('.') && !aft.startsWith(':')) found.add(w); i = j; continue; }
    i++;
  }
  return [...found];
}

// ---------------- 1. 全部 describe 站点 ----------------
const KEYWORDS = new Set(['let', 'const', 'var', 'return', 'if', 'else', 'true', 'false', 'null', 'undefined', 'Math', 'String', 'Number', 'Object', 'e42', 'e43', 't2', 'n2']);
const sites = [];
{
  const re = /describe:\s*/g;
  let m;
  while ((m = re.exec(src))) {
    const valStart = m.index + m[0].length;
    const fn = scanExpr(valStart, 'literal').trim().replace(/\n\s+/g, ' ');
    const before = src.slice(Math.max(0, m.index - 4000), m.index);
    const ids = [...before.matchAll(/(?:^|[\{,]\s*)id:\s*`([^`]+)`/g)];
    const around = src.slice(m.index - 500, m.index);
    const mls = [...around.matchAll(/maxLevel:\s*(\d+)/g)];
    sites.push({
      id: ids.length ? ids[ids.length - 1][1] : `site_${sites.length}`,
      maxLevel: mls.length ? Number(mls[mls.length - 1][1]) : 6,
      fn,
      deps: identifiersOf(fn).filter((w) => !KEYWORDS.has(w) && !/^e42$/.test(w)),
    });
    re.lastIndex = valStart + fn.length;
  }
}
console.error(`describe sites: ${sites.length}`);

// ---------------- 2. 依赖数值表（传递闭包）----------------
// describe 里引用的函数（如 eK / mU / DW.cooldown 的宿主 DW）本身又引用别的顶层
// 常量（$G、fU…），所以必须一路解析到闭包，否则求值时报 “x is not defined”。
const SKIP_DEPS = new Set(['QU', 'VM', 'Math', 'String', 'Number', 'Object', 'Array', 'JSON', 'console', 'window', 'document', 'true', 'false', 'null', 'undefined']);
const allDeps = new Set();
const resolved = new Map(); // name -> decl source
const unresolved = new Set();
function resolveDep(name) {
  if (allDeps.has(name)) return;
  allDeps.add(name);
  if (/^[0-9]+(\.[0-9]+)?$/.test(name)) return;
  if (SKIP_DEPS.has(name)) return;
  const expr = findDef(name);
  if (expr) { resolved.set(name, `var ${name} = ${expr};`); for (const d of identifiersOf(expr)) resolveDep(d); return; }
  const fnSrc = findFn(name);
  if (fnSrc) { resolved.set(name, fnSrc + ';'); for (const d of identifiersOf(fnSrc)) resolveDep(d); return; }
  unresolved.add(name);
}
for (const s of sites) for (const d of s.deps) resolveDep(d);
allDeps.delete('QU'); allDeps.delete('VM');

function findDef(name) {
  const re = new RegExp(`(^|[\\s,;])(var\\s+)?${name.replace(/\$/g, '\\$')}\\s*=\\s*`, 'g');
  let m;
  const cands = [];
  while ((m = re.exec(src))) {
    const valStart = m.index + m[0].length;
    const fc = src[valStart];
    if (!/[`'"({[\w$]/.test(fc)) continue;
    const expr = scanExpr(valStart, fc === '{' || fc === '[' ? 'bracket' : 'literal').trim();
    if (!expr || expr.length > 6000) continue;
    // 排除明显不是数值表的赋值（如 DOM 元素、对象实例）
    cands.push({ line: lineOf(m.index), expr });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => Math.abs(a.line - 29300) - Math.abs(b.line - 29300));
  return cands[0].expr;
}

function findFn(name) {
  const re = new RegExp(`function ${name.replace(/\$/g, '\\$')}\\s*\\(`);
  const m = re.exec(src);
  if (!m) return null;
  const braceStart = src.indexOf('{', m.index + m[0].length - 1);
  let depth = 0, i = braceStart, inStr = null;
  while (i < src.length) {
    const c = src[i];
    if (inStr) { if (c === '\\') { i += 2; continue; } if (c === inStr) inStr = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) return src.slice(m.index, i + 1); }
    i++;
  }
  return null;
}
const decls = [];
for (const [, decl] of resolved) decls.push(decl);
const missing = [...unresolved].filter((n) => !resolved.has(n));
if (missing.length) console.error(`missing defs (will be treated as errors on eval): ${missing.join(', ')}`);

const bootstrap = `
  ${decls.join('\n')}
  var QU = arguments[0];
  var VM = { leap: arguments[1] };
  var sites = arguments[2];
  var fns = sites.map((s) => eval('(' + s.fn + ')'));
  return { fns, zG: (typeof zG === 'undefined' ? null : zG) };
`;
let make;
try { make = new Function(bootstrap); }
catch (e) { console.error('bootstrap compile error:', e.message); writeFileSync('/tmp/cw-bootstrap.js', bootstrap); throw e; }

// ---------------- 3. 求值语料 ----------------
const corpus = {};
const errors = [];
for (const QU of [false, true]) {
  for (const leapKey of ['Space']) {
    const ctx = make(QU, leapKey, sites);
    for (const extra of [0, 1, 2]) {
      if (ctx.zG) ctx.zG.extra = extra;
      sites.forEach((site, i) => {
        for (let rank = 1; rank <= site.maxLevel; rank++) {
          let text;
          try { text = String(ctx.fns[i](rank)); }
          catch (e) { errors.push(`${site.id} r${rank} extra${extra} QU${QU}: ${e.message}`); continue; }
          (corpus[site.id] ||= new Set()).add(text);
        }
      });
    }
  }
}
if (errors.length) console.error('EVAL ERRORS:\n' + [...new Set(errors)].join('\n'));

const out = {};
for (const k of Object.keys(corpus)) out[k] = [...corpus[k]].sort();
const target = resolve(rootDir, 'zh/describe-corpus.json');
if (!process.argv.includes('--dry')) writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
let total = 0;
for (const k of Object.keys(out)) { total += out[k].length; console.log(`${k}: ${out[k].length}`); }
console.error(`total unique strings: ${total}`);

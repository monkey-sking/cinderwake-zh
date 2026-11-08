/**
 * 从 Cinderwake 主程序（格式化后的 JS）里抽取界面/技能/装备/图鉴/提示文案。
 * 只做「候选文本 + 出处行号」的机械提取，人工再筛，避免手抄漏项。
 *
 * 用法: node cinderwake/tools/extract-strings.mjs /tmp/cinderwake-formatted.js > cinderwake/strings.json
 */
import { readFileSync } from 'node:fs';

const src = readFileSync(process.argv[2] || '/tmp/cinderwake-formatted.js', 'utf8');
const lines = src.split('\n');

/** 找到反引号模板字符串的结束位置（正确处理 ${ ... } 嵌套） */
function findTemplateEnd(text, start) {
  let i = start + 1, depth = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`' && depth === 0) return i;
    if (c === '$' && text[i + 1] === '{') { depth += 1; i += 2; continue; }
    if (c === '}' && depth > 0) { depth -= 1; i += 1; continue; }
    i += 1;
  }
  return -1;
}

/** 模板字符串里的 ${...} 挖成占位符，便于后续做正则匹配 */
function toPattern(raw) {
  let out = '', i = 0, slots = 0;
  while (i < raw.length) {
    if (raw[i] === '$' && raw[i + 1] === '{') {
      let depth = 0, j = i + 1;
      for (; j < raw.length; j++) {
        if (raw[j] === '{') depth++;
        else if (raw[j] === '}') { depth--; if (!depth) break; }
      }
      out += `\x00${slots}\x00`; slots += 1; i = j + 1; continue;
    }
    if (raw[i] === '\\') {
      const n = raw[i + 1];
      out += n === 'n' ? ' ' : n === 'u' ? raw.slice(i, i + 6) : (n || raw[i]);
      i += 2; continue;
    }
    out += raw[i]; i += 1;
  }
  return out.replace(/\s+/g, ' ').trim();
}

const MIN = 8;            // 短串交给 UI 词典人工整理
const isProse = (s) => /[A-Za-z]{2,}/.test(s)
  && /\s/.test(s.trim())
  && !/[<>{}|\\^_]|https?:|\.js|\.css|\.glb|\.webp|\.png|function|=>/.test(s)
  && /[a-z]{3,}\s[a-z]{3,}/.test(s.toLowerCase());

const found = new Map();
for (let li = 0; li < lines.length; li++) {
  const line = lines[li];
  for (let ci = 0; ci < line.length; ci++) {
    if (line[ci] !== '`') continue;
    const end = findTemplateEnd(line, ci);
    if (end === -1) continue;                       // 跨行模板，本轮不处理
    const raw = line.slice(ci + 1, end);
    ci = end;
    if (raw.length < MIN) continue;
    const text = toPattern(raw);
    if (!isProse(text)) continue;
    const key = text;
    if (!found.has(key)) found.set(key, { text, line: li + 1, hits: 0 });
    found.get(key).hits += 1;
  }
}

/** 跨行模板单独扫一遍（少见但存在） */
for (let ci = 0; ci < src.length; ci++) {
  if (src[ci] !== '`') continue;
  const end = findTemplateEnd(src, ci);
  if (end === -1) { ci += 1; continue; }
  const raw = src.slice(ci + 1, end);
  if (!raw.includes('\n')) { ci = end; continue; }  // 单行已在上面处理
  ci = end;
  if (raw.length < MIN || raw.includes('SVGPath') || /M\d/.test(raw)) continue;
  const text = toPattern(raw);
  if (!isProse(text)) continue;
  const line = src.slice(0, ci).split('\n').length;
  if (!found.has(text)) found.set(text, { text, line, hits: 1 });
}

const items = [...found.values()].sort((a, b) => a.line - b.line);
console.log(JSON.stringify({ source: 'index-Bik5Serm.js', count: items.length, items }, null, 2));

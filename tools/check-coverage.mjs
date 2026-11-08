/**
 * 覆盖率校验：用「已构建的油猴脚本」里的真实字典与模式，跑一遍 describe-corpus.json
 * 以及附加的 HUD / 动态模板语料，报告所有未被命中的英文字符串。
 *
 * 用法：
 *   node cinderwake/tools/check-coverage.mjs            # 只跑 describe-corpus
 *   node cinderwake/tools/check-coverage.mjs --all      # 再加上 extra-corpus.json
 *   node cinderwake/tools/check-coverage.mjs --all --json
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const script = readFileSync(resolve(rootDir, 'cinderwake-zh.user.js'), 'utf8');

function extractJson(linePrefix) {
  const start = script.indexOf(linePrefix);
  if (start === -1) throw new Error(`找不到 ${linePrefix}`);
  const from = start + linePrefix.length;
  const open = script[from];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) throw new Error(`无法解析 ${linePrefix} 的起始括号`);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = from; i < script.length; i++) {
    const ch = script[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(script.slice(from, i + 1));
    }
  }
  throw new Error(`未找到 ${linePrefix} 的结束括号`);
}

const EXACT_MAP = extractJson('const EXACT_MAP = ');
const RAW_PATTERNS = extractJson('const RAW_PATTERNS = ');

// 复用与运行时完全一致的 i18n-core 实现
const coreCode = readFileSync(resolve(__dirname, 'lib/i18n-core.js'), 'utf8');
const coreFn = new Function(coreCode + '\nreturn createI18nCore(arguments[0], arguments[1]);');
const core = coreFn(EXACT_MAP, RAW_PATTERNS);
const translateText = (t) => core.translateText(t);

// 收集语料
const corpus = JSON.parse(readFileSync(resolve(rootDir, 'zh/describe-corpus.json'), 'utf8'));
const groups = [];
for (const [key, list] of Object.entries(corpus)) {
  for (const s of list) groups.push({ group: key, en: s });
}

if (process.argv.includes('--all')) {
  const extra = resolve(rootDir, 'zh/extra-corpus.json');
  if (existsSync(extra)) {
    const data = JSON.parse(readFileSync(extra, 'utf8'));
    for (const [key, list] of Object.entries(data)) {
      for (const s of list) groups.push({ group: key, en: s });
    }
  }
  const hudPath = resolve(rootDir, 'zh/hud-corpus.json');
  if (existsSync(hudPath)) {
    const hud = JSON.parse(readFileSync(hudPath, 'utf8'));
    for (const [key, list] of Object.entries(hud)) {
      for (const s of list) groups.push({ group: 'hud:' + key, en: s });
    }
  }
}

const failed = [];
for (const item of groups) {
  if (translateText(item.en) === null) failed.push(item);
}

const total = groups.length;
const pass = total - failed.length;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total, pass, failed }, null, 2));
} else {
  console.log(`覆盖率：${pass}/${total}` + (total ? ` (${((pass / total) * 100).toFixed(1)}%)` : ''));
  if (failed.length) {
    console.log(`\n未命中 ${failed.length} 条：`);
    let lastGroup = null;
    for (const f of failed) {
      if (f.group !== lastGroup) {
        console.log(`\n[${f.group}]`);
        lastGroup = f.group;
      }
      console.log('  - ' + JSON.stringify(f.en));
    }
  }
}

process.exit(failed.length ? 1 : 0);

/**
 * 以「源码模板静态片段」为单位生成技能描述汉化字典。
 *
 * 为什么这样做：describe() 的真实渲染文本里，可选片段有时为空（`, the arc wider`
 * 只在 3 级以上出现），用占位符正则很难可靠匹配。这里直接复用游戏自己的求值器：
 *   英文 pass -> 原样求值得到 en 文本
 *   中文 pass -> 把同一函数里的静态英文片段换成中文后求值，得到对齐的 zh 文本
 * 两边按 (skill, rank, 变体) 一一配对；求值失败或译文不变的结果会单独报告。
 *
 * 用法：
 *   node cinderwake/tools/describe-dict.mjs chunks   # 生成待译片段 zh/describe-chunks.json
 *   node cinderwake/tools/describe-dict.mjs build    # 用已填好 zh 的清单生成 zh/describe-zh.json
 *   node cinderwake/tools/describe-dict.mjs audit    # 检查中文结果里残留的英文
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectDescribeSites,
  buildEvaluator,
  literalChunks,
  applyChunkMap,
  forEachVariant,
} from './lib/describe-runtime.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const mode = process.argv[2];
const bundlePath = process.argv[3] && !process.argv[3].startsWith('--')
  ? process.argv[3] : '/tmp/cinderwake-formatted-new.js';

const CHUNKS_FILE = resolve(rootDir, 'zh/describe-chunks.json');
const DICT_FILE = resolve(rootDir, 'zh/describe-zh.json');

const src = readFileSync(bundlePath, 'utf8');
const { sites, lineOf } = collectDescribeSites(src);
const enEval = buildEvaluator(src, sites, lineOf);
if (enEval.missing.length) console.error(`missing defs: ${enEval.missing.join(', ')}`);

// 只把「像英文句子片段」的字面量纳入待译清单：路径、图标、十六进制色、id 等跳过
const HAS_PROSE = /[A-Za-z]{2,}[A-Za-z'’\-,\. ]*/;
const NOT_PROSE = /^(https?:|\/|#[0-9a-fA-F]{3,8}$)/;
// 出现在完整描述里的短片段必须纳入清单，否则整句会以英文开头或夹英文
const PROSE_WHITELIST = new Set([
  'Every ', 'far ', 'Hurls ', ' bolt', ' damage', 'Flings ', 's, ', 's.',
]);

function isProse(text) {
  if (!text || !text.trim()) return false;
  const t = text.trim();
  if (NOT_PROSE.test(t)) return false;
  if (PROSE_WHITELIST.has(t)) return true;
  if (!HAS_PROSE.test(t)) return false;
  // 单词数 < 2 且不含句末标点/百分号的，多半是枚举值或 id
  const words = t.split(/\s+/).length;
  if (words < 2 && !/[.!?%:;]$/.test(t)) return false;
  return true;
}

function collectVariantMap(sitesForEval, evaluatorMake) {
  const out = new Map();
  const errors = [];
  forEachVariant(sitesForEval, evaluatorMake, (v, err) => {
    if (err) {
      errors.push(`${err.site.id} r${err.rank} QU${err.QU} extra${err.extra}: ${err.error}`);
      return;
    }
    out.set(`${v.site.id}|${v.rank}|${v.QU ? 1 : 0}|${v.extra}`, v.text);
  });
  return { out, errors };
}

function translatedSites(chunkMap) {
  return sites.map((s) => ({ ...s, fn: applyChunkMap(s.fn, chunkMap).code }));
}

function polishZh(text) {
  return text
    .replace(/Every (\d+(?:\.\d+)?)s/g, '每 $1 秒')
    .replace(/\bEvery\b/g, '每')
    .replace(/一道火线far 延伸到前方/g, '一道火线远距离延伸到前方')
    .replace(/\bfar\b/g, '远距离')
    .replace(/穿透前 one 个击中的敌人/g, '穿透前 1 个击中的敌人')
    .replace(/\bone\b/g, '1')
    .replace(/Hurls 1 bolt[，, ]*(造成)?/g, '向最近的敌人射出 1 枚飞弹，造成')
    .replace(/Hurls (\d+) bolts[，, ]*(造成)?/g, '向最近的敌人射出 $1 枚飞弹，造成')
    .replace(/(\d+)\s*damage\.?/g, '$1 点伤害')
    .replace(/\bHurls\b/g, '猛掷')
    .replace(/\bbolts?\b/g, '飞弹')
    .replace(/\bdamage\.?\b/g, '点伤害')
    .replace(/Flings (\d+) 块炽热煤块/g, '向前方投掷 $1 块炽热煤块')
    .replace(/\bFlings\b/g, '投掷')
    .replace(/Slings (\d+) 个敌人/g, '将 $1 个敌人')
    .replace(/\bSlings\b/g, '投掷')
    .replace(/(\d+)\s*arms熔渣之臂/g, '$1 条熔渣之臂')
    .replace(/\barms\b/g, '条熔渣之臂')
    .replace(/\bLMB\b/g, '鼠标左键')
    .replace(/\bFissure:/g, '地裂：')
    .replace(/\bSeam:/g, '矿层：')
    .replace(/\bVein:/g, '矿脉：')
    .replace(/Heals (\d+)% 最大生命值的生命回复（受击中敌人数量加成，至多 (\d+)\/挥动/g, '每次挥动每击中一名敌人回复 $1% 最大生命值（至多 $2 名）')
    .replace(/\bHeals\b/g, '回复')
    .replace(/\bTwo\b/g, '两')
    .replace(/\bThree\b/g, '三')
    .replace(/\bFour\b/g, '四')
    .replace(/\bfive\b/g, '五')
    .replace(/\bfour\b/g, '四')
    .replace(/\bthree\b/g, '三')
    .replace(/\btwo\b/g, '两')
    .replace(/\bSpace\b/g, '空格键')
    // 复数片段 "s" 译空后会粘在前一个中文名词上，如「火箭s」
    .replace(/火箭s/g, '火箭')
    .replace(/(\d(?:\.\d+)?)s\./g, '$1 秒。')
    .replace(/([一二两三四五六七八九十]) (颗|枚|名|道|座|块)/g, '$1$2');
}

function doChunks() {
  const chunkSet = new Set();
  for (const s of sites) {
    for (const ch of literalChunks(s.fn)) if (isProse(ch.decoded)) chunkSet.add(ch.decoded);
  }
  // 依赖数值表/辅助函数里也可能带文案
  for (const decl of enEval.resolved.values()) {
    for (const ch of literalChunks(decl)) if (isProse(ch.decoded)) chunkSet.add(ch.decoded);
  }

  const enPass = collectVariantMap(sites, enEval.make);
  const allTexts = [...enPass.out.values()];

  // 复用已有译文
  const existing = new Map();
  if (existsSync(CHUNKS_FILE)) {
    for (const item of JSON.parse(readFileSync(CHUNKS_FILE, 'utf8'))) {
      if (item && item.en) existing.set(item.en, item.zh || '');
    }
  }

  const list = [...chunkSet].sort().map((en) => {
    const contexts = [];
    for (const text of allTexts) {
      if (text.includes(en.trim())) {
        contexts.push(text);
        if (contexts.length >= 2) break;
      }
    }
    return { en, zh: existing.get(en) || '', contexts };
  });
  writeFileSync(CHUNKS_FILE, JSON.stringify(list, null, 2) + '\n');
  console.log(`写出 ${list.length} 个待译片段 -> ${CHUNKS_FILE}`);
  console.log(`其中已有译文 ${list.filter((x) => x.zh).length} 个，待译 ${list.filter((x) => !x.zh).length} 个`);
}

function doBuild() {
  if (!existsSync(CHUNKS_FILE)) throw new Error(`缺少 ${CHUNKS_FILE}，请先跑 chunks`);
  const list = JSON.parse(readFileSync(CHUNKS_FILE, 'utf8'));
  const chunkMap = Object.create(null);
  let blank = 0;
  for (const item of list) {
    if (!item.zh || !String(item.zh).trim()) { blank++; continue; }
    chunkMap[item.en] = String(item.zh);
  }
  console.log(`片段 ${list.length} 个，已译 ${list.length - blank} 个，未译 ${blank} 个`);

  const zhEval = buildEvaluator(src, sites, lineOf, { chunkMap });
  const enPass = collectVariantMap(sites, enEval.make);
  const zhPass = collectVariantMap(translatedSites(chunkMap), zhEval.make);

  const dict = Object.create(null);
  const conflicts = [];
  const dropped = [];
  for (const [key, en] of enPass.out) {
    const rawZh = zhPass.out.get(key);
    const zh = rawZh ? polishZh(rawZh) : rawZh;
    if (!zh || zh === en) { dropped.push(en); continue; }
    if (dict[en] && dict[en] !== zh) conflicts.push({ en, a: dict[en], b: zh });
    else dict[en] = zh;
  }

  const sorted = {};
  for (const k of Object.keys(dict).sort()) sorted[k] = dict[k];
  writeFileSync(DICT_FILE, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`写出 ${Object.keys(sorted).length} 条 en->zh -> ${DICT_FILE}`);
  if (dropped.length) console.log(`中英相同/未产生中文：${new Set(dropped).size} 条`);
  if (conflicts.length) {
    console.log(`冲突 ${conflicts.length} 处（保留先出现的译法）：`);
    for (const c of conflicts.slice(0, 5)) console.log(`  EN: ${c.en}\n   A: ${c.a}\n   B: ${c.b}`);
  }
  if (enPass.errors.length) console.log(`英文求值错误 ${enPass.errors.length}`);
  if (zhPass.errors.length) console.log(`中文求值错误 ${zhPass.errors.length}\n` + [...new Set(zhPass.errors)].slice(0, 10).join('\n'));
}

function doAudit() {
  if (!existsSync(DICT_FILE)) throw new Error(`缺少 ${DICT_FILE}，请先跑 build`);
  const dict = JSON.parse(readFileSync(DICT_FILE, 'utf8'));
  const leftovers = [];
  for (const [en, zh] of Object.entries(dict)) {
    const m = zh.match(/[A-Za-z][A-Za-z'’\-.]{2,}/g);
    if (m) leftovers.push({ en, zh, words: [...new Set(m)] });
  }
  console.log(`字典 ${Object.keys(dict).length} 条，中文里残留英文 ${leftovers.length} 条`);
  for (const item of leftovers.slice(0, Number(process.argv[4] || 30))) {
    console.log(`\nEN: ${item.en}\nZH: ${item.zh}\n残留: ${item.words.join(', ')}`);
  }
}

if (mode === 'chunks') doChunks();
else if (mode === 'build') doBuild();
else if (mode === 'audit') doAudit();
else console.log('用法: node describe-dict.mjs [chunks|build|audit] [bundlePath]');

/**
 * 从 cinderwake-formatted.js 结构化解析文案并输出各类字典骨架
 */
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('/tmp/cinderwake-formatted.js', 'utf8');

// 1. 角色 (yj)
const yjIdx = src.indexOf('var yj =');
const bjIdx = src.indexOf('bj = `cinderwake.character`');
let chars = [];
if (yjIdx !== -1 && bjIdx !== -1) {
  const yjStr = src.slice(yjIdx + 'var yj = '.length, bjIdx).trim().replace(/,\s*$/, '');
  chars = eval(yjStr);
}

// 2. 状态名 (Vj)
const vjIdx = src.indexOf(', Vj = [{ name: `Shocked`');
let statuses = [];
if (vjIdx !== -1) {
  const vjEnd = src.indexOf('}];', vjIdx);
  const vjStr = src.slice(vjIdx + ', Vj = '.length, vjEnd + 2);
  statuses = eval(vjStr);
}

// 3. Hearth 局外升级条目 (hU)
const huIdx = src.indexOf(', hU = [{ id: `vitality`');
let hearthItems = [];
if (huIdx !== -1) {
  const huEnd = src.indexOf('];\nfunction gU()', huIdx);
  const huSnippet = src.slice(huIdx, huEnd);
  for (const m of huSnippet.matchAll(/id:\s*`([^`]+)`,\s*(?:glyph:\s*`([^`]+)`,\s*)?name:\s*`([^`]+)`/g)) {
    hearthItems.push({ id: m[1], glyph: m[2], name: m[3] });
  }
}

// 4. 技能列表 (wq 数组，包含 id, name, describe)
const skillMatches = [...src.matchAll(/id:\s*`([^`]+)`,\s*name:\s*`([^`]+)`/g)];
const skillDefs = [];
const seenIds = new Set();
for (const m of skillMatches) {
  if (seenIds.has(m[1])) continue;
  seenIds.add(m[1]);
  skillDefs.push({ id: m[1], name: m[2] });
}

// 5. 图鉴技能 (uY)
const codexSkillsMatch = src.match(/var lY = \[`AOE`[\s\S]*?\],\s*uY = (\{[\s\S]*?\})\s*,\s*dY/);
let codexSkills = {};
if (codexSkillsMatch) {
  try { codexSkills = eval('(' + codexSkillsMatch[1] + ')'); } catch (e) { console.error('uY parse fail', e.message); }
}

// 6. 图鉴怪物 (fY)
const codexMobsMatch = src.match(/dY = \[`Melee`[\s\S]*?\],\s*fY = (\{[\s\S]*?\})\s*,\s*pY/);
let codexMobs = {};
if (codexMobsMatch) {
  try { codexMobs = eval('(' + codexMobsMatch[1] + ')'); } catch (e) { console.error('fY parse fail', e.message); }
}

// 7. 战斗怪物名 (lI)
const combatMobsMatch = src.match(/var lI = (\{[\s\S]*?\})\s*,\s*Z = Object\.values\(lI\)/);
let combatMobs = {};
if (combatMobsMatch) {
  for (const m of combatMobsMatch[1].matchAll(/(\w+):\s*\{[^}]*?name:\s*`([^`]+)`/g)) {
    combatMobs[m[1]] = m[2];
  }
}

// 8. 装备字典 (gY)
const gyIdx = src.indexOf('gY = { emberwright_lantern:');
let gears = [];
if (gyIdx !== -1) {
  // gY 结束在 `function vY`
  const gyEnd = src.indexOf('function vY', gyIdx);
  const gyStr = gyEnd !== -1 ? src.slice(gyIdx, gyEnd) : src.slice(gyIdx, gyIdx + 40000);
  for (const m of gyStr.matchAll(/(\w+):\s*\{\s*id:\s*`([^`]+)`(?:,\s*char:\s*`([^`]+)`)?,\s*name:\s*`([^`]+)`[\s\S]*?text:\s*`([^`]+)`/g)) {
    gears.push({ key: m[1], id: m[2], char: m[3] || null, name: m[4], text: m[5] });
  }
}

// 9. 更新日志 (QY)
const newsMatch = src.match(/var QY = (\[[\s\S]*?\])\s*,\s*\$Y/);
let news = [];
if (newsMatch) {
  try { news = eval(newsMatch[1]); } catch (e) { console.error('QY parse fail', e.message); }
}

// 10. 加载 Tips ($Y)
const tipsIdx = src.indexOf(', $Y = [`Cinder Shield soaks damage');
let tips = [];
if (tipsIdx !== -1) {
  const tipsEnd = src.indexOf('], eX =', tipsIdx);
  const tipsStr = src.slice(tipsIdx + ', $Y = '.length, tipsEnd + 1);
  try { tips = eval(tipsStr); } catch (e) { console.error('$Y eval fail', e.message); }
}

console.log({
  chars: chars.length,
  statuses: statuses.length,
  hearthItems: hearthItems.length,
  skills: skillDefs.length,
  codexSkills: Object.keys(codexSkills).length,
  codexMobs: Object.keys(codexMobs).length,
  combatMobs: Object.keys(combatMobs).length,
  gears: gears.length,
  news: news.length,
  tips: tips.length
});

writeFileSync('/tmp/cw-extracted.json', JSON.stringify({
  chars,
  statuses,
  hearthItems,
  skillDefs,
  codexSkills,
  codexMobs,
  combatMobs,
  gears,
  news,
  tips
}, null, 2));

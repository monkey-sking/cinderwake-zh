# Cinderwake 非技能 UI / 动态文案语料提取与分析报告

## 1. 范围与产物

- **任务目标**：穷尽式提取 Cinderwake 游戏主程序中所有「非技能 `describe()`」的用户可见英文字符串（覆盖 HUD、设置面板、控制键位、暖炉升级树、装备浮层、精英词缀、战斗广播、图鉴元数据、账号/登录、排行榜、提示与结算等）。
- **数据产物**：
  - `cinderwake/zh/hud-corpus.json`：共 **24 组**，**946 条完整英文渲染字符串**（去重后 **891 条**）。包含动态模板在运行期的多数值真实采样（2~3 个具体示例）。纯英文字符串，未包含任何中文字段。
- **报告产物**：
  - `cinderwake/zh/hud-report.md`（本报告）。
- **约束遵循**：本任务未修改仓库已有文件（`describe-corpus.json`、`patterns.json`、`ui.json`、`terms.json`、`gear.json`、`codex.json` 等原样保留），未提交 Git。

---

## 2. 数量与分组统计

总计 **946 条字符串**，去重后 **891 条全唯一英文字符串**，涵盖 **24 个业务分组**。

| 分组 ID (`group`) | 提取条数 | 主要覆盖模块与源码区段 |
|---|---:|---|
| `hud` | 14 | 局内顶部与底部 HUD（击杀、等级、余烬、Boss 倒计时/血条状态、全屏提示）`31861-31889` |
| `controls` | 35 | 控制说明、默认按键、按键规范名映射与重置 `22781-22816`, `32144-32178` |
| `title_loading` | 41 | 标题菜单、副标题、玩法指引、初始加载、版本公告 `31957-32075` |
| `character_select` | 21 | 角色切换卡片（灰烬使者/司炉工）、定位描述与载入失败提示 `31420-31500` |
| `settings_tabs_labels`| 29 | 设置抽屉选项卡（Display, Audio, Controls, Game）及各分组标签 `32200-32252` |
| `settings_options` | 30 | 设置项可选枚举值（分辨率、刷新率、颜色风格、粒子量等）`31574`, `31620`, `32219-32249` |
| `settings_help` | 4 | 设置抽屉说明 Tooltip 与小贴士 `32243-32244` |
| `pause_draft_results` | 53 | 暂停菜单、升级三选一/四选一面板、死亡/清场黎明面板、结算统计 `32139-32143`, `32254-32326` |
| `leaderboard` | 19 | 排行榜表头、作用域切换（Everyone/Friends）、排序指标、无数据与网络错误状态 `32080-32136` |
| `hearth` | 35 | 暖炉天赋值、升级树名称与阶级描述、花费余烬文案 `28502-28504`, `32362-32390` |
| `account_status` | 42 | 第三方账号登录（Google/X/Steam）、账号绑定解绑、匿名迁移与删除提示 `30701`, `32330-32360` |
| `email_updates` | 22 | 邮件订阅更新状态（输入、验证、成功订阅、取消提示）`32353-32360` |
| `news` | 41 | 游戏更新公告标题、更新日期与正文列表 `31574`, `32180-32196` |
| `loading_tips` | 18 | 加载画面随机 Tip 知识库 `31574`, `32075` |
| `status_toasts` | 8 | 局内轻量弹出 Toast（余烬获得、连接恢复、上传失败等）`31889`, `32312-32317` |
| `gear_names` | 125 | 41 件基础装备名 + 高阶 II/III 名 + 司炉工 Firebox 变体名 `28400-28500`, `32450-32500` |
| `gear_tooltip` | 220 | 装备浮层属性、阶级描述、替换与装备槽位操作提示、按键交互说明 `31790-31800`, `32450-32500` |
| `affixes` | 42 | 精英怪 12 种词缀名、1 阶/2 阶效果描述及其在血条上的完整组合渲染 `25084` |
| `battle_announcements`| 41 | 局内波次警报、Boss 降临/转阶段/破盾/击杀的全屏大广播 `34883-36474` |
| `codex_meta` | 17 | 图鉴概览、解锁进度统计模板、未解锁提示文本、图鉴交互按键 `32400-32450` |
| `skill_names` | 34 | 全部主动/被动/司炉工技能标准英文名（来自 terms.json） |
| `boss_names` | 15 | Boss 英文专有名词（来自 terms.json） |
| `monster_names` | 27 | 小怪/精英怪标准英文名（来自 terms.json） |
| `status_effects` | 9 | 9 种异常状态/标记词（Burning, Shocked, Branded...） |

---

## 3. 动态模板骨架、源码位置与真实渲染示例

以下为核心动态模板骨架、源码行号与渲染示例对照表：

| 业务域 | 模板骨架 | 源码行号 | 真实运行期渲染示例（2~3 采样） |
|---|---|---:|---|
| **HUD** | `Kills ${kills}` | `31870, 31882` | `Kills 0` / `Kills 7` / `Kills 42` |
| **HUD** | `${bossName} walks` | `31882` | `The Hollow Warden walks` / `The Unmade walks` |
| **HUD** | `${bossName} burn` | `31882` | `The Twin Kilns burn`（双生熔炉特判谓词） |
| **HUD** | `${bossNext} in ${MM:SS}` | `31882` | `The Hollow Warden in 0:00` / `The Hollow Warden in 2:33` / `The Unmade in 12:05` |
| **HUD** | `${xp} / ${maxHp}` | `31882` | `45 / 100` / `120 / 120` |
| **HUD** | `+${xpGained}` | `31889` | `+1` / `+24` / `+42` |
| **操作** | `${key} for fullscreen` | `31926-31933` | `F for fullscreen`（或 `for fullscreen` 单节点） |
| **标题** | `Playing as ${heroName}` | `31986` | `Playing as The Emberwright` / `Playing as The Stoker` |
| **角色** | `Unlocked at Level ${n}` | `31450` | `Unlocked at Level 5` / `Unlocked at Level 10` |
| **角色** | `Requires ${name} rank ${r}` | `31462` | `Requires Emberwright rank 3` / `Requires Stoker rank 2` |
| **升级三选一** | `Choose a boon (${keys})` | `32258` | `Choose a boon (1, 2, 3)` / `Choose a boon (1, 2, 3, 4)` |
| **升级三选一** | `Tap a boon to choose` | `32258` | `Tap a boon to choose`（移动端对应文案） |
| **升级三选一** | `Level ${lvl}` | `32264` | `Level 2` / `Level 7` / `Level 15` |
| **升级三选一** | `Level ${lvl} → ${lvl+1}` | `32264` | `Level 1 → 2` / `Level 4 → 5` |
| **升级三选一** | `Rank ${r} / ${max}` | `32265` | `Rank 1 / 5` / `Rank 3 / 5` |
| **升级三选一** | `Keep ${skill}` | `32270` | `Keep Cinder Bolt` / `Keep Arc Lash` |
| **升级三选一** | `Change to ${skill}` | `32270` | `Change to Flame Wake` / `Change to Shovelful` |
| **升级三选一** | `Replace which?` | `32272` | `Replace which?`（满槽时替换提示） |
| **结算** | `Survived ${MM:SS} · Level ${lvl} · ${kills} kills · ${diff}` | `32312` | `Survived 2:33 · Level 9 · 42 kills · Medium`<br>`Held the line for 12:05 · Level 37 · 1,284 kills · Hard` |
| **结算** | `Gained ${n} cinders` | `32314` | `Gained 12 cinders` / `Gained 150 cinders` |
| **暖炉** | `Cost: ${n} cinders` | `32375` | `Cost: 10 cinders` / `Cost: 50 cinders` |
| **暖炉** | `Rank ${r} / ${max}` | `32378` | `Rank 0 / 5` / `Rank 2 / 5` / `Rank 5 / 5` |
| **暖炉** | `Max rank` | `32378` | `Max rank` |
| **暖炉** | `+${val}% ${stat}` | `28503` | `+15% damage` / `+18% damage` / `+10% area` |
| **暖炉阶级预览** | `${current} → ${next}` | `32380` | `+5 health, 0.4/s regen → +8 health, 0.8/s regen`<br>`+15% damage → +18% damage` |
| **装备阶级** | `${gearName} ${Tier}` | `32456` | `Gravewick Lantern II` / `Conduit Spike III` |
| **装备升级提示** | `Upgrades ${name}` | `32459` | `Upgrades Gravewick Lantern` / `Upgrades Conduit Spike` |
| **装备替换提示** | `Replaces ${name}` | `32459` | `Replaces Iron Shovel` / `Replaces Cinder Core` |
| **装备前置要求** | `${skill} (you don't have it)` | `31798` | `Kindling (you don't have it)` / `Stoke! (you don't have it)` |
| **精英词缀组合** | `${Affix}: ${desc}` | `25084` | `Swift: moves much faster` / `Swift II: moves very fast`<br>`Brutal: hits much harder` / `Brutal II: hits twice as hard` |
| **图鉴进度** | `${seen} / ${total} discovered` | `32412` | `3 / 12 discovered` / `8 / 36 seen` / `2 / 18 met` |
| **账号状态** | `Signed in as ${user}, with ${providers}.` | `30701` | `Signed in as Ashkeeper, with Google.`<br>`Signed in as Ashkeeper, with Google and Steam.` |

---

## 4. 大写转换与 CSS 影响排查

本任务深入排查了主程序 JS 与编译后样式表（CSS）：

### 1. CSS `text-transform: uppercase` 发现
样式表中共发现 13 处设置了全大写转换：
- `.target-tier`：目标阶级（如 `Tier II`）
- `.setting-heading`：设置子标题（如 `GRAPHICS`, `AUDIO`）
- `.card-tag`：技能卡片标签（如 `NEW SKILL`, `PASSIVE`, `WEAPON`）
- `.sheet-heading`：角色面板标题（如 `ATTRIBUTES`, `KIT`）
- `.slot-label`：装备槽位标签（如 `LANTERN`, `CHARM`）
- `.codex-filter` / `.codex-tag`：图鉴过滤器及类别标签
- `.tip-slot` / `.works-label` / `.board-head` / `.news-badge` / `.news-date` / `.char-kind`

> **重要结论**：
> 浏览器 DOM 树中的 `textContent` **完全保留源代码的原始自然大小写**（如 `Rare`、`Sound`、`New skill`、`Lantern`），仅在屏幕渲染呈现大写视觉。
> **字典（`ui.json` / `patterns.json`）中必须使用自然大小写**，切勿录入全大写字符串（如切勿写 `RARE` 或 `NEW SKILL`），否则油猴脚本直接比对 `element.textContent` 时将全部失效！

### 2. JS 源码级 `.toUpperCase()`
全主程序（36569 行）中仅发现 2 处运行时大写调用：
1. **行 32456**：`slot.slice(0, 1).toUpperCase() + slot.slice(1)`（对装备槽名首字母大写，`focus` 单独特判为 `"Staff focus"`）。
2. **行 29391**：技能描述生成器中对首字母进行大写转换。
3. 罗马数字（`I`、`II`、`III`、`IV`、`V` 等）在 JS 中为显式全大写常量数组。

---

## 5. 覆盖率自查与未命中分析

通过复制 `cinderwake/tools/check-coverage.mjs` 测试引擎，加载当前现有的 `cinderwake-zh.user.js`（含当前线上构建的 `EXACT_MAP` 与 `RAW_PATTERNS`），对本次提取的 `hud-corpus.json`（946 条）进行了全量扫描：

- **总扫描条数**：946 条
- **已命中（覆盖）**：**709 条（74.9%）**
- **未命中缺口**：**237 条（25.1%）**

### 未命中分组分布
- `gear_names`：82 条（主要为装备的高阶 II / III 后缀名）
- `settings_options`：20 条（分辨率、刷新率、部分枚举颜色）
- `gear_tooltip`：19 条（高阶装备特殊描述、槽位独立标签）
- `controls`：18 条（按键名 `Esc`, `L Shift`, 符号 `◈`, `▤` 等）
- `account_status`：17 条（OAuth 提供商名与登录拼接句式）
- `affixes`：16 条（精英词缀两节点血条组合串与二级描述）
- `pause_draft_results`：15 条（三选一快捷键标题与黎明结算句）
- `codex_meta`：8 条（未遇到提示与统计骨架）
- `leaderboard`：7 条（榜单标签与离线提示）
- 其余各组小计：35 条

### 未命中 Top 20 示例
1. `Gravewick Lantern II`（高阶装备名）
2. `Gravewick Lantern III`（高阶装备名）
3. `Pick a level-up card`（按键设置说明）
4. `Fullscreen, for the best view (or ⌃ ⌘ F)`（全屏提示）
5. `Click a key to change it.`（重绑按键提示）
6. `Esc` / `L Shift` / `Num 1`（按键规范名）
7. `◈` / `▤` / `II`（移动端虚拟按键标签）
8. `WASD / arrows to move. Your skills cast on their own...`（初始玩法大段长文）
9. `Upgrades ` / `Replaces `（装备浮层带尾随空格的独立节点）
10. `Google` / `Steam` / `Link Google`（账号登录按钮）
11. `Signed in as Ashkeeper, with Google.`（账号状态拼接句）
12. `quickens nearby foes` / `hastes the horde`（精英词缀描述）
13. `Choose a boon (1, 2, 3)`（带可用数字键的升级标题）
14. `Held the line for 12:05 · Level 37 · 1,284 kills · Hard`（通关黎明结算句）
15. `Skills` / `Gear` / `Monsters`（图鉴分类标签）
16. `3 / 12 discovered`（图鉴收集统计）
17. `The leaderboard can’t be reached right now.`（排行榜错误提示）
18. `You’re on the list` / `Hear when it’s out`（邮件更新提示）
19. `+18% damage` / `+15% damage → +18% damage`（暖炉数值与升级预览分段）
20. `Stoke! (you don't have it)`（带感叹号技能名的前置提示）

---

## 6. 给后续补全模式与词条的建议

为使未命中的 237 条能够快速被汉化脚本覆盖，建议在后续构建时补充以下模式和词条：

1. **装备高阶后缀通用模式（一举覆盖 82 条）**：
   在 `patterns.json` 中增加：
   ```json
   "{0} II": "{0} II",
   "{0} III": "{0} III"
   ```
2. **暖炉升级对比预览模式**：
   ```json
   "{0} → {1}": "{0} → {1}"
   ```
   暖炉数值变化节点由 ` → ` 连结两个状态，增加此双槽模式即可直接让两侧的属性描述自动复用已有的属性翻译。
3. **升级卡片按键提示标题**：
   ```json
   "Choose a boon ({0})": "选择一项恩赐（{0}）"
   ```
4. **放宽技能插槽的正则字符集**：
   现有模式 `"{0} (you don't have it)"` 无法命中 `"Stoke! (you don't have it)"`，原因是插槽正则过滤了 `!`。将插槽匹配字符集微调后即可天然命中。
5. **词缀双节点拼接处理**：
   血条上的精英词缀渲染结构为：
   `<span>${affix}: </span><span>${desc}</span>`
   两者经常拆成独立节点渲染。需确保词缀名（如 `Swift`、`Brutal`）与短描述（如 `moves much faster`）在 `terms.json` 或 `ui.json` 中均有独立词条。
6. **带尾随空格的修饰词**：
   `"Upgrades "` 与 `"Replaces "` 后紧跟带颜色的装备名 span。汉化脚本宜对带空格的独立文本节点增加 trim 处理或独立词条映射 `"Upgrades ": "升级 "`、`"Replaces ": "替换 "`。
7. **静态常用词补全到 `ui.json`**：
   `Attributes`（属性）、`Health`（生命）、`Damage`（伤害）、`Cooldowns`（冷却）、`Area`（范围）、`Regeneration`（生命回复）、`Tier I/II/III`（一/二/三阶）、`Kit`（装备）、`Empty`（空）、`Leave it`（保留原样）。

# Cinderwake 简体中文汉化项目 (cinderwake-zh)

为网页肉鸽动作 RPG [Cinderwake](https://cinderwake.io/) 制作的完整简体中文汉化油猴脚本与本地化构建工程。

---

## 快速安装与使用

1. 安装浏览器扩展（[Tampermonkey](https://www.tampermonkey.net/)、Violentmonkey 或 ScriptCat）。
2. 打开油猴扩展管理面板，新建脚本。
3. 打开本项目生成的产物脚本文件：
   `cinderwake-zh.user.js`
   复制其全部内容，粘贴到油猴脚本编辑器中并保存。
4. 访问或刷新 [https://cinderwake.io/](https://cinderwake.io/) 即可体验全中文界面。

> **提示**：当本项目更新或重新构建后，请务必在油猴中**重新导入并覆盖最新脚本**（浏览器不会自动同步本地文件修改）。

---

## 项目结构

```text
cinderwake-zh/
├── cinderwake-zh.user.js   # 编译构建生成的单文件油猴脚本产物（直接安装）
├── package.json            # npm 配置与命令
├── zh/                     # 汉化词库与分片字典
│   ├── terms.json          # 专有名词（角色、部位、Boss、小怪、状态、标签等）
│   ├── ui.json             # 静态 UI、菜单、按键提示、结算与设置项
│   ├── patterns.json       # 动态正则模板（如数值/百分比/复合状态）
│   ├── describe-zh.json    # 技能升阶（Rank 1-11）动态全量求值字典（1,000+ 条）
│   ├── codex.json          # 技能与怪物图鉴全文
│   ├── gear.json           # 全角色装备、火箱变体与档位属性
│   ├── news.json           # 官方更新公告全文
│   └── tips.json           # 加载小贴士
├── tools/                  # 构建、扫描与静态分析工具链
│   ├── build-user-script.mjs   # 油猴脚本打包构建器
│   ├── describe-dict.mjs       # 技能动态描述求值生成工具
│   ├── check-coverage.mjs      # 词库对齐与覆盖率审计
│   └── lib/                    # 运行时与静态分析核心库
└── tests/                  # 单元测试与端到端回归测试 (node --test)
```

---

## 为什么进游戏还是能看到部分英文？

如果你已经安装了脚本，但游戏内某些地方依然显示英文，主要有以下几个技术原因：

### 1. 油猴扩展内未同步更新（最常见）
在本地更新词库并执行构建后，生成的是本地的 `cinderwake-zh.user.js`。浏览器扩展**不会**自动从本地文件系统热重载，必须手动打开油猴管理面板，将最新构建的代码复制进去覆盖并保存，然后强制刷新（Ctrl+F5 或 Cmd+Shift+R）清除浏览器缓存。

### 2. Canvas 2D / WebGL 离屏贴图物理限制
Cinderwake 采用 Three.js 构建 3D 场景与战斗画面：
- **HTML DOM 部分**（血条数值、技能卡片、装备描述、更新日志、设置菜单、伤害明细面板等）：由油猴脚本通过 `MutationObserver` 实时监听并翻译。
- **Canvas 场景内部绘制**（例如怪物头顶的名字、地面实时暴击伤害数字飘字、部分特效文字）：是游戏底层直接调用 `CanvasRenderingContext2D.prototype.fillText` 或 WebGL 纹理贴图绘制到画布上的。HTML 树中**根本不存在对应的文本节点 (TextNode)**，纯 DOM 脚本天然无法截获。

### 3. DOM 动态节点拆分与插槽拼接
部分战斗界面的说明是由多个标签拼接而成的（例如：`<span>Level </span><span>3</span><span> deals fire damage</span>`）。浏览器将其拆分为了独立的 TextNode，若词库中仅有完整的英文单句，孤立的文本碎片将无法精确匹配，从而回退显示为英文。

### 4. 游戏线上频繁热更新
Cinderwake 官方版本更新频繁（如近期推出的蒸气沼泽 Steamfen、高塔预览 Tower Preview、新角色石标投掷手等），游戏代码会被分割加载为新的 Chunk 分包。新出现的机制文本与未收录的播报需由分析工具提取后合入词库。

---

## 常用开发命令

```bash
# 运行全部自动化回归测试
npm test

# 重新构建油猴脚本 (cinderwake-zh.user.js)
npm run build

# 检查当前主程序覆盖率
npm run coverage
```

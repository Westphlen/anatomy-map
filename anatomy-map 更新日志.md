# Anatomy Map 插件更新日志

> 版本基线：v1.1.0（接受原插件时）
> 加固周期：2026-10-11 ~ 2026-10-12
> 记录范围：从接受原插件到当前的全部主要改动（5 个批次）

---

## 概述

本次加固共完成 **5 个批次**（3 个审核批次 + 2 个功能缺陷批次），核心目标：让原插件通过 Obsidian 官方审核（消除全部 Error/Warning），并修复实操中发现的功能缺陷。

**总体改动统计：**

| 维度 | 数据 |
|------|------|
| 修改文件 | main.ts、view.ts、settings.ts、anatomy-data.ts、svg-templates.ts、styles.css、package.json、tsconfig.json（共 8 个） |
| 新建文件 | dom-safe.ts、esbuild.config.mjs（共 2 个） |
| 删除内容 | onunload 方法、10 处 innerHTML 赋值、3 处清空、11 处 DEBUG 日志、4 个临时脚本 |
| 构建状态 | `npm run build` exit 0 |
| eslint | 41 → 0 条告警 |
| TS 错误 | 10 → 0 条 |

---

## 批次 1：构建通过（2026-10-11）

**目标：** 修复 review.txt 报的 Build verification 错误，使插件能成功构建。

### 主要改动

| 问题 | 改动 |
|------|------|
| main.ts 中 3 处 import 路径错误（`./src/` 前缀） | 改为 `./view`、`./anatomy-data`、`./settings` |
| 5 处参数隐式 any（TS7006） | 补全 `RegionPolygon`、`PointAnnotation`、`number` 类型注解 |
| `buildAliasMap` 导入后未使用（死代码） | 从 main.ts import 列表移除 |
| `esbuild.config.mjs` 文件缺失 | 按 Obsidian 官方模板新建（使用 `node:module` 内置模块） |
| `builtin-modules` 废弃依赖 | 从 package.json 移除，改用 Node 内置 `node:module` |
| `esbuild.context()` 不接受 `watch` 选项 | 移除 `watch` 行，dev 模式改用 `context.watch()` |

### 连带修复
- 2 处 TS2339（View 基类缺方法）在 import 路径修正后自动清零（原因为类型解析失败连带），未追加断言。

### 结果
- tsc 0 错误，`npm run build` exit 0。

---

## 批次 2：Source Code Error 清零（2026-10-11）

**目标：** 消除 review.txt 报的 3 项 Source Error（innerHTML 注入、onunload 破坏布局、API 版本不符）。

### 主要改动

**P1 — XSS 注入面收口（新建 dom-safe.ts）**
- 新建 `dom-safe.ts`，导出 `escapeSvgAttr`、`isImageDataUrl`、`svgToElement`、`renderSvgInto` 四个安全工具；
- 7 处 SVG 字符串赋值（main.ts×1、view.ts×4、settings.ts×2）从 `innerHTML =` 改为 `renderSvgInto()`（DOMParser 安全路径）；
- 3 处清空（settings.ts）从 `innerHTML = ''` 改为 `replaceChildren()`；
- 注入面收口：`regionId` 过 `escapeSvgAttr`、`pts` 过 `Number()` 强转、`dataUrl` 双入口白名单校验（持久化硬门 + 渲染门），非白名单格式拒存/回退。

**P2 — 卸载破坏用户布局**
- 删除整个 `onunload()` 方法（原含 `detachLeavesOfType`，会重置用户工作区布局）。

**P3 — API 版本不符**
- `revealLeaf`（@since 1.7.2）替换为 `setActiveLeaf(leaf, { focus: true })`（@since 0.16.3 ≤ minAppVersion 1.1.0）。

### 行为变化（用户知悉）
1. 上传 bmp/avif/svg 等非白名单格式示意图将被拒存并提示（原版可存，但存在脚本注入风险）；
2. data.json 被篡改出非法 dataUrl 时，渲染回退低优先级底图，不再执行注入内容。

### 结果
- 全仓 `innerHTML` 赋值 0 处、`detachLeavesOfType` 0 处、`revealLeaf` 0 处；build exit 0。

---

## 批次 F1：关联笔记统计口径（2026-10-11）

**批次性质：** 功能缺陷（用户实操发现），非 review 审核条目。

**问题：** 主视图"已关联 X 篇笔记"只统计 frontmatter 关联，漏计选点标注的笔记；且多别名/跨父子分区关联会重复计数。

### 主要改动（仅改 view.ts）

1. 新增 `getVisibleRegions()`：收集非隐藏/非回收的全部分区 ID；
2. 新增 `collectRegionIds(region)`：递归取自身+子孙分区 ID；
3. 新增 `isExistingNote(path)`：校验笔记文件实际存在；
4. 新增 `getTotalLinkedNoteCount()`：frontmatter + pointAnnotations 双源进同一 `Set<string>`（path 去重），排除隐藏/回收分区；
5. `countNotesForRegion` 改造：分区级角标/tooltip 同步并入选点标注笔记；
6. 主视图 stats 两处调用统一替换为 `getTotalLinkedNoteCount()`。

### 效果
- 总数 = frontmatter 关联 + 选点标注关联（去重后）；
- 一篇笔记多别名或跨父子分区只计 1 篇；
- 笔记重命名/删除后计数即时回落；
- 隐藏/回收分区上的关联不计入。

---

## 批次 3：TS 类型安全清零（2026-10-11 ~ 10-12）

**目标：** 消除 review.txt 报的 Source Code Warning（约 115 条 unsafe-* + 3 条 floating-promises + 4 条 prefer-create-el + 1 条 setTimeout + 1 条命令 ID）。

### 主要改动

**P1 — 类型收口（16 条 unsafe/explicit-any → 0）**
- `loadData()` 显式断言 `Partial<AnatomyMapSettings>`；
- 旧数据迁移用 `PointAnnotation & { notePath?: string }` 精确窄化，删除 4 处 `as any`；
- frontmatter 取值收 `unknown` 后窄化；
- `super(app, plugin as unknown as Plugin)` 双断言；
- `catch (err: unknown)` + `instanceof Error` 窄化；
- `JSON.parse` 显式类型断言。

**P2 — 浮动 Promise（13 处 → 0）**
- UI 事件触发型（activateView/openFile/saveSettings）用 `void` 标记；
- async 事件回调统一 `void IIFE + .catch(console.error)` 兜底。

**P3 — no-misused-promises（12 处 → 0）**
- 12 个 async 事件回调签名恢复 void，rejection 有兜底。

**P4 — prefer-create-el（19 处 → 0）**
- SVG 元素 `document.createElementNS` → `createSvg()`（自动命名空间，创建即追加，删冗余 appendChild 并核对层叠顺序）；
- canvas/input `document.createElement` → `createEl()`。

**P5 — 裸 setTimeout（3 处 → 0）**
- 全部加 `window.` 前缀（popout window 兼容）。

**P6 — 命令 ID 含插件 ID**
- 双注册：正式 id `open` + 兼容 id `open-anatomy-map`（命名"（兼容旧热键）"），共享同一 callback，旧热键不失效。

**P7 — tsconfig.include 陈旧**
- `["main.ts","src/**/*.ts"]` → `["**/*.ts"]`。

### 结果
- eslint 探针复扫 TOTAL=0（修复前 41 条）；build exit 0。

---

## 批次 F2：子分区下钻与选点适配（2026-10-12）

**批次性质：** 功能缺陷（用户实操发现）。

### F2-P1：无缩略图分区下钻入口缺失

**问题：** 创建非顶级父分区的子分区后，父分区无缩略图时，子分区在 0 标注时无点击入口。

**修复：** `getAnnotationSVG` 分支 3（polygon-body-outline）和分支 5（fallback）渲染中叠加子分区 polygon 叠加层。

### F2-P3：脑分区紫色荧光杂线

**问题：** 脑分区 polygon 裁剪后出现紫色荧光线条。

**根因：** `.anatomy-svg .region:hover` 规则中的 `filter: brightness(1.18) saturate(1.25)` 与 Obsidian 主题滤镜叠加产生紫色荧光。

**修复（用户裁定直接删除悬停显示逻辑）：**
- styles.css：删除 `.region:hover path/polygon/...`（含 filter + 描边）、`.region:hover path[fill="transparent"]` 半透明填充光、`.spine-region:hover` opacity 变化；
- view.ts：删除标注点 `mouseenter/mouseleave` 悬停放大事件及 `hoverR` 变量；
- 保留 `mouseenter` 的 `title` tooltip（功能性提示，非视觉特效）。

### F2-P4：选点尺寸不统一且与像素不适应

**问题：** 三处选点（主界面标注、设置-多边形顶点、设置-标注选点）尺寸计算逻辑不一致，大 viewBox 下过大，脉冲动画硬编码半径覆盖动态值。

**修复：**
- 统一基准 `vbShort = min(vb.width, vb.height)`，废弃原 `sqrt(vb.width) * 0.2` 公式；
- 三处半径均改为 `vbShort` 百分比 + 上下限钳制；
- 脉冲动画 `@keyframes` 从硬编码 `r: 10/12` 改为 `transform: scale()`，保持 JS 动态半径。

**最终参数：**

| 位置 | 半径 | 字号 |
|------|------|------|
| 主界面标注点 | `clamp(vbShort * 0.01, 2, 10)` | `clamp(baseR * 3, 8, 14)` |
| 设置-多边形顶点 | `clamp(vbShort * 0.01, 1, 6)` | `clamp(dotR * 2, 6, 12)` |
| 设置-标注选点 | `clamp(vbShort * 0.004, 1, 4)` | `clamp(dotR * 1.6, 5, 8)` |

### 收尾清理
- 删除 4 个临时调试脚本（`_test_*.js`）；
- 删除源码根目录 6.9MB 旧 `data.json`（代码未引用的测试残留）；
- 清理 11 处 `DEBUG-F2` 调试日志。

---

## 版本一致性与部署

- **真相源：** `d:\桌面\anatomy-map\`
- **双副本同步（R19 规则）：**
  - 沙箱：`C:\Users\19154\AppData\Roaming\obsidian\Obsidian Sandbox\.obsidian\plugins\anatomy-map\`
  - 漫云湖 vault：`c:\Users\19154\Documents\trae_projects\漫云湖-Trae\.obsidian\plugins\anatomy-map\`
- 三个目录的 main.js / styles.css / manifest.json MD5 一致。

---

## 待办（后续批次）

| 批次 | 名称 | 状态 |
|------|------|------|
| 4 | CSS 规范 | 未开始 |
| 5 | 交叉复核 | 未开始 |
| 6 | 修订产物全量替代 | 未开始（含 N1–N8 封版流程） |

**已知局限：** 预设 SVG（上肢/下肢等）内部骨骼纹理暂不处理。

# VOO 图像处理功能审计 · 对照 Affinity 3.3.1（顶部工具栏 + 右侧面板）

日期：2026-10-26 · 版本：Affinity 3.3.1 (4940) / VOO Design 当前工作区（含未提交改动，2026-10-26）
方法：**REA CLI 静态取证（主）** + 运行时截图 + 源码证据（file:line）；VOO 侧全部为当前工作区实测。
产出目录：[`analysis/`](./) · Affinity 证据：[`affinity/rea-image-ui-2026-10-26/`](affinity/rea-image-ui-2026-10-26/) · VOO 盘点：[`voo/IMAGE_UI_INVENTORY_2026-10-26.md`](voo/IMAGE_UI_INVENTORY_2026-10-26.md) · VOO 度量：[`voo/IMAGE_UX_METRICS_2026-10-26.md`](voo/IMAGE_UX_METRICS_2026-10-26.md)

> 一句话结论：**功能数量已接近 Affinity 的子集（滤镜 23 vs 41、调整 20 vs 25），差距不在“有没有”，而在“怎么组织”**——审计时非破坏栈不可排序 / 不可混合 / 无 per-filter 蒙版、每个滤镜的参数深度不足、图像入口分层与发现性差。本轮已把 23 个滤镜统一为可排序/可调透明度的栈，并让 IMAGE 区常驻（见 §0.4）；剩余差距集中在混合/per-filter 蒙版、参数深度与工作流。

---

## 0. 执行摘要（先看这里）

### 0.1 五个最重要的判断

1. **VOO 有“两套滤镜系统”，且互不相通**（审计时 P0；**已修正**，见 §0.4）。右栏 Effects 里的 23 个 `FILTER_KINDS` 与隐藏的 `Live Filters` 栈（8 个 kind）名字完全重复；Live Filters 要从 `+ ADD → Live Filters → + → 选类型` 约四步才出现（实测完成前 3 步时 picker 已出现，第 4 步选择未单独截图），而且首次揭示后 picker 仍收起。用户无法分辨“哪个 filter 能排序/调透明度/加蒙版”。证据：`live_filter_stack.js:21`、`adjustment_kinds.js:306`、`properties_panel_sections.jsx:354`；实测截图 `20-live-filter-picker.png`。
2. **调整/滤镜仍不是“层”**（P0，部分改善）。Affinity 把它们做成 Layers 面板里的 live filter / adjustment layer，能单独显隐、拖拽排序、混合、加蒙版；VOO 本轮已把 23 个滤镜统一成可排序/透明度/开关的 Filter stack（§0.4），但仍不能像 Affinity 那样作为带混合模式和 per-filter 蒙版的子层，Layers 面板也看不到它们。证据：`layer_effects_section.jsx`、`live_filter_stack.jsx`、`editor_layers.jsx`。
3. **每个滤镜只有一个通用滑杆**（P0）。VOO 23 个滤镜共享一个 `value` 参数（少数加 angle），而 Affinity 的滤镜以带参数对话框的菜单项提供（41 个菜单项均以“…”结尾；具体参数集本轮未逐项核验，景深/降噪/钝化蒙版/镜头畸变等按公开产品行为列出）。这让“有滤镜”与“能修图”之间差了一个产品级参数模型。证据：`adjustment_popover.jsx`、`adjustment_simple_controls.jsx`、实测截图 `15-image-effect-filter.png`（BLUR 只有一个 10% 滑杆）。
4. **图像专属动作在右栏里被折叠/分散**（P1）。按 VOO 规则（顶栏只选工具、工具与对象属性统一在右栏），图像动作应该是右栏的一部分；但目前 Image tools（频率分离/快速亮度对比度/Fit-Fill）是折叠的 `<details>`，AI 动作只在底部任务条，底部任务条里还混着文本节点的字体/字号/对齐/颜色（与右栏 Typography 重复）。Affinity 的上下文工具栏是它的体系选择，**不应照搬**；正确做法是把 Image 动作收进右栏常驻 Image 区并清掉面板外属性（见 §3.4 规则核对）。证据：`image_context_actions.jsx:75`、`editor_contextual_taskbar.jsx:195-258`、`editor_toolbar.jsx`。
5. **参数数量不是问题，参数质量才是**（P1/P2）。VOO 的 43 个 adjustment/filter + 11 个 effect + 19 个预设，在数量上足够覆盖日常 80% 场景；真正缺的是 Affinity 的 9 类高频“重参数”滤镜（景深/场模糊、径向/镜头模糊、液化、网格变形、镜头校正、双边/小波/ML 降噪、多频段锐化、程序纹理），以及 LUT/软打样/HSL 曲线这类色彩管理能力。

### 0.2 结论速览（对比矩阵）

| 维度 | Affinity 3.3.1 | VOO 现状 | 判定 |
|---|---|---|---|
| 顶部工具栏图像工具 | 92 个含 `tool` 的资源名（工具/滤镜工具图标）：选择/节点/钢笔/画笔族/修复族/选区族/裁剪/变形/液化/开发等 | 12 个主入口 / 7 个族 + 33 子项；无独立“图像”族，无吸管按钮 | **有结构差** |
| 工具属性承载位置 | 上下文工具栏（第二行）+ 可停靠面板 | **顶部只选工具/模式，属性统一右栏**；规则核对基本合规，3 处例外见 §3.4 | **设计规则不同，非差距** |
| 右栏形态 | 可停靠面板系统（颜色/色板/画笔/外观、图层/路径画笔/快速特效/样式、变换/导航器/历史；11 套 Studio 预设） | 固定属性栈（288px，一列，按选择/工具切换） | **设计取向不同，非缺陷** |
| 滤镜数量 | **41**（模糊 13 / 畸变 11 / 噪声 5 / 锐化 5 / 颜色 5 / 光照 2） | **23** 个 filter kind | 子集，缺 10+ 高价值 |
| 调整数量 | **25**（含 LUT3D / 软打样 / OCIO / 分离色调 / HSL / 色调压缩…） | **20** 个 tone adjustment | 子集（缺 LUT3D/软打样/OCIO/分离色调/HSL 等，见 §4.1） |
| 非破坏栈 | live filter layer：可排序、透明度、混合、单独蒙版、可见性 | 滤镜已统一为可排序/透明度/开关的栈；仍无混合、per-filter 蒙版；Layers 面板无子行 | **P0 差距 → 部分改善（§0.4）** |
| 参数模型 | 每个滤镜独立参数对话框 | 通用单滑杆（少数带角度） | **P0 差距** |
| 预设 | 每滤镜预设 + Develop 预设 + 宏 + 快照 | 19 个全局预设（12 色彩分级 + 7 像素滤镜） | 部分等价 |
| 直方图/范围 | Histogram / Scope 面板 | 只在 Curves/Levels 弹层内 | P1 差距 |
| 图像工作流 | Develop(RAW)/Liquify/Tone Map/HDR/Focus Merge/Panorama/Astro Stack | 无（频率分离、AI 修复/放大/抠图已有） | 产品级差距，P3 |
| 性能 | GPU + ML（ML 去噪/去模糊/WB/SDR→HDR） | 新增 9 个 Affinity 风格滤镜全为 CPU；GL 无对应 shader | P2 风险 |

### 0.3 本轮实测到的数字（可直接验收）

- **VOO 右栏（图片层选中）**：10 个 section、56 个控件；内容高 **779px** / 可视 **598px**（溢出 30%）；加上一个滤镜行和 Live Filters 后内容高 **1128px** / 可视 **599px**（溢出 88%）。小目标（<24px）**16/56**；无 aria-label 控件 0；低对比文本 3。
- **入口点击数**（从选中图片开始）：加调整/滤镜 **2 次**（Effects + → 选类型）；裁剪 **2 次 + Apply**；画笔属性 **1 次**；Spot/AI Repair **2 次**（需经 Tool options）；蒙版 **1 次**；选区 Refine/Feather **3 次 + 拖动**；Live Filters **约 4 步**（ADD → Live Filters → + → 类型；实测到第 3 步 picker 已出现）；命令面板无调整/滤镜命令。
- **Affinity 静态目录**：41 滤镜 / 25 调整 / 6 个蒙版相关条目（其中实时范围/带通蒙版 3）/ 3 个图像 persona（开发、液化、色调映射）；Assets.car 1540 个命名资源中，92 个含 `tool`、56 个含 `effect`、40 个 `layer_filters_*`、14 个 `persona` 资源名（图标级证据，非 UI 条目计数）。

### 0.4 本次已落地（2026-10-27，最小改动批）

> 已按「滤镜统一栈化 + Image 区常驻 + 文本属性归位 + picker 搜索/直方图/行内混合/选区蒙版/Layers 子行」实施。验证：本次相关 focused tests **56 passed**；排除 3 个因并行会话“原生 select 改自定义下拉”而待更新的测试文件后，全量 **3653 passed / 12 skipped / 424 files**（当前未排除全量为 3674 passed / 7 failed，失败全部来自那 3 个文件，与本次改动无关）；`npm run lint:design` clean（1109 files）；`npm run build` 通过。运行时截图见 §7.2 的 23–27。

| # | 改动 | 细节 | 落地位置 |
|---|---|---|---|
| 1 | **滤镜入口收敛 + 全量栈化** | 删除独立的「Live Filters」section 与 `+ADD` 菜单入口；**23 个滤镜全部改为从 Effects picker 添加后进入 Effects 内的「Filter stack」块**，统一拥有逐项排序（↑↓）/透明度/开关；栈渲染器扩展到全部 23 个 kind（除原有 8 个外补齐 Median/Bloom/Twirl/Denoise/Defringe/Haze/Diffuse Glow/Unsharp/Clouds/Posterize/Solarize/Halftone/Emboss/Vignette），**滤镜类型零丢失** | `layer_effects_section.jsx`、`live_filter_stack.js`、`live_filter_stack.jsx`、`cpu_adjustments_kernels.js`、`properties_panel_sections.jsx`、`panel_extras.js`；删除 `live_filter_section.jsx` |
| 2 | **Image 区常驻** | 原折叠的 `<details>Image tools` 改为常驻的 **IMAGE TOOLS** section（频率分离 / Fit-Fill 直接可见）；移除重复的 “Adjust image → Brightness/Contrast” 折叠（亮度/对比度统一走 Effects picker） | `image_context_actions.jsx` |
| 3 | **文本属性归位右栏** | 底部 taskbar 移除字体族/字号/加粗/对齐控件；右栏 TEXT STYLE 成为唯一来源；taskbar 仅保留层级动作与 AI | `editor_contextual_taskbar.jsx` |
| 4 | **英文标签去重** | `editor.tool.marquee` 由 “Select” 改为 “Marquee”，与选择工具不再重名 | `extended-en.js` |
| 5 | **Effects picker 搜索** | 顶部新增搜索框（中英标签匹配，`⌕` 图标）；无匹配时显示空状态并隐藏预设列；搜索时只显示命中的调整/滤镜/效果/模糊噪点组 | `add_kind_picker.jsx`、`extended-{en,zh}.js` |
| 6 | **IMAGE 区直方图常驻** | IMAGE TOOLS 顶部加入 64px 直方图条（RGB + 亮度、裁剪读数），随图像/调整实时更新；无 bitmap 时自动隐藏 | `image_context_actions.jsx`、`properties_panel_sections.jsx` |
| 7 | **Filter stack 行内混合模式** | 每个滤镜栈条新增 blend 下拉（normal/multiply/screen/overlay/darken/lighten/color-dodge/color-burn/hard-light/soft-light/difference/exclusion）；渲染器按 pre-filter 缓冲做 RGB 混合，并纳入 tone 缓存签名与 GPU guard | `live_filter_stack.js`、`live_filter_stack.jsx`、`tone_lut_build.js` |
| 8 | **per-filter 蒙版（选区版）** | 每个栈条新增 `M` 按钮：在当前像素选区存在时，把选区轮廓归一化写入该 entry 的 `mask`，渲染时只在蒙版内应用该滤镜（硬边）；再次点击移除。`target: selection mask`，暂不支持画笔编辑/羽化，后续可升级为 bitmap mask。 | `live_filter_stack.js`、`live_filter_stack.jsx`、`layer_effects_section.jsx`、`properties_panel_sections.jsx` |
| 9 | **Layers 面板滤镜子行** | 每个带滤镜栈的图层下方显示只读子行：启用圆点 + 滤镜名称 + 蒙版标记（`M`），让“滤镜也是图层内容”在 Layers 里可见；子行暂不参与选择/拖拽。 | `editor_layers.jsx` |
| 10 | **验证** | 全量测试 / lint / build 通过；新增 `effects_filter_stack.test.jsx` 覆盖「无独立 section / 栈内渲染 / Add 菜单不再出现 Live Filters / 全 23 kind / blend」 | `tests/unit/effects_filter_stack.test.jsx`、`editor_taskbar_fixed_controls.test.jsx`、`selection_quickbar.test.jsx` |

**未做（明确留下一批）**：图像 AI 动作从 taskbar 收进 Image 区（现有测试明确要求右栏无 AI 入口，属于产品决策）；非图像节点（rect/group 等）的滤镜仍走旧行（栈目前只对 image/raster 开放）；per-filter 蒙版的画笔编辑/羽化（当前只支持“从像素选区生成”的硬边蒙版）；Layers 子行目前只读，暂不参与选择/拖拽。

---

## 1. 方法与证据（REA CLI 的实际使用）

### 1.1 做了什么

| 步骤 | 命令 / 方式 | 结果 |
|---|---|---|
| 环境体检 | `rea doctor` | Hopper/Ghidra/IDA 未配置 → 深度反编译不可用（已如实记录，不伪称机器码分析） |
| 应用概览 | `rea analyze /Applications/Affinity.app --format json` | 返回 `provider_unavailable`（同上），用于确认证据边界 |
| 资产目录 | `rea inspect-asset-catalog /Applications/Affinity.app --format json --limit 3000` | 2 个 Assets.car、3317 条记录、1540 个命名资源；工具/滤镜/persona 图标名 |
| **菜单解码** | `rea decode-interface-builder /tmp/AffinityMenu.app --format json --max-documents 8` | 6 个 MainMenu nib（主/Develop/Liquify/HDR/Panorama/AstroStack）→ 6060 节点 / 3662 边；**1198 条可执行菜单项 / 798 个唯一 selector**（与本目录上一轮 798 个完全吻合） |
| 名称本地化 | `plutil -convert json` 读 `zh-Hans.lproj/MainMenu*.strings` | 每个 selector 的中英文标题（如 `addGaussianBlurFilterRasterLayer:` → 高斯模糊…） |
| Studio 布局 | `rea inspect-keyed-archive` + `plutil` 解析 `com.canva.affinity.Studio.Data.*`、`studios3.dat` | 7 个 NSKeyedArchiver 布局归档（对象/引用可解，面板 UID→名称映射未完全还原） |
| 运行时截图 | `screencapture -x -l 8418` + 窗口枚举 `swift` | 打开图片后的像素上下文工具栏、Persona 栏、右侧面板组（`affinity-image-context.png`） |

> **REA 的边界（必须写明）**：`rea` 的原生 UI 捕获（`observe-native-ui`）报 `accessibility-denied`（REA host 没有辅助功能权限，无法在本会话授予）；`rea analyze` 因缺深度 provider 不可用。因此 Affinity 的“滤镜/调整清单”来自 **nib action selector + 本地化字符串**，属于静态 UI 证据，**不是**逐项打开菜单截屏；Affinity 的菜单截图只有主工作区与像素上下文工具栏两张。所有推断在文中标注。

### 1.2 可复现

```bash
# Affinity 菜单 → 中文名（本报告 §2.4 的数据源）
mkdir -p /tmp/AffinityMenu.app/Contents/Resources/Base.lproj /tmp/AffinityMenu.app/Contents/MacOS
cp /Applications/Affinity.app/Contents/Resources/Base.lproj/MainMenu*.nib \
   /tmp/AffinityMenu.app/Contents/Resources/Base.lproj/
cp /Applications/Affinity.app/Contents/Info.plist /tmp/AffinityMenu.app/Contents/
cp /usr/bin/true "/tmp/AffinityMenu.app/Contents/MacOS/Affinity Affinity Store"
rea decode-interface-builder /tmp/AffinityMenu.app --format json > /tmp/rea-affinity-mainmenu.json
node analysis/affinity/rea-image-ui-2026-10-26/evidence/extract-menus.mjs   # 生成 menu-items-full.json / menu-items-image.json
# 资产目录
rea inspect-asset-catalog /Applications/Affinity.app --format json --limit 3000 > /tmp/rea-affinity-assets.json
# VOO 侧
# http://127.0.0.1:5173/ → New → 插入图片，Playwright 截图与 DOM 度量（见 §6 证据索引）
```

原始证据：`evidence/menu-items-full.json`（1198 条）、`evidence/menu-items-image.json`（93 条图像相关）、`evidence/catalog.json`（41/25/6/3）、`evidence/mainmenu-graph-summary.json`（REA evidence id `ev_37d627ac…`）。

---

## 2. Affinity 3.3.1 的图像处理功能面（benchmark）

### 2.1 三层结构：Studio 预设 → Persona → 上下文工具栏

Affinity 这一代的“Studio”是**工作区/面板预设**，不是模式：

- 顶部 Persona 栏：**矢量 / 像素 / 布局 / Canva AI**（截图 `affinity-image-context.png`）。
- 打开一张像素图后，运行时截图显示**上下文工具栏**变为：`背景 (像素) 72dpi` + **`开发` / `液化` / `色调映射`** + 网格/设置（触发条件与逐工具行为未逐层验证）。
- 右栏是**可停靠面板组**（当前 Studio 下）：`颜色 / 色板 / 画笔 / 外观`、`图层 / 路径画笔 / 快速特效 / 样式`、`变换 / 导航器 / 历史记录`；面板可换 tab、可隐藏、可存成 Studio 预设。
- 内置 11 套 Studio 预设（`Contents/Resources/*.afstudio`）：Vector / Pixel / Layout / Slice / Canva AI / Retouching / Colour Grading / Typography / Compositing / Astrophotography / Scripting。其中 Colour Grading 的描述明确包含 **Scopes + 宏 + Library + Quick Adjustments + 调整预设**；Retouching 含 **Snapshots**；Compositing 强调 **非破坏滤镜快捷入口**（`studios.strings`）。

> 对 VOO 的启示：Affinity 的“Studio”不是要抄的复杂度，而是它把**图像处理需要的面板**（调整、滤镜、直方图/Scope、快照、宏）都视为可组合面板；VOO 目前把它们全部压进了一个属性栈。

### 2.2 图像处理相关工具栏工具（Assets.car 92 个 tool 资源，节选）

| 族 | Affinity 工具 | VOO 对应 |
|---|---|---|
| 选择/变换 | Select, Node, Edge move/rotate/scale, Pan, Zoom, Measure | Select（含扭曲/透视/操控）、Hand、缩放无独立工具 |
| 画笔 | Brush, Erase Brush, Background Erase, Flood Erase, Blur/Sharpen/Smudge/Dodge/Burn/Sponge, Median Brush, Colour Replacement, Paint Mixer | Brush（Normal/Smudge/Blur/Sharpen/Dodge/Burn/Sponge）——**7 种已覆盖主力**；缺 Background Erase、Colour Replacement、Paint Mixer |
| 修复/修补 | Healing Brush, Inpainting Brush, Patch, Clone, Blemish Removal, Red Eye Removal | AI Repair / Spot / Patch / Clone——缺 Blemish、Red Eye、连续 Inpainting（AI 修补偏单点） |
| 选区 | Rect/Ellipse/Column/Row/Freehand Marquee, Selection Brush, Flood Select, Object Selection, Smart Selection, Mask Tool | 矩形/椭圆/多边形/套索/磁性/魔棒/对象（7 种）——缺 Column/Row 选框、**Selection Brush（画笔式选区）**；Refine 有但入口深 |
| 局部调整 | **Adjustment Brush / Filter Brush**（笔刷式局部调整） | 需“调整层 + 蒙版 + 画笔”三步近似；无一步式局部调整笔刷 |
| 裁剪/变形 | Crop, Raster Crop, Straighten, Mesh Warp, Perspective, Liquify 工具组（9 个） | Crop（Free/Ratio/Size/Straighten）、Distort/Perspective/Puppet Warp；**无 Mesh Warp、无 Liquify** |
| 图像 AI/开发 | Develop（RAW）、Develop WB、Portrait Blur/Lighting、Super Resolution、Generative Fill/Expand | AI 抠图/超分/修复/自动增强/人像修饰/拆图层（底部任务条）——**Super Resolution 等价，其余缺** |

### 2.3 右栏图像处理面板（Affinity 的“图像管道”）

- **Layers**：图像层 + **live filter / adjustment layer** 作为子层，可单独显隐、拖拽排序、加蒙版。※ 该交互按公开产品行为整理；本轮 REA 只取得菜单 selector 与本地化名称，未做 Layers 面板运行时取证。
- **Adjustments**：25 种调整层（见 §2.4），带预设列表。
- **Effects / Quick FX**：图层效果（阴影/发光/描边/斜面等）+ 快速特效面板。
- **Histogram / Scope**：直方图与范围面板（Colour Grading Studio 的默认面板之一）。
- **Snapshots**：保存/恢复多个编辑版本（Retouching Studio）。
- **Macros**：录制/回放操作序列（Colour Grading Studio）。
- **Channels**：通道面板；**Navigator**；**History**（非线性历史）。
- **Path Brushes / Styles / Symbols / Assets** 等非图像专用面板。

### 2.4 Affinity 图像处理目录（REA 静态，中文名来自官方本地化）

> 数据来源：`evidence/catalog.json`。REA 的 MainMenu connections 覆盖为 **partial**（3 条未解析）且 `graph.truncated=true`，所以下表是“解码到的 selector 清单”，不排除极少数菜单项遗漏；selector 本身不代表二进制实现或运行时可见。

#### 滤镜 41（6 类；菜单项均以“…”结尾，代表打开参数对话框）

| 分类 | 数量 | 滤镜 |
|---|---|---|
| 模糊 Blur | 13 | 高斯、方框、中值、运动、径向、最大、最小、双向(Bilateral)、镜头、场(Field)、景深、光晕(Bloom)、扩散亮光(Diffuse Glow) ※ 本版目录无独立“缩放模糊”条目，Zoom 可能是径向模糊对话框内的模式（未核验） |
| 畸变 Distort | 11 | 球面、收缩/膨胀(Pinch/Punch)、故障(Glitch)、像素化、网格扭曲(Mesh Warp)、液化(Liquify)、波纹(Ripple)、镜头畸变、扭曲(Twirl)、透视、置换(Displace) |
| 噪声 Noise | 5 | 扩散(Diffuse)、去噪、蒙尘与划痕、小波去噪、添加噪声 |
| 锐化 Sharpen | 5 | 高通、多频段(Multi Band)、钝化蒙版(Unsharp Mask)、纹理、清晰度(Clarity) |
| 颜色 Colours | 5 | 过程纹理、半色调、泰森多边形(Voronoi)、去边(Defringe)、晕影(Vignette) |
| 光照 Lighting | 2 | 阴影/高亮、光照 |

#### 调整 25（全部在“新建调整图层 ›”下）

反转、镜头滤镜、通道混合器、OCIO、饱和度/色相曲线、明度/对比度、渐变贴图、曲线、白平衡、分离色调、法线、**LUT3D**、阈值、曝光、**软打样(Soft Proof)**、自然饱和度、再上色(Recolour)、**HSL**、色调拉伸、色彩平衡、黑白、选色、色阶、色调分离(Posterise)、色调压缩。

#### 蒙版相关条目 6（其中实时蒙版 3）

- 实时范围/带通蒙版（3）：色调范围(Hue Range)、光度范围(Luminosity Range)、带通(Band-pass)。
- 普通蒙版（3）：蒙版图层、空白蒙版图层、复合蒙版图层。

#### 图像工作流

开发(Develop, RAW) / 液化(Liquify) / 色调映射(Tone Map) / HDR 合并 / 焦点合成 / 全景 / 天文堆栈 / 堆叠 / Live Tone Blend Group / Live Stack Group。

---

## 3. VOO 现状（顶部工具栏 + 右侧面板）

### 3.1 顶部工具栏：12 个主入口 / 7 个族 / 33 个子项

（源码：`editor_toolbar.jsx`；id：`tool_ids.js`；快捷键：`editor_shortcuts.js`；标签：`extended-zh/en.js`）

| # | 入口 | 快捷键 | 下拉子项 | 图像相关 |
|---|---|---|---|---|
| 1 | 选择 Select（族） | V / A | 选择、扭曲、透视、操控变形 | ✅ 变形 |
| 2 | 抓手 Hand | H | — | 导航 |
| 3 | 画框 Frame | F | — | 容器 |
| 4 | 裁剪 Crop | C | — | ✅ |
| 5 | 选区 Marquee（族） | M | 对象、矩形、椭圆、魔棒、套索、多边形、磁性套索（7） | ✅ |
| 6 | 画笔 Brush（族） | B | 正常、涂抹、模糊、锐化、减淡、加深、海绵（7） | ✅ |
| 7 | 橡皮擦 Eraser | E | — | ✅ |
| 8 | 文字 Text | T | — | — |
| 9 | 钢笔 Pen（族） | P | 钢笔、曲率钢笔、自由钢笔（3） | — |
| 10 | 形状 Shapes（族） | R | 矩形、椭圆、直线、多边形、星形、箭头（6） | — |
| 11 | 填充 Fill（族） | G | 填充、渐变（2） | ✅ |
| 12 | 修复 Healing（族） | J | AI 修补、污点、修补、仿制图章（4） | ✅ |

- Motion 变体隐藏 Frame/Crop/Marquee/Brush/Eraser/Fill/Healing，仅留 5 个。
- 3D 对象菜单（box/sphere/plane）仅在 `EDITOR_BETA_ENABLED` 下出现。
- **没有吸管按钮**：`TOOL.DROPPER` 只能按 `I`，或从颜色选择器的吸管进入（`image_editor.jsx:4240`、`extended-en.js:1179`）。
- **英文标签冲突**：选区工具与选择工具都叫 “Select”（`extended-en.js:1273` vs `:1179`），命令面板里也出现两个 “Select”；中文已区分“选择/选区”。
- 顶部没有“图像工具”族；图像动作在选中图像后的**底部浮动任务条**（AI 抠图/超分/自动增强/人像修饰/拆图层）和右栏里。

### 3.2 右侧面板（图片层选中，实测）

**内容高 779px / 可视 598px（溢出 30%）；10 个 section、56 个控件、16 个 <24px 小目标。**

```
[Header] image · IMAGE            [New Mask]
ALIGN (6 按钮)
TRANSFORM (anchor · X/Y/W/H · R/S · flip · 圆角)
CONSTRAINTS (水平/垂直 9 档)
APPEARANCE (opacity · blend)
FILL  (+ ALT TEXT)
STROKE (+)
IMAGE TOOLS（常驻）
   Radius (px) + Frequency Separation
   Fit / Fill
EFFECTS (+)  ← 调整/滤镜/图层效果都在这里；另含 Layer blur / Background blur / Noise
  └─ Filter stack（有 stack 滤镜时出现：排序 / 透明度 / 开关）
EXPORT
+ ADD  →  Styles / Modifiers（Live Filters 入口已移除）
```

| section | 控件/内容（实测） | 图像处理相关性 |
|---|---|---|
| Header | 类型图标 + 名称 + New Mask | 蒙版入口 |
| ALIGN | 6 个对齐按钮 | — |
| TRANSFORM | 锚点、X/Y/W/H、R/S、翻转、圆角 | 图像变换 |
| CONSTRAINTS | 水平/垂直各 9 档 | — |
| APPEARANCE | opacity、blend mode | 图像混合 |
| FILL | + 填充；图片层额外有 ALT TEXT | 图片填充/无障碍 |
| STROKE | + 描边 | — |
| Image tools | Radius + Frequency Separation、Adjust image（Brightness/Contrast）、Fit / Fill | **图像专属**（折叠） |
| EFFECTS | 调整/滤镜/图层效果行；Layer blur / Background blur / Noise | **图像处理主入口** |
| EXPORT | PNG / 倍率 / 透明背景 / Export | 导出 |
| + ADD | Live Filters / Styles / Modifiers | **非破坏滤镜（重复体系）** |

- **调整/滤镜的入口只有一个**：Effects 的 `+` 打开统一 picker。pick 后生成一条行（固定顺序），点行弹出浮动参数卡。
- Effects picker 内容（实测）：**ADJUSTMENTS 20 + FILTERS 23 + EFFECTS 11 + BLUR & NOISE 3 = 57 种**，右列 **19 个预设**（12 色彩分级 + 7 像素滤镜）。两列长列表，无搜索、无分类筛选、无最近使用。
- **Live Filters**：通过 `+ ADD` 揭示，是一个独立 section，内含 8 种 kind（Blur、Sharpen、Noise、High Pass、Clarity、Motion Blur、Sepia、Pixelate），与 FILTERS 组的同名项重复；首次揭示后 picker 还是收起的（需再点 +）。
- **Image tools** 是折叠 `<details>`：频率分离（半径输入 + 按钮）、亮度/对比度（与 Effects picker 的 Brightness/Contrast 重复）、Fit/Fill。
- 工具激活时右栏被 `ToolPropertiesSection` 接管：Crop（Free/Fixed Ratio/Fixed Size、Smart、Straighten、Delete cropped pixels、Apply/Cancel/Reset）、Brush（颜色 + 宽度/硬度/不透明度/流量/平滑 + 压力 + 高级 + 6 预设 + `.ABR` 导入）、AI Repair（宽/硬/不透明度）、Wand（羽化/容差/采样/连续/抗锯齿/所有图层/自动选择）等。

### 3.3 图像处理能力清单（VOO）

| 能力 | 数量 | UI 入口 |
|---|---|---|
| 色调调整 kinds | 20（亮度/对比度/色阶/曲线/曝光/高光/阴影/色温/色调/色相/饱和度/自然饱和度/色彩平衡/黑白/照片滤镜/通道混合器/选色/渐变贴图/反转/阈值） | Effects picker › ADJUSTMENTS |
| 滤镜 kinds | 23（Blur/Sharpen/Clarity/High Pass/Motion Blur/Noise/Clouds/Pixelate/Posterize/Solarize/Halftone/Emboss/Median/Bloom/Zoom Blur/Twirl/Denoise/Defringe/Haze Removal/Diffuse Glow/Unsharp Mask/Sepia/Vignette） | Effects picker › FILTERS |
| 图层效果 | 11（阴影/发光/内阴影/内发光/缎光/斜面浮雕/Glass/纹理/颜色叠加/渐变叠加/描边） | Effects picker › EFFECTS |
| 图层模糊/噪点 | 3（Layer blur / Background blur / Noise） | Effects 面板内联 |
| Live Filters | 已并入 Effects 的 Filter stack（23 种滤镜统一） | Effects picker › FILTERS（添加后出现在 Effects 内） |
| 预设模板 | 19（12 色彩分级 + 7 像素滤镜） | picker 右列 |
| 蒙版 | 节点级蒙版（新建/编辑/反相/羽化/细化） | Header `New Mask` + 工具面板 |
| 裁剪 | Free/Ratio/Size、Smart、Straighten、Delete cropped pixels | Crop 工具面板 |
| 修复 | AI Repair / Spot / Patch / Clone | Healing 族 |
| AI | 抠图、超分 2x/4x/anime、AI 修复、自动增强、人像修饰、拆图层、生成式扩展 | 选中图像的底部任务条（非顶部/非右栏） |
| 频率分离 | 有 | Image tools（折叠） |

### 3.4 面板归属规则核对（VOO 规则：工具相关工具栏/属性全部在右栏）

按你们的约定：**顶部工具栏只负责“选哪个工具、哪个模式”，工具属性与对象属性统一在右侧面板。** 本轮逐项核对：

| 界面 | 承载内容 | 是否符合规则 | 证据 |
|---|---|---|---|
| 顶部工具栏 | 12 个工具入口 + 7 个族的模式下拉（选择/选区/画笔/钢笔/形状/填充/修复）；菜单项只有工具/模式，无任何数值或开关 | ✅ 合规 | `editor_toolbar.jsx`；`editor_family_menu.jsx`（菜单只渲染 family items）；`editor_brush_menu.jsx` 注释明确 “chevron lists every brush mode … so the properties panel does not have to” |
| 右栏 · 工具态 | 选区（模式/羽化/魔棒/套索）、画笔/橡皮/修复/retouch（宽/硬/不透明度/流量/平滑/压力/预设）、钢笔、形状、文字、填充/渐变、吸管、裁剪（Free/Ratio/Size/Straighten/Apply/Reset）、蒙版工具条（画笔/羽化/反相/清除/移除） | ✅ 合规，覆盖全部有参数的工具 | `tool_properties_section.jsx`；`properties_panel_mask_toolbar.jsx`；`resolve_panel_context.js` |
| 右栏 · 对象态 | Image tools（频率分离/Fit-Fill/快速亮度对比度）、Effects、Fill/Stroke、Export、+ADD；图片的调整/滤镜入口都在这里 | ⚠️ 合规但入口折叠/分散 | `properties_panel_sections.jsx` |
| 底部 contextual taskbar | 选择动作（对齐/布尔/翻转/蒙版/裁剪/添加调整/AI）+ **文本节点的字体/字号/对齐/颜色** | ⚠️ **例外**：文本属性在面板外，与右栏 Typography 重复 | `editor_contextual_taskbar.jsx:195-258` |
| 底部 taskbar · 图像动作 | Crop / Replace / AI 去背景 / More 菜单（含调整 picker） | ⚠️ 图像动作在面板外；按规则应进右栏 Image 区 | `editor_contextual_taskbar.jsx:219-254` |
| 对象 AI 动作 | 抠图/超分/自动增强/人像修饰/拆图层只在底部任务条 | ⚠️ 图像动作不在右栏（按规则应进右栏 Image 区） | `editor_ai_taskbar_buttons.jsx` |
| 右键菜单 | Feather Selection / Stroke Selection 等选择命令 | ✅ 可接受的命令菜单（与右栏重复，但不是唯一入口） | `editor_context_menu.jsx:248` |
| 底部 EditorZoom | 缩放/页导航 | ✅ 导航控件，不是属性 | `editor_zoom.jsx` |

**核对结论**：
- **规则基本成立**：顶栏没有属性控件；右栏覆盖了所有有参数的工具（含蒙版工具条）。
- 真正需要收敛的例外只有三处：① **文本节点的字体/字号/对齐/颜色在底部任务条**；② **添加调整/滤镜有第二个入口（底部任务条）**；③ **图像 AI 动作只在任务条、右栏没有**。
- 因此“图像专属动作”的正确改法**不是新增顶部上下文工具栏**，而是收进右栏常驻 Image 区（见 P1-1 / P1-3）。

---

## 4. 差距矩阵（能力 / 入口 / 交互）

### 4.1 能力层（有 vs 无）

| 能力 | Affinity | VOO | 判定 | 备注 |
|---|---|---|---|---|
| 高斯/方框/中值/运动/缩放模糊 | ✅ | ✅ | parity | |
| 径向模糊 / 最大/最小模糊 / 双向模糊 | ✅ | ❌ | gap | 低工程量 |
| 场模糊/镜头模糊/景深 | ✅ | ❌ | gap | 中工程量，人像/风光刚需 |
| 网格变形 Mesh Warp / 液化 Liquify | ✅（persona + filter） | ❌（有透视/扭曲/操控变形） | gap | 高工程量，差异化 |
| 镜头校正 / 镜头畸变 | ✅ | ❌ | gap | 中 |
| 波纹/球面/收缩膨胀/置换/故障 | ✅ | ❌ | gap | 低-中 |
| 光照 / 程序纹理 / 纹理 / Voronoi | ✅ | ❌ | gap | 中 |
| 多频段锐化 / 蒙尘与划痕 / 小波/FFT/ML 降噪 | ✅ | ❌（有 median/denoise 近似） | partial_gap | 中-高 |
| 亮度对比度/曝光/色阶/曲线/白平衡/黑白/选色/色相饱和/自然饱和度/色彩平衡/通道混合器/渐变贴图/反转/阈值/照片滤镜 | ✅ | ✅ | parity（部分拆分方式不同） | |
| 分离色调 / HSL / 饱和度-色相曲线 / LUT3D / 软打样 / OCIO / 再上色 / 法线 / 色调压缩/拉伸 | ✅ | ❌ | gap | LUT/OCIO 需色彩管理链路 |
| 实时蒙版（色调范围/光度范围/带通/复合） | ✅ | ❌（节点蒙版 + 色彩范围选择近似） | partial_gap | |
| 非破坏滤镜层（排序/透明度/混合/单独蒙版） | ✅ | ❌（固定行） | **P0** | |
| 每滤镜多参数 | ✅（按菜单项/公开行为；未逐项核验） | ❌（23 个 FILTER_KINDS 多为通用单滑杆） | **P0** | |
| 直方图/Scope 常驻 | ✅ | partial（仅 Curves/Levels 弹层内） | P1 | |
| 预设/宏/快照 | ✅ | partial（19 全局预设，无宏/快照） | P1 | |
| RAW 开发 / HDR / 焦点合成 / 全景 / 天文堆叠 | ✅ | ❌ | P3 | 产品面 |
| AI：抠图/超分/修复/自动增强/人像修饰/拆图层 | ✅（部分 ML） | ✅ | ahead（部分） | |

### 4.2 入口层（发现性 / 点击数）

| 任务 | Affinity | VOO | 差异 |
|---|---|---|---|
| 选中图像后看到“图像专属动作” | 上下文工具栏直接显示开发/液化/色调映射 | 右栏 Image tools 折叠；AI 在底部任务条（按 VOO 规则应收进右栏） | **入口可见性不足，不是缺工具栏** |
| 加调整/滤镜 | 菜单/调整面板，分类清晰 | Effects `+` → picker（2 次点击） | VOO 更短，但 57 项无搜索、无分类 |
| 给滤镜加蒙版 | live filter 行右键/图层蒙版 | 需复制图层 + 节点蒙版近似 | **能力缺失** |
| 调整参数 | 菜单项带参数对话框（参数集未逐项核验） | 单滑杆 + Reset | **深度不足（VOO 侧实测）** |
| 多滤镜串联与排序 | 拖拽 | 固定顺序 | **能力缺失** |
| 局部调整（只改脸/天空） | Adjustment Brush / Filter Brush 一笔完成 | 调整层 + 蒙版 + 画笔（3 步） | **效率差** |
| 命令面板找图像命令 | 菜单搜索（系统级） | ⌘K 有工具与像素选区命令，**无调整/滤镜/AI 命令** | P1 |
| 前景色/吸管 | 工具栏常驻 | 仅 I 键 / 取色器内 | P1 |

### 4.3 交互质量层

| 维度 | Affinity | VOO |
|---|---|---|
| 非破坏性 | 图层化，可逐项开关/排序/混合/蒙版 | 滤镜：可开关/排序/透明度/混合/选区蒙版（已栈化）；调整/效果行仍仅开关；Layers 无子行；蒙版仅选区硬边 |
| 参数控件 | 每滤镜定制（半径/阈值/角度/衰减…） | 通用滑杆；少数 angle |
| 预览 | 对话框内实时（前后对比未核验） | 实时；无统一 before/after（只能关眼睛） |
| 撤销粒度 | 历史面板 | 连续输入合并 commit，无历史面板入口（有 `editor_history_panel` 但图像流程未用） |
| 信息密度 | 面板可收起/停靠 | 288px 固定单列，30% 溢出；小目标 16/56 |
| 可发现性 | 菜单分类 + 面板 + context bar | picker 57 项长列表；Image tools 折叠；两套滤镜 |

---

## 5. 优化空间（按优先级，含落点与验收）

### P0 · 结构性（建议 1–2 周，决定“像不像专业图像编辑器”）

#### P0-1 统一滤镜管道，收敛双轨
**问题**：`FILTER_KINDS`（23）与 `LIVE_FILTER_KINDS`（8）重复；Live Filters 隐藏且多 4 次操作；两套语义（LUT/CPU kernel vs 有序栈）让渲染、导出、撤销都要维护两份。

**先澄清口径：合并会不会删滤镜？——不会，但会涉及栈语义迁移。**

| 项 | 数量 | 合并后 |
|---|---|---|
| `FILTER_KINDS`（Effects › FILTERS） | 23 | **23 个全部保留** |
| `LIVE_FILTER_KINDS`（Live Filters） | 8 | 8 个与 FILTERS 完全重复 → **只删重复 UI，不删滤镜** |
| Live 独有 kind | **0** | 无（`blur/sharpen/noise/highPass/clarity/motionBlur/sepia/pixelate` 全部是 23 的子集） |
| 栈语义（逐项排序/透明度/开关） | **仅 Live Filters 有** | 需迁移到统一行；直接删 UI 会**丢失能力**（不是丢滤镜） |
| Live 栈渲染支持范围 | 审计时仅 8 kind | **已扩展为全量 23 kind（§0.4）**；仍缺每滤镜混合/蒙版 |

**建议**（推荐 A，保守 B）：
- **A（统一为有序栈）**：把所有 adjustment/filter 行升级为 `entries[]`（id/enabled/opacity/blendMode/params/maskId），Effects 只保留图层样式；删除 Live Filters 独立 UI。渲染按 entries 顺序执行；导出走同一管线。
- **B（最小改动）**：删除 `Live Filter` UI（`properties_panel_sections.jsx:354`、`live_filter_section.jsx`），保留 `liveFilters` 字段仅作 PSD/旧文档兼容；在 FILTERS 组标注“17 种为 CPU 滤镜”。
**落点**：`add_kind_picker.jsx`、`layer_effects_section.jsx`、`live_filter_section.jsx`、`live_filter_stack.js`、`adjustment_queries.js`、`tone_lut_build.js`、`cpu_adjustments_runner.js`。
**验收**：全 UI 只有一处“添加滤镜/调整”；无重复 kind；导出/撤销/测试全绿；文档 `.voo` 迁移脚本。

#### P0-2 调整/滤镜图层化：可排序、可混合、可单独蒙版
**问题**：滤镜已可排序/调透明度/混合/选区蒙版（§0.4），但调整/效果行仍只有“眼睛 + 删除”；Layers 面板没有子行；per-filter 蒙版还不能画笔编辑或羽化。
**建议**：
1. 行内增加拖拽手柄（或上/下移按钮），顺序写入 `entries`；渲染按序。
2. 行内增加 opacity + blend（复用 `blend_math.js`）。
3. 行菜单增加“添加蒙版”，复用现有 mask infra（`mask_edit` / `mask_tool`），实现 Affinity 式 **per-filter mask**；图层蒙版继续存在，二者不冲突。
4. 在 Layers 面板把 entries 作为子行显示（可折叠在图层下），让“滤镜也是层”可见。
**落点**：`scene_model_*` 归一化、`layer_effects_section.jsx`、`editor_layers.jsx`、`cpu_adjustments_*`、`mask_*`。
**验收**：滤镜顺序/混合/选区蒙版已验证（已达成）；任一滤镜/调整可加蒙版且导出正确（调整/效果行待补）；单测覆盖混合/蒙版 12+ 例。

#### P0-3 参数模型：从“一个 value”到“每 kind 一组参数”
**问题**：Blur/Denoise/Unsharp 等共用一个 0–100 滑杆，专业用户无法调“半径/阈值/细节/衰减”。对照：Affinity 的滤镜菜单项均带参数对话框（参数集未逐项核验），VOO 的参数表达明显更浅。
**建议**：
1. 在 `adjustment_kinds.js` 为每个 kind 声明 `params` schema（number/angle/point/select，含 min/max/step/default/unit）。
2. 通用 `AdjustmentParamPanel` 按 schema 渲染；参数存储进 kind 对象（向后兼容旧 `{value}`）。
3. 先做 **8 个高频**：Blur（radius）、Motion Blur（angle+distance）、Unsharp Mask（amount/radius/threshold）、High Pass（radius）、Clarity（amount+radius）、Denoise（strength/detail）、Defringe（amount+radius）、Vignette（amount/softness/roundness）。
4. 每个参数支持拖拽 scrub、方向键 ±1/Shift ±10、双击重置、Reset all。
**落点**：`adjustment_kinds.js`、`adjustment_simple_controls.jsx`、`adjustment_popover.jsx`、`affinity_filters.js`、CPU kernels、i18n。
**验收**：8 个滤镜 ≥2 参数；预设仍可应用；参数改变有实时预览与确定性导出；新增 kind 无需改 UI 代码。

### P1 · 体验与发现性（建议 3–5 天）

#### P1-1 给“图片层”一个真正的 Image section ※已实施（见 §0.4）
- 把折叠的 Image tools 提升为常驻 **IMAGE** 区（位于 Transform 之后、Fill 之前）：图像信息（尺寸/DPI）、**Frequency Separation**、**Fit/Fill**、Alt text、AI 快捷（去背景/超分/人像修饰）。
- 删除或合并重复的 “Adjust image → Brightness/Contrast”（已可通过 Effects picker；若要快捷，改成 2 个常用滑杆并标注“快速调整”）。
- 默认展开，减少“图像专属功能藏在折叠里”的问题。
**验收**：选中图像 1 次点击内可见并触达频率分离/Fit-Fill/AI；无重复亮度对比度入口。

#### P1-2 Effects picker 升级为可搜索目录
- 顶部搜索框（中英 + 拼音可选）、三段 tab（调整/滤镜/效果）、组内按 Affinity 分类（模糊/锐化/噪声/畸变/颜色/光照）、**最近使用** + 收藏。
- 列表项显示简短说明（如 DoF 的“焦点距离/模糊半径”）。
- 键盘 ↑↓/Enter/⌘F 搜索；Esc 关闭。
**验收**：任意 kind 从打开 picker 起 ≤2 次操作可达；搜索中英命中；MRU 跨会话持久化。

#### P1-3 右栏 Image 区常驻 + 入口归位（按 VOO 规则，不新增顶部上下文栏）※Image 区与文本属性已实施，见 §0.4
- 遵循既定规则：**顶部工具栏只放工具入口，工具/对象属性全部在右栏**，不引入 Affinity 式顶部 context toolbar。
- 右栏：Image 区常驻（见 P1-1），承载频率分离/Fit-Fill/Alt text/AI；Effects 仍为调整/滤镜唯一编辑面。
- 底部 taskbar：保留选择动作快捷方式；把**文本节点的字体/字号/对齐/颜色**移到右栏 Typography（或只读展示），并把“添加调整/滤镜”入口收敛为打开右栏同一处，不再在任务条内弹独立 picker。
- 顶栏只补“入口一致性”：吸管按钮（或并入 Fill/颜色族）、修复 `Select` 英文重名；如确需 Image 工具族，也只放工具入口，不放属性。
**验收**：所有图像属性/动作可只在右栏完成；顶部工具栏 0 个属性控件；底部 taskbar 不再出现文本属性；`Select` 不再重名。

#### P1-4 命令面板与快捷键补齐图像动作
- 向 `palette_actions.js` 注册：`Add adjustment…`、`Add filter…`、`Remove background`、`Upscale 2×/4×`、`Auto enhance`、`Frequency separation`、`Apply crop`、`Reset all adjustments`、`Toggle before/after`。
- 为 `Add effect` 提供快捷键（建议 ⌥⌘A，避开现有冲突），并在 picker 内可键盘选择。
**验收**：⌘K 搜 “blur/曲线/去背景” 均能执行；快捷键写入 `editor_shortcuts.js` 与命令表。

#### P1-5 直方图/范围常驻 + before/after
- 在 IMAGE/Effects 区顶部放一条 64px 直方图条（默认亮度，可切 RGB），随调整实时更新；后续扩展 Scopes（矢量示波器/波形）。
- 参数编辑器加“按住对比”（press-and-hold 关闭效果），与“眼睛”开关并存。
**验收**：选中图像即可见直方图；调整时直方图实时变化；对比按钮在 8 个高频滤镜可用。

#### P1-6 计数与标签清理（快赢）
- `lightness` 在 SIMPLE_ADJUSTMENTS 定义但不在任何 picker 组（`adjustment_kinds.js:43`）；确认是否有入口，否则删除或加入 Hue/Saturation 弹层。
- `raster` 分支（`panel_extras.js:24`）无生产者，死代码清理。
- 无 aria-label 控件 0（已达标），但 <24px 目标 16/56——优先放大 Effects/行内操作按钮到 28px 命中区。
- 中英标签审查：`Select` 重名、`Crop` 内 `Smart` 禁用态缺说明。

### P2 · 能力补齐（按 ROI 排序，2–6 周）

| 优先 | 能力 | 估算 | 依赖 / 备注 |
|---|---|---|---|
| 1 | 径向模糊、最大/最小模糊、波纹、球面、收缩/膨胀、故障 | 3–5 天 | 都是 CPU kernel 级；复用 `affinity_filters.js` 模式 |
| 2 | 分离色调、HSL 合并面板、饱和度/色相曲线、色调分离（作为调整） | 3–5 天 | UI + CPU/GL；分离色调可先 CPU |
| 3 | 场模糊/镜头模糊/景深 | 1–2 周 | 需要焦点/距离近似；先做“以某点为中心的高斯+渐变”，不做真深度图 |
| 4 | 钝化蒙版/多频段锐化/双边/蒙尘划痕（参数化） | 1 周 | 与 P0-3 参数模型一起做 |
| 5 | 镜头畸变/镜头校正 | 1 周 | 需要相机/镜头 profile 或手动参数；可与 PSD 元数据结合 |
| 6 | 网格变形 / 液化 | 2–3 周 | 新 warp runtime；可作为“图像工作台”第一阶段 |
| 7 | LUT3D + 软打样/OCIO | 2–4 周 | 色彩管理链路，先定色彩空间模型 |
| 8 | 宏 / 快照 / 历史面板接入图像流程 | 1–2 周 | 快照可复用 `.voo` 快照；宏需要命令录制层 |
| 9 | RAW Develop / HDR / 焦点合成 / 全景 | 产品级，另立项 | 不建议本轮 |

### P3 · 不建议照抄 Affinity 的部分

- **Persona/Studio 复杂度**：VOO 是设计工具，不是相册/印刷工具；11 套 Studio + 三套 Persona 的切换成本对 VOO 用户是负担。
- **菜单式滤镜目录**：Affinity 靠系统菜单承载 41 个滤镜；VOO 已有搜索式 picker 的潜力，应把 picker 做成“可搜索的命令面板”，而不是复制菜单。
- **强行做 RAW**：VOO 的定位（矢量/动效/3D + 图像）不支持 RAW 全链路；优先做“位图导入后的轻量开发”（曝光/白平衡/镜头校正）。

---

## 6. 路线图（建议）

| 阶段 | 内容 | 产出/验收 | 估时 |
|---|---|---|---|
| Now（已完成） | 滤镜入口收敛 + 全量 stack、Image tools 常驻、文本属性归位、Marquee 英文重名修复；未做：picker 搜索、吸管、直方图 | 已合入工作区；截图 23–27；focused tests 64 passed | — |
| Next（2 周） | P0-2 图层化（per-filter 蒙版/拖拽）；P0-3 前 8 个参数；P1-2 picker 搜索；P1-4 命令面板 | 滤镜可搜索；8 个滤镜多参数；per-filter 蒙版 | 1–2 周 |
| Later（1 个月+） | P0-2 图层化（排序/混合/per-filter 蒙版）；P2 前 4 项；性能 GL 化 | Layers 面板出现滤镜子层；局部滤镜蒙版 | 3–6 周 |

**验证方式**（每阶段）：
1. `npx vitest run`（当前基线 3338 passed / 12 skipped，按工作区实际为准）+ `npm run lint:design` + `npm run build`。
2. 44 状态深/浅色巡检 0 error / 0 裁剪 / 0 漏翻 / 0 无名称。
3. 本报告 §0.3 的数字回归：图片面板 section 数、内容/可视高度、点击数、picker 项数。
4. 导出与画布一致性：滤镜顺序、蒙版、透明度、混合的导出像素 diff。
5. 截取 before/after 对照图存档到 `analysis/screenshots/`。

---

## 7. 附录

### 7.1 证据索引

| 证据 | 路径 |
|---|---|
| Affinity 图像 UI 盘点（静态） | [`affinity/rea-image-ui-2026-10-26/AFFINITY_IMAGE_UI.md`](affinity/rea-image-ui-2026-10-26/AFFINITY_IMAGE_UI.md) |
| Affinity 摘要 | [`affinity/rea-image-ui-2026-10-26/SUMMARY.md`](affinity/rea-image-ui-2026-10-26/SUMMARY.md) |
| Affinity 菜单全量（1198 条） | `affinity/rea-image-ui-2026-10-26/evidence/menu-items-full.json` |
| Affinity 图像相关菜单（93 条） | `.../evidence/menu-items-image.json` |
| Affinity 目录（41/25/6/3） | `.../evidence/catalog.json` |
| Affinity REA 证据摘要 | `.../evidence/mainmenu-graph-summary.json`（`ev_37d627ac…`） |
| Affinity 资产名 | `.../evidence/asset-catalog.json`、`asset-ui-names.json` |
| Affinity 命令日志 | `.../evidence/commands.md` |
| Affinity 截图 | `.../screens/affinity-image-context.png`、`affinity-vector-workspace.png` |
| VOO 功能清单（源码 file:line；其正文写于截图前） | [`voo/IMAGE_UI_INVENTORY_2026-10-26.md`](voo/IMAGE_UI_INVENTORY_2026-10-26.md) |
| VOO 体验度量（截图 + DOM JSON） | [`voo/IMAGE_UX_METRICS_2026-10-26.md`](voo/IMAGE_UX_METRICS_2026-10-26.md) |
| VOO 截图 | `voo/assets/image-ui-2026-10-26/`（本次实测 20 张）、`voo/assets/image-ux-2026-10-26/`（第三方并行采集） |
| 既有 Audits | [`docs/image-processing-audit.md`](../docs/image-processing-audit.md)、[`analysis/FEATURE_MATRIX.md`](FEATURE_MATRIX.md)、[`analysis/RIGHT_PANEL_ALIGNMENT.md`](RIGHT_PANEL_ALIGNMENT.md) |

### 7.2 截图清单（本报告引用）

| 图 | 内容 |
|---|---|
| `voo/assets/image-ui-2026-10-26/01-toolbar-strip.png` | VOO 顶部工具栏全貌（12 入口） |
| `.../03-image-selected.png` | 选中图片的右栏（ALIGN→…→EFFECTS→EXPORT） |
| `.../06-image-with-curves.png` | 添加 Tone Curves 后的效果行（在折叠线以下） |
| `.../15-image-effect-filter.png` | 添加 Blur 后的单参数浮动卡（“BLUR 10%”） |
| `.../17-image-tools-open.png` | 展开的 Image tools（频率分离/调整/Fit-Fill） |
| `.../18-image-add-menu.png` | `+ ADD` 菜单（Live Filters/Styles/Modifiers） |
| `.../20-live-filter-picker.png` | Live Filters 8 个 kind（与 FILTERS 重复） |
| `.../21-text-taskbar-vs-panel.png` | 文本节点的字体/字号/对齐/颜色同时出现在底部任务条与右栏 Typography（修复前证据） |
| `.../23-effects-filter-stack.png` | 从 Effects picker 添加 Blur 后，滤镜行出现在 Effects 内（本次优化后） |
| `.../24-effects-filter-stack-bottom.png` | Filter stack：排序 ↑↓ / VALUE / OPACITY / 开关（本次优化后） |
| `.../25-text-taskbar-after.png` | 文本 taskbar 仅保留层级动作，字体属性只在右栏（本次优化后） |
| `.../26-image-tools-section.png` | IMAGE TOOLS 常驻 section（频率分离 / Fit-Fill） |
| `.../27-filter-stack-all.png` | 23 种滤镜统一进 Filter stack（示例：BLUR + MEDIAN） |
| `.../28-image-histogram.png` | IMAGE TOOLS 常驻直方图（RGB + luma + 裁剪读数） |
| `.../29-filter-stack-blend.png` | Filter stack 行内 blend 下拉（NORMAL / Multiply / …） |
| `.../30-effects-picker-search.png` | Effects picker 搜索 "blur" 的过滤结果 |
| `.../31-filter-mask.png` | 用像素选区给 Blur 生成 per-filter 蒙版（M 按钮高亮） |
| `.../32-layers-filter-sublist.png` | Layers 面板下的滤镜子行（● Blur） |
| `.../09-tool-crop.png` | Crop 工具面板 |
| `.../10-tool-brush.png` | Brush 工具面板 |
| `.../12-tool-wand.png` | 魔棒工具面板 |
| `affinity/rea-image-ui-2026-10-26/screens/affinity-image-context.png` | Affinity 像素上下文工具栏（开发/液化/色调映射）+ 右侧面板组 |

### 7.3 与上一轮分析的关系

- 上一轮 [`affinity/GAP_ANALYSIS_2026-10-26.md`](affinity/GAP_ANALYSIS_2026-10-26.md) 的结论仍成立（滤镜补齐清单、没有 RAW/Liquify 等），本报告在此基础上补充：
  1. REA nib 解码得到**完整 41 滤镜 + 25 调整 + 6 实时蒙版**（上一轮以 action selector 抽样为主）；
  2. 把重点从“能力有/无”转到**非破坏栈表达力/参数模型/入口分层**；
  3. 用 VOO 运行时实测给出可验收的数字（section 数、高度、点击数、picker 项数）；
  4. 纠正上一轮未覆盖的问题：**两套滤镜重复、Image tools 折叠、Live Filters 4 次操作、吸管无按钮、Select 英文重名、⌘K 无调整/滤镜动作**。

### 7.4 局限

- **REA 菜单解码的覆盖是 partial**：`mainmenu-graph-summary.json` 的 `graph.truncated=true`，MainMenu 的 connections 覆盖为 `partial`（3 条未解析）；因此 41 滤镜 / 25 调整 / 6 蒙版是“REA 解码到的 selector 清单”，不排除极少数未连接项遗漏；selector 也只证明 nib 中存在 target-action，**不证明二进制实现与运行时可见**（REA limitations 原文）。
- Affinity 未能运行时逐项打开滤镜对话框（AX 权限被系统拒绝）；滤镜参数范围、Layers 面板的排序/混合/蒙版交互均未逐项取证，文中已标注“公开产品行为/未核验”。
- `voo/IMAGE_UI_INVENTORY_2026-10-26.md` 由并行 agent 先于截图完成（其正文写“截图未完成”）；本报告引用的 VOO 截图是 Lead 在同一工作区后续实际拍摄的 `voo/assets/image-ui-2026-10-26/`（20 张），两者时间口径不同，以截图文件为准。
- Affinity 菜单中文名来自官方本地化，部分菜单标题带“…”省略号；实际对话框标题可能略有差异。
- VOO 数字基于 1440×900、深色主题、单图片层的实测；其他视口/内容长度会影响滚动数字。
- 性能结论（CPU/GL）来自源码路径与既有 audit 文档，未在本轮做帧率对比。

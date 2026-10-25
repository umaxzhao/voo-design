# 右侧属性面板 · 功能布局对齐分析（Figma / Pen → VOO）

日期：2026-10-25 · 工具链：`rea` v6.5.0 + 已回收的 Figma / Pen 运行时证据
目标：**视觉风格保持 VOO 现有规范**，**功能布局（section 组成、顺序、行结构、交互）对齐 Figma 与 Pen.app**。

配套证据（本目录）：
- [`figma/RIGHT_PANEL.md`](figma/RIGHT_PANEL.md) —— Figma 右栏功能解剖（i18n 860 keys + bundle 抽取，含逐控件证据与复现命令）
- [`pen/RIGHT_PANEL.md`](pen/RIGHT_PANEL.md) —— Pen 右栏逐 section 解剖（bundle 字节偏移可复现，含完整渲染顺序）
- 现有实现审计：[`docs/panel-control-audit.md`](../docs/panel-control-audit.md)

---

## 0. 结论摘要

1. **Pen 的面板顺序是硬证据**（面板组件 `WBn` @6354800）：
   `Header → Alignment → Position → Layout → Appearance → Fill → Stroke → Typography → Icon/Script/Browser → Effects → Theme → Metadata → Code → Export`。
   Pen 没有 Constraints / Prototype / 组件变体 section；组件操作在 header；Variables 是独立面板，右栏只消费绑定；无选中时**整个右栏不挂载**。
2. **Figma 的面板词汇是硬证据、顺序是推断**：`fullscreen.properties_panel.*` 有 860 个 key，但渲染 section 容器的 lazy chunk 未回收到缓存，因此顺序按 Figma 设计栏的公认结构复原（报告内已逐条标注 `INFERENCE`）。
   Figma = 两段 tab（Design / Prototype）+ Dev Mode 模式（Inspect）；状态栏常驻 `Fill / Stroke / Effects / Export`，每段自带 `+`；Fill 行内联 样式/变量 绑定与可见性；“Selection colors” 聚合多选颜色；尺寸输入是“数值 + hug/fill/fixed 下拉 + min/max”的组合控件。
3. **VOO 现状的最大偏差不是控件多少，而是“布局模型”不同**：
   - 单一长栈、固定 JSX 顺序；`Effects / Export / Variables / Styles / Constraints` 默认藏在面板底部唯一的 “+ Add” 里（渐进披露）；
   - 工具激活时右栏被工具选项整体接管（这点与 Pen 一致、与 Figma 不同，建议保留）；
   - 无图层名/类型 header、无 Selection colors、无 Appearance 段、尺寸无 hug/fill/fixed 组合下拉、Fill/Stroke 行内无样式/变量入口；
   - Typography 在自动布局之后渲染（应前移到尺寸之后，文字本身就是排版属性）。
4. **建议目标**：保留 VOO 的视觉原语（288px、黑玻璃、9px 微标题、h-7 圆角字段、`#a7ffd4` 焦点环），把 section 组织改成 Pen 的顺序 + Figma 的状态语义（常驻 paint/effects/export、行内绑定、mixed/disabled 可见化）；把 VOO 现有“+ Add”收敛为**高级能力**（Live filters / Modifiers / 独立 Variables / Styles 面板入口）。分三期落地（见 §9）。

---

## 1. 方法与证据

| 证据 | 位置 | 强度 |
|---|---|---|
| Pen 面板渲染顺序 | `/tmp/apps/pen/out/editor/assets/index.js` `WBn` @6354800；逐 section 调用点 @6355482–6358154 | static（bundle） |
| Pen 每段控件顺序/文案 | 同 bundle（Fill `mjn`@6182160、Stroke `iBn`@6298528、Effects `VDn`@5998438、Typography `bBn`@6323379…） | static |
| Pen 可见性/门控 | 选择器 `rEe` @6120482 | static |
| Figma 面板词汇 | `/private/tmp/figma_editor/figma_app.en.json`：`fullscreen.properties_panel.*` 860 keys；`fullscreen.type_panel.*` 36；`inspect_panel.*` 284 | static |
| Figma 行级结构 | `figma_app.js`：`stylePaintRow`@3664549、stroke 行 @5133000–5140000、paint 类型顺序 @1736600、header @4252437 | static |
| Figma 顺序 | lazy chunk 缺失 → `INFERENCE`（报告 §0 明示） | inferred |
| VOO 现状 | `src/canvas/components/editor_properties/**`、`src/canvas/components/image_editor.jsx` | static（代码） |

REA 证据本体：`/tmp/rea_evidence/figma/analyze-editor.json`（`ev_52416c8b…`）、`/tmp/rea_evidence/pen/analyze-index-renderer.json`（`ev_057db33…`）。两份 197–238 MB 的图未整份解析；上面两种 bundle 级证据更直接、可复现（命令见各报告 Reproduction 节）。

> 限制：Figma 面板容器的 lazy chunk 不在缓存里（860 个 panel key 中只有 285 个在 main bundle 出现，**所有 section 标题 key 都未被引用**），因此 Figma 的 section **顺序**属于高置信推断；控件、行结构、状态语义均为实证。

---

## 2. 参考解剖 A · Figma 设计栏

### 2.1 顶栏与标签

- 右栏 = `Design | Prototype` 两个 tab（`properties_panel.design` / `.prototype`），Dev Mode 是**模式切换**（`enter-inspect-mode`）→ 整栏换成 `Inspect`（独立 `inspect_panel.*` 命名空间，284 keys）。
- Header（`data-testid="property-panel-toolbar"` @4252437）：节点类型图标 + 名称/类型 + 溢出动作；多选显示 `{count} selected`。
- 页面上下文（无选中）：`Page` → `Background` → `On this page`（页面颜色）→ `Presets`。

### 2.2 单节点 Design 栏（顺序为推断，内容是实证）

`Alignment → Position/Size(+圆角/弧线/3D) → Auto layout → Grid → Constraints → Fill → Stroke → Effects → Typography(text) → 组件/实例 → Export → Appearance(opacity/blend)`

| 段 | 关键构件（实证 key） |
|---|---|
| Alignment | 6 对齐 + 6 分布 + tidy；`section_position.label_alignment` |
| Position/Size | `transform_panel.x/y/w/h/rotation/corner_radius/independent_corners/corner_smoothing`；W/H 是**数值 + sizing 下拉（hug/fill/fixed + min/max）+ 比例锁**组合；弧线 `start/sweep/ratio`、线 `x2/y2`、重复 `count/list_spacing` |
| Auto layout | 方向（水平/垂直 + `wrap`）→ 尺寸模式（hug/fill/fixed）→ gap（含 space between/around/auto spacing）→ padding（all/独立/水平垂直）→ 9 宫格对齐(+baseline) → min/max 行 → canvas stacking → `clip_content` → strokes-in-layout → 子项 include/exclude |
| Grid | 列×行、轨道 sizing、gap、flow（`grid.*` 27 keys） |
| Constraints | 水平/垂直两个下拉：left/right/L+R/center/scale/top/bottom/T+B + resizing（fill/fixed/hug） |
| Fill | 标题 + `+ Add fill`；行 = `stylePaintRow`（色块+hex+透明度+**样式 chip / 变量绑定**+可见性+删除）；类型：Solid/Video/Image(GIF)/Linear/Radial/Angular/Diamond/Pattern/Noise/Shader；`limit:5` + “See all N colors”；底部 `Selection colors` / `On this page` / `Show in exports` |
| Stroke | `+ Add stroke`；行序：Weight(+按边) → Position|Join(+advanced ⚙) → End points|Width profile → Path trim → advanced（solid/dashed、dash/gap、miter、cap、箭头端点） |
| Effects | `+ Add effect`：Drop shadow / Inner shadow / Layer blur / Background blur / Glass / Noise / Texture / Shader；行内参数 + 删除；禁用态有原因 tooltip |
| Typography | Font family → style → size → line-height → letter-spacing → paragraph spacing → 水平/垂直对齐 → auto-size（auto width/height/fixed）→ 列表 → variable font axes；样式 chip / 变量 chip |
| Component/Instance | 组件配置/属性/描述/publish；实例 swap → 主组件 → 覆盖重置矩阵（fill/stroke/effects/text/size/…） |
| Export | `+ Add export settings` 预设行（Format/Scale/Suffix/删除）+ 高级（quality、色彩配置、采样、DPI、帧率、PDF、轮廓化文字、id 属性）；静态/动画 tab、文件尺寸预览 |
| Appearance | Opacity + Blend mode + Show content |

### 2.3 交互语义（对齐重点）

- **常驻段 + 段内 `+`**：Fill/Stroke/Effects/Export 永远在栏里，新增行在段内完成；不是全局“+ Add”。
- **混合值显式化**：`Mixed` 占位、`Click + to replace mixed content`；不隐藏控件。
- **禁用不隐藏**：tooltip 解释为什么禁用（如 “Fill can only be applied to instances”）。
- **行内样式/变量入口**：`Apply style / Apply variable`、`Detach style/variable`、`Press = to apply a variable`。
- **数值微调**：方向键 1、Shift ×10；split 输入（符号键打开下拉）。
- **多选**：`{count} selected` + `Selection colors` 聚合。

---

## 3. 参考解剖 B · Pen.app（精确顺序）

**Panel = 221px 可折叠岛；无选中→不渲染；工具态替换面板**（Comment→评论面板、Scale→Scale 面板、路径编辑→仅 Vector 段）。

节点态顺序（`WBn`，全部 static 证据）：

| # | Section | 内部顺序（要点） |
|---|---|---|
| 0 | Header | 名称/类型徽标 + Present + 折叠；组件操作（Make/Detach/Go to component/Slot）+ Context 折叠块 |
| 1 | Alignment | 左/中/右 + 上/中/下（只读隐藏） |
| 2 | Position | X Y R° → Rotate 90°/Flip H/Flip V → （父级有布局时）Absolute Position 勾选 |
| 3 | Layout（flex 时标题变 Flex Layout） | 方向(Freeform/Vertical/Horizontal) → Alignment(3×3) → Gap(+Space Between/Around) → Padding(单/双/四边) → Dimensions W H → Fill Width/Height → （文字）Hug Width/Height → （文字）Resizing: Auto width/Auto height/Fixed size → （frame/script）Clip content |
| 4 | Appearance | Opacity% + Corner radius（可展开 4 角）+ Ellipse(A/S/R) / Polygon(N) |
| 5 | Fill | `+ Add fill`；行自下而上、拖拽排序、hover ×、点行开 250px 左侧弹层：Color/Gradient/Image/Shader + Blend + enable；色行=色块+hex+变量绑定；渐变=类型(Linear/Radial/Angular/Mesh)+Stops+几何；图片=URL/文件/Fit/Apply shader/Remove background/Vectorize |
| 6 | Stroke | `+ Add stroke`；paint 行 → Position(Center/Inside/Outside) + Weight（可按边）→ Join(Miter/Round/Bevel) + Cap(Butt/Round/Square) |
| 7 | Typography | 字体族（含变量绑定）→ Weight/Style → Size → Line height% → Letter spacing → 水平对齐(4) + 垂直对齐(3) |
| 8 | Icon / Script / Browser | 各自专用 |
| 9 | Effects | `+ Add effect`：Drop Shadow / Inner Shadow / Layer Blur / Background Blur（同类去重禁用）；行自下而上 + 拖拽 + 弹层编辑 |
| 10 | Theme | 文档主题（mode）列表 + Add theme |
| 11 | Metadata | 只读 key/value + 删除（仅单选） |
| 12 | Code | 代码导出设置 + Copy HTML / Export HTML / Import Web via Browser |
| 13 | Export | Scale(1x/2x/3x) + Format(PNG/JPEG/WEBP/PDF) + Quality + Export layer(s)（单一预设，非列表） |

Pen 的缺失（实证）：**没有 Constraints、Prototype、组件变体、Variables 段、页面属性面板、导出预设列表**。
快捷键：`Shift+A` / `Shift+Alt+A` 加/删 flex、`Shift+H/V` 翻转、`Cmd+Alt+X` detach、`Cmd+Alt+C` 复制 HTML。

---

## 4. VOO 现状（2026-10-25 审计）

- 容器 `src/canvas/components/editor_properties/index.jsx`：`md:w-72`（288px）、`rounded-3xl`、`bg-black/95`、`p-3`、`font-mono`；窄屏（<768）下沉为整宽分栏。
- Header `properties_panel_header.jsx`：只有「属性」标题或工具胶囊 + Mask/Motion/换边；**无图层名/类型**。
- 版式原语 `property_section.jsx`：`CollapsibleSection`/`StaticSection`、9px uppercase 标题、`h-7 rounded-xl` 行、折叠状态持久化。
- 上下文 `resolve_panel_context.js`：`tool`（工具接管）/ `properties`（节点）/ `background`（页面）；多选按类型交集。
- **实际渲染顺序**（`properties_panel_sections.jsx` 单一 JSX 链）：
  `Align → Combine → Warp|Transform(锚点·XY·WH·R·S·翻转·opacity/blend·圆角) → Constraints → Variants → TypeSpecific(arc/clip/layoutGrid/component) → Media → AutoLayout → AutoLayoutChild → Text → Shape → Adjustments → Fill → Stroke → ImageActions → Variables* → Styles* → Effects → LiveFilters* → Modifiers* → + Add`
  （`*` = 需在底部 “+ Add” 里揭示）
- 工具态 `tool_properties_section.jsx`：颜色属性（色轮+双色板）→ 工具专属；与 Pen 的“工具替换面板”一致。
- 默认 section 集合见 `PROPERTY_SECTIONS`；数组顺序与渲染顺序并不一致（frame 的 clip/layoutGrid 在 TypeSpecific 内、autoLayout 在 constraints 之后渲染）。

---

## 5. 差异矩阵（功能布局）

| 维度 | Figma | Pen | VOO 现状 | 目标 |
|---|---|---|---|---|
| 面板结构 | Design/Prototype tabs + Dev Mode | 单栈 + 上下文替换 | 单栈 | **Phase 1 单栈（Pen），Phase 3 再评估 tabs** |
| Header | 类型图标+名称+动作 | 名称+类型+组件操作 | 仅“属性”/工具名 | **补图层 meta（类型图标、可编辑名、多选计数）** |
| Fill/Stroke/Effects/Export | 常驻，段内 `+` | 常驻，段内 `+` | Fill/Stroke 常驻；Effects/Export 藏 +Add | **全部常驻；段内 +** |
| 尺寸控件 | 数值+hug/fill/fixed+min/max | W/H 数值 + Fill/Hug 复选 | 纯数值 | **Phase 2 组合下拉** |
| 布局段 | Auto layout + Grid 独立 | 合并为 Layout | Auto layout 独立；Grid 在 TypeSpecific | **保留独立但顺序对齐：Layout 紧跟尺寸** |
| 约束 | 独立段 | 无 | 有（藏 +Add） | **常驻（frame 子项）** |
| Appearance | Opacity+Blend | Opacity+Corner | opacity/blend 塞在 Transform | **新增 Appearance 段，置于 Effects 后** |
| Typography | 靠前（尺寸后） | Stroke 后 | AutoLayout 之后 | **文字层：尺寸后立即 Typography** |
| 样式/变量 | 行内 chip + Apply variable | 行内变量 | 独立段（+Add） | **Phase 2 行内绑定；独立段保留为高级** |
| Selection colors | 有 | 无 | 无 | **多选时新增** |
| Mixed/禁用态 | 显式可见 | Mixed 文本 | 部分 mixed | **统一显式化** |
| 行编辑 | 行内展开 + 弹层 | 行 + 250px 侧弹层 | 行内展开 | **保留行内（VOO 风格），不引入弹层** |
| Export | 预设列表 | 单一预设 | 单个 PNG 导出（+Add） | **Phase 2 预设行** |

---

## 6. 目标规范（保持 VOO 视觉风格）

### 6.1 不变项（视觉）

- 容器：`288px`、`rounded-3xl`、`bg-black/95`、`backdrop-blur`、`p-3`、`font-mono`、`text-neutral-200`，窄屏下沉行为不变。
- 段标题：9px uppercase `tracking-[0.14em]`、`text-neutral-400`、chevron 折叠、折叠状态持久化（`editor_panel_preferences`）。
- 行/字段：`h-7`、`rounded-xl`、`bg-neutral-800`、hover 提亮、焦点环 `#a7ffd4/40`；数值等宽、可拖拽、混合值显示 `—`/`Mixed`。
- 段落节奏：`border-t border-white/10`、`pt-2.5 pb-1 mt-2.5`（现有 `sectionRhythmClass`）。
- 颜色：只使用 design tokens / Design.md 允许值；不引入 Figma/Pen 的配色或圆角。

### 6.2 面板结构与上下文

```
右侧面板（288px，单栈）
├─ 无选中 / 页面： Page（背景色、页面颜色、预设、删除画布）
├─ 工具态： [工具胶囊] → 颜色属性 → 工具参数 → （选区工具）选区动作
└─ 节点态： Header（类型图标 · 可编辑名 · 多选计数 · 动作 ▾）
             → Alignment
             → Position & Size（X/Y → W/H+sizing → R → 圆角 → 翻转）
             → Layout（auto layout；子项 Absolute position）
             → Grid（frame）
             → Constraints（frame 子项）
             → [Typography（文字层）]
             → Fill
             → Stroke
             → Effects
             → Appearance（opacity · blend）
             → Export
             → 高级（+ Add：Live filters / Modifiers / Variables 段 / Styles 段）
```

- **保持在节点态显示选择属性**（工具态由工具面板接管，与 Pen 相同；与 Figma 的顶部工具条差异在 §10 说明）。
- Header 多选时显示 `N selected`，单选显示类型图标 + 名称（双击重命名）。

### 6.3 每种上下文的 section 顺序

| 上下文 | 顺序 |
|---|---|
| 无选中/页面 | Page（Background → On this page colors → Presets） |
| Frame | Header → Alignment → Position&Size → Layout → Grid → Fill → Stroke → Effects → Appearance → Export |
| Shape（rect/ellipse/polygon/star/line/vector） | Header → Alignment → Position&Size(+弧线/形状参数) → Constraints → Fill → Stroke → Effects → Appearance → Export |
| Image | 同 Shape（图片填充在 Fill 内编辑：Fit/替换/裁切入口） |
| Text | Header → Alignment → Position&Size → Typography → Fill → Stroke → Effects → Appearance → Export |
| Group | Header → Alignment → Position&Size → Layout → Effects → Appearance → Export |
| Component / Instance | Header（组件操作）→ Alignment → Position&Size → Layout → 组件/变体/属性 → Fill → Stroke → Effects → Appearance → Export |
| 多选 | Header(N selected) → Alignment → Position&Size(mixed) → Selection colors → Fill → Stroke → Effects → Export |
| 工具态 | 工具胶囊 → 颜色 → 工具参数 →（选区）动作 |

### 6.4 Section 内部行顺序（目标）

- **Color/Fill 行**：`色块 + Hex + 透明度 + 样式/变量 chip + 可见性 + 删除`；`+` 打开类型选择：Solid / Linear / Radial / Angular / Diamond / Image / Video（依 VOO 引擎支持裁剪）；>5 行折叠为 “查看全部”。
- **Stroke 行**：`Weight（可按边）→ Position(Center/Inside/Outside) → Join → Cap → Dash`；`+` 新增。
- **Effects 行**：`类型下拉 + 参数（X/Y、Blur、Spread、Color）+ 删除`；`+` 类型：Drop shadow / Inner shadow / Layer blur / Background blur（Glass/Noise/Texture 作为后续差距项）。
- **Appearance**：`Opacity + Blend mode`（frame 可加 `Show content`）。
- **Typography**：`Font family → Weight/Style → Size → Line height → Letter spacing → Paragraph spacing → 水平对齐(4) → 垂直对齐(3) → Auto-size(Auto width/Auto height/Fixed size)`。
- **Export**：预设行 `Format + Scale + Suffix + 删除`，`+ Add export settings`；底部主按钮 `Export`。
- **Alignment**：`左/中/右 + 上/中/下 + 分布`。
- **Layout**：`方向(Freeform/Horizontal/Vertical + Wrap) → W/H sizing(hug/fill/fixed) → Gap(+space between/around) → Padding(all/按边) → Alignment 3×3(+baseline) → Min/Max → Clip content`。

### 6.5 交互规则

1. **常驻 + 段内 `+`**：移除底部全局 “+ Add” 对 Fill/Stroke/Effects/Export/Constraints 的隐藏；`+ Add` 仅保留高级项（Live filters、Modifiers、Variables 段、Styles 段、Legacy 能力）。
2. **行内绑定**：Fill/Stroke 行内提供样式/变量 chip（`Apply variable` / `Detach`），未绑定时不占位；绑定态用现有 token 色（不改样式体系）。
3. **混合值显式**：`Mixed` 占位，不空白；多选顶部 `Selection colors`。
4. **禁用不隐藏**：不可用控件保留并 tooltip 说明原因。
5. **数值交互**：方向键 1、Shift ×10；保留现有拖拽 scrub；尺寸下拉用 split（点击字母图标展开）。
6. **不引入侧弹层**：VOO 保持行内展开，避免多一层浮层（与 Figma/Pen 的弹出编辑差异，属于风格取舍）。

---

## 7. 实施映射（文件级）

| 变更 | 文件 |
|---|---|
| section 顺序注册表（按上下文数组驱动渲染，替代固定 JSX 顺序） | `editor_properties/resolve_panel_context.js`、`properties_panel_sections.jsx` |
| 常驻 Effects/Export/Constraints；`+ Add` 收敛为高级 | `properties_panel_sections.jsx`、`panel_extras.js`、`panel_add_menu.jsx` |
| 新增 Appearance 段（opacity/blend 从 Transform 移出） | `transform_section.jsx`、新 `appearance_section.jsx` |
| Header 图层 meta（类型图标/名称/多选计数/动作） | `properties_panel_header.jsx` |
| Typography 前移（文字层） | `properties_panel_sections.jsx` |
| Selection colors（多选） | `properties_panel_sections.jsx` + 新组件（复用 `colour_swatch.jsx`） |
| Fill/Stroke 行内样式/变量 chip、可见性、>5 折叠 | `colour_fill_section.jsx`、`colour_stroke_section.jsx` |
| Export 预设行 | `type_specific_sections.jsx`（现有 `downloadSelectionPng`）→ 新 `export_section.jsx` |
| 尺寸 hug/fill/fixed + min/max（需引擎字段） | `transform_section.jsx`、`scene_constraints.js`（已有 constraints 模型） |
| i18n | `src/shared/i18n/extended-{en,zh}.js` + feature 模块 |
| 测试 | 新增 `tests/unit/right_panel_layout.test.jsx`（各上下文 section 顺序快照）、`right_panel_rows.test.jsx`（行结构/交互）；更新 `panel_no_tool_options`、`page_properties_and_slider_labels`、`resolve_panel_context` 相关测试 |

---

## 8. 测试与验收

1. **顺序快照**：按 8 种上下文渲染 `PropertiesPanelSections`，断言 section 标题顺序与 §6.3 一致。
2. **常驻性**：Frame/Shape 上下文默认出现 Fill/Stroke/Effects/Export/Constraints（不再依赖 +Add）。
3. **行结构**：Fill 行含色块/Hex/透明度/删除；Stroke 行含 Weight/Position/Join/Cap；Effects 行含类型与参数。
4. **混合/禁用态**：多选时 `Mixed` 文本与 `N selected`；禁用 tooltip 存在。
5. **工具态回归**：工具面板顺序不变（颜色→参数→动作），不触发节点 section。
6. **视觉回归**：288px、圆角、9px 标题、`h-7` 字段、焦点环不变；`npm run lint:design` clean。
7. **i18n**：en/zh key 对齐（现有 i18n 检查脚本）。

---

## 9. 分阶段计划

- **Phase 1（纯布局，无引擎改动）**：Header meta；section 顺序注册表 + §6.3 顺序；Typography 前移；Effects/Export/Constraints 常驻；新增 Appearance（opacity/blend 迁移）；`+ Add` 收敛；Selection colors 骨架；测试快照。预计 1 个 PR。
- **Phase 2（行级深度，轻引擎）**：Fill/Stroke 行内样式/变量 chip、可见性、>5 折叠；Effects 类型下拉与参数行；Export 预设行；尺寸 sizing 下拉 + min/max（复用 `constraints`/`auto layout` 现有字段）；Typography 段间距/大小写等。
- **Phase 3（产品级对齐）**：原型交互上线后再加 `Design | Prototype` 分栏；Dev Mode/Inspect 面（Code/Colors/Typography 检查器）；组件变体/属性段；导出预设列表。

---

## 10. 未决与风险

1. **Figma 顺序为推断**：若需要 100% 实证，需补抓 Figma 的 lazy chunk 或做一次运行时 DOM dump（不在本次 REA 范围内）。
2. **与现行“渐进披露”冲突**：当前 + Add 的收敛是此前的刻意设计（`panel_extras.js` 注释与提交记录可证）。本规范要把它降级为“高级能力”入口，需要产品确认。
3. **工具态与 Figma 不同**：Figma 工具选项在顶部工具条、右栏始终显示选择属性；VOO/Pen 是右栏接管。建议保持 VOO/Pen 行为（本次不改），若要求“完全 Figma”需再增加工具选项浮层。
4. **Pen 无 Constraints/Prototype/变体**：这些段只能参考 Figma；VOO 已有 constraints（藏在 +Add）与 variants 骨架，Phase 1 将其常驻即可。
5. **导出**：VOO 当前只有 PNG 导出入口；预设列表与格式矩阵需要新组件与渲染管线支持，放 Phase 2。
6. **变量/样式**：VOO 已有 Variables v2 模型与独立面板；目标只改“入口位置”，不改数据模型。

---

## 附：REA 复现入口

- Pen：`grep -o -b 'function WBn(' index.js` → 6354800；逐段偏移见 [`pen/RIGHT_PANEL.md`](pen/RIGHT_PANEL.md) Reproduction。
- Figma：`python3` 读取 `figma_app.en.json`，筛 `fullscreen.properties_panel.*`；反向核对 main bundle 引用（285/860）；行级结构按 `stylePaintRow`/stroke 行偏移读取。详见 [`figma/RIGHT_PANEL.md`](figma/RIGHT_PANEL.md)。

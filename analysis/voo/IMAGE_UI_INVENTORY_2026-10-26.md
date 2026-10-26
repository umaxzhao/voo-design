# VOO Design 图像处理 UI 盘点（2026-10-26）

> 范围：顶部工具栏 `editor_toolbar.jsx` + 右侧属性面板 `editor_properties/` 中与图像处理相关的入口与能力。
> 证据类型：**源码证据为主**（file:line，行号以 2026-10-26 工作区为准）。
> **运行时截图未完成**：Playwright 脚本（`tmp/image-ui-inventory/01-toolbar.mjs`）因 `node` 执行命令被权限闸门拦截（"This command requires approval"），无人值守环境下无法获批，未绕过。`assets/image-ui-2026-10-26/` 目前**没有任何截图**。凡需运行时确认的项已在文中标注"待运行时核实"。

---

## 结论（先看这里）

1. 顶部工具栏 design 模式下有 **12 个主按钮**，其中 **7 个带下拉**（选择、选区、画笔、钢笔、形状、填充、修复），下拉合计 **33 个子项**；另有 3D 对象菜单（3 项）仅在 `EDITOR_BETA_ENABLED` 下出现。
2. 图像处理能力集中在两条路径：**图层效果/调整栈**（`adjustments`，右栏 Effects 的 `+` 选择器）和**像素工具**（画笔模式、修复、裁剪、选区）。
3. 右栏 `PropertiesPanelSections` 渲染 24 个区块组件（含 `PanelAddMenu`），其中与图像相关的约 12 个；工具激活时由 `ToolPropertiesSection` 接管，分 11 个子面板。
4. 出现**两套并行的滤镜系统**：`adjustments` 下的 23 个滤镜 kinds（右栏 Effects）与 `adjustments.liveFilters` 下的 8 个 live filter kinds（右栏 Live Filters），有 8 个名字重复（见 E-2）。
5. 高价值入口（AI 抠图、超分、Auto Enhance、人像修饰、拆图层）**不在顶部工具栏**，而在选中图像后浮出的 contextual taskbar（`editor_contextual_taskbar.jsx` + `editor_ai_taskbar_buttons.jsx`）里。
6. 命令面板（⌘K）的 `paletteActions` 只包含撤销/重做/缩放/面板开关等，**未找到任何调整/裁剪/修复类命令**（见 E-5）。

---

## A. 顶部工具栏结构表

源码：`src/canvas/components/editor_toolbar.jsx`；工具 id 见 `src/canvas/editor/tool_ids.js:3-40`；快捷键见 `src/canvas/editor/editor_shortcuts.js:7-31`；菜单项数据见 `src/canvas/editor/tool_families.js`。

| # | 按钮（design 模式） | 工具 id | 快捷键 | 下拉（chevron）子项数 | 下拉子项（id → i18n key） | 图像相关 | 源码位置 |
|---|---|---|---|---|---|---|---|
| 1 | 选择 Select | `select`（族：select/distort/perspective/puppet_warp/select_region） | V（A 为族径向） | 4 | select / distort（扭曲）/ perspective（透视）/ puppet（操控） | 是（变形） | `editor_toolbar.jsx:91-93`；`editor_select_menu.jsx:53-58`（`SELECT_MENU_ITEMS`） |
| 2 | 抓手 Hand | `hand` | H | — | — | 否 | `editor_toolbar.jsx:96-100` |
| 3 | 画框 Frame | `frame` | F | — | — | 否（容器） | `editor_toolbar.jsx:104-108` |
| 4 | 裁剪 Crop | `crop` | C | — | — | **是** | `editor_toolbar.jsx:111-115` |
| 5 | 选区 Marquee（族） | `marquee` / `lasso` / `region` / `wand` | M（族 M/L/Z/W 等） | 7 | region 对象（AI）/ wand 魔棒 / rect 矩形 / ellipse 椭圆 ＋ lasso 套索 / poly 多边形 / magnetic 磁吸套索 | **是** | `editor_toolbar.jsx:118-129`；`editor_marquee_menu.jsx`；`tool_families.js:3-75`（`MARQUEE_TOOL_ITEMS`） |
| 6 | 画笔 Brush（族） | `brush` + brushMode | B | 7 | normal 画笔 / smudge 涂抹 / blur 模糊 / sharpen 锐化 / dodge 减淡 / burn 加深 / sponge 海绵 | **是** | `editor_toolbar.jsx:132-141`；`editor_brush_menu.jsx:25-80`；`tool_families.js:185-241` |
| 7 | 橡皮擦 Eraser | `eraser` | E | — | — | 是（像素擦除） | `editor_toolbar.jsx:144-148` |
| 8 | 文字 Text | `text` | T | — | — | 否 | `editor_toolbar.jsx:154-158` |
| 9 | 钢笔 Pen（族） | `pen` / `curvature_pen` / `free_pen` | P（⇧P 自由钢笔） | 3 | 钢笔 / 曲率钢笔 / 自由钢笔 | 否（矢量） | `editor_pen_menu.jsx:38`；`tool_families.js:284-313` |
| 10 | 形状 Shape（族） | `rect` / `ellipse` / `line` / `polygon` / `star` / `arrow` | R（O 椭圆，⇧L 箭头） | 6 | 矩形 / 椭圆 / 直线 / 多边形 / 星形 / 箭头 | 否（矢量） | `editor_shape_menu.jsx:66`；`tool_families.js:315-366` |
| 11 | 填充 Fill（族） | `fill` / `gradient` | G | 2 | 填充（桶）/ 渐变 | 是（像素填充） | `editor_fill_menu.jsx:19-54`；`tool_families.js:368-390` |
| 12 | 修复 Healing（族） | `healing` + healingMode | J（clone 为 S） | 4 | aiRepair（AI 修补，isAi）/ spot 污点修复 / patch 修补 / clone 仿制图章 | **是** | `editor_healing_menu.jsx:22-89`；`tool_families.js:243-282` |
| — | 3D 对象 Object3d | 由 `onAddObject3d` 插入 | — | 3 | box / sphere / plane | 否（3D） | `editor_object3d_menu.jsx:13-15`；仅当 `EDITOR_BETA_ENABLED && onAddObject3d`（`editor_toolbar.jsx` 末尾） |

**Motion 变体**（`variant="motion"`）：`editor_toolbar.jsx` 的 `!motionVariant` 分支隐藏 Frame、Crop、Marquee、Brush、Eraser、Fill、Healing；剩余 Select、Hand、Text、Pen、Shape 共 5 个。原因注释写在 `editor_toolbar.jsx` props 注释中："destructive pixel tools … belong in the design surface"。

**工具栏内统计**：design 主按钮 12（含 3D 测试版 3 项则 15 个可点入口）；下拉子项 33（+3D 3）。

**关键观察**：
- **Dropper（吸管，`TOOL.DROPPER`，快捷键 I）不在顶部工具栏**，只能键盘或其它入口到达（`editor_toolbar.jsx` 无 DROPPER 按钮；`editor_constants.js:39` 有 `KeyI: TOOL.DROPPER`）。
- Brush 族的 `dodge/burn/sponge/blur/sharpen/smudge` 是**像素修饰**，不是调整层，且它们与 Brush 同一个按钮（`tool_families.js:191-234`）。

---

## B. 图像工具激活后的上下文 UI

右栏由 `resolve_panel_context.js:50-72` 决定：`TOOL` 不在 `objectSelectionTools`（select / select_region / perspective / distort / puppet_warp）时 `panel: 'tool'`，由 `tool_properties_section.jsx` 接管。

| 激活工具 | 右栏内容 | 源码证据 | 备注 |
|---|---|---|---|
| Crop（C） | `CropProperties`（`crop_properties.jsx`），裁剪比例/尺寸字段 | `tool_properties_section.jsx:244,460-461`；`crop_panel_fields.js`；`crop_geometry.js`；`auto_crop.js`（比例预设 `PRESET_RATIOS` `auto_crop.js:15`） | 具体字段待运行时核实 |
| Brush（B）/ 画笔模式 | `BrushProperties`（颜色/宽度/硬度/流量/平滑） + `BrushPresets` | `tool_properties_section.jsx:326-365`；`brush_properties.jsx:15-47`（`BRUSH_MODE_PROPERTIES`）；`brush_presets.jsx` | 当 `brushModeHasColor` 时显示颜色 |
| Brush 的 retouch 模式（smudge/blur/sharpen/dodge/burn/sponge） | `BrushRetouchControls` + `BrushAdvancedControls` | `brush_properties.jsx:13-14, 317-331`；`brush_retouch_controls.jsx`；`brush_advanced_controls.jsx` | 对应 `soft_brush.js`、`brush_pressure.js` |
| Eraser（E） | 同 BrushProperties（`isEraser`）；`brushModeHasPresets('eraser')` 时显示 BrushPresets | `tool_properties_section.jsx:228-256` | 无 retouch |
| Healing（J） | `HealingModeControls`（按 healingMode 显示字段）；clone 模式显示源点（`onBrushFlow`） | `brush_properties.jsx:152-153, 289, 347`；`healing_mode_controls.jsx`；`healing_properties.js:12-33`（`HEALING_MODE_PROPERTIES`） | 大小/硬度/不透明度依 mode 决定 |
| 选区族（Marquee/Lasso/Wand/Region） | `SelectionProperties`（含 `isWand` 魔棒、磁吸套索字段）+ `SelectionActions` | `tool_properties_section.jsx:214-218, 377-420`；`selection_properties.jsx`；`selection_wand_controls.jsx`；`magnetic_lasso_fields.jsx`；`selection_lasso_workflow.jsx`；`selection_actions.jsx` | 选区模式按钮 `selection_mode_buttons.jsx` |
| Dropper（I） | `EyedropperProperties`（取样大小） | `tool_properties_section.jsx:433-445` | 工具栏无按钮（见 A） |
| Fill / Gradient（G） | `GradientProperties` | `tool_properties_section.jsx:481-490` | — |
| Shape / Pen / Text | `ShapeProperties` / `PenProperties` / `TextToolProperties`，颜色由 `ToolColorProperties` | `tool_properties_section.jsx:262-310, 446-456` | 矢量，非图像处理 |

**遮罩编辑态**：`index.jsx:263` `if (maskEditing && maskActions)` 走 `PropertiesPanelMaskToolbar`（`properties_panel_mask_toolbar.jsx`，`index.jsx:199`）。待运行时核实具体控件。

---

## C. 右侧面板 section 清单表

源码：`properties_panel_sections.jsx`（渲染顺序即屏幕顺序）；可见性规则：`resolve_panel_context.js:11-28`（`PROPERTY_SECTIONS`）、`panel_extras.js:20-51`（`eligible` / `hasContent`）。

默认折叠：`property_section.jsx:130-140`，`defaultOpen = true`，若 `loadEditorPanelSectionState()` 有存储则以存储为准。**即默认展开**（运行时核实存储来源）。

| # | Section（组件） | 出现条件 | 控件类型 | 默认 | 与图像相关 | 证据 |
|---|---|---|---|---|---|---|
| 1 | Align（`align_section.jsx`） | 非 warp、非 adjustment，有 onLayout | 对齐按钮组 | 展开 | 否 | `properties_panel_sections.jsx:149-156` |
| 2 | Puppet pin（`puppet_pin_section.jsx`） | `tool === PUPPET_WARP` | 旋转/深度/固定 | — | 是（变形） | `:138-147` |
| 3 | Warp（`warp_section.jsx`） | isWarpTool | 重置/选 pin | — | 是（变形） | `:158-179` |
| 4 | Transform（`transform_section.jsx`） | 有 transform 且非 adjustment/audio | XY/WH/旋转/圆角 | 展开 | 否 | `:180-194` |
| 5 | Constraints（`constraints_section.jsx`） | `eligible.constraints` | 约束下拉 | 按需 | 否 | `:198-200` |
| 6 | Variants（`variants_section.jsx`） | 仅 frame | — | — | 否 | `:202-204` |
| 7 | Instance（`instance_section.jsx`） | 非 warp | — | — | 否 | `:206` |
| 8 | TypeSpecific（`type_specific_sections.jsx`） | 按 sections 白名单 | 依类型 | — | 部分（radius/frame） | `:208-218` |
| 9 | Media（`media_section.jsx`） | kind ∈ video/model3d/audio | 媒体控件 | — | 否（非图像） | `:220-230` |
| 10 | AutoLayoutChild（`auto_layout_child_section.jsx`） | `layoutChild` 且有 parentLayout | — | — | 否 | `:232-234` |
| 11 | Shape（`shape_section.jsx`） | path 且 poly/arrow/line | 多边形参数、箭头端点 | — | 否 | `:236-248` |
| 12 | **Adjustment 参数**（`affinity_adjustment_section.jsx`） | `kind === "adjustment"` | `normalizeAdjustments` 后逐个调节 | — | **是** | `:250-260` |
| 13 | Text（`text_section.jsx`） | kind text | — | — | 否 | `:262-270` |
| 14 | Appearance（`appearance_section.jsx`） | 非 adjustment/region/audio | 不透明度/混合/等 | 展开 | 部分 | `:272-280` |
| 15 | **Colour / Fill / Stroke**（`colour_section.jsx` → `colour_fill_section.jsx`、`colour_stroke_section.jsx`、`stroke_style_section.jsx`） | `has("fill")||has("stroke")` 且 supportsColour | 颜色/渐变/图片填充（`getBitmap`）/描边 | 展开 | 部分（图片填充） | `:282-298` |
| 16 | **Image context actions**（`image_context_actions.jsx`） | kind=image 且 tool=SELECT | 频率分离半径+按钮、亮度/对比度滑块、Fit/Fill 下拉 | 展开（非 disclosure） | **是** | `:299-306`；`image_context_actions.jsx:18, 77-156` |
| 17 | Color variables（`color_variables_section.jsx`） | 用户加入（`revealed`）或已绑定 | — | 按需 | 否 | `:307-319` |
| 18 | Styles（`style_section.jsx`） | 用户加入或已用样式 | — | 按需 | 否 | `:321-328` |
| 19 | **Effects / 图层效果 + 调整栈**（`layer_effects_section.jsx`） | `eligible.effects`（非 adjustment/region/media 且 has effects） | 行列表（开关/移除/编辑）+ `+` 选择器（`AddKindPicker`） | 常驻（"空态仅标题+按钮"） | **是**（核心） | `:330-344`；`layer_effects_section.jsx:150-183` |
| 20 | Selection colours（`selection_colors_section.jsx`） | 非 warp | — | — | 否 | `:346-348` |
| 21 | Export（`export_section.jsx`） | `eligible.export` | 导出格式/尺寸 | 按需（有 engine 即可） | 部分（位图导出） | `:350-352` |
| 22 | **Live Filters**（`live_filter_section.jsx` + `live_filter_stack.jsx`） | `eligible.liveFilters`（kind ∈ image/raster，非 frame，有 effects 能力） | `+` 打开 `LiveFilterPicker` 8 项；栈内滑块 | 有内容才显示，或由 `+ 添加` 唤出 | **是** | `:354-363`；`panel_extras.js:24`；`live_filter_section.jsx:17-82` |
| 23 | Modifiers（`modifiers_section.jsx`） | 单选、非 frame/adjustment，且已绑定或唤出 | 线性/环形/网格阵列 | 按需 | 否 | `:365` |
| 24 | PanelAddMenu（`panel_add_menu.jsx`） | 总是 | 一个 `+` 菜单，列出未显示的可选 section（Live Filters/Variables/Styles/Modifiers） | 常驻 | 是（入口） | `:367`；`properties_panel_sections.jsx:130-135` |

**与图像相关的区块数量**：#2、#3、#12、#15（部分）、#16、#19、#21（部分）、#22、#24 等 **9 个直接相关**；加上工具激活时的子面板（B 节）共 **约 12 个**。

---

## D. 图像处理能力清单与入口位置

入口代号：**TB** = 顶部工具栏；**RP** = 右栏；**CT** = contextual taskbar（选中图像后浮出的工具条）；**CM** = 右键菜单；**CP** = 命令面板（⌘K）；**KB** = 键盘快捷键；**NUI** = 无 UI（仅代码/数据层）。

### D1. 色调与滤镜（adjustments）

| 能力 | kinds 数 | 定义 | UI 入口 | 证据 |
|---|---|---|---|---|
| 色调调整（Tone） | 20 | brightness, contrast, levels, curves, exposure, highlights, shadows, temperature, tint, hue, saturation, vibrance, colorBalance, blackAndWhite, photoFilter, channelMixer, selectiveColor, gradientMap, invert, threshold | RP #19 `+` → AddKindPicker「Adjustments」组；CT「调整」按钮（`editor_contextual_taskbar.jsx:242-250, 313`） | `adjustment_kinds.js:280-301`；`add_kind_picker.jsx:180-184` |
| 像素滤镜（Filters） | 23 | blur, sharpen, clarity, highPass, motionBlur, noise, clouds, pixelate, posterize, solarize, halftone, emboss, median, bloom, zoomBlur, twirl, denoise, defringe, hazeRemoval, diffuseGlow, unsharpMask, sepia, vignette | RP #19 `+` →「Filters」组；CT「调整」 | `adjustment_kinds.js:306-330`；`add_kind_picker.jsx:186-192` |
| 图层效果（Effects） | 11 | shadow, glow, innerShadow, innerGlow, satin, bevel, glass, texture, fill, gradientOverlay, stroke | RP #19 `+` →「Effects」组 | `adjustment_kinds.js:336-348`；`add_kind_picker.jsx:193-201` |
| 模糊与颗粒（layer-level） | 3 | layerBlur, backgroundBlur, noise | RP #19 `+` →「Blur & noise」组 | `layer_effects_section.jsx:150-162`；`add_kind_picker.jsx:202-210` |
| 预设模板（presets） | 若干 | `FILTER_PRESETS`、`PIXEL_FILTER_PRESETS`，分类 `FILTER_CATEGORIES` | RP #19 `+` 的右栏「预设」列（`add_kind_picker.jsx:213-220`） | `filter_presets.js:27, 194, 243` |
| 调整层 / 图层 | — | `kind: adjustment` 独立图层，`PROPERTY_SECTIONS.adjustment` | 图层面板；CT「添加调整层」（`onAddAdjustmentLayer`，`editor_contextual_taskbar.jsx:313-315`） | `resolve_panel_context.js:25` |

**标签映射**：`adjustmentLabelKey`（`adjustment_kinds.js:351-368`）对 `keys` 表外的 kind 回退到 `editor.props.adjustments`；但 SIMPLE 表里的 33 个 kind 都有 label key。

### D2. Live Filter（层级实时滤镜栈）

| 能力 | kinds | 定义 | UI 入口 | 证据 |
|---|---|---|---|---|
| Live filter 栈 | 8：blur, sharpen, noise, highPass, clarity, motionBlur, sepia, pixelate | `live_filter_stack.js:22-31` | RP #22：`+ 添加` → `LiveFilterPicker` | `live_filter_section.jsx:29-40` |

> 注：已逐行核对 `live_filter_stack.js:23-30`，共 8 项。这 8 项与 `FILTER_KINDS` 完全重合（见 E-2）。

### D3. 裁剪（Crop）

| 能力 | 定义 | UI 入口 | 证据 |
|---|---|---|---|
| 裁剪工具（C） | `TOOL.CROP` | TB #4；KB C；CT「裁剪」（`editor_contextual_taskbar.jsx:220`） | `editor_toolbar.jsx:111-115`；`shortcut-catalog:46` |
| 裁剪属性面板 | `CropProperties` | 工具激活时 RP（B 节） | `tool_properties_section.jsx:460-461` |
| 非破坏性图像裁剪 | `image_layer_crop.js`：`normalizeImageCrop` / `drawImageCrop` | 图像节点数据层（显示时裁剪） | `image_layer_crop.js:6, 111` |
| 破坏性裁剪 | `crop_destructive.js:33 applyDestructiveCrop`（裁剪文档/节点，按位图重算） | 由 `editor_pointer_crop.js` / `editor_crop.js` 调用；待运行时核实具体触发 | `crop_destructive.js:33, 85` |
| 自动裁剪（主体/比例） | `auto_crop.js`：`subjectBounds`、`windowForRatio`、`PRESET_RATIOS`（`auto_crop.js:15`） | 待核实（疑似裁剪面板内的比例预设） | `auto_crop.js:86-313`；`auto_crop_page.js` |
| 裁剪几何 | `crop_geometry.js`：`clampCropRect`、`straightenCropRect` | 裁剪工具内部 | `crop_geometry.js:14, 91` |

### D4. 选区（Selection）与蒙版（Mask）

| 能力 | 定义 | UI 入口 | 证据 |
|---|---|---|---|
| 矩形/椭圆选区 | `pixelMarquee`（TOOL.MARQUEE + marqueeMode） | TB #5；KB M | `tool_families.js:21-36` |
| 多边形/磁吸/套索 | `polygonLasso`、`magneticLasso`、`maskLasso` | TB #5（lasso 族）；KB L | `tool_families.js:13-52` |
| 魔棒 | `magicWand`（TOOL.WAND，KB W） | TB #5；`selection_wand_controls.jsx` | `tool_families.js:53-60` |
| 对象选择（AI） | `objectSelection`，`isAi:true`（TOOL.REGION，KB Z） | TB #5 首项 | `tool_families.js:3-12` |
| 选区操作 | 反选/取消/变换（CT 选区态按钮） | CT；RP `SelectionActions` | `editor_contextual_taskbar.jsx:191`；`selection_actions.jsx` |
| 遮罩（mask）编辑 | `editor_mask*.js`、`PropertiesPanelMaskToolbar` | RP 遮罩态（`index.jsx:263`） | `editor_mask_brush.js`、`properties_panel_mask_toolbar.jsx` |
| 剪贴蒙版 | ⌥⌘G / ⇧⌥⌘G、反相 ⇧⌘I | 快捷键目录（KB） | `editor-shortcut-catalog.js:67-72` |

### D5. 修复（Healing / Repair）

| 能力 | 定义 | UI 入口 | 证据 |
|---|---|---|---|
| AI 修补（AI Repair） | `local_ai_repair.js` `inpaintWithLocalAi`；门控 `isLocalAiRepairSupported`（WebAssembly + caches + OffscreenCanvas） | TB #12 首项（isAi）；KB J | `tool_families.js:248-256`；`ai_capabilities.js:88-94`；`local_ai_repair.js:249` |
| 污点修复 / 修补 / 仿制 | `repair_tools_healing.js`、`healing_properties.js` | TB #12；KB J / clone 为 S | `tool_families.js:257-274` |
| 局部 inpaint | `local_inpaint.js`、`local_inpaint_patch.js` | 待核实（疑似 CT 的 AI 区域修复） | `editor_repair_tools.js` |

### D6. AI 能力（本地/云端）

| 能力 | 定义 | UI 入口 | 证据 |
|---|---|---|---|
| 抠图 / 去背（Remove BG） | `matting` 模块（`ensureMattingModule`）、`matte_refine.js`、`matting_models.js` | CT `ai-remove-bg`（`editor_contextual_taskbar.jsx:236-241`，`disabled: maskBusy || !removeBackground`） | `ai_capabilities.js:14-72`；`matting_transform.js` |
| 超分（Upscale 2x / 4x / 动漫） | `local_upscale.js`、`upscale_models.js`、`upscale_tiling.js` | CT「更多 → AI」`editor.upscale.2x/4x/anime`（`editor_ai_taskbar_buttons.jsx:209-226`）；按钮 `editor_upscale_button.jsx:33` | `ai_capabilities.js:80-86` |
| 自动增强（Auto Enhance） | 待核实（`onAutoEnhance`） | CT「更多 → AI」（`editor_ai_taskbar_buttons.jsx:236`） | `editor_ai_taskbar_buttons.jsx:236` |
| 人像修饰（Portrait retouch） | `portrait_retouch.js` | CT「更多 → AI」「修饰」（`:245`） | `editor_ai_taskbar_buttons.jsx:245` |
| 拆分图层（Split layers） | `layer_split.js` | CT「更多 → AI」（`:264-268`，web 端 `splitLayersUnavailableWeb` 不可用） | `editor_ai_taskbar_buttons.jsx:264-268` |
| 外扩（Outpaint）/ AI 重绘（Repaint） | `editor_generated_output.js`；`selection_effects_inpaint.js` | CT「更多 → AI」（`:198`）、`ai-repaint`（`editor_contextual_taskbar.jsx:320` 同一行） | `editor_ai_taskbar_buttons.jsx:198` |
| 频率分离（Frequency separation） | `image_context_actions.jsx:90-107`（半径 + 按钮） | RP #16 | `image_context_actions.jsx:90-107` |

### D7. 其它图像能力

| 能力 | 定义 | UI 入口 | 证据 |
|---|---|---|---|
| 直方图 | `histogram.js`（`computeHistogram`、`histogramStats`）；`histogram_strip.jsx` + `use_layer_histogram.js` | **只在调整弹层**（`adjustment_simple_controls.jsx:159, 206`） | `histogram.js:263, 212` |
| 色调曲线 | `tone_curves_widget.jsx`（`adjustment_simple_controls.jsx:5`） | 调整弹层内 | `tone_curves_widget.jsx` |
| 图像替换 | 文件输入 `accept="image/*"` | CT「替换」（`editor_contextual_taskbar.jsx:222-232`，`resetCrop: true`） | `editor_contextual_taskbar.jsx:222` |
| 图像适配（Fit/Fill） | `<select>`：fit / fill | RP #16（`image_context_actions.jsx:147-156`） | `image_context_actions.jsx:147-156` |
| 画笔 / 橡皮 | 画笔粒度/硬度/流量/压力 | TB #6、#7；RP | `brush_properties.jsx`、`brush_pressure.js`、`soft_brush.js` |
| 吸管取色 | `dropper` | KB I（**工具栏无按钮**） | `editor_constants.js:39` |

---

## E. 可达性观察（源码有但 UI 未挂载 / 冗余 / 不一致）

每条给出证据；标注"待运行时核实"的需在可跑的环境复核。

### E-1 `lightness` 调整在 SIMPLE 表中，但 AddKindPicker 的分组里找不到
- `adjustment_kinds.js:43-47` 定义了 `lightness`（`labelKey: editor.props.lightness`）。
- 但 `TONE_ADJUSTMENT_KINDS`（`adjustment_kinds.js:280-301`）与 `FILTER_KINDS`（`:306-330`）两个列表都**不含** `lightness`；`AddKindPicker` 只渲染这两组 + `EFFECT_KINDS` + `LAYER_EFFECT_KINDS`（`add_kind_picker.jsx:179-210`）。
- 结论：**`lightness` 在源码中有定义和 label，但在 `+` 选择器中不可达**（待运行时核实是否有其它入口，如调整层图标映射）。

### E-2 两套滤镜系统并行，8 个名字重复
- `adjustments` 滤镜（RP #19）23 项 vs `liveFilters`（RP #22）8 项（注：`LIVE_FILTER_KINDS` 为 8 项，见 D2 注）。
- 重复名：blur, sharpen, noise, highPass, clarity, motionBlur, sepia, pixelate（`live_filter_stack.js:23-30` 与 `adjustment_kinds.js:306-330` 交叉）。
- 同一张图可以既有 `blur` 调整（Effects 栈）又有 `blur` live filter（Live Filters 栈），**用户会看到两处同名的模糊**，且两者的参数与执行路径不同（`cpu_adjustments_kernels.js` 与 `live_filter_stack.js:87 applyLiveFilterStack`）。
- 这是**冗余**，也是**心智模型冲突**的主要来源。

### E-3 `affinity_filters.js` 不是 UI 注册表，只是 CPU 内核
- `affinity_filters.js` 只导出 9 个 `applyXxxFilter` 函数（`:12-325`）。
- 全仓库中**唯一导入方**是 `cpu_adjustments_kernels.js:46`（`grep affinity_filters` 已验证）。
- 这 9 个（median, bloom, zoomBlur, twirl, denoise, defringe, hazeRemoval, diffuseGlow, unsharpMask）在 `FILTER_KINDS` 中可达（RP #19 Filters 组），所以**不是死代码**；但它**不是**一个"可枚举的滤镜注册表"，因此对比报告中不应把它当作 UI 列表。

### E-4 `raster` 分支疑似死代码
- `panel_extras.js:24` 的 `live` 判断写了 `object.kind === "raster"`。
- `resolve_panel_context.js:11-28` 的 `PROPERTY_SECTIONS` 没有 `raster`；`propertyType()`（`:29-41`）对未知 kind 回退为 `vector`，而 vector 的 sections 不含 `effects`，于是 `has("effects")` 为假，`live` 为假。
- 结论：`raster` 分支在当前 kind 体系里**不会产生 live filter 入口**（需要在代码库内搜 `kind: "raster"` 的生产者；本次 grep 在 `src/canvas/editor` 未找到生产者，**待运行时/全仓核实**）。

### E-5 命令面板（⌘K）没有图像处理命令
- 命令表 `src/canvas/commands/command_registry.js` 只含索引/筛选/最近使用逻辑（`:261-331`），无 adjust/crop/heal 类命令。
- `image_editor.jsx:2365-2420` 的 `paletteActions` 只有 undo/redo/zoom/rulers 等视图命令。
- 结论：**图像处理能力无法经 ⌘K 到达**（与 `feedback-progressive-disclosure` 的"右栏只显示当前工具需要的"原则一致，但对"找不到功能"的用户不友好）。

### E-6 Dropper 不在工具栏
- `TOOL.DROPPER`（`tool_ids.js:37`）、快捷键 I（`editor_constants.js:39`）、i18n `editor.tool.dropper`（`extended-zh.js:1329` / `extended-en.js:1350`）全都存在；但 `editor_toolbar.jsx` 没有对应按钮。
- 结论：吸管只能靠键盘 I 到达，**UI 未挂载**。

### E-7 直方图只在调整弹层里
- `HistogramStrip` 仅在 `adjustment_simple_controls.jsx:159, 206` 被引用。
- 图像节点的右栏（B/C 节）没有直方图；选中图像时用户看不到整体色阶（除非打开某个调整）。

### E-8 英文 i18n 歧义：Marquee 与 Select 同名
- `editor.tool.marquee` 英文 = `"Select"`（`extended-en.js:1273`）。
- `editor.tool.select` 英文 = `"Select"`（`extended-en.js:1179`）。
- 工具栏的选区按钮（`editor_marquee_menu.jsx:42` 中间的 label 取 `editor.tool.marquee`）与选择按钮同名，英文 aria-label 与 tooltip 无法区分。**这是可访问性与可发现性问题**。

### E-9 Object3d 菜单仅 beta
- `editor_toolbar.jsx` 末尾：`EDITOR_BETA_ENABLED && onAddObject3d`；`editor-beta-features.js:20-23` 由 `import.meta.env.VITE_EDITOR_BETA` 决定。
- 默认生产构建不显示；属于"源码有、默认不可达"。

### E-10 Contextual taskbar 与右栏重复入口
- 「调整」按钮在 CT（`editor_contextual_taskbar.jsx:242-250`）与右栏 Effects `+`（`layer_effects_section.jsx:170-183`）**共用 AddKindPicker**，功能重复但位置不同。这是有意设计（两入口），报告里应作为"双入口"而非缺陷来写。
- 同理：CT 的 ai-remove-bg 在右栏无对应。

---

## F. 截图索引

| 编号 | 文件 | 状态 |
|---|---|---|
| 01-toolbar-fullwidth.png | `analysis/voo/assets/image-ui-2026-10-26/` | **未生成**（运行被权限闸门拦截） |
| 02-menu-{select,marquee,brush,healing,pen,shape,fill}.png | 同上 | **未生成** |
| 03–08（右栏图像节点分段、Crop/Brush/Healing/选区态、Effects `+` 选择器与 Live Filter 选择器） | 同上 | **未生成** |

复现脚本（未执行）：`tmp/image-ui-inventory/01-toolbar.mjs`，使用 `scripts/audit/design-experience-audit.mjs` 的 headless 参数与 1440x900 视口，会输出 `TOOLBAR_BUTTONS`、`MENU <family>` 的 JSON 清单与截图。**在获得 `node` 执行授权后可直接运行**，无需改代码。插图片节点的步骤尚未写入脚本（需用 `input[type=file]`，见 `editor_contextual_taskbar.jsx:222`），如运行时需要图像节点截图，请先确认该路径。

---

## 统计汇总

| 指标 | 数值 | 说明 |
|---|---|---|
| 顶部工具栏主按钮（design） | 12 | 不含 3D 测试版 |
| 下拉菜单数 | 7 | 选择、选区、画笔、钢笔、形状、填充、修复 |
| 下拉子项合计 | 33 | 4+7+7+3+6+2+4 |
| 3D 对象（beta） | 3 | 默认不可见 |
| 右栏 section 组件（PropertiesPanelSections 渲染） | 24 | 含 PanelAddMenu |
| 工具激活时子面板 | 11 | ToolPropertiesSection 的分支 |
| 调整 SIMPLE 条目 | 33 | `adjustment_kinds.js:9-276` |
| 调整 TONE / FILTER / EFFECT | 20 / 23 / 11 | 其中 TONE+FILTER = ADJUSTMENT_KINDS 共 43 |
| 图层级模糊/颗粒 | 3 | layerBlur / backgroundBlur / noise |
| Live filter kinds | 8 | 注：与 `adjustment_kinds` 的 FILTER 有 8 项重复 |
| AI 能力 | 约 8 | 抠图、超分（3 档）、AI 修补、外扩、AI 重绘、自动增强、人像修饰、拆图层 |
| 裁剪相关能力 | 5 | 工具、属性面板、非破坏裁剪、破坏裁剪、自动裁剪 |

---

## 缺失项（诚实说明）

1. **运行时截图全部缺失**（F 节）。原因：`node` 执行被权限闸门拦截，无人值守无法获批。未绕过。
2. 以下只靠源码推断、未在运行时验证：
   - 每个 section 的**实际折叠状态**（依赖 `loadEditorPanelSectionState` 存储）。
   - CropProperties / HealingModeControls / BrushRetouchControls 的具体字段。
   - `auto_crop` 的入口（是否在 Crop 面板内）。
   - `ai-remove-bg` 的 `removeBackground` 门控值（是否在 web 端恒为 false）。
   - `lightness` 是否有其它 UI 入口（E-1）。
   - `raster` kind 是否有生产者（E-4）。
3. i18n 键并不全在 `panel-zh.js` / `panel-en.js`，实际在 `extended-zh.js` / `extended-en.js`（本次按此核对）。
4. 未运行 `npm test`，按要求未连接 9555 端口。
5. 未修改 `src/`；未做任何 git 写操作。

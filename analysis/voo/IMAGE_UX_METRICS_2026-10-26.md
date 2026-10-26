# VOO Design 图像处理 UI 体验量化（2026-10-26）

## 结论

图像处理能力在源码和右栏均能找到：Brightness / Tone Curves 及 23 种 FILTER_KINDS 可通过 Effects picker 添加；Affinity 本轮新增的 9 种 CPU 滤镜均在该滤镜组中。另有一个独立的非破坏式 Live Filters 区，实际 UI 只接入 8 种 live kind。主要体验摩擦在右栏纵向滚动、紧凑小目标、图片处理入口分散，以及高级能力要经由工具菜单或上下文菜单才能发现。

测量页面：本地 Vite `http://127.0.0.1:5173/`，Playwright headless，视口 1440×900，深色主题，导入测试图 `sample-scene.png`（480×320）。没有连接用户实例，也没有运行 npm test。截图与逐状态原始 DOM JSON 一并保存。

> 数字是当前页面这一个桌面视口的实测。主右栏 section 按 9px 大写分组标题识别；像素选择、刷子、修复、裁剪会切换为工具专用面板，因此“右栏 section”只统计每个当前面板的可见分组，不代表所有属性都在图层主面板里。低对比度按现有审计脚本的近似 WCAG 算法（从最近不透明背景估算）计数。

## A. 右栏与工具面板密度

| 上下文 | Section 数 / 顺序 | 总滚动高度 / 可视高度 | 首屏可见 section | 控件数 | 无 aria-label 控件 | <24px 目标 | 低对比文本 | 默认折叠 section | 裁剪/溢出文本 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Image（选中图层） | 10：Image、Align、Transform、Constraints、Appearance、Fill、Alt text、Stroke、Effects、Export | 779 / 598px | 10 | 56 | 0 | 16 | 3 | 0 | 0 |
| Pixel（矩形像素选区） | 4 个 9px 标题：Tool options、Feather、AI actions、Modify selection（另有 Rectangle / Ratio / Refine edge 操作） | 457 / 457px | 4 | 17 | 0 | 1 | 未估算 | 0 | 0 |
| Adjustment（Brightness 编辑） | 9：Align、Transform、Layout、Appearance、Fill、Stroke、Effects、Selection colors、Export | 851 / 611px | 9 | 60 | 0 | 13 | 1 | 0 | 0 |
| Effect（Blur 编辑器关闭后、Effects 栈） | 同上 9 组 | 851 / 611px | 9 | 54 | 0 | 12 | 0 | 0 | 0 |
| Crop | 1：Crop | 197 / 197px | 1 | 6 | 0 | 0 | 0 | 0 | 0 |
| Brush | 3：Color、Brush、Brushes | 710 / 710px | 3 | 23 | 0 | 3 | 0 | 0 | 0 |
| Heal（AI Repair 工具） | 1：Healing | 201 / 201px | 1 | 3 | 0 | 0 | 0 | 0 | 0 |
| Selection（矩形选区工具） | 主图层栏仍显示 10 组；Selection 工具面板显示 Feather、AI actions 等 4 个 9px 组标题 | 457 / 457px（已画选区） | 4 | 17 | 0 | 1 | 未估算 | 0 | 0 |

注：调整编辑器和滤镜组改变时，右栏仍保留图层属性，弹出的编辑卡浮在画布与面板之间。Image 首屏主面板 779px 内容高于 598px 内部滚动视窗 181px（约 30%）；Adjustment 高出 240px（约 39%）。固定 1440×900 下内容能滚动，工作区纵向信息密度偏高。section 折叠统计只按 `aria-expanded="false"` 计算；本次样本没有观察到默认折叠项。

原始 JSON：[`raw-metrics.json`](assets/image-ux-2026-10-26/raw-metrics.json)、[`context-metrics.json`](assets/image-ux-2026-10-26/context-metrics.json)。

## B. 交互路径（从已选中图片开始）

| 任务 | 主入口与步骤 | 点击数 | 实时预览 | 可更短路径 / 补充入口 |
|---|---|---:|---|---|
| 加亮度或对比度 | 右栏 Effects `+` → Effects picker → Brightness / Contrast | 2 | 是；选中后弹出数值卡并即时呈现 | 选中图层的底部 contextual taskbar 有调整入口，也可打开同类 picker；约 2 次点击。⌘K 没有直接的 Brightness 命令 |
| 加曲线 | Effects `+` → Tone Curves | 2 | 是；弹卡包含曲线控件 | 选中图层的 contextual taskbar 调整入口；约 2 次点击 |
| 添加滤镜（Blur/Median 等） | 右栏 Effects `+` → FILTERS 组 → 选滤镜 | 2 | 是；通用调整值即时影响图像 | contextual taskbar 调整入口也到相同 picker；⌘K 搜索不是滤镜入口 |
| 裁剪 | 顶部工具栏 Crop → 调框（可选）→ Apply | 2 次点击 + 可选拖动 | 有裁剪遮罩/框的实时反馈；Apply 后提交 | 右栏 Crop 面板有 Free/Ratio/Size、Reset Crop、Apply/Cancel；图层 contextual taskbar 有 Crop 快捷入口 |
| 画笔属性 | 顶部 Brush 工具 → 右栏设置 Brush width 等 | 1 | 是，笔刷宽度等随光标绘制可见 | 菜单可切 Smudge/Blur/Sharpen/Dodge/Burn/Sponge；属性面板另有预设列表 |
| Spot heal / AI repair | 顶部 AI Repair → Tool options → Spot healing | 2 | Spot heal 笔刷落笔时有局部反馈；AI repair 是否成功取决于模型/模块状态 | AI Repair 主按钮是直接入口；Tool options 才能切 Spot、Patch、Clone |
| Refine selection | 顶部 Selection Tool options → Rectangle → 拖出选区 → 右栏 Refine Edge（或右键 Feather Selection） | 3 次点击 + 拖动；右键 Feather 替代路径共 4 次点击 | 选区边界实时反馈；Feather 通过右键命令提交 | Inspector 选区工具区有 Refine Edge / Modify Selection；右键有 Feather Selection（默认 8px）。命令面板也含 refine_selection 对应命令（搜索结果以 Feather Selection 呈现） |
| 蒙版 | 选中图层 → 图层 contextual taskbar Mask | 1 | 是，进入 mask 编辑时可见 mask 内容 | 主右栏的 mask actions 面板也提供编辑、反相、羽化/细化等能力；非破坏性调整与 mask 入口并列于属性栏 |

路径点击数是目标命令上的控件点击数，不含导入图片、拖动与等待。Spot healing、Refine selection 的菜单结构由真实点击和页面截图确认；Live Filter picker 由 source/组件入口确认，自动点击没有稳定完成，故不列作已复测路径。右栏 Effects picker 截图证明第一、二条可达。

### 命令面板与多入口

- `⌘K` 打开后，输入 `image` 显示 12 个结果（截图 `command-palette.png`）。包含 Select all pixels、Layer via Copy、Stroke Selection、Delete selected pixels、Content-aware fill、Deselect active pixel selection、Select layers 等；它主要覆盖图像/选区命令和工具动作，不提供 Brightness、Curves、滤镜种类或预设的直接入口。
- 顶部工具栏提供 Crop、Brush、AI Repair、Selection 等工具；右栏提供选中对象属性与 Effects picker；contextual taskbar 为选中对象提供 Crop/Adjust/Mask 等快捷操作；右键菜单提供选择编辑、蒙版和层操作。
- 调整/滤镜至少有右栏和 contextual taskbar 两条重复入口；Crop 有顶栏、右栏、taskbar 三入口；Spot healing 的细分项藏在工具选项菜单；Refine / Feather 在 inspector 与右键分别出现；命令面板与这些能力的重合主要是“选区命令/工具动作”，缺少直接的图像调整/滤镜命令。

## C. 后端能力与 UI 可达性

| 能力源 | 已实现能力 | UI 可达性结论 | 差异 / 文件位置 |
|---|---|---|---|
| `adjustment_kinds.js` | 20 种 tone/color adjustment + 23 种 FILTER_KINDS + 11 种 layer effect；SIMPLE_ADJUSTMENTS 另有 32 个标量参数项 | TONE_ADJUSTMENT_KINDS 和 FILTER_KINDS 都由 AddKindPicker 映射成可点击项；本次打开 picker 确认 Brightness、Tone Curves、Blur、Median、Bloom、Zoom blur、Twirl、Unsharp mask 可选 | 没发现本组已注册 kind 缺少普通 Effects picker 入口。定义：[adjustment_kinds.js:280]、[adjustment_kinds.js:306]、[add_kind_picker.jsx:179] |
| `affinity_filters.js` | Median、Bloom、Zoom Blur、Twirl、Denoise、Defringe、Haze Removal、Diffuse Glow、Unsharp Mask，9 个 CPU 运算 | 9/9 均在 FILTER_KINDS，Effects picker 有入口；通过通用滤镜参数卡添加 | 这些 9 个**不在**独立 Live Filter stack 的 8 种名单中，不能用其 opacity/order/toggle 级联栈路径。CPU dispatch：[cpu_adjustments_kernels.js:37]、[cpu_adjustments_kernels.js:217]；UI 目录：[adjustment_kinds.js:306] |
| `live_filter_stack.js` | Live filter kinds：blur、sharpen、noise、highPass、clarity、motionBlur、sepia、pixelate（8） | UI 已接入 `LiveFilterSection`，面板“ADD → Live Filters → +”打开 picker | 接入真实；但新增的 9 个 Affinity filter 都未进入 live stack。能力名单：[live_filter_stack.js:21]；组件入口：[live_filter_section.jsx:28]、[live_filter_section.jsx:59]；面板组合见 [properties_panel_sections.jsx:354-363]，ADD 菜单 reveal 见 [properties_panel_sections.jsx:130-135]。 |
| `ai_capabilities.js` | Matting / Upscale / AI Repair 的本地能力与 wasm 环境支持探测、模块加载 | AI Repair 有顶部工具入口；本地支持通过独立能力函数判断 | 该文件是平台能力探测，不是滤镜目录；可达性受运行时能力/模块状态影响。函数：[ai_capabilities.js:22]、[ai_capabilities.js:72]、[ai_capabilities.js:80] |
| Palette actions / commands | 工具动作与注册命令表 | `⌘K` 有 Crop / Brush / Select 等工具动作、选区命令；未发现调整/滤镜 kinds 被加入 action 列表 | `palette_actions.js:14` 列工具，`31` 起列额外动作；`command_registry.js` 管理命令目录。UI 缺口为“命令面板没有直达调整和滤镜项”，不是无 UI 功能。 |

**缺口统计**：普通 Effects picker 的调整 / 滤镜入口缺失 **0 个**（检查 20 + 23 个目录 kind）；Affinity 专有 CPU 滤镜普通 UI 入口缺失 **0/9**；Live Filter stack UI 入口缺失 **0**，但 9/9 Affinity 滤镜未被该 stack 支持；⌘K 中直接调整/滤镜动作缺少 **至少 43 类目录项**（20 adjustment + 23 filter，注意 Curves 可能在用户查询词里别名匹配）。

## D. 摩擦清单

| 优先级 | 摩擦 / 复现步骤 | 证据截图 | 源码位置 |
|---|---|---|---|
| P1 | **右栏长且需要滚动**：选中图片，右栏需浏览 ALIGN→…→EXPORT；图层/选区变化时 779–922px 内容高于 598–611px 滚动区域。调整/滤镜弹卡再叠加在画布边缘，部分工作区被遮挡 | `image.png`、`adjustment.png`、`effect.png` | `property_section.jsx`（统一 9px 分组标题）；`add_kind_picker.jsx:176-215`（弹出 picker 双列） |
| P1 | **小目标密集**：Image 主栏 16/56 个可点目标至少一个边小于 24px；Adjustment 13/60；低于手指/精细指针较舒适的目标面积，图标按钮依赖 hover/title | `image.png`、`adjustment.png` | `property_section.jsx:34-47`（section action 24×24）；`layer_effects_section.jsx` |
| P1 | **非破坏性与普通滤镜 UI 分流**：普通 Effects picker 有 23 种滤镜；独立 Live Filters 需先 ADD→Live Filters，再 picker，且仅 8 种。用户无法从滤镜入口自然辨别“可排序/混合透明度”的 stack 能力范围 | `effects-picker.png`、`live-filter-added.png`（picker 添加状态以源代码和旧脚本交互记录为准） | `live_filter_section.jsx:2-4, 59-79`；`live_filter_stack.js:21-31` |
| P1 | **⌘K 可达性偏命令而非处理参数**：`image` 搜索返回 12 项，但不包括 Brightness/Curves/Blur/Median 等直接动作；要回到右栏 picker 操作 | `command-palette.png` | `palette_actions.js:14-46`；`editor_command_palette.jsx:74-116` |
| P2 | **工具选项二级入口**：Spot、Patch、Clone、Brush 子工具要从工具按钮右侧 Tool options 下拉中找；AI Repair 独立按钮本身不暴露模式切换 | `brush-menu.png`、`healing-menu.png`、`direct-brush.png`、`direct-ai-repair.png` | `editor_toolbar.jsx`；`brush_properties.jsx:92-128` |
| P2 | **裁剪反馈项散落但整体可用**：裁剪专用面板有 Apply/Cancel/Reset Crop 和模式切换，但 Reset Crop 是小型文字按钮，缺少与普通图像调整统一的 before/after 对照入口 | `crop.png`、`direct-crop.png` | `crop_properties.jsx:41-63`、[Reset/Apply/Cancel 源码位置](../..)（crop_properties.jsx 后段） |
| P2 | **蒙版可视但入口存在图层状态依赖**：taskbar Mask 是选中对象上下文按钮；无选中图层时不可用。右栏面板切换到 Mask editing 后替换常规属性栏 | `mask.png`、`editor_context_menu.jsx` 的 mask context 操作 | `image_editor.jsx:4584-4616`；`editor_properties/index.jsx:263-275` |
| P2 | **操作反馈分布不一致**：Brightness 编辑器提供 Reset 和开关，预设在 picker 右列；裁剪有 Reset；通用滤镜编辑器有数值编辑/Reset，但没有通用 before/after 对比按钮；撤销粒度按连续输入结束后 commit 一次 | `adjustment.png`、`effects-picker.png` | `adjustment_popover.jsx:46-68`；`layer_effects_section.jsx:136-148`；`use_property_commit.js` |

无障碍样本审计：按钮无可访问名称 0；裁剪/工具面板目标普遍更大；Image 面板小于 24px 的 16 个点位值得先调大或扩展 hit-area。低对比 3 条来自 Image 主栏小字（报告脚本按 4.5:1 粗筛），因对渐变/透明背景的合成估算不精确，需以实际主题做 WCAG 工具复核。

## E. 与 Affinity 差距假设

以下是基于本地二手报告和本次 UI 观察的假设，不代表运行时实测 Affinity：

1. Affinity 把调整/滤镜作为独立图层或 Live Filter layer 管理；VOO 的 Brightness/Blur 从同一 Effects picker 加入后以行/弹卡编辑，层叠概念收在图层属性内，发现成本更高。
2. Affinity 的滤镜 persona 与细分滤镜入口更体系化；VOO 当前能直接选 Median/Bloom/Zoom Blur 等 9 种，但要在 Effects picker 的滤镜列表里寻找，⌘K 没有直达项。
3. Affinity 提供专用 before/after 比较习惯（本轮对比材料如此描述），VOO 当前可见的状态切换是 adjustment enabled/bypass 和撤销，缺少统一的按住比较控件；需 Lead 用 Affinity 实机复核。
4. Affinity 有更完整的高端能力类别（RAW Develop、LUT3D、Soft Proof/OCIO、Liquify persona 等），这些差距来自本地静态菜单 REA 报告，不代表本次 UI 浏览器测试。参考 [GAP_ANALYSIS_2026-10-26.md](../affinity/GAP_ANALYSIS_2026-10-26.md)；其原报告明确标出 Affinity 原生运行时未执行。
5. 右栏 section 标题 9px 且一屏内容逼近/超过内部视窗；Affinity 对比里可将其作为信息层级与可发现性的假设，不能单凭屏幕截图推断 Affinity 全面优于 VOO。参考 [RIGHT_PANEL_CLARITY_2026-10-26.md](RIGHT_PANEL_CLARITY_2026-10-26.md)。

## F. 截图索引

目录：`analysis/voo/assets/image-ux-2026-10-26/`。主要截图：

- `image.png`：图片层主右栏、布局与小目标。
- `effects-picker.png`：调整/滤镜/效果/preset picker 双列。
- `adjustment.png`：Brightness 卡片、Reset、enable/bypass、画布实时预览。
- `effect.png`：效果/滤镜添加后的状态。
- `crop.png`、`direct-crop.png`：Crop 工具浮动面板、模式、Apply/Cancel/Reset。
- `direct-brush.png`、`brush-menu.png`：笔刷参数和工具子菜单。
- `direct-ai-repair.png`、`healing-menu.png`：AI Repair 属性与 Heal 子菜单。
- `pixel-selection.png`、`selection-context-menu.png`：矩形像素选区、右键操作及 Feather Selection。
- `mask.png`：蒙版按钮所在的选中/图层区域状态；该点击路径截图状态不充分，仅作入口视觉参考。
- `command-palette.png`：⌘K 搜索 image 的 12 个结果。
- `context-*.png`：上下文采集辅助全页截图；`01-*.png` 至 `12-*.png` 为首轮旧审计输出，工具状态切换有不完整样本。`direct-*.png` 与 `pixel-selection.png` 是后续确认的专用工具状态。
- `raw-metrics.json`、`context-metrics.json`：原始 DOM 测量、控件列表与 palette 搜索结果。

## 复现路径

1. 打开 `http://127.0.0.1:5173/`，等待 3 秒，点击 New 并等待 2.5 秒。
2. 用 `data-testid="editor-media-file-input"` 导入 `sample-scene.png`。
3. 选中图层；右栏 Effects `+` 打开 picker。工具上下文使用顶栏 Brush / AI Repair / Crop，selection 使用 `Tool options → Rectangle` 并拖动框选。
4. ⌘K 输入 `image` 查看命令结果；选区状态下右键可见 Feather Selection / Stroke Selection 等命令。

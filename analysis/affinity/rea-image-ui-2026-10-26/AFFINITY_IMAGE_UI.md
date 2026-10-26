# Affinity 3.3.1 图像处理 UI 面取证

取证对象：Affinity 3.3.1 (4940)，`/Applications/Affinity.app`，中文界面；REA 6.5.0。此文区分静态资源、运行时窗口截图和解释性推断。截图中画布显示的是打开的 `packaged-smoke.png` 内容，不能把画布内的 VOO 设计稿误认成 Affinity 自身 UI。

## A. 顶部 Persona / Studio 栏

当前运行时窗口顶部可见「矢量 / 像素 / 布局 / Canva AI」Studio 切换；截图当前高亮「矢量」。本次受控点击未能验证模式切换，不声称已切换到像素。像素 Studio 资源说明其服务于图像校正、增强、数字绘画，配套位图工具、滤镜、调整和辅助面板；修整、色彩分级、合成、天文摄影等 Studio 名称也存在于本地化资源。[REA `plutil` → `zh-Hans-studios.json`；运行时 `current-pixel-studio.png`（窗口实录，当前矢量状态）；`lead-vector-workspace-fallback.png`]

Affinity 窗口第二行运行时显示「背景（像素）/72dpi」及「开发 / 液化 / 色调映射」入口；它们是图像/文档上下文能力入口，入口可见不等于 persona 工作流已进入。[运行时截图 `current-pixel-studio.png`]

## B. 左侧工具栏图像工具

左侧工具栏运行时可见移动/选择、节点、画笔/绘制、填充、矩形、文字、图像、裁切/测量、吸管、抓手、缩放等图标组；由于图标 tooltip 与 accessibility 标签未展开，名称为视觉识别，证据等级为运行时观察/推断。不可据此断言每个图标的精确动作。图像模式备用截图来自 Lead，作为入口布局佐证，不是本轮独立 GUI 采集。[`current-pixel-studio.png`; `lead-image-mode-fallback.png`]。

## C. 上下文工具栏

运行时窗口可见文档级上下文栏包含像素背景、72dpi、开发、液化、色调映射和设置入口；顶栏图标组随所选 Persona/对象改变，但本次没有逐工具选择并验证参数字段，因此逐工具参数清单缺失。截图中画布内的浮动工具条属于打开文档内容的一部分，不能当作 Affinity 工具栏证据。[`current-pixel-studio.png`]。

## D. 右侧面板与 Studio 布局

运行时右侧可见颜色/色板/笔画/外观面板，以及图层/路径/画笔/快速特效/样式、变换/导航器/历史记录组；颜色区含 HSL/色值、不透明度和色板。名称来自窗口截图视觉观察。Studio preference 中有 7 个 `StudioData` archive，REA 成功解出 binary-plist 对象与引用数量；`studio-layout.json` 保存 UUID、对象数量、根对象和限制。由于对象中 Cocoa 类名未知且没有公开的面板 UUID 映射，不把对象树猜译为具体面板组合。[REA keyed archive: `studio-layout.json`; `zh-Hans-studios.json`; `current-pixel-studio.png`]。

## E. 滤镜目录

本轮没有成功打开并截取 Filter 菜单，故完整菜单目录缺失。静态资源仅有 adjustments、fills、tool_settings、studios 等字符串表，不含可验证的 Filter 菜单层级。界面截图的右侧 Studio 说明明确提及非破坏性滤镜和像素 Studio 滤镜能力；资产目录分页共检查 3317 条记录，筛得 237 个相关资源名；包括 `layer_filters_guassianblur`、`layer_filters_motionblur`、`layer_filters_liquify`、多种 `layer_adjustment_*`、`DevelopPersona`、`LiquifyPersona`、`HDRPersona` 等。它们证实资源/图标命名存在，不等于 UI 菜单可见或完整目录。完整筛选结果见 `evidence/asset-ui-names.json`。菜单分组和条目不得仅从资产名推断。可复核本地双语命名 inventory：`evidence/menus.json` 收录 adjustments.strings 的 158 项（其中包含调整名称与预设名称，非菜单树）。[REA `plutil`; `zh-Hans-studios.json`; 菜单运行时缺失]。

## F. 调整目录

`adjustments.strings` 双语资源共有 158 key/value 项，混合调整名称与预设。例如「曲线 / Curves」「色阶 / Levels」「曝光 / Exposure」「色彩平衡 / ColourBalance」「HSL」「通道混合器 / ChannelMixer」「渐变贴图 / GradientMap」「分离色调 / SplitToning」「阴影高亮 / ShadowsHighlights」「阈值 / Threshold」「LUT3D」。同一资源还包含「+/- 光圈数」「柔和」「鲜艳」等预设标签，因此 158 不是调整类别计数。所有键值见 `evidence/menus.json`。[REA 本地化 plist 转换；`en-GB-adjustments.json`、`zh-Hans-adjustments.json`]。

## G. Persona 工作流

运行时入口可见开发、液化、色调映射。静态 `MainMenuDevelop/Liquify/HDR/Panorama/AstroStack.nib` 未能被本轮 REA app-bundle 解码覆盖：默认文档上限 64 被框架资源优先占满；上限 200 被参数校验拒绝（最大 64）。因此仅确认入口标签与存在对应 nib 资源，不描述具体 persona 工序。Develop、Liquify、HDR、Panorama、AstroStack 文件名可由 bundle 资源路径检查复核；焦点合成的运行时流程未采集。[运行时 `current-pixel-studio.png`; REA `interface-builder.json`; `evidence/commands.md`]。

## H. 可供 VOO 借鉴的 UX 模式

- 快速调整、调整预设、色彩示波器（Scope）、宏录制/回放与 Library 面板：Colour Grading Studio 的英文描述明确列出。[`en-GB-studios.json` / `zh-Hans-studios.json`；静态字符串]
- 修整工作室提供 Snapshot 面板以保存/恢复多个编辑版本。[`studios.strings`；静态字符串]
- 合成 Studio 快速访问多种非破坏性滤镜。[`studios.strings`；静态字符串]
- Pixel Studio 将位图编辑、滤镜、调整及支持面板集中到专用工作区。[`studios.strings`；静态字符串]
- Studio 是围绕任务编排工具与面板的配置层；建议 VOO 评估任务型工作区、局部编辑工具和一键预设。后半句是对资源描述的产品推断，不是 Affinity 内部行为证据。[推断]

频率分离、蒙版/选区的精确交互、Live Filter 添加流程、滤镜对话框和调整面板参数在本轮没有动态采集；不得将它们写成已验证的体验结论。

## 证据与限制

- 原始证据：`evidence/` 中 REA JSON、plutil JSON 和命令记录；运行时窗口截图在 `screens/`。Lead 提供的两张备用图在文件名中标明 fallback。
- `rea doctor` 显示 Hopper、Ghidra、IDA、JADX 未配置；`rea analyze` 返回 `provider_unavailable`。静态 nib/asset/plist 能力可用，但本轮 app-wide nib 64 文档窗口未覆盖目标主菜单。
- Studio 偏好顶层 plist 是普通 plist，不能整体交给 `inspect-keyed-archive`；7 个 `Studio.Data.*` NSData blob 已单独抽取并解析。`studios3.dat` 被 REA 报 unsupported binary format。
- Orca accessibility 快照和 ScreenCaptureKit 截屏成功；工具操作能发出，但切换 Studio/菜单的结果未在 AX 树中验证，未继续尝试高风险盲点操作。

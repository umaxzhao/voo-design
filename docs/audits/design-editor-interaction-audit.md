# Design editor interaction audit

审查日期：2026-10-26。审查对象：当前本地设计编辑器，不是静态截图。

## 方法与边界

使用 `design:design-critique` 检查操作与面板的一致性，使用 `webapp-testing`
的“观察 → 操作 → 验证”流程执行页面测试，使用 `engineering:code-review`
追踪渲染、历史和持久化路径。浏览器操作使用当前环境要求的 CUA 接口。

结论分为“页面复现”“代码确认”“回归测试”。代码确认不等于已经完成所有浏览器、
格式和异常条件的实测。本次覆盖桌面 1280×720 和窄屏 390×844；未执行真实手机触屏、
软键盘、长时间压力测试、所有媒体格式及断网/存储满额测试。

审查期间共享工作区有并行的面板与智能体配置改动。本轮保留这些改动，提交只包含
本轮的图片绘制、多 Frame 恢复、回归测试和本报告。

## 本轮已修复

| ID | 问题与证据 | 修复与验收 |
| --- | --- | --- |
| F01 | 页面复现：导入 WebP 后图层缩略图正常，画布只有选框；控制台 `Workspace Skia draw failed / Failed to fetch`。图片缓存中的已解码资源与 GPU 再次获取 URL 是两条路径。 | 图片使用已有 Canvas2D 合成器直接绘制已解码资源，避免再次获取临时 URL。实测导入后可见，Frame 底色正常。 |
| F02 | 代码确认：图片填充、多重填充、蒙版、调整层等会让 `requiresCanvas2dMediaFallback` 拒绝 GPU 绘制，但自由画布没有挂载对应的 2D 内容层。一个不支持的文档还可能中断整个工作区绘制。 | GPU 保留 Frame，本 Frame 的兼容内容由独立 2D 层绘制；测试覆盖图片、多重填充、蒙版和视频的路由及 Frame 底色保留。尚未逐种格式做像素对照。 |
| F03 | 代码确认：兼容内容必须订阅引擎绘制事件，否则 React 未更新时会再次出现“选框移动、内容不动”，资源解码完成也可能不刷新。 | 内容层每次从实时文档获取节点；测试覆盖实时移动、节点撤销删除、订阅释放。页面验证图片拖动、撤销、尺寸输入、隐藏与显示。 |
| F04 | 页面复现：项目有两个 Frame，重开后仅显示一个，页码仍为 2/2。加载路径把 `editingNodeIds` 设为仅包含当前页。 | 恢复所有保存的 Frame，当前焦点独立保留；页面检查两个 Frame 均存在，测试检查页序与焦点。 |
| F19 | 页面复现：新建文字时输入框能显示，按 Escape 结束编辑后文字消失。代码确认 GPU font manager 在未注册字体时返回空段落，当前 host 没有字体注册调用。 | 文字与图片一样使用现有浏览器字体合成路径，避免编辑测量与最终画面使用两套字体。加入文字路由回归；GPU 字体加载与排版一致性仍需独立完善。 |

主要实现：`workspace-artwork-routing.js`、`editor_artwork_fallback.jsx`、
`use_skia_page.js`、`editor_page.jsx`、`design_store.js`。

## 待修复：数据可靠性优先

### F05 · P0 · 自动保存没有覆盖所有项目

- 证据：页面测试导入并移动图片后，刷新重开测试项目，图片未恢复。
- 代码确认：`use_draft_autosave.js` 对存在 `filePath` 的项目取消调度；
  `writeDraftSnapshot` 同样跳过；`findDraftEntry` 只匹配无路径且同名的最近条目。
- 影响：不能把“自动保存”作为所有项目共同的可靠承诺。
- 修复方向：区分“写入工作区文件”和“恢复草稿”，所有项目变更都进入可等待的持久化队列；
  用稳定项目 ID 匹配恢复记录。不能只延长等待时间或删除脏标记。
- 验收：新项目、浏览器工作区、本地授权目录、已有路径项目均在修改后重开恢复一致。

### F06 · P0 · 关闭前没有可靠刷新最后一笔修改

- 代码确认：草稿调度延迟 1500ms，卸载清理只 `cancel()`；标签关闭直接进入
  `closeDocument`，没有等待这条调度队列完成。
- 影响：即使其他自动保存条件满足，修改后立即关闭仍有丢失窗口。
- 修复方向：事务与项目绑定；关闭、切换和退出先 flush，失败保留项目并给出重试。
- 验收：输入最后一个字符后立即关闭、重新打开，最后一笔仍在；写入失败时不丢弃内存状态。

### F07 · P1 · Frame 位置、整体背景与对象历史没有统一

- 代码确认：`setEditorArtboardLayout`、`moveEditorArtboard` 直接更新 store，
  没有生成引擎历史；位置修改不统一设置 `isDirty`。
- 自动草稿 revision 只包含 `engineVersion` 与工作区颜色，独立的 Frame 位移未纳入。
- 影响：移动 Frame 后撤销、待保存状态和重开结果可能不一致；整体背景也没有统一历史。
- 修复方向：项目层事务覆盖 Frame 位置、页面结构和工作区颜色，一段拖动生成一条记录。
- 验收：拖动 → 撤销 → 重做 → 等待自动保存 → 重开，位置和颜色完全一致。

### F08 · P1 · 同名项目仍可能混淆恢复身份

- 代码确认：`findDraftEntry`、`openPathless` 都使用名称关联无路径条目。
- 影响：不同目录、模板副本中的同名项目不能可靠区分。
- 修复方向：持久化项目 ID、工作区文件 ID、草稿 ID 显式关联，名称仅供展示。
- 验收：两个同名项目各自修改后，重开均恢复自己的内容。

## 待修复：右侧面板必须与实际能力一致

### F09 · P1 · 顶层 Frame 的 Auto Layout 只改属性、不参与排版

- 代码确认：面板修改文档级 `autoLayout`；`reflowAutoLayout` 只遍历
  `doc.nodes` 中具有 `autoLayout` 的 group，文档本身没有参与。
- 影响：横向、纵向、间距等控件可以改变状态，但顶层 Frame 子对象可能不重新排版。
- 修复方向：顶层与嵌套 Frame 复用同一个排版入口，排版结果进入历史和保存。
- 验收：相同内容分别放入顶层/嵌套 Frame，设置相同布局得到相同相对位置。

### F10 · P1 · 顶层 Frame 的变换和外观属性不完整

- 代码确认：面板翻转写 `flipH/flipV`，文档 Frame 读取 `flipX/flipY`。
- Frame 代理没有统一提供 `shear`，Frame 场景描述不消费 `shear` 与 `blendMode`。
- Frame 旋转/透明度的背景绘制、子对象绘制与 DOM 交互框走不同路径，缺少统一的父变换。
- 影响：部分控件有值或按钮响应，但画面、子对象和命中范围可能不一致。
- 修复方向：统一 Frame 文档/节点适配器；未完整支持的属性不能作为正常可用控件展示。
- 验收：包含不对称图形和图片的 Frame，逐项修改旋转、斜切、翻转、透明度、混合模式，
  内容、选框、点击位置、撤销和导出一致。

### F11 · P1 · 取消裁剪没有贯通所有绘制层

- 代码确认：自由画布的 Frame stage 固定 `overflow-hidden`；Canvas2D 根页面也直接裁剪。
- 本轮兼容画布尺寸仍按 Frame stage 分配，不能据此宣称已支持所有溢出内容。
- 修复方向：区分 Frame 边界、内容边界、事件边界，兼容层也按内容范围绘制。
- 验收：图片跨出 Frame 四边，切换裁剪、拖动、缩放、重开，显示和命中一致。

### F12 · P1 · 预览与栅格导出还没有共用完整 Frame 描述

- 代码确认：Skia Frame 使用 `frameSceneFills`；Canvas2D 页面底色仍直接读取
  `backgroundColor`，没有完整消费 Frame 多重填充、隐藏填充、渐变、透明度与圆角状态。
- 影响：面板里设置的外观不能保证 PNG 等导出所见即所得。
- 修复方向：预览、兼容层、导出共用 Frame paint/clip/transform 描述。
- 验收：透明、隐藏填充、渐变、多重填充、圆角、描边逐项做预览/导出像素对照。

### F13 · P2 · 一次性动作仍有重复和无效入口

- 页面与代码确认：普通形状的翻转出现在快捷栏和右侧变换区；图片还有快捷操作与右侧图像工具。
- 审查期间的共享面板改动给顶层 Frame 显示了对齐行，但 `layoutSelection` 操作的是
  引擎已选节点，顶层 Frame 代理不等同于这些节点。需做能力检查，不能仅检查函数存在。
- 修复方向：一次性动作集中到快捷栏；右侧保留属性；显示规则使用统一的选择上下文与能力表。
- 验收：空白、顶层 Frame、嵌套 Frame、图片、文字、单选、多选、锁定状态逐一检查入口。

### F14 · P2 · 保存反馈与导出名称仍有歧义

- 页面确认：标签仍提示“未保存更改（Ctrl+S / ⌘S 保存）”，与用户要求的自动保存交互冲突。
- 代码确认：草稿保存结果没有对应统一的保存中/成功/失败状态。
- 顶部“导出”为项目 ZIP；右侧“导出”为图层图片格式，名称没有说明产物。
- 修复方向：保存状态绑定已持久化 revision，失败显示重试；区分项目快照与图片/矢量导出。

## 待修复：移动端与错误恢复

### F15 · P1 · 390px 下属性输入被挤压

- 页面复现：两个面板各约 175px 宽，右侧 W 输入框实际只有约 17.47px，当前值 300 显示不完整。
- 面板间约 12px 间距和圆角已保留，这部分符合既定要求。
- 修复方向：保留面板外形；窄面板内变换行改为纵向/两行布局，设置字段最小可读宽度，
  必要时单面板展开，不能让输入框无限收缩。
- 验收：390、540、768px 下 X/Y/W/H、比例锁、颜色、布局均可完整读取与编辑。

### F16 · P2 · 多个触控目标小于项目约定

- 代码确认：移动端顶栏最小 44px，快捷栏常规按钮约 28px；当前规则要求 48px 点击区域。
- 修复方向：视觉图标尺寸与点击热区分开，窄屏增加热区但不增加所有图标尺寸。
- 验收：真实触屏检查滚动、点击、长按、拖动互不抢占。

### F17 · P1 · 渲染失败反馈只在控制台

- 后续修复：GPU 加载中、初始化失败、绘制/尺寸更新异常、上下文丢失时，普通 Frame
  现已使用包含底色和所有对象的 Canvas2D 备用绘制，并隐藏失效的 GPU 表面。
  独立测试标签页阻断 CanvasKit 加载后，已验证两个 Frame、矩形拖动及工作区换色仍正常。
  以下可见的失败原因与重试交互尚待完善，因此此项不是全部完成。
- 页面复现：图片加载失败时只有日志和空白选框，没有可理解的失败状态。
- 代码确认：工作区 Skia 初始化/绘制失败主要 `console.warn`，没有完整的可见错误与重试路径。
- 修复方向：区分资源失败、解码中、渲染器不可用，保留已有画面并提供重试。
- 验收：无 WebGL、坏图片、失效 URL、网络失败分别显示可恢复状态，不把空白当成成功。

### F18 · P1 · 线上版本与验收版本没有可靠同步

- 前几轮 GitHub 构建成功，但部署 job 被跳过；直接 SSH 连接被服务器关闭。
- 用户线上界面因此仍可能保留已在本地修复的八点选框、拖动和图标问题。
- 修复方向：恢复部署配置与服务器连接，页面展示可核对的构建版本，发布后执行同一组冒烟验收。
- 验收：线上版本号匹配提交，图片导入与拖动、四角选框、多 Frame 重开均通过。

## 固定回归矩阵

| 流程 | 本轮验证 | 后续必须补齐 |
| --- | --- | --- |
| 导入真实图片 | WebP 文件导入、缩略图、画布内容 | PNG/JPEG/SVG、超大图片、坏文件 |
| 选择与拖动 | 图片直接选中、四角框、内容随动、拖动撤销 | 交叠、旋转、锁定、跨 Frame、触屏 |
| 文字 | 创建、输入、退出编辑；已发现退出后消失并补齐兼容绘制 | 中英文混排、字体加载、换行、富文本、导出对照 |
| 属性修改 | 图片 W 与比例联动，隐藏/显示 | Frame 父变换、混合、蒙版、所有填充种类 |
| 多 Frame | 重开后数量、页序、焦点保留 | 嵌套、虚拟化、重命名、删除重做 |
| 保存与恢复 | 已发现重开丢失本轮图片的失败流程 | 所有存储驱动、最后一笔 flush、失败重试 |
| 输出 | 已检查预览/导出路径差异 | PNG/JPEG/WebP/SVG 逐项像素或结构对照 |
| 响应式 | 1280×720、390×844，面板边距与字段宽度 | 540/768px、真实触屏、软键盘、横竖屏 |
| 错误恢复 | 记录图片 fetch 失败与空白表现 | 无 GPU、离线、额度满、权限撤销、资源重试 |

## 修复顺序与完成标准

先完成 F05–F08 的项目事务与保存可靠性，再统一 F09–F12 的 Frame 数据与绘制描述，
然后收敛 F13–F17 的面板入口、窄屏和失败反馈。F18 必须在对外宣称线上生效前解决。

本轮新增可执行回归覆盖绘制路由、实时兼容层更新、Frame 底色与多 Frame 恢复。
报告中的待修复项没有因为已列出建议就标记为完成；它们应按上述验收场景逐项关闭，
而不是继续等待用户截图发现。

额外环境观察：并行修改与热更新期间，界面曾显示 `editor.props.*` 等原始翻译键。
此现象尚未在冷启动生产构建中复测，暂不归因为稳定产品缺陷，也未计入上述问题数量。


## Fixed midpoint insertion — 2026-10-31

Capability: `vectors.midpoint-insertion`. Hover and pointer insertion share one
fixed t=0.5 target per adjacent anchor pair, including the closing edge.
Subdivision preserves the original cubic geometry; existing handles and anchors
keep pointer priority. Selection-mode artboard dragging yields to active path
editing. Insertion and any following drag commit once on release; cancelling
restores the pre-insertion points.

Evidence: `tests/unit/pen-midpoint-insertion.test.js` first reproduced five
failures on the former moving-target implementation. Its eight assertions cover
arbitrary-position rejection, fixed straight/curved targets, rotation/nonuniform
scale at 0.5/1/3 zoom, exact curve samples, closure, overlap and cancellation.
`tests/e2e/pen-midpoint-insertion.e2e.mjs` uses real Chromium mouse events to
verify preview coordinates, rejected off-midpoint clicks, insertion, selected
new anchor, and one-step undo/redo. The preview assertion reads the rendered
chrome target; it is not a pixel comparison. Retained artboard/anchor tests cover
existing gestures. The clean release report at `/tmp/voo-midpoint-release.json`
records the exact verified revision and execution status; only `complete: true`
with that revision is release evidence.

Scope remains partial: physical pen/touch input, signed Electron packages,
self-overlapping multi-contour imports, cold project reopen and render/export
pixel comparisons are not certified by this targeted scenario. Bend/cut tools
retain their own segment projections; this change restricts anchor insertion.


## Browser drawer visibility — 2026-10-31

Capability: `platform.browser-drawer`. The local browser feature from `ae4c11e`
and `e35b167` is integrated without their unrelated collaboration bootstrap.
The drawer now portals above the editor, follows the measured title-bar bottom,
and clamps its width to the viewport. The active toggle uses the VOO mint fill
and a black, plain window icon. Navigation controls wrap instead of overflowing.
The original large drawer is split into its view, controller and overlay hook;
visible controls/status labels support both languages and failed script calls
surface their errors. Escape closes the drawer, or cancels active picking first.

`tests/e2e/browser-drawer.e2e.mjs` reproduced the toolbar being covered before
the fix. It checks foreground hit testing, computed active colors, 1440/390px
bounds, Escape, close and reopen. Existing import and title-bar unit checks are
retained, with the browser button explicitly included in action assertions.
An isolated Electron smoke run at `/tmp/voo-browser-native-check.mjs` uses the
real webview and address bar, loads a controlled blank guest, checks reachable
chrome and close/reopen, and captures `/tmp/voo-browser-native-preview.png`.
The release loading regression caught the eager HTML parser pulling fonts and
scene variables into the welcome screen; conversion now loads only on import.
`editor-loading.e2e.mjs` retains that regression.
The clean release report `/tmp/voo-browser-release.json` records the exact source
revision and gate results; native evidence is a development-runtime check, not
certification of signed installers or every external website.

Remaining contexts: third-party iframe embedding policies, authenticated sites,
all DOM extraction/remote-navigation combinations, touch resizing, Windows/Linux
native webview composition, and signed packaging are not certified here.


## Stroke paint row — 2026-11-01

- Capability: `inspector.control-hierarchy`; reuse the existing inspector source/unit/browser ownership.
- Remove the separate paint-type button from the primary stroke row, matching Fill. The existing swatch still owns solid/gradient editing; opacity, visibility, width and alignment stay available. No document operation or dependency changes.
- Reproduction: `stroke-row-icon-before.log` records both solid/gradient cases failing the new menu-absence assertion. `opacity_icon_blend_bg.test.jsx` retains those assertions; `inspector-control-cases.mjs` clicks the actual stroke swatch, switches to Gradient, checks the node, closes with Escape, checks focus and undoes once.
- Clean `62a41ee32c335951df862e5c20079b72e0299ce0` passed all 91 release steps, 87 core browser suites and 4691 units (4 skipped); GitHub CI passed. Reports: `/private/tmp/voo-license-regression/stroke-row-icon-release.json` and `stroke-row-icon-ci.json`. PR #74 merged as `d0658e0` with the identical source tree. The la2 deployment passed canonical entry/83 loaded asset SHA-256 checks, actual swatch gradient editing, Escape focus and keyboard undo with no page errors (`stroke-row-icon-production-proof.json`). Local application received only this component patch; its bytes match the verified source (`stroke-row-icon-primary-proof.json`). Backup: `/srv/voo-run/editor-backups/62a41ee32c335951df862e5c20079b72e0299ce0-20261031T203350Z`.
- Coverage is limited to registered Chromium scenarios. Signed desktop installers, physical touch/IME and every stroke combination are not certified. This visual removal needs no persistence migration.

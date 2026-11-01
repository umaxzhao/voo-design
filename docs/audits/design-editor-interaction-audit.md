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


## Circular color swatches — 2026-11-01

- Capability: `inspector.control-hierarchy` / `inspector.unified-fill`. Presets, document colors, primary/extra fill and stroke, effects/shape colors, inspect preview, tool foreground/background, taskbar chips, gradient stops, mesh points and design-system palette chips use circles. Existing selection/variable/background chips were already circular. Native color inputs share circular clipping (including their browser swatch pseudo-elements) and square sizing; hidden full-area inputs keep their original hit area. Spectrum surfaces, gradient tracks, design thumbnails and cover images retain their distinct purpose.
- Before: `/private/tmp/voo-license-regression/circular-swatches-before.log` records actual 20x20px picker presets with 6px radii failing the circle assertion. Regression: `inspector-control-cases.mjs` checks computed width/height/radius for actual presets, fill/stroke, gradient stops and mesh points, plus individual undo and Escape focus. Unit coverage includes a user document color and preset chips, with existing design-system tests retained.
- Targeted 32 units and the complete `ui-inspector-interaction` browser suite passed. Clean `92feeaa82ef28dbe97cfcc324707ea3920a706fd` passed all 91 release steps, 87 core browser suites and 4692 units (4 skipped), plus GitHub CI. PR #75 merged as `455cb16` with the identical tree. Reports under `/private/tmp/voo-license-regression/`: `circular-swatches-release.json`, `circular-swatches-ci.json`, `circular-swatches-main-tree-proof.json`. All 13 patched local source files match the verified files; other drafts are preserved (`circular-swatches-primary-proof.json`). The la2 deployment matched canonical entry/83 loaded resources; actual document-color pick/undo, 19 preset/document chips, fill/stroke, gradient/mesh, mobile and nine native token inputs passed circle checks with no page errors (`circular-swatches-production-proof.json`). Screenshots: `circular-swatches-production-{picker,mobile,native}.png`. Backup: `/srv/voo-run/editor-backups/92feeaa82ef28dbe97cfcc324707ea3920a706fd-20261031T205226Z`. The preview script initially raced the mobile media-query transition; it now waits for the actual mobile toggle before clicking. This was an external acceptance script timing issue; product assertions were retained.
- Scope remains partial: Chromium representative interactions and existing responsive/theme/locale tests do not certify every color entry, native OS picker dialog, Firefox/WebKit, physical touch or signed Electron installers. This is presentation only; no document schema, color values or mutation API changes.


## Brand loading feedback — 2026-11-01

- Capability: `platform.loading`. The real cold editor fallback and document-opening overlay use a rotating canonical VOO mark above a neutral thin progress bar. Entry labels stay accessible without visible copy; existing AI/shared/image phase labels and optional cancellation remain available. The unchanged brand SVG moved to a dependency-light component; the title bar retains its public re-export, avoiding a loading-to-title-bar import cycle.
- No percentage is invented: missing/nonfinite progress is indeterminate; finite values are clamped and reflected in `aria-valuenow` and scale. Reduce Motion stops logo/travel animation while keeping the progress segment visible. CSS transform animations add no timers or dependencies.
- Reproduction: `/private/tmp/voo-license-regression/loading-brand-before.log` / `.png` retain the old purple ring failing the brand assertion. `editor-loading.e2e.mjs` holds the actual editor module, checks layout, real rotation, unknown-progress semantics, 320px dark/light and reduced motion, then releases the same document and checks real drawing, engine continuity, undo/redo and deferred PDF export. An initial external interception cleanup race was corrected before retaining the real visual failure.
- Targeted 23 unit assertions and the complete loading browser suite pass. Impeccable detector returns no findings; design lint, module inventory and diff whitespace checks pass. Clean `44e07147f7b7f29cc876284ab3900fee76a13e1a` passed the complete 91-step gate (87 core browser suites, 4704 units passed / 4 skipped) and GitHub CI. The first run failed the fixture cache-directory removal assertion; `loading-brand-release-initial.json` / `.log` retain it, and `loading-brand-startup-recheck.log` plus the complete same-revision `loading-brand-release.json` record subsequent passes without assertion/source changes or stitched results. PR #76 merged as `005f8e2` with the identical tree (`loading-brand-main-tree-proof.json`). The local application received only this patch, verified by reverse-apply check; four complete source files match, while title-bar drafts outside the patch are preserved (`loading-brand-primary-proof.json`). The la2 deployment matched the canonical entry and 83 loaded resources; held real editor chunk, rotation/reduced motion/mobile, actual pointer rectangle/red pixel and undo/redo passed with no page errors (`loading-brand-production-proof.json`). Screenshots: `loading-brand-production-{desktop,mobile}.png`; backup `/srv/voo-run/editor-backups/44e07147f7b7f29cc876284ab3900fee76a13e1a-20261031T211205Z`.
- Coverage remains partial: these are Chromium/browser state and geometry checks, not signed Electron installers, physical mobile devices, all assistive technologies or measured rendering FPS. Actual file/model/server failure paths remain the responsibility of their existing suites; this change does not certify every loading caller.


## Canonical share links — 2026-11-01

- Capability: `platform.native-collaboration`. Shared room URLs always use the configured public `VOO_RUN_ORIGIN` (`https://voo.run`), independent of local, LAN, preview, desktop or extension origin. Retain the legacy origin argument position for callers but ignore its value. Edit/view query semantics and fragment-only room secrets are preserved.
- The published `/r/<id>` route returned HTTP 404, while `/editor/?r=<id>` returned 200 (`canonical-share-{legacy,editor}-route-headers.txt`); generated links therefore use the direct editor entry. Retain legacy path/query parsing for pasted invitations. Local query-parser drafts are preserved. The early `/r/` implementation verifier was stopped and is not release evidence (`canonical-share-r-route-incomplete.log`).
- Local/preview hosts must rendezvous with public recipients on the same signaling service, so the default also uses the shared hosted endpoint. Explicit `__VOO_SIGNALING_URL__` overrides remain supported for isolated development. No permission, room lifetime, document mutation or authentication changes.
- Reproduction: `/private/tmp/voo-license-regression/canonical-share-before.log` retains seven failed assertions from the old origin-dependent behavior. Regression covers nine origins, both permissions, detected and legacy-argument paths, preserved secrets and explicit signaling overrides. The real loopback share popover is clicked through Copy/View only/Copy; displayed and clipboard payloads must match, IDs/secrets must remain stable, and the attempted signaling URL must be hosted. Config/socket/clipboard are isolated in the browser test; no public room or real clipboard is used.
- Targeted 72 units and the complete `ui-global-interaction` browser suite pass. Clean `56ef64fb36f9c327bd5ea58830aca42b027a1b64` passed all 91 release steps, 87 core browser suites and 4713 units (4 skipped), plus GitHub CI. PR #77 merged as `9f37259` with the identical tree (`canonical-share-main-tree-proof.json`). Reports: `canonical-share-release.json` / `canonical-share-ci.json`. Local generation/parsing across 18 origin/permission cases and default signaling pass; local query-parser drafts remain (`canonical-share-primary-proof.json`). The la2 deployment matched the entry and 85 loaded assets; real host copy/edit/view, recipient HTTP 200/build/read-only mode, guest reshare preserving the exact invitation, unchanged host document and no page errors pass (`canonical-share-production-proof.json`). Screenshots: `canonical-share-production-{host,guest}.png`. The receipt initially closed sessions before both deferred socket imports were observed; it now awaits the two connection events before teardown, retaining the initial log without changing product assertions. A separate public socket handshake accepts localhost Origin without sending JOIN (`canonical-share-signaling-handshake.json`). Backup: `/srv/voo-run/editor-backups/56ef64fb36f9c327bd5ea58830aca42b027a1b64-20261031T213510Z`.
- Coverage remains partial: a simulated socket establishes endpoint choice and link behavior, not real multi-user P2P delivery, TURN/NAT traversal, hosted availability or signed desktop installers. Those require their own acceptance evidence.


## Duplicated Frame dragging — 2026-11-01

- Capabilities: `selection.transforms`, `selection.frame-title-selection`, `selection.cancel`, `layers.duplicate-delete-lock`. On the shipped FORM example, a selected copied Frame's content drag instead moved Quarter arch; its title consumed pointerdown without starting a move. The edge already moved the complete subtree. Evidence: `/private/tmp/voo-license-regression/duplicate-frame-probe.log` / `duplicate-frame-{body,edge,title}-before.png`; the retained new assertion fails `[0,0]` versus `[160,80]` in `duplicate-frame-drag-before.log`.
- Extract the existing move startup into `move-gesture-start.js`, keeping one move/Alt-copy/history transaction. A press on a selected Frame descendant defers child selection: dragging moves the Frame/subtree, while a plain release selects the original hit. Ctrl/Meta still deep-drags the child. Title pointer presses select the Frame and reuse the same stage controller and real pointer capture, with lock and read-only checks and teardown of the added starter method.
- `duplicate-frame-drag-checks.mjs` exercises actual Layers selection plus the Duplicate shortcut and internal copy/paste on FORM; body/title/edge movement shifts every copied descendant, leaves all original nodes fixed and undoes/redoes once. Added body/title Escape, pointercancel and blur restore geometry/selection/history, root locks reject title moves, and deep child drag/click remain independent. Its captured session restores the preexisting history so these extra scenarios do not hit the history-cap limit in later tests; no old assertion was weakened.
- The initial full gate caught a legacy navigation scenario that selected the Frame then expected a direct child drag. Its intent remains covered by an explicit plain child click first, with a new selected-child/no-history assertion; all original geometry/pixel/undo assertions remain unchanged. Direct Frame dragging is independently covered by the new scenarios. `duplicate-frame-release-initial.json` / `.log` retain that mismatch.
- Targeted 39 units and complete `frame-alt-duplicate`, `frame-label-selection` and `frame-child-pointer` suites pass. Clean `c67a950c4f0456fcf627f46306fa19c48ebe3d8e` passed all 91 release steps, 87 core browser suites and 4713 units (4 skipped), plus GitHub CI (`duplicate-frame-release.json` / `duplicate-frame-ci.json`). The independent-child navigation scenario also passes with its original position/pixel/undo assertions retained. Primary application sources pass 16 isolated real interactions while preserving the preexisting pen Ctrl/Meta draft (`duplicate-frame-primary-proof.json` / `duplicate-frame-primary-browser.log`). PR #78 merged as `f854d27` with the identical tree (`duplicate-frame-main-tree-proof.json`). The la2 deployment matched the canonical entry and 82 loaded resources; actual Layers selection, Duplicate shortcut, body/title mouse drag of all 13 copied FORM nodes, unchanged originals, sampled color and one-step undo/redo pass with no page errors (`duplicate-frame-production-proof.json`). Screenshots: `duplicate-frame-production-{body,title}.png`; backup `/srv/voo-run/editor-backups/c67a950c4f0456fcf627f46306fa19c48ebe3d8e-20261031T221546Z`.
- Coverage remains partial: registered Chromium mouse paths and tested zooms do not certify physical touch/stylus, every animation/warp context, all locked-descendant combinations or signed desktop installers. The original Frame and editable children remain separate nodes; no document schema or export-format change.


## Multi-Frame layer operation audit — 2026-11-01

- Capabilities: `selection.transforms`, `selection.frame-title-selection`, `selection.cancel`, `layers.duplicate-delete-lock`. Baseline `c67a950c4f0456fcf627f46306fa19c48ebe3d8e` passed the 32 registered Layers and related browser suites (`/private/tmp/voo-license-regression/layer-operations-audit.log`). This is a targeted execution record, not a new release certificate or exhaustive coverage.
- Actual Layers clicks with Cmd/Ctrl multiselect exposed two gaps: dragging a selected Frame's content selected/moved only its child, while its title dropped the second Frame and moved only the first. Edge drag correctly moved both complete subtrees. Actual geometry and selected IDs: `layer-multiframe-proof.json`; screenshots `layer-multiframe-{body,title,edge}.png`. The retained new browser regression fails `[0,0]` against `[60,40]` on old code (`multiframe-regression-before.log`).
- Adding locked-descendant coverage exposed a third defect: a multi-Frame drag with a locked child moved only the Frame roots, shearing content. This intermediate failing regression is retained as `multiframe-regression-after.log`. The independent single-Frame lock probes had passed and did not certify this multi-selection context (`layer-lock-probe.log`).
- Resolve the nearest explicitly selected Frame ancestor independently of selection order/primary. Title presses and clicks preserve an already-selected Frame's multi-selection. Reuse the existing pointer move transaction; Ctrl/Meta still directly targets children, plain click still enters a child without history. Refuse an entire expanded move set containing any full/position lock, including clipping followers, rather than degrading it to just roots. No document/schema, export, rendering or new control changes.
- Regression ownership: `multiframe-drag-checks.mjs` runs inside registered `frame-alt-duplicate`. Its 16 actual Chromium mouse scenarios cover two layer selection orders × body/title/edge, body/title × Escape/pointercancel/blur, full/position locked descendant, Ctrl/Meta child drag and plain child click. Assert all four nodes' geometry/ownership, unique/acyclic hierarchy, two actual color samples, retained selection, one complete scene undo/redo, and cancellation without history. Capture/restore the original document session. Three unit cases cover Frame locks and a locked clipping follower in `reparent-moved-roots.test.js`.
- Targeted 42 units, all 16 new isolated interactions and complete registered `frame-alt-duplicate` suite pass (`multiframe-units.log`, `multiframe-regression-fixed.log`, `multiframe-targeted-browser-final.log`). Clean `5cd112efcd7597d36680eea3c9b8eba66a50d7b5` passed all 91 release steps, 87 core browser suites and 4716 units (4 skipped), plus GitHub CI run 41256893117 (`multiframe-release.json`, `multiframe-ci.json`). PR #79 merged as `f7f782c` with the identical tree (`multiframe-main-tree-proof.json`). Only three source patches were applied to the local application; exact file hashes and 16 isolated mouse interactions pass while other drafts remain (`multiframe-primary-proof.json`, `multiframe-primary-browser.log`). The la2 deployment matched the canonical entry and 82 loaded script/style resources. Six real production multi-selection cases pass: body/title/edge complete subtree movement and color samples with one-step undo/redo; full/position locked child refusal; Escape cancellation with unchanged document/history/selection. No page errors (`multiframe-production-proof.json`). Screenshots `multiframe-production-{body,title,edge,locked,lockPosition,cancel}.png`; backup `/srv/voo-run/editor-backups/5cd112efcd7597d36680eea3c9b8eba66a50d7b5-20261101T003214Z`. Raw receipts are under `/private/tmp/voo-license-regression/`.
- The first combined browser run reached the existing 50-entry history cap (`multiframe-targeted-browser.log`); the new scenarios now run after the preceding FORM audit restores its original session. Each audit retains its own capture/restore boundary; no history or scene assertion is weakened.
- Scope remains partial: synthetic fixtures do not certify every locked ancestry/layout/mask combination, every deep selection modifier, physical touch/stylus or signed Electron installers. The previous release's FORM duplication, cold save/reopen, hierarchy, group/ungroup, ordering, deletion and visibility evidence remains tied to its actual revision; passing old suites did not discover the new multi-Frame contexts.


## Relative layer order audit — 2026-11-01

- Capabilities: `layers.nesting`, `layers.container-boundaries`, `selection.shortcuts`. Baseline `c666a886f3a934cea14db462e012138c8d119e5c` has three reproduced defects: actual Layers mask-base/follower multiselect plus `]` moves the same stack unit twice (green appears above the yellow layer); a locked Frame's selected child still responds to the relative-order shortcut (red replaces blue); public `reorderNode` moves a Frame header alone and leaves its child outside the contiguous subtree. Raw state and actual pixel probes: `/private/tmp/voo-license-regression/layer-order-before-proof.json`, `layer-order-before.log`. The new browser regression fails expected `[one,base,clip,two]` vs actual `[one,two,base,clip]` on old code (`layer-order-regression-before.log`).
- Normalize selected clipping chains to their base before ancestor filtering and stack-order traversal. Each unit moves once regardless of click order. Moving and adjacent blocks honor full ancestor locks. The single-node relative API delegates to the same batch operation, retaining subtree/clip references and one history boundary. Position locks are not redefined as ordering locks. No new UI, dependencies, document schema or export changes.
- Ownership: `layer-order-contracts.test.js` adds 12 cases; `layer-order-contract-checks.mjs` runs inside registered `editor-layers-composition`. Ten browser contexts: mask forward/backward × both click orders; locked Group/Frame ancestor × forward/backward; single-node Frame relative API × forward/backward. Tree selection and shortcuts use actual UI; locked ordinary Group children use public exact selection, and single-node API checks are explicitly engine calls rather than claimed pointer/Agent tests. Assert complete node order and unchanged per-node geometry/references, two exact visible colors as applicable, selected IDs, valid hierarchy, one complete undo/redo or no history for locked refusals. Capture/restore the fixture session.
- Targeted 34 units and all ten new browser contexts pass (`layer-order-units.log`, `layer-order-regression-after.log`). Complete layer composition and Loading suites also pass against current main. Final clean `00b3f982120efac466e3c24f18beccc19f6b5243` completes all 105 release steps in one run: 101 core browser suites, 4825 unit passes / 4 skipped, design/module/build checks, and same-head GitHub CI run 41301142997. `layer-order-release.json` / `.log` and `layer-order-ci.json` are the current evidence; older successful, failed and interrupted reports remain separate, not stitched.
- Coverage remains partial. Absolute indexed reorder (`reorderNodeTo`), drag-to-index, move-to-root/into-Group, extreme front/back commands, all clipping chains/ancestor mixes, cold reopen specifically after each relative reorder, physical devices and signed installers are not certified by these ten contexts. Existing full-gate suites retain their own recorded assertions; this audit does not equate their execution with exhaustive functional coverage.

- The first full gate on `b4a076652d5f46013c444a9bf3f3375359397a08` passed all units but failed the existing Loading 20px breathing-room assertion (`layer-order-release-initial.json` / `.log`). Deterministic pause at 45° reproduces an actual 14.0589px gap (`loading-gap-regression-before.log`): rotating the 48px brand enlarges its bounds, reducing the 24px flow gap. Increase the shared flow gap to 32px, retaining the original 20px visible requirement; add eight evenly spaced animation phases with all original rotation/reduced-motion/mobile/drawing/history assertions intact. This is an additional `platform.loading` product defect, not a weakened assertion or an inherited pass. The initial worktree dependency-startup failure is separately retained as `loading-gap-worktree-dependency.log` and is not defect evidence.

- Clean `7056abef00556ee0b53612eb6ef49c68279b75cd` subsequently passed the complete 91-step gate at two-browser concurrency: all 87 core browser suites and 4728 units (4 skipped), plus CI run 41262363765 (`layer-order-release-preintegration.json` / `.log`). The prior busy-host `new_document` startup timeout is retained in `layer-order-release-contention.json` / `.log`; the complete destructive-Boolean suite passed unchanged before the successful full run (`layer-order-startup-recheck.log`). No assertion/timeout was relaxed and no partial runs were stitched.
- Before publishing, main advanced to `89c124f` with separately verified interface/checklist work and 99 registered core browser suites. Integrate that work without reverting product changes or dropping checks. Resolve Loading-test overlap by retaining both the eight rotating viewport-bound checks and main's independent untransformed layout-gap check. Quality progress retains both task records; only blank lines are compacted to the file-size limit. The integrated 103-step release must pass before merge/deployment; the older 91-step success is not its certificate.
- Clean `6605aa859c6ac429b39f07eb6bf4bdab6c70ddfa` completed 103/103 steps in one fresh run: 99 core browser suites, 4729 units passed / 4 skipped, and CI run 41263346237. Preserve that exact result as `layer-order-release-prezoom.json` / `.log`. At the final publication guard, main had advanced to `732b1b9` with already-published zoom optimization and its extra core suite. Integrate those changes rather than deploy an older runtime over them. Shared audit/progress records are retained; the final 104-step gate is pending, and neither prior complete version certifies it.

- User interruption ended the `43f0c6d` run before a complete result; its saved partial report is not a 104-step pass. On resume, stop a newly started old-baseline run once current main is found at `8c270d0` with additional published toolbar, desktop release, layer/history and layout/effect work. Preserve all of that source and every registered check; only the progress-document conflict needs resolution. The final catalog now requires 105 steps / 101 core browser suites. Earlier successful 91/103-step reports remain bound to their own commits. GitHub CLI authentication expired; the existing connected GitHub account is the repository owner with explicit admin/push permission, so publication can continue through the connector without reading or requesting a token.

- Final publication evidence for `00b3f98`: only the three task-source patches were applied to the primary application; complete file hashes match and its ten isolated ordering contexts plus complete Loading/eight-angle/layout-gap suite pass (`layer-order-primary-proof.json` and related logs). Other local drafts remain; this does not certify the whole dirty application or a signed installer. The validated build is deployed to la2 and canonical `https://voo.run/editor/`: entry plus all 82 loaded script/style resources match SHA-256, six actual ordering cases pass with unchanged node fields/selection, actual color samples and one-step undo/redo, eight rotating Loading phases retain at least 20px (minimum representative 22.0589px), with no page errors (`layer-order-production-proof.json`). Screenshots: `layer-order-production-{loading,mask-1,mask--1,locked-frame-1,locked-frame--1,single-frame-api-1,single-frame-api--1}.png`. Rollback backup `/srv/voo-run/editor-backups/00b3f982120efac466e3c24f18beccc19f6b5243-20261101T112646Z`. PR #80 carries only this task's changes relative to current main. The final receipt commit changes documentation only; runtime/test parity is recorded separately in `layer-order-main-tree-proof.json`. No existing user document, paid provider, real collaboration room or native Release artifact was modified.

## Canvas zoom efficiency — 2026-11-01

Capability: `canvas.zoom-preview`, related `canvas.camera`,
`compositing.frame-clips`, image/font/matte lifecycle and selection hit testing.
The user prioritizes reducing real zoom stalls toward Figma's interaction
quality; no equivalent Figma execution has been measured or claimed.

- Reproduction: generated 600-layer free workspace, actual Ctrl-wheel input.
  A single zoom redraws the invisible measurement surface four times
  (`/tmp/voo-zoom-red-browser.log`). Source `c85224c` production build on the
  unchanged Desktop `test.fig` records six Ctrl-wheel waits with median
  1,222 ms, using the live engine zoom and artboard origin rather than the
  stale initial `window.__vooStore` snapshot. CPU samples show repeated painting.
- Free non-mixed pages stop painting their detached measurement surface.
  Explicit readback temporarily paints it and flushes the visible preview.
  Standalone/mixed rendering and export retain their authoritative paths.
- One bounded artwork picture per surface reuses covered camera changes;
  missing coverage, edits, resource changes, resize or DPR changes force exact
  painting. After 160 ms quiet the latest viewport is repainted exactly.
  Overscan is warmed separately, capped at 32 MiB retained per surface.
  Its center copies authoritative pixels, never approximated settled content.
  Video refuses a reusable stamp. Disposal cancels refinement and frees buffers.
- Stamps include immutable document identity, font epoch, adjustment bypass,
  actual decoded/paint bitmap identities and texture versions, and live mattes
  even before a persisted mask ID exists. The initial missing-matte regression
  is retained in `/tmp/voo-zoom-matte-red.log`; its correction is independently
  checked. Frame label topology reuses immutable ancestry across camera ticks.
- Hit regions cache world-space clipped bounds and omit only descendants
  already contained by a contributing ancestor rectangle. Positive camera
  transforms preserve that union and eight CSS-pixel padding. Overflow,
  negative coordinates, hidden/clipped branches, cycles and inter-page gaps
  retain their semantics. Shared-camera UI publication waits for settle while
  active DOM text/region editing keeps immediate notifications.
- Registered `canvas-zoom-preview` uses real Ctrl-wheel, verifies no invisible
  painting or layer-tree rasterization during covered motion, exact settled
  RGBA versus direct painting, synchronous sample flush, immutable document
  through camera gestures, style invalidation and one-step undo/redo.
  `frame-surface-camera` retains real DPR2 screenshot pixels, negative media,
  direct selection, neighbouring-page focus and resize. Unit checks cover
  bitmap/font/matte versions, memory limits, fractional DPR1.25, timer cleanup,
  viewport notification ownership and exact hit-region unions.
- Interim private production-build trials on the same file progress from
  1,222 ms to 166 ms, 117 ms and 83 ms median Ctrl-wheel waits; final trial
  settles exact content after about 230 ms. Three stable isolated first-page
  renders at 1000x800/zoom .024 compare with zero changed pixels. These are
  six-event shared-machine waits including automation plus two rAFs, not GPU
  FPS or universal speedups. Fixed committed-source and production receipts
  are recorded after the complete gate; no interim result certifies later code.
- Evidence: `/tmp/voo-zoom-performance/`, `/tmp/voo-zoom-*.log`. Original fixture
  stays private and read-only. Full readable-scale property fidelity, every
  effect/driver/animation combination, signed Electron, native trackpad/stylus
  and physical frame presentation remain unverified. `native_studio` excluded.


The first complete attempt on `d3bec48` passes 4,729 units (four skipped) but
stops at the new zoom suite with one additional rasterization during its
sequential wheel/RAF loop. `/tmp/voo-zoom-release.json` / `.log` preserve the
incomplete run; it is not release evidence. Quiet work now waits for a cancelable
animation frame so queued input can supersede it. A deterministic unit cancels
an already elapsed quiet timer before its exact frame. The browser case waits
for font readiness, queues the actual wheel burst without automation-created
idle gaps, and retains the strict zero-extra-raster and exact-RGBA assertions.
Targeted repeats pass; a fresh fixed-revision full gate is required below.

The second frozen run (`6ababe5`) passes 4,730 units (four skipped), including
the strict zoom suite, but stops at step 69: the layout fixture's default 30s
engine-readiness timeout expires before any business assertion. Its unchanged
isolated rerun passes all layout/history assertions. Host load was about 52.
`voo-zoom-final-release.json` preserves the incomplete 70-result attempt.
A real engine-module request held for 35s reproduces the same setup failure
(`voo-zoom-workspace-delay-red.log`). Workspace setup now gets its own bounded
90s phase, matching welcome setup; business/pixel assertions keep their original
timeouts. The startup suite retains this real delayed-import/create/pixel/undo
scenario. Application source remains identical to `6ababe5`; a fresh full gate
is required. No historical or isolated pass completes either failed report.

Final acceptance: `cf9e00d48905752fe14fb79ff16bd1280fb0c2bd` completes
104/104 steps in one fresh run: 100 core browser suites, 4,731 unit passes,
four skips, build/design/module checks. `voo-zoom-integrated-release.json`
and `.log` retain the exact revision and all results. The delayed real engine
import, creation, actual red pixel and single undo pass. Neither failed run is
stitched into this result. Eleven additional checks remain explicitly not-run.

Production-build control is the merged main parent `db4a184`; only eight
zoom-related application files differ. The same unchanged 241.86MiB file has
17,499 first-page layers. Run order is baseline, optimized, baseline again:
six real Ctrl-wheel waits per run have medians 1,713.5 / 82.5 / 1,808ms.
The optimized sample is reused for reverse comparison, not a second run.
Recorded initial one-minute host loads are 71.79 / 51.43 / 39.36; the reverse
baseline is slower despite its lower load. Shared-host waits include automation
and two rAFs, are overview-only, and do not establish hardware FPS or Figma parity.
The script's remaining exact-refinement wait is 237ms after profiling/camera
readback. Three stable isolated 1000x800 renders at zoom .024 have zero pixel
or channel differences. Real cameras change, document identity stays fixed,
and both control/optimized runs have no page errors. Original file SHA-256 is
`ddf80a00291c5c79ebc30c9b71c7c4180a74ca80311a170ed16f2aeed006b2c2`.

The fixed build is pushed and deployed to la2. Canonical HTML plus eight direct
or critical assets match bytes/SHA-256; production native-Figma fixture pixels,
mask cache, constraints/history and actual zoom preview/exact-RGBA/readback/
edit/undo/redo pass with no page errors. `voo-zoom-deployment-proof.json`,
`voo-zoom-production-fidelity.json` and `voo-zoom-published-tree-proof.json`
bind production and subsequent documentation-only merges to the verified code.
Private evidence is in the visualization directory `canvas-zoom-optimization/`;
no commercial design/file is committed or uploaded to production for testing.

## Error recovery visual integration — 2026-11-02

- Capability: `platform.error-recovery`; application-level React boundary only.
- Preserve existing localized recovery wording and error capture. Use the canonical VOO mark and shared buttons, neutral page surface, and one details entry. Copy diagnostics lives inside the collapsed details area. Explicit copy-button naming keeps its live feedback accessible.
- Entry/state assertions: a real child render exception reaches the actual boundary; two default actions; details toggle and sanitized clipboard report; actual reload navigation resets disclosure. Chinese and English are exercised.
- Visible/context assertions: 1440px, 768px and 390px layouts; long diagnostics do not cause horizontal page overflow; mobile actions are at least 48px high; keyboard focus is visible; light surface follows the theme. No document edits or history operations occur.
- Evidence: `tests/e2e/app-error-recovery.e2e.mjs`, mounted through `app-error-recovery-harness.jsx`. Targeted execution passed; screenshots `/private/tmp/voo-error-recovery-{desktop,390-details,light}.png`, log `/private/tmp/voo-error-recovery-browser-fixed.log`. Complete clean-revision evidence will be recorded after release verification.
- Coverage remains partial: browser Chromium only; native crash/restart, actual draft recovery, clipboard denial, screen-reader hardware and other browsers are not certified. This change does not diagnose or fix the exception that originally triggered the user's screenshot.

# Impeccable 全项目界面审查

Method: dual-agent（A：独立设计评估；B：规则扫描及浏览器取证）。

日期：2026-10-31。目标：`src/App.jsx` 及其关联 Web/Electron 共用界面。
审查源码：`23d961ca7bc6a526447e821488290f76bd295693`；归档前 HEAD
`6c91f83` 相对该修订只有文档改动，界面源码一致。
模式：Operate。按用户指示排除 `native_studio`。

## 结论

综合评分 **25/40**，属于主观启发式评分，不是功能测试覆盖率。
VOO 已有明确产品语言，优先解决状态隔离和空间分配，不应整体换字体或
把高密度编辑器一律改成大字号。保留薄荷绿色框架、黑色浮动工具面板、
紫色 Agent，以及专业数值的 monospace 字体。

本轮为审查和整改规划，未实施 UI 改动；不将建议记录为已修复。

## 方法与覆盖

A 在独立 origin 的测试项目上，实际检查首次使用、欢迎页、设置与账户、
供应商、空白编辑器、Frame、自动布局、Agent、内置浏览器和指南。
覆盖中文/英文、1440×1000、900×1000、390×844。形状与文字工具的面板
被查看，但未确认对象创建成功，因此不声称验证其编辑和撤销。

B 独立扫描 302 个 JSX/HTML 界面文件，分为 10 个范围，每个少于500文件。
CLI 均退出0、静态提示0。随后在1920×886的独立 Chrome 标签检查首次使用、
欢迎、常规设置、供应商设置、空编辑器五种状态，实际注入 detector 并保存
截图、DOM、计算样式和控制台结果。A 完成前未接触 B 的发现。

运行时供应商设置扫描原始21组标记，其中18组有正面积，3组是被模态层遮住
的欢迎页底层标记；另3组零面积。部分规则重叠或对应禁用控件，不能把21组
当成21个独立缺陷。9–10px功能状态及说明文字需要处理；11px模型名和紧凑
参数要按角色判断。用户明确保留的绿紫发光输入框属于品牌意图，不因
`dark-glow` 提示而删除。模态层下的标记不重复计数。

未验收：真触摸、Safari、200%浏览器缩放、读屏软件、原生 Electron 壳、
第三方登录/支付、真实模型调用、完整导入导出、扩展/插件运行。
运营后台不在当前应用入口范围内。没有付费调用或凭据输入。

## Nielsen 评分

| 评估项         |   分数 /4 | 主要依据                                      |
| -------------- | --------: | --------------------------------------------- |
| 系统状态可见   |         3 | 选中、加载和未保存状态清楚；浏览器失败缺解释  |
| 符合现实世界   |         3 | 图层和样式惯例明确；普通 Frame 暴露 Slot 术语 |
| 用户控制与自由 |         2 | 引导可跳过；隐藏编辑器仍可聚焦                |
| 一致性与标准   |         3 | 工具语言一致；窄宽度与输入类型适配不统一      |
| 错误预防       |         3 | 有禁用和未配置状态；真实提交未验证            |
| 识别优于回忆   |         2 | 分组清楚；受限窗口的隐藏或截断增加记忆负担    |
| 灵活性与效率   |         2 | 快捷键丰富；Agent 同开后控件被遮挡            |
| 审美与最小化   |         2 | Prompt 默认简洁；空 Slot 和账户表单有收纳机会 |
| 错误恢复       |         2 | 浏览器已有替代入口，但失败处未连接引导        |
| 帮助与文档     |         3 | 入口存在；长说明字小且行太长                  |
| **合计**       | **25/40** | 所有十项适用于 Operate 界面                   |

## 五个优先问题

### P1：隐藏编辑器仍接受键盘焦点

新建项目 → 选 Text 工具 → 点击品牌回欢迎页 → 连续 Tab。
第8次起进入看不见的评论、背景色、前景色、字体等控件；欢迎搜索和 Prompt
之前至少经过13个隐藏控件，可访问树也同时暴露两层界面。

位置：`src/App.jsx:152` 的 `visible={true}` 与仅靠 z-index 的欢迎覆盖层。
修正：保留编辑器挂载和历史，欢迎打开时隔离焦点及可访问树；恢复编辑器时
还原合理焦点，不能只加 aria-hidden 却保留可聚焦后代。
命令：polish。证据：[焦点实录](impeccable-evidence/welcome-focus.json)。

### P1：中等窗口打开 Agent 后面板重叠

900×1000、选中 Frame、打开 Agent：剩余画布宽512px，图层卡x22–278，
属性卡x214–502，重叠64px；工具条宽586px、x−31–555，被画布裁切。

位置：`src/App.jsx` 固定助手宽、`editor_layers.jsx`、
`editor_properties/properties_panel_shell.jsx`、`editor_toolbar.jsx`。
修正：依据画布容器剩余宽度收纳或互斥展示两侧面板，限制工具条宽度；
不能只增加 window 断点或把所有控件缩小。
命令：layout。证据：[实际截图](impeccable-evidence/agent-tablet.png)。

### P2：窄鼠标窗口的欢迎导航挤占主任务

390×844、鼠标输入，侧栏高约287px（34dvh）且内部滚动；主区域仅余约462px，
输入和最近文件被下推。仅对 coarse pointer 生效的移动端减法未覆盖窄桌面。

位置：`welcome_sidebar.jsx:63`、`welcome_mobile_layout.css`、`use_is_narrow.js`。
修正：按宽度确定任务顺序和导航收纳，再按输入类型调整点击尺寸，复用已有入口。
命令：layout / distill。证据：[截图](impeccable-evidence/welcome-narrow-mouse.png)。
不把此项推断为实体手机布局失败。

### P2：普通空 Frame 默认展示组件插槽

选中普通 Frame，变换与布局之间常驻 Slot、空推荐列表、空输入和禁用加号。

位置：`editor_properties/properties_panel_sections.jsx:204`、`frame_slot_section.jsx`。
修正：仅在有插槽数据、组件编辑意图或已有高级入口被打开时展示，保留功能。
命令：distill。不能为减法删掉用户需要的组件能力。

### P2：说明文案与参数数据共用过紧的排版

指南英文长说明为12px/16px，文本框宽784px，标题也12px/16px；供应商状态
及存储说明有9px文字。存储警告与配置状态承担决策信息，不能当纯装饰弱化。

位置：`welcome_dialogs_and_shortcuts.jsx:27,48–54`、`provider_settings.jsx:245`、
`provider_card.jsx:209,257,301`。修正：为说明文字建立独立阅读角色、45–75ch
行长和适当行高/对比度，保持数值字段紧凑。无需换字体。
命令：typeset / polish。

## 五命令结论与建议顺序

| 命令     | 本轮结论                              | 建议                                     |
| -------- | ------------------------------------- | ---------------------------------------- |
| critique | 产品辨识度成立，跨状态和空间边界失分  | 以25/40为本轮基线，修复后独立复评        |
| layout   | 桌面分区清楚，剩余画布变窄时失效      | 先修面板遮挡和窄窗口主任务顺序           |
| distill  | Prompt 高级设置是正例，空 Slot 是负例 | 收纳无数据高级配置，保留已有能力         |
| typeset  | UI字体和参数密度合理，说明角色不足    | 改正文行长/行高/对比度，保留专业数值密度 |
| polish   | 视觉状态基础较好，状态转换收尾不足    | 修隐藏焦点与失败替代路径，最后复核全流程 |

## 用户与情绪路径

- 新用户：空 Slot 增加概念学习；窄窗口需要先滚导航再找主任务。
- 熟练用户：Agent 与 Inspector 同时使用时被迫反复收起面板，工具条裁切损害效率。
- 键盘/低视力用户：Tab 进入隐藏编辑器；长说明的小字和长行提高阅读负担。

引导可跳过、Prompt 高级选项收纳、对象引用可移除是掌控感的正例。
打开 Agent 后遮挡是明显任务低谷，返回欢迎后隐藏焦点削弱结束时的确定性。

## 次要观察

网页版 Awwwards iframe 在本次环境拒绝连接；应在失败点连接已有外部打开
和粘贴HTML路径，不能推断所有网站或 Electron webview 都失败。
常规设置先展示完整账户表单，可评估移入已有资料入口。
供应商“浏览器无法保存API配置”与记住选项同时可见，能力文案需复核；
没有输入密钥或提交，不能据此宣布保存功能失败。
初始 Frame 偏左的观察缺少全新宽屏对照，不列为普遍缺陷。

## 证据与清理

A 报告及22张截图：`/tmp/voo-impeccable-a/assessment-a.md`。
B报告、302文件清单、原始JSON和浏览器记录：`/tmp/voo-impeccable-b/`。
关键证据已复制到本目录；其余/tmp内容可能被系统清理。
两份评估独立完成；独立标签已关闭，Vite服务已停止。
B 的检测注入成功，结束时移除overlay、恢复标题，并使用
`live-server stop --keep-inject` 停止检测服务；没有遗留用户可见overlay。
无ignore清单，未将有意的品牌效果写入全局忽略规则。

项目模块登记有效：12模块、55能力、83核心浏览器套件、21独立检查。
设计lint在同修订的隔离副本通过（1374文件）；这不是完整功能验收。
本轮文档与证据更新，不重新部署界面或沿用历史发布测试作为本轮通过记录。

## Remediation — 2026-10-31

After the user's continuation, this pass implements the five priority findings.
The assessment and 25/40 score above remain the historical baseline; this pass
is not a new independent whole-product score.

- Hidden editors receive `visible=false`, `aria-hidden` and `inert`; the mounted
  engine/document stays intact when navigating through welcome.
- Compact panels now follow measured canvas width, including the space left by
  a docked Agent. Existing bottom panels and expand/collapse controls are reused;
  no extra panel switcher was added. Toolbar bounds use the canvas width.
  Page navigation occupies a separate compact band, leaving collapsed/expanded
  panel actions and zoom controls reachable even with long page names.
- Welcome's existing compact project menu also serves narrow mouse windows.
  Search remains on demand through that menu; the sidebar no longer consumes
  a third of the narrow viewport.
- Empty Slot content is opt-in through the existing Add menu; configured slots
  and main components retain their section. Switching selection resets reveal.
- Guide prose uses the existing 15px role, 24px leading and a 70ch maximum.
  Provider explanations use 12px/20px and status labels 11px with stronger
  contrast. Dense editor values and font families remain unchanged.

`tests/e2e/impeccable-polish.e2e.mjs` first failed on the formerly focusable
covered editor. It now checks real Tab traversal, document preservation,
900px Agent/panel layout, toolbar bounds, Slot opt-in, narrow-mouse search
through the existing menu and computed guide typography. Existing responsive
checks additionally cover numeric edits/undo, live resize, touch panel gestures
and Agent open/close. The prior static expectations now read the extracted
compact stylesheet as well as its importing mobile stylesheet.

Changed-markup Impeccable scan: `/tmp/voo-impeccable-polish-detect.json` (zero
static findings). Design lint passed on the isolated changed source. Initial
broad unit execution from a non-Git archive without dist/listener permissions
was invalid release evidence; its log is retained separately. Complete release
results must come from the clean committed checkout and report below.

Final revision, build, unit and browser steps are recorded in
`/tmp/voo-impeccable-polish-release.json`; only `complete: true` for the deployed
revision establishes release execution. Before/after captures are in
`impeccable-evidence/`. Scope still excludes native_studio, signed Electron
installers, physical devices, real accounts/paid services and every external
browser embedding policy. The account form and external-site recovery proposal
were not part of the recommended five-priority implementation scope.


### Context menu simplification — 2026-10-31

- Kept cut, duplicate, delete and grouping in the root menu. Moved selection
  matching, properties, ordering, masks, components, copy/export and path
  operations to one secondary level. No domain operation or shortcut removed.
- Extracted the former oversized menu into lifecycle, object, path and submenu
  modules, each below 400 lines. Submenus portal outside scroll clipping, flip
  at viewport edges and share one expanded group. Pointer traversal, Right/Left,
  Up/Down/Home/End, disabled-item skipping, Escape and outside dismissal have
  real-browser checks in `context-submenu-checks.mjs`, owned by the registered
  `impeccable-polish` suite and `inspector.context-submenus` capability.
- The pre-fix reproduction failed because the four select-same commands were
  flat entries. The updated check verifies the collapsed group and actual
  style-copy dispatch, as well as compact height, edge placement and layering
  above the floating Agent launcher. The continuous creation regression now
  reaches clipping operations through their menu, retaining pixel and undo
  assertions. Screenshot: `impeccable-evidence/context-menu-fixed.png`.
- Integration gate also caught an untranslated upstream DeepSeek cloud label
  and stale provider/tool inventories. Reused the existing translated provider
  label, included DeepSeek in card/setup assertions and documented the already
  registered `resize_document` tool. Four targeted unit files passed 80 tests.
- Full release evidence remains revision-bound in the report referenced above;
  historical scores and unverified platform contexts are unchanged.


The first complete gate on `e460d84` passed build, design lint, 4,508 unit
assertions (four existing collaboration assertions skipped) and the completed
browser checks, then stopped at the hook lifecycle suite. Its settings fixture
assumed Studio was the first gallery card. The curated gallery now starts with
Stripe and collapses older presets. The regression now expands the gallery and
selects Studio explicitly before retaining the original focused-engine and
locale/draft assertions. The failed report is retained at
`/tmp/voo-impeccable-before-preset-fixture-fix.json`; it is not a passing release.


The next gate on `aeb8f36` retained the same passing build/unit stages but
stopped at a stale safe-area expectation after upstream `a11e7f4` intentionally
balanced both horizontal insets. Page drag and responsive checks now assert
`4px + max(left, right)` on both sides for mouse, portrait and landscape,
retaining all real drag, pointer ownership, touch and cancellation checks.
Failed evidence: `/tmp/voo-impeccable-before-safe-area-fixture-fix.json`.


After integrating the concurrently published illustrated type picker, the
legacy welcome workbench unit fixture still expected six types and no radio
group anywhere on the default surface. It now asserts the eight visible type
choices while explicitly keeping the advanced dialog and style/system/variant/
size controls absent. Failed evidence is retained in
`/tmp/voo-impeccable-before-welcome-fixture-fix.json`.


The browser workbench fixtures also used the previous `Generation type`
settings trigger and nested type dropdown. Updated all three affected suites
(`ui-home-settings`, `editor-canvas-navigation`, `pending-integration`) to the
new `Generation settings` entry and the visible eight-choice radio picker.
Desktop/mobile dimensions, selected type retention, advanced style ownership,
nested Escape, real outside touch, canvas camera/document retention and
Meta/Control duplicate/cut/undo assertions remain and pass targeted execution.
The prior failed gate is retained at
`/tmp/voo-impeccable-before-generation-menu-fixture-fix.json`.


The tool census then exposed the missing positive scenario for the already
advertised `resize_document`. Added `image-agent-document-cases.mjs` to the
existing registered tool suite: real MCP changes dimensions, preserves artwork
around the canvas center without scaling or reparenting, and restores the full
document with one undo/redo. Its default centered-anchor behavior is asserted;
absolute coordinates are intentionally not assumed fixed. The complete live
tool suite now passes its available scenarios; its five existing external
provider blockers remain explicit and unexecuted. Failed gate evidence:
`/tmp/voo-impeccable-before-resize-tool-case.json`.

All 28 previously uncompleted browser suites also passed targeted execution,
including inspector/menus, responsive/touch, locale lifecycle, loading,
collaboration and runtime. This preflight uses an uncommitted harness and does
not replace final clean-revision evidence:
`/tmp/voo-remaining-browser-checks.json`.


The gate on `ffa83f2` reached the final loading/lifecycle group, where three
fixtures failed after their esbuild services stopped (EPIPE / stopped transform
service), rather than a failed product assertion. The same focused suites had
passed the targeted remaining-suite run. Failed evidence is retained at
`/tmp/voo-impeccable-before-esbuild-interruption.json`. Final verification uses
an isolated copy of the already installed declared dependencies in
`/tmp/voo-impeccable-deps`, preserving package versions and the existing vendor
package. No dependency was added. Concurrent Antigravity account-auth changes
were merged before the final run to prevent a production rollback.


A subsequent isolated run had one 91ms viewport-culling measurement against
the unchanged 25ms unit threshold; its three assertions passed alone and the
next full run passed at two unit workers. Evidence:
`/tmp/voo-impeccable-before-performance-contention.json` and
`/tmp/voo-performance-targeted.log`. No performance threshold was relaxed.
That run later stopped before Boolean assertions because a cold development
page exceeded Playwright's implicit 30s navigation deadline. The shared fixture
now gives only initial Vite navigation/network idle a named 60s setup allowance;
MCP readiness, functional assertions and performance limits remain unchanged.
The incomplete report is retained at
`/tmp/voo-impeccable-before-cold-start-timeout.json`.


The latest main branch includes the P0 boundary suite and moves the illustrated
eight-choice gallery into accessible advanced settings (`cfc3c21`). Conflict
resolution preserves both scopes: default SSR has no radio group; advanced SSR
still asserts eight radios. Desktop/mobile tests retain all eight choices,
Mobile dimensions, design-system style ownership, default collapse and selected
type retention after reopening. Only conflicting hunks were reconciled; no
remote file replaced a complete local test file. The menu implementation is
unchanged. Inventory now contains 60 capability groups and 85 browser suites;
final clean verification therefore has 89 steps. Historical failed-run counts
above remain tied to their recorded source revisions.


The combined gallery fixtures also required a state-aware expansion precondition:
Studio selection already expands the gallery, so the later Wellness step now
ensures `aria-expanded=true` instead of toggling an already-open gallery.
All subsequent engine, dirty draft, locale and rendering assertions remain.
The remaining 60-suite batch completed without stopping at failures: 58 passed;
mesh/stroke setup failed when esbuild stopped. Both then passed separately with
`GOMAXPROCS=1`, including actual pixels, SVG, history and save/reopen assertions.
No product assertion or performance threshold was relaxed. Evidence:
`/tmp/voo-final-remaining-browser.json`, `/tmp/voo-mesh-targeted.log`,
`/tmp/voo-stroke-targeted.log`. Compiler termination cause remains unconfirmed.
Final execution retains isolated dependencies, two unit workers, one Go compiler
scheduler processor and the standard three-browser pool.


## Published verification — 2026-10-31

The clean revision `6008dfa6fcd78e02abf14a27597fb0c1d584e770` completed
all 89 registered release steps with zero failures: 85 browser suites,
module registration, build, design lint and unit tests. Units recorded 4,534
passed and four skipped assertions (553 passed and three skipped files).
The immutable report and log are `/tmp/voo-impeccable-verified-6008.json`
and `/tmp/voo-impeccable-verified-6008.log`.

The final deployed application is `9c5a063e874aaa5346a1804171d414740463032a`,
which additionally merges upstream collaboration share-secret/read-only
permissions, missing search translations and deployment SSH isolation.
It passed a fresh build, design lint, module registration, shell syntax and
diff formatting checks; collaboration/i18n units recorded 169 passed and four
skipped assertions. Three browser suites passed again: `settings-i18n`,
`comments-lifecycle` and `impeccable-polish`. This is incremental evidence,
not a claim that all 89 steps ran on the final merge. Related logs are
`/tmp/voo-impeccable-merge-tests.log`, `-merge-browser.log` and
`-final-merge-build.log` under the same prefix.

Production `https://voo.run/editor/` matches the final local HTML; all five
direct JS/CSS assets return 200. A fresh, isolated browser verified real canvas
right-click, submenu pointer and keyboard traversal, Escape return/dismissal,
900px canvas-with-Agent panel separation and hidden-editor focus isolation.
No page errors occurred. The check waits for actual geometry after panel
transitions; it opens the object menu inside the selected frame rather than
right-clicking its external title. Browser storage and loopback connections
are isolated from the user's installed application and documents.

The checked-in [receipt](impeccable-evidence/release-verification.json) and
[production screenshot](impeccable-evidence/context-menu-production.png)
retain the exact revisions, check scope and evidence hashes. Current inventory
is 12 modules / 62 capabilities / 85 registered browser suites. Functional
coverage remains partial: 21 standalone checks, five existing external-image
provider blockers, real accounts, paid inference, physical devices and signed
installers are not certified. `native_studio` is excluded. The historical
25/40 audit score was not re-scored. Documentation-only publication does not
change the deployed application revision.

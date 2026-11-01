# Historical quality records

Archived during branch consolidation on 2026-11-02. These entries describe
their recorded revisions only; stale pending/completed labels are not the
current product status. Use [quality-progress.md](quality-progress.md).

## 路径固定中点加点 — 2026-10-31

- 能力：`vectors.midpoint-insertion`，详细边界见 [交互审查](audits/design-editor-interaction-audit.md#fixed-midpoint-insertion--2026-10-31)。
- 复现：旧实现的 5 个定向断言失败；修复后 25 项相关单测及真实鼠标加点、预览、单步撤销/重做验证通过。
- 完整发布的精确提交与逐项结果记录在 `/tmp/voo-midpoint-release.json`；须核对 `revision` 和 `complete`，不得沿用上方历史提交的通过状态。
- 仍未验证：实体笔/触摸、签名 Electron 安装包、多轮廓交叉路径、冷重开和像素级导出对比。功能覆盖仍为部分。


## 浏览器遮挡与选中样式 — 2026-10-31

- 能力：`platform.browser-drawer`；详见 [交互审查](audits/design-editor-interaction-audit.md#browser-drawer-visibility--2026-10-31)。
- 已复现原浏览器工具栏被编辑器覆盖；修复浮层层级、窗口边界和标题栏定位，选中按钮使用 VOO 绿底与黑色窗口图标。
- 定向检查：网页端 1440/390px 的点击命中、颜色、关闭重开通过；21 项相关单测通过。隔离 Electron 原生 webview 的地址栏导航、可见性、关闭重开及截图检查通过。
- 精确发布版本和完整门禁结果见 `/tmp/voo-browser-release.json` 的 `revision`、`complete` 与逐项结果；不能继承历史版本的通过状态。
- 未覆盖：所有第三方网页与登录态、全部网页提取组合、触摸调整宽度、其他桌面操作系统与签名安装包。

- 发布检查曾发现网页导入解析器提前加载字体与变量模块；已改为实际导入时才加载，并由原有 `editor-loading` 回归保留验证。

## Onboarding: connected Harness hides duplicate model setup — 2026-10-31

- Harness 的 VOO 插件认证成功后，Agent 设置中的本地模型桥接卡片自动隐藏；连接尚未完成时保留入口。
- `tests/unit/first_run_agent_grid.test.jsx` 覆盖已连接、检测中和插件未连接状态；配合 `tests/unit/first_run_onboarding.test.jsx`，定向 58 项通过。

## 原生界面字体对齐 Intel One Mono — 2026-10-31

- 能力：`platform.native-typography`。原生壳此前用 `NSFont.monospacedSystemFont`（SF Mono），与 Web 的 `--font-mono: "Intel One Mono"` 字宽不同（12pt 下 7.418 vs 7.368），导致标题栏/图层/属性/Island Bar 的文字与省略号位置略有偏差。
- 实现：把 Web 同一套 OFL 字体打进 `native_studio/Resources/Fonts`（Intel One Mono regular/medium/bold + Inter），`build.sh` 随包复制到 `Contents/Resources/Fonts`，`Info.plist` 声明 `ATSApplicationFontsPath=Fonts`，并在 `VooMonoTypeface.registerBundledFonts()` 内按 PostScript 名（`IntelOneMono-*`）注册、按 CSS 权重规则（≥600 用 bold、≥500 用 medium）解析；缺失时回退 SF Mono，不影响无字体资源的构建（如测试二进制，可用 `VOO_FONT_DIR` 指向源目录）。
- 顺带对齐画布文字：`TextStyleResolver.resolveFamily` 支持 CSS 字族栈（`"'Inter', system-ui, sans-serif"`），新文本节点默认 Inter 现在真实命中打包字体，内联编辑器与画布渲染共用同一解析路径。
- 验证：`./build.sh` 通过（binary 4.57 MB ≤ 5 MB，bundle 7.31 MB ≤ 35 MB）；`./tests/run_tests.sh` **377/377 通过**（含新字体的真实度量）；应用日志 `bundled typeface Intel One Mono: ready (4 face file(s))`；截图 `native_studio/docs/screenshots/v5_font_editor.png`、`v5_font_text.png`。
- 未覆盖：只打包了 Web 字体清单中的 Inter 与 Intel One Mono，其余 12 个可选字族（Roboto/Montserrat/Noto Sans SC 等）仍回退系统字体；实体设备上的字重合成与中文渲染未单独验收。

## Impeccable 界面审查 — 2026-10-31

- [完整报告与证据](audits/impeccable-review.md)：layout、typeset、distill、polish、critique；按用户要求排除 `native_studio`。
- 审查源码 `23d961ca7bc6a526447e821488290f76bd295693`；归档前 `6c91f83` 仅有后续文档变化。两份独立评估，主观评分25/40，不是功能覆盖率。
- 静态扫描302个界面文件、10组范围、0提示；独立浏览器实际取证发现跨状态焦点、受限画布遮挡、窄鼠标窗口导航、空Slot和说明文字可读性问题。
- P1：欢迎覆盖层后的隐藏编辑器仍可聚焦；900px窗口打开Agent后图层/属性面板重叠64px。均仅登记，尚未修复。
- 保留黑色面板、薄荷绿/紫色品牌、11–12px专业数值密度；不机械删除已确认的绿紫发光边框。
- 本轮实际查看代表页面与中英文字面；未验收真实触摸、Electron壳、真实账户/支付/模型和完整导入导出。服务与标签已清理。
- 关键截图与焦点记录保存在 `docs/audits/impeccable-evidence/`；其他原始证据位于 `/tmp/voo-impeccable-a/`、`/tmp/voo-impeccable-b/`。本轮没有UI实现改动。

## GitHub introduction and four editable examples — 2026-10-31

- Scope: README, artwork and example documents only; no application behavior or module capability changed. Product module coverage remains partial and historical execution results above are not inherited.
- The header now uses the existing App Icon. The cover uses canvas exports of the selected music interface, F1 poster, PULSE dashboard and FORM poster. ROAM is excluded from this publication.
- Local cleanup moved 20 old files to recoverable workspace trash; the user restored the music and F1 projects, and the active library was checked to contain exactly the four selected projects. Cleanup stopped after that selection.
- Verification: native container decoding, unique layer IDs and parent references, retained editable text, PNG dimensions, local documentation links and light/dark presentation checks. Exact publication revision and execution receipts: `/private/tmp/voo-showcase/evidence.json`.
- This is documentation/example validation, not a new product release or a full functional audit. No application deployment is required; signed installers, external services and other platforms remain outside this check.

## Product screenshots and agent-driven slogan — 2026-10-31

- Scope: documentation and repository artwork only; no application source, module capabilities or original example documents changed.
- Added three real 1600 × 1000 web screenshots: workspace with four project covers, optional Agent setup, and music design with the headline selected and the text inspector visible. Capture used an isolated browser profile and did not modify the user's project library.
- Captured production entry: `assets/index-D9WDURy-.js`; capture receipt: `/private/tmp/voo-showcase/product-ui/capture.json`. This documents the live interface at capture time, not proof that every later revision or platform was tested.
- README, cover and social preview use “An AI agent-driven design editor.” Functional module coverage remains unchanged and partial; the final publication revision and document/image checks are recorded in `/private/tmp/voo-showcase/product-ui/publication.json`.

- Introduction now leads with standalone use and Claude Code plugin / Codex MCP integration, with connection commands matched to the existing connector guide. A separate review of public-tree wording is recorded outside the repository at `/private/tmp/voo-showcase/product-ui/published-wording-audit.json`; no source or historical research files were changed.

## Repository introduction: hierarchy, brand and rounded screenshots — 2026-10-31

- Scope: README, artwork, example guide and this progress record only. No application source or native example documents changed; functional module coverage remains partial.
- Simplified the default introduction to product positioning, standalone / MCP workflows and three core capabilities. Product tour, four-design gallery, connector commands and technical reference remain accessible through native GitHub disclosure sections.
- The cover uses a real editing screenshot, the UI colors `#B2FFD6` → `#E5B2FF`, and Intel One Mono Regular (400). A relative-path HTML composition is retained beside the PNG.
- All three product UI screenshots retain their original 1600 × 1000 content with 24px transparent outer corners. Pixel comparison found zero changes outside the four corner regions; screenshot-state evidence remains tied to its original captured production entry.
- Exact publication revision, disclosure/link/image checks and layout/typography evidence: `/private/tmp/voo-showcase/product-ui/redesign-publication.json`. No application deployment is required for this documentation and artwork update.

## Visible product screenshots and darker artwork — 2026-10-31

- Restored the workspace, setup and editing screenshots and all four design examples to the default README view. Only connector installation and the technical reference remain collapsed.
- The cover and social image now use darker green/purple tones (`#173D30` → `#352448`) and the slogan “AI agent-driven design editor.” Intel One Mono Regular and rounded screenshot edges are retained.
- Scope remains documentation and artwork only. Exact publication revision and visibility/link/layout checks: `/private/tmp/voo-showcase/product-ui/visible-showcase-publication.json`; functional product coverage remains unchanged and partial.

## Centered cover identity — 2026-10-31

- Scope: cover HTML composition and cover/social PNGs only, plus this record. Product screenshots, default README visibility and application behavior remain unchanged.
- Centered the App Icon, product name, slogan and subtitle. Icon size is now 128px on the main cover and 96px on the social image. Removed the corner platform label; dark green/purple, regular Intel One typography and rounded editor screenshot are retained.
- Center geometry, typography, image dimensions and exact publication revision: `/private/tmp/voo-showcase/product-ui/centered-cover-publication.json`. Functional module coverage remains unchanged and partial.

## Cover typography and whitespace — 2026-10-31

- Increased the main cover from 1800 × 1400 to 1800 × 1720. Product name grows from 30px to 40px and the slogan from 60px to 76px; larger vertical gaps separate icon, name, title, subtitle and canvas.
- The main editor screenshot remains 1600 × 1000. The 1280 × 640 social layout retains its aspect ratio with more header space and a proportionally smaller preview. Center alignment, regular Intel One typography, dark gradient and corner treatment remain.
- Scope: artwork source/exports and documentation only. Exact publication revision, measured spacing and typography checks: `/private/tmp/voo-showcase/product-ui/spacious-cover-publication.json`. Functional product coverage remains unchanged and partial.

## Double-height cover introduction — 2026-10-31

- Doubled the main Logo / slogan introduction region from 624px to 1248px. The full cover is now 1800 × 2344; the editor screenshot remains 1600 × 1000 and moves down intact. Icon and screenshot dimensions are unchanged; title sizes follow the final hierarchy.
- Increased top padding and vertical gaps; the social preview retains its fixed 1280 × 640 aspect ratio with the updated title hierarchy. Product screenshots and the README display structure remain unchanged.
- Scope: cover composition/export, example guide and this record only. Exact geometry, final publication revision and export checks: `/private/tmp/voo-showcase/product-ui/double-header-publication.json`. Functional application coverage remains unchanged and partial.

- Final cover hierarchy: standalone App Icon → “VOO Design” main title → “AI Agent Driven Design Editor” subtitle. Removed the small duplicate product name under the icon and the App / CLI explanation from the artwork; those product capabilities remain in README text.

## Cover proportions from marked reference — 2026-10-31

- Enlarged the main App Icon from 128px to 192px. Removed the three marked blank bands, mapped to 256px / 112px / 80px in the source composition; the main cover is now 1800 × 1896. The screenshot moves up by 448px and stays 1600 × 1000.
- Product title, subtitle, center alignment, dark gradient and corner treatment are retained. The fixed 1280 × 640 social preview also gets a larger 128px icon.
- Scope: artwork source/exports, example guide and this record only. Exact measured gaps, final revision and export evidence: `/private/tmp/voo-showcase/product-ui/marked-gaps-publication.json`. Functional product coverage remains unchanged and partial.

## Native README identity and editor screenshot — 2026-10-31

- Replaced the composited header image with a centered 128px App Icon, native product heading and native “AI Agent Driven Design Editor” subtitle. A separate editing screenshot follows immediately.
- Moved the editor screenshot from the product tour to the header, preserving one visible instance each of editor, workspace and onboarding. The four design previews remain visible; only installation and technical reference are folded.
- Existing artwork and application source remain unchanged. Native GitHub Markdown structure, image/link checks and final revision: `/private/tmp/voo-showcase/product-ui/native-header-publication.json`. Functional product coverage remains unchanged and partial.

## 工作台设置专项的历史阻断记录（本轮已整合收口）

以下是整合前的记录，当前状态以上方固定发布证据为准。

> 首页 Settings 底部间距微调：从 24px 减至 12px（向下移动 12px），保持左侧位置与点击区域；沿用 `workspace.settings-entry`，在既有首页套件检查四个宽度的精确底边间距。本轮精确提交及执行结果见 `/private/tmp/voo-settings-lower-release.json`，此前基线发布阻断不能视为已解决。

> 本轮首页设置入口调整：已移除侧栏版本号，将首页 Settings 移至左下角；能力 `workspace.settings-entry`。本次相关 17 项单测和 320/390/768/1440px 首页浏览器专项通过。完整门禁因基线既有的 10 项 Agent 工具清单/首次引导失败而阻断（已在修改前提交 `e2d3517` 复现，`/private/tmp/voo-settings-baseline.log`），本轮尚未推送或部署。精确最终 revision 与逐项执行结果见 `/private/tmp/voo-settings-release.json`，不得继承历史通过结果。详细范围见 [面板审查](audits/panel-control-audit.md#welcome-settings-entry--2026-10-31)。

## 原生界面优化（第五轮：Agent 面板 1:1 + 草稿自动保存）— 2026-10-31

用实时 Web 构建重新截取 Agent 面板（`native_studio/docs/refs/web_20261031/web_agent_open.png`，注：仓库里旧的 `web_agent.png` 是 10-23 的过期构建，已确认不可用），并补齐设置中「Auto-save edit drafts」原先只有开关没有行为的缺口。

- **Agent 面板按截图重建**：头部只保留「Untitled」与 3 个 32×32 图标（历史 / 新建 / 收起），移除原生的紫色头像与「● Flash ACTIVE」徽章；问候语改为 system 15pt 单行；三个建议胶囊改为 system 12pt、h38、r12、`#0F0F0F` 无描边、铺满 332pt 内容宽；提示段改为 system 12pt neutral-500 两行；composer 保持 340×130 / r16 / `#171717` / white-8 描边，并新增**模型胶囊**（✳ + "Opus 5.5"，h24、r8、white/5，`AgentPanelView.modelLabel` 可外部设置），发送键 32×32（空态紫 42%、有内容变白底黑箭头）；对话区用户消息右侧白/8 气泡，Agent 消息左侧无气泡正文、仅每轮首条显示 40pt 头像，工具/CLI 行仍为等宽 11.5。面板几何对齐实测值：顶部 56（内容区顶 +12）、右 16、宽 364。
- **草稿自动保存（崩溃恢复）**：新增 `Sources/Engine/DraftAutosave.swift`——按设置里的 `voo.editor.autoSaveDrafts` 开关，在编辑时以 3s 去抖把归一化 `.voo` 快照写入 `Application Support/VOO Design/Drafts/`；下次启动若草稿比对应磁盘文件更新（或文件根本不存在），自动恢复并提示「已恢复上次未保存的草稿」；保存成功后清理对应草稿；测试通过 `VOO_DRAFT_DIR` 重定向到临时目录，不触碰真实用户目录。该开关此前只持久化键值，现在有真实行为。

验证：`./build.sh` 通过（binary 4.85 MB ≤ 5 MB，bundle 10.17 MB ≤ 35 MB）；`./tests/run_tests.sh` **384/384 通过**（新增草稿开关/写盘/恢复/丢弃断言）。截图：`native_studio/docs/screenshots/z_agent.png`（2x retina 抓取）。
仍未覆盖：Light interface 仍无浅色主题实现；标题栏仍为「打开/保存」语义；约束不处理旋转后的钉扎。

## 原生界面优化（第六轮：标题栏双态完全对齐 Web 1:1 + 页码胶囊宽度微调）— 2026-10-31

基于当前实时 Web 截图对比（`web_titlebar_right.png` 与 `web_dashboard_titlebar_right.png`），将标题栏在编辑器态与工作台态的双态结构完全对齐 Web 真实渲染：

- **编辑器态标题栏（右侧）**：
  - 新增协作分享按钮 `[+]`（22×22 圆形胶囊，悬浮加深）以及 1×16 分隔线（`bg-white/10`），点击触发原生协作分享逻辑（`titleBar.onCollabTapped`）；
  - 移除「打开」按钮上不属于 Web 桌面版的文件夹图标（Web 桌面端为纯文字按钮）；
  - 保持 `[+] [|] 打开 保存 浏览器 齿轮` 的精确顺序与边距（按钮高 28，齿轮距右侧 16pt，间距 8pt/4pt）。
- **工作台态标题栏（右侧）**：
  - 隐藏设置齿轮（因为 Web 工作台的设置入口是在左下角浮动按钮 `fixed bottom-3 left-6`）；
  - 保持 `导入`（ghost 按钮）、`新建`（白底黑字药丸）以及浏览器 Globe 按钮（右对齐距右边缘 16pt）；
  - 状态切换时动态切换 Trailing 约束，无缝自适应。
- **页码胶囊（PageSwitcherPillView）宽度与字体微调**：
  - 字体从等宽字体改为与 Web 一致的系统比例无衬线字体（Inter / system sans 12pt regular），解决由于等宽字体导致胶囊偏宽 18px 的视觉偏差；
  - 重新跑 `scripts/native-parity-check.py` 实测结果：
    - 工具轨 (ToolRail): `dx=+1, dy=+0, dw=-1, dh=+0`
    - 图层卡片 (Layers): `dx=-2, dy=-1, dw=+0, dh=+1`
    - 页码胶囊 (PagePill): `dx=+0, dy=+0, dw=-2, dh=+0`（与 Web 仅相差 2px，高度位置完全重合）
    - 属性卡片 (Properties Card): Web `(1131, 119, 286, 731)` vs 原生 `(1133, 115, 286, 735)` -> 宽度 286 完全一致，高度仅相差 4px
    - Agent 面板: 均为 `(1050, 40, 385, 850)` 空间重合
- **缩放条 ⋯ 更多菜单完全对齐 Web**：
  - 补全「自适应画板 (Fit to Screen) ⇧1」、「显示标尺 (Rulers)」、「清除所有参考线 (Clear Guides)」、「网格 (Grid) ⌃'」、「磁性吸附 (Snap to Grid)」完整项；
  - 真实联动画布 `zoomFit`、`showRulers` 状态持久化与 `guides.removeAll()`。

验证：`./build.sh` 通过（binary 4.92 MB ≤ 5 MB，bundle 10.25 MB ≤ 35 MB，冷启动 0.31~0.5s）；`./tests/run_tests.sh` **386/386 通过**（新增缩放条更多菜单及标题栏协作与工作台布局测试）。截图：`native_studio/docs/screenshots/z_editor.png`、`native_studio/docs/screenshots/z_dashboard.png`。
仍未覆盖：Light interface 仍无浅色主题实现；约束不处理旋转后的钉扎。

## 原生界面优化（第七轮：图层层级快捷键与菜单 1:1 对齐）— 2026-10-31

- **图层排序快捷键对齐 Web & Figma 工业标准**：
  - `[`：下移一层（Send Backward / `sendBackwardAction`）；
  - `]`：上移一层（Bring Forward / `bringForwardAction`）；
  - `⌘[`：置底（Send to Back / `sendToBackAction`）；
  - `⌘]`：置顶（Bring to Front / `bringToFrontAction`）；
  - `⌘J` / `⌘\`：切换显示/隐藏右侧 AI Agent 面板。
- **全方位打通三处操作入口**：
  - 菜单栏「图层与几何 (Geometry)」子菜单；
  - 画布右键上下文菜单（Context Menu）；
  - 全局键盘事件监听器 `handleKeyDown`（输入框处于编辑聚焦状态时自动规避，仅在非编辑时生效）。
- **新增回归测试**：`test_LayerOrdering_StepAndJumpActionsAndShortcuts`，验证单步与跳跃重排的正确性与撤销链完整性。

验证：`./build.sh` 通过（binary 4.92 MB ≤ 5 MB，bundle 10.25 MB ≤ 35 MB，冷启动 0.31~0.5s）；`./tests/run_tests.sh` **387/387 通过**。
仍未覆盖：Light interface 仍无浅色主题实现；约束不处理旋转后的钉扎。

## 原生界面优化（第八轮：旋转画板约束联动与多层级嵌套自适应）— 2026-10-31

- **旋转画板（Rotated Frame）约束空间投影**：
  - 支持画板带有任意旋转角（`rotation != 0`）时的子节点自动约束计算；
  - 核心算法：将画布全局绝对坐标通过逆变换矩阵投影至画板自身的局部正交坐标系（沿画板旋转后的宽高向量轴 $(\cos\theta, \sin\theta)$ 与 $(-\sin\theta, \cos\theta)$），在局部空间完成与未旋转画板完全等价的 `left/center/right/scale` 和 `top/middle/bottom/scale` 钉扎计算，再通过正变换投影回画布空间；
  - 彻底消除了旋转画板拉伸时子节点沿未旋转绝对轴跑偏的问题。
- **嵌套画板（Nested Frames）递归级联重排**：
  - 当子画板因外层画板的 `scale` 约束发生尺寸变化时，自动递归调用 `applyConstraints(frameId:)` 重新排列其内部子图层。
- **新增回归测试**：`test_Constraints_RotatedFramePinsAlongLocalAxes`，精准验证 90° 旋转画板拉伸时右侧钉扎子节点沿局部轴正确定位（共 388 项测试，100% 通过）。

验证：`./build.sh` 通过（binary 4.94 MB ≤ 5 MB，bundle 10.26 MB ≤ 35 MB，冷启动 0.31~0.5s）；`./tests/run_tests.sh` **388/388 通过**。

## 原生界面优化（第九轮：浅色界面主题架构与设置联动）— 2026-10-31

- **浅色主题协调器（ThemeManager）实现**：
  - 新增 `native_studio/Sources/UI/ThemeManager.swift`，与 Web `use_editor_theme.js` 与 `theme-light.css` 保持严格规范对齐（持久化键 `voo.editor.theme`，支持 `dark` / `light` 双向切换）；
  - 遵循 Web 设计哲学：“It is deliberately scoped to the app chrome: the document canvas keeps its own background/checkerboard”；画布保持自身真实渲染与设计稿色彩，界面外框与顶栏根据主题无缝切换；
  - 浅色模式下：窗口底色自动切换为 `#f5f5f5`，编辑外框背景切换为 `#f5f5f5`，标题栏自动绘制 `#fafafa` 平铺背景与浅色底边描边 `rgba(0,0,0,0.1)`；
  - 深色模式下：完全保留既有的 `#000000` / `#171717` 与薄荷到纯黑的标志性渐变顶栏，386+ 测试基线 100% 字节无损。
- **设置面板开关真实联动**：
  - `WindowController` 接入 `settingsDrawer.onToggleLightInterface`，设置中点击“Light interface”开关立即广播并触发各视图片段重绘。
- **新增回归测试**：`test_ThemeManager_LightAndDarkSwitchingAndWindowBackground`，验证浅色/深色模式切换、持久化、以及窗口背景色在 `#171717` 与 `#f5f5f5` 间的精准切换。

验证：`./build.sh` 通过（binary 4.94 MB ≤ 5 MB，bundle 10.27 MB ≤ 35 MB，冷启动 0.31~0.5s）；`./tests/run_tests.sh` **389/389 通过**。

## 原生界面优化（第十轮：AI 智能体模型名动态联动与多 Provider 适配）— 2026-10-31

- **AI 侧栏模型胶囊动态联动**：
  - `WindowController` 增加 `syncAgentModelLabel()`，自动监听 `SettingsDrawerView.onAgentChange` 与 `UserDefaults` 中的 `voo.agent.llmProvider` 配置；
  - 动态为不同 Provider 映射最精准的友好模型标签：
    - Claude Code $\to$ `Opus 5.5`（与 Web 截图默认模型标签完全对齐）
    - OpenAI Codex $\to$ `GPT-5`
    - Google Antigravity $\to$ `Gemini 3.8`
    - DeepSeek Harness $\to$ `DeepSeek V3`
    - OpenCode $\to$ `OpenCode`
    - 用户自定义 `voo.agent.model` 时自动优先采用自定义模型名；
  - 设置中切换 Provider 时立即实时刷新 Agent 侧栏输入框内的胶囊标签。
- **新增回归测试**：`test_AgentPanel_ModelLabelSyncWithProvider`，验证默认映射、各提供商切换、以及自定义模型配置优先级的完整流转。

验证：`./build.sh` 通过（binary 4.95 MB ≤ 5 MB，bundle 10.27 MB ≤ 35 MB，冷启动 0.31~0.5s）；`./tests/run_tests.sh` **390/390 通过**。

## 原生界面优化（第十一轮：选区浮动条方位逻辑精准对齐与遮挡消除）— 2026-10-31

- **选区浮动条（Island Bar）垂直空间拓扑修复**：
  - 彻底根治了此前因为非翻转坐标系方向误判，导致选择条被错误推到选区上方、并遮挡文本图层顶部控标的缺陷；
  - 严格对标 Web `top: calc(100% + 8px)` 的几何物理定义：默认置于选区底边缘下方 8pt (`minY - gap - height`)，居中显示；
  - 空间边缘检测：当选区靠近画布底部、会导致浮动条与底部缩放控制栏（Zoom Bar，顶部位于 $y=56$）发生碰撞重叠时，自适应向上翻转（Flip Above）至选区顶边上方；
  - 截屏复核：选区图层、文字手柄与下方 8pt 处的新版 12 键浮动条层次分明，零遮挡、零边缘冲突。

验证：`./build.sh` 通过（binary 4.95 MB ≤ 5 MB，bundle 10.27 MB ≤ 35 MB，冷启动 0.31~0.5s）；`./tests/run_tests.sh` **390/390 通过**。截图：`native_studio/docs/screenshots/z_selected.png`。

## 原生界面优化（第十二轮：全格式真实 .voo 解析、工作台真实封面、自由画布平移、工具轨顺序与画笔绘制重构）— 2026-11-01

针对用户真机运行反馈的四项核心缺陷进行全链路深度修复：

1. **彻底解决 .voo 打开报错（“The data couldn't be read because it is missing”）**：
   - 根因定位：Swift 自动合成的 `Codable` 在面对 Web 导出的真实工程文件时，因缺少 `id`、`title`、`canvas` 或 `style` 嵌套字典而抛出 `keyNotFound`，被系统弹出该错误；
   - 解决方案：在 `DocumentModel.swift` 中为 `VOODocument`、`VOONode`、`PenAnchor` 实现健壮的容错解码器（`FlexibleNumber` / `FlexibleBool` / `FlexibleString`），支持展平属性与嵌套 `style` 互通、字符串数值与浮点数自适应转换、缺失属性赋予安全默认值；实测验证 Web 导出的 4 个真实复杂工程文件（131 节点的 `f1-grand-prix.voo` 等）全量无损秒开！
2. **工作台卡片真实封面提取与展示**：
   - 根因定位：此前代码硬编码调用 `drawThumbnailWireframe` 绘制 3 根灰色占位柱，未解析工程文件的封面；
   - 解决方案：在 `WelcomeDashboardView` 中增加极速二进制预览解析器，直接从 `.voo` 容器切片提取 `assetIndex["__preview"]` 的 PNG 图像数据并做 `NSCache` 缓存；在非翻转坐标系下进行纵向反转校正后做高保真 `aspectFill` 渲染，彻底替换假骨架柱！
3. **工具轨图标顺序与类别严格对齐 Web**：
   - 工具轨顺序修正为：`选择 (Select)` $\to$ `抓手 (Hand)` $\to$ `画板 (Frame)` $\to$ `裁切 (Crop)` $\to$ `选区 (Marquee)` $\to$ `画笔 (Brush)` $\to$ `橡皮 (Eraser)` $\to$ `文字 (Text)` $\to$ `钢笔 (Pen)` $\to$ `形状 (Shapes)` $\to$ `魔棒 (Wand)`，消除了画板与裁切颠倒、钢笔插在文字前等历史排布偏差。
4. **画布自由平移手势支持（Web 1:1 自由画布手势）**：
   - 点击空白灰色舞台背景直接拖拽平移画布（此前误判为矩形框选导致用户无法拖动背景）；
   - 增加鼠标中键（滚轮按压）拖拽平移支持（`otherMouseDown/Dragged/Up`）；
   - 保持空格键与抓手工具平移无缝可用。
5. **画笔工具自由绘制与图层提交重构**：
   - 修复画笔图层位图缓存与提交复用逻辑，避免单次绘制后清空位图或生成重复图层，在 `stampPaint` 增加即时 `context.flush()`，确保即画即显、持久保存。
6. **新增回归测试**：
   - `test_WebExamples_RealVooFilesDecodeAndLoadCleanly`：验证 4 款真实复杂 Web 工程文件（含 191 个贝塞尔路径点）解码；
   - `test_WindowController_OpenRealVooFileDirectlyLoadsSceneAndSetsTitle`：验证端到端从工作台打开真实 .voo 文件进入画布并切换视图。

验证：`./build.sh` 通过（binary 4.97 MB ≤ 5 MB，bundle 10.29 MB ≤ 35 MB，冷启动 0.20~0.50s）；`./tests/run_tests.sh` **392/392 通过**。真机截图：`native_studio/docs/screenshots/z_dashboard_with_covers.png`。

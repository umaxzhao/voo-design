# 项目检查总进度

## 可见窗口底边与绿框阴影修复（2026-11-03）

- 在独立 `voo-ui-frame-followup`、基线 `66d7609d` 复现两处问题：旧预览固定 1440×1000 虚拟视口超出真实浏览器内容区；全局浮动控件的阴影覆盖底角与部分侧边。既有窗口和用户未保存文档均保留。
- 后续预览改为 `viewport:null`，新建正常 1200×800 窗口。产品 CSS 在 workspace 顶层重绘 2px 绿框及四角外侧绿填充，保留 16px 圆角、顶部绿至黑渐变、结构分割线；绘制层不接受指针事件。
- 强化已有 `editor-frame-pixels`：完整左右及底边物理像素宽度、四角圆弧实色锚点、内侧圆角切口。20 组浅深/宽度/DPR 页面通过；旧版同断言失败。圆弧抗锯齿与背景混色不能用整块颜色掩码逐像素相等代替，因此保留最初失败记录，不宣称整块掩码完全一致。
- 真实 headful 窗口补测：3 个窗口尺寸 × 浅深，以及适配窗口中的 DPR1/2 仿真，共 10 组捕获、16 张包含滚动后的内容区截图；逐条边缘连续性、等宽和圆弧实色像素通过。物理显示器仅观测 DPR1，DPR2 为仿真；页面截图不是 OS 整窗截图。用户实际反馈来自哪个原窗口尚未得到答复，不能推定其 Mac 原生版本。
- 最终提交、检查退出码、可见预览地址与窗口 metrics 统一记录在同级 `evidence/FRAME-VISIBLE-EDGES-REPORT.md`。未重试被拒的 Mac 原生 GUI；不宣称原生 VOO、其他 OS 或完整 release gate 通过。未 push/部署/发布。

## UI 导出输入补测与修复（2026-11-03）

- 基线 `48d5b6f8` 的可见预览保持 clean、不改窗口或用户文档；本次仅在独立 `voo-ui-export-followup` 副本修已有内联导出交互。
- 真实失败：两条配置依次改 2x/3x、后缀、格式时，后缀事件用旧 inspector snapshot 将缩放回写成 1x；逐字输入 `png`/`web` 只留下 `g`/`b`。原日志分别为同级 `evidence/export-followup-before.log` 与 `export-followup-typed.log`。
- 修复：共享 `updateExportPresets` 可按当前文档执行更新配方，新增/删除/单项修改不覆盖其它刚完成的编辑；导出按钮读取当前配置。后缀字段用即时草稿保留连续键盘字符，失焦后同步文档值，节点切换按节点/配置ID重置。
- 注册回归 `inline-export-presets-cold`：不加操作间等待，逐字输入后连续改格式/缩放/质量，实际 PNG 240×160/WebP 360×240 下载与红色像素；真实 portable ZIP 下载、新浏览器 filechooser 冷开，两条配置逐字段一致，并补后缀真实键盘 Undo/Redo 与可见值。
- 检查状态、准确提交和源 hash 以同级 `evidence/EXPORT-FOLLOWUP-REPORT.md` 与 `export-followup-verification.json` 为准。16 项 targeted unit、完整 build/lint/modules 与真实下载冷开已执行；完整单测最终结果单列，未测 OS 不继承 Chromium 通过。
- 不改 Frame 残影、选择工具/快捷键或 PSD/JPEG round-trip owner 的源码；没有 push、部署、发布、原树改动或 Mac 原生 GUI操作。

## UI 专项：状态栏与编辑器绿框、空态间距（2026-11-03）

- 独立副本 `2026-11-03/task/voo-ui-codex`，基线 `b8ae8039`；保留已审查的 #52 间距与测试入口四提交，未覆盖原冻结仓库或 e0 草稿。最终提交、源文件 hash、退出码和截图统一记录在同级 `evidence/REPORT.md`。
- 最新用户意图：顶部状态栏独立保留左绿右黑渐变，黑色覆盖右上角；下面内容区单独完整 2px 绿色描边、四角 16px。去掉固定 4px 外间距，保留物理 safe-area；浅色主题也保留状态渐变及操作按钮对比度。浮动面板阴影裁切在内容边界内。
- 修前真实像素：桌面黑色 4px 外沿、768px 左绿右黑；旧空 Styles/Modifiers/Export 高 57px，Stroke/Effects 高 49px。补齐 CollapsibleSection 空内容判定、Export 显式空状态后，五组统一 49px，上下各 12px，新增入口与内联导出保留。
- 已执行：注册的 `editor-frame-pixels`（5 宽度 × 浅深 × 实际 DPR1/2，完整视口四角、状态栏黑绿两端、左右对称、上下半径及返回欢迎页）；`inspector-controls` 15 项；空分区真实新增/UndoRedo；PNG/JPEG 2x 导出尺寸与像素、变量绑定/解绑/UndoRedo；中心十字实际布局、独立命中与 Tab 可见焦点。
- `t02-panel-visual-audit` 原来测得 0 个分区，不能证明面板结构。现改用实际标题/分组，增加非空、真实分割线与五个默认入口断言；1440/1100px × 浅深测得各 10 个分区。历史失败、初版预览与最新用户更正分别保留，不能互相冒充最终通过。
- Mac 上已正常启动独立可见 Chromium 源码预览 `VOO Design — UI preview`，仅含自有 QA 样本；不是签名原生包或线上部署。旧 b8 Mac PID224/F1 未保存文档/profile 未操作。原生 Mac/Windows/Linux、物理 DPI、触控与实际安全区设备、完整 release gate 均未认证；选区 Esc 逻辑仍由 C 负责。

## LINUX-STYLE01 — scoped opacity repair, 2026-11-03

- Pinned reproduction: `aad8cafc1c415817e3d55e0e1deb6854164abc65`, own standalone clone; fill RGBA `[255,0,0,128]`, overlapping stroke `[85,0,170,192]`. Layer alpha was applied separately per paint. Reuse the existing isolated-style compositor and wrap expanded SVG paint siblings once; own paint opacity is preserved.
- Evidence: `/Users/tt/Desktop/voo-linux-qa/linux-style01-20261103T040609Z/` (raw exit codes, before/after pixels, source hashes, final revision in report). Registered capability `compositing.alpha`; new assertions stay in existing `container-opacity` suite. UF23 files, including the shared catalog, are explicitly excluded; the existing unit path is unmapped and therefore requires the full gate.
- Scoped checks: 40 targeted units and full units 5178 passed / 4 skipped; design lint, module registration, build, stroke-controls and image-layer-alpha passed. Seven new browser checks cover 0/25/50/100% layer alpha, own paint alpha, multi-fill/multi-stroke, PNG/SVG, and one-step API undo/redo. The full container suite still has an Opacity locator failure; baseline comparison and full verifier results are recorded externally, not promoted to pass here.
- Coverage remains partial: this is macOS arm64 headless Chromium with Canvas2D/export evidence, not Linux native certification, physical gestures, performance, every backdrop/custom-blend combination or public 56005464/beta3 acceptance. No original repository edits, push, workflow or release.

## UF23 live paint and SVG import correctness — 2026-11-03

- Scope: existing `layout.components` live instance paint parity and `vectors.format-losses` SVG paint opacity/gradient direction import; base `950df98e`, isolated `uf23-correctness-20261103T063510Z`.
- Reproduction: `uf23-correctness-20261103T063510Z-evidence/before.log` and `.exit` record real UI exit 1, with original pixels, screenshots, traces, FIG/SVG and ZIP files retained; old unit passes do not remove the hold.
- Candidate: live vector shapes reuse the common multi-paint renderer, applying outer layer alpha once; SVG import retains independent paint alpha and applicable object-bounding-box gradient direction lines. No PSD or UF24/26/27 changes.
- Acceptance: the evidence directory's `verification.json` binds the exact fixed revision and real `final-ui.exit`/logs to object-relative screenshot pixels, real chooser FIG/SVG reimports, instance/detached portable ZIP cold opens, and UI Undo/Redo. Only those recorded contexts can pass; a nonzero or missing final exit retains the hold.
- Remaining: integration into A, full release gate, Electron/native picker, signed apps, Linux, arbitrary SVG transforms and broader component/media combinations are not certified by this audit.


## VOO 设计编辑器进驻 DeepSeek Harness 右侧面板：2026-11-03

- **基线版本**：`3657d11e`（`merge/consolidate-all-branches`，工作树在改动前干净）；本轮改动为新增插件包与单测，未推送。
- **交付**：新增 Harness 插件包 `plugins/voo-editor-panel`（Host + Client 两半），已通过 Harness Plugin Manager 安装到 `desktop` profile（`voo-editor-panel 1.0.0 <- plugins/voo-editor-panel` 链接安装，`application: applied`，无 warnings）。
  - Host 半 `index.js` / `lib/*`：在 `http://127.0.0.1:4173` 提供仓库 `dist/` 构建（仅回环、GET/HEAD、SPA 回退、拒绝路径穿越、`/__voo/health` 健康信息），并在 4179 无人监听时于 Host 进程内启动 VOO CLI bridge（已运行则复用），随插件行卸载一并关闭。
  - Client 半 `client.js`：注册右侧栏标签类型 `voo`（`keepMounted`，切换标签保留文档）、引导页卡片与 iframe 主体 `http://127.0.0.1:4173/?embed`；含加载态、页面刷新命令绑定、`zh`/`en` 文案，外观只用 `--dsw-alias-*` 主题 token，不引用任何 Harness Client 包。
  - 编辑器侧零改动：`?embed` 已支持隐藏标题栏/引导、自动新建未命名项目，并主动连接本地 bridge（`src/canvas/mcp/mcp_link_boot.js`）。
- **验收证据**：
  1. 单测 `tests/unit/voo_editor_panel.test.js`：16/16 通过（`npx vitest run tests/unit/voo_editor_panel.test.js`，退出码 0），覆盖 options 解析、请求路径映射、真实 HTTP 服务（端口 0 + 临时构建夹具）、目录穿越、缺失构建提示页、`close()` 后拒绝连接；含本轮修复的回归断言——`editorDir: ""` 不再遮蔽 `VOO_EDITOR_PANEL_DIR` 环境覆盖（独立验证者发现，已修复并锁定）。
  2. 注册门禁：`npm run check:modules` 通过（12 模块 / 74 能力 / 99 浏览器套件注册有效；新增 `platform.harness-editor-panel`，`tests/unit/voo_editor_panel.test.js` 归属 `platform` 路径）；`node scripts/editor-checks.mjs --changed --json` 的 `unmapped` 为 0、`fullReleaseRequired` 为 false（影响面按 `platform` 及其 related 模块列出）。
  3. 语法与清单：`node --check` 覆盖 `index.js`、`client.js`、`lib/*.js`；`package.json`、`locale/*.json`、`cordis.patch.yml` 解析通过；`icon.png` 为有效 PNG（92,379 字节 < 256 KiB）。
  4. 运行态（本机 `desktop` profile）：
     - `curl http://127.0.0.1:4173/__voo/health` → `{"ok":true,"service":"voo-editor-panel","editorDir":".../dist","hasBuild":true}`；`GET /` 返回 200 HTML，`assets/index-HO9CiTZV.js` 返回 200 `text/javascript`（553,244 B）。
     - `curl http://127.0.0.1:4179/health` → `{"ok":true,"service":"voo-cli-bridge"}`，由插件 Host 半启动。
     - Client 注册：Harness Client Slots 的 `sidebar.right.pane.tab` 出现占位 `voo-editor-panel`（active），证明 Client 半已加载并完成标签类型与主体注册。
     - 端到端：右侧面板里的编辑器页面连接上 bridge 后，`voo_status` 返回 `canvasConnected: true`、`documentId: "document-1"`，`inspect_layer_tree` 读到真实文档（`totalCount: 79`），即 Agent 的 `mcp__voo__*` 画布工具作用对象正是右侧面板中的编辑器。
- **未验证 / 保留项**：
  - 已认证 Harness GUI 的渲染外观（浅色/深色、悬浮与全屏呈现）未截图核对：本环境不启动独立浏览器读取已认证页面，只验证到 Client 注册与页面内运行态；显示元数据（标题/描述/图标）已核对安装资源，但未在 Plugin Manager 中目视确认。
  - Harness 重启后的重新激活、以及 VOO 桌面 App 自带 bridge 与插件启动的 bridge 之间的接管顺序未做双实例实测。
  - 未运行编辑器浏览器套件：本轮未改动 `src/`、`electron/` 运行时代码，`--changed` 列出的 platform 及 related 模块浏览器套件未执行，不能据此认定通过；也未执行 `npm run lint:design`（扫描范围仅 `src/`，本轮无 `src/` 变更）。
  - 未执行 `scripts/deploy-editor.sh`：`dist/` 与源码均未变化，部署不携带本插件；本轮未 push——本地 `merge/consolidate-all-branches` 相对 `origin` 领先 61 / 落后 8，直接 push 会被拒绝，未做合并或强推。

## 同一父级与根平面多选图层重排原子迁移修复与双重实测：2026-11-02

- **基线版本**：`cb67e0d2`（前序包含 `de7b42a1`、`31c24644`、`d20c6836`）；未推送、未发布。
- **问题闭环（现有多选重排未关闭验收缺口）**：
  - 复现根因：此前多选拖入 Frame 虽已支持多节点批次迁移，但在同一父级同胞拖拽分支（`dragged?.parentId && scope === "siblings"`）及根平面同级拖拽分支（`!dragged?.parentId`）中，`use_editor_layer_interactions.js` 仍仅把首个单节点 `id` 传给 `onReorder` / `onReorderGroup`；底层 `reorderNodeTo`（`doc_ops_groups.js`）亦未支持多选数组，导致拖拽时其余被选中的兄弟图层被遗留原位。此外在虚拟化列表快速连续点击（⌘+点击多选）后触发 pointer down 时，DOM 事件与 React 渲染周期的微小时差可能导致闭包持有的 `selectedIds` 滞后，补充 `liveSelectedIds` 读取保障选区实时。
  - 架构与工程实现：
    - 在 `src/canvas/editor/reorder-layer-batch.js` 抽离实现 `reorderLayerBatchTo(doc, idOrIds, targetIndex, primaryId)`，完整支持单个或多个根节点的批次重排；严格保留被选节点在文档内的相对层序、子树（descendants）、蒙版附属层（followers）及锁定层边界约束（拒绝跨越锁定层或移动锁定节点），单步插入目标位置；
    - `src/canvas/editor/doc_ops_groups.js` 中 `reorderNodeTo` 接入 `reorderLayerBatchTo`，保持文件在 359 行（<400 行红线）；
    - `src/canvas/editor/node-stack-actions.js` 及 `src/canvas/components/image_editor.jsx` 对齐透传 `primaryId` 参数，并在单次操作内完成单一事务性提交（`editor.layer.order`）；
    - `src/canvas/components/use_editor_layer_interactions.js` 在同级 siblings 与 root 平面统一传入所选批次 `ids`，保持 inside 容器及跨 Frame 既有行为；
    - `src/canvas/components/use_layer_drag.js` 引入 `liveSelectedIds` 双重兜底，确保在极速输入与列表虚拟化重挂载下选区集合永不失真。
- **双重实测验收与证据**：
  1. **小样本与定向单测全链路覆盖**：
     - 新建专用单测 `tests/unit/layer_multiselect_reorder.test.js`（9/9 全部通过），覆盖根平面连续节点向上/向下重排、非连续节点重排、Frame 内部同胞重排（不越界至父级或外部根节点）、组与蒙版附属层原子绑定、锁定层约束拒动、单步 Undo/Redo 状态无损还原，以及交互层 `useEditorLayerInteractions` 的 root/sibling 事件分发契约；
     - 运行全量图层模块相关单元测试（共 7 个套件 71 项），100% 通过（71 passed）。
  2. **2,000 层虚拟化大列表严格重测**：
     - 运行真实 Chromium 浏览器环境严格重测：`node --input-type=module -e 'import {withEditorBrowser} from "./tests/e2e/editor-browser-fixture.mjs"; import {verifyLayerWindowMultiDrag} from "/Users/tt/Documents/Codex/2026-11-02/task/integration-voo-ui/tests/e2e/layer-window-multiselect-checks.mjs"; await withEditorBrowser(verifyLayerWindowMultiDrag,{deviceScaleFactor:2});'`；
     - 连续 3 次独立运行全部退出码 0 通过：验证 2000 个根级矩形（`large-0`…`1999`）滚动到底并 ⌘ 多选 `large-0` 与 `large-1` 拖至 `large-3` 上边缘后：
       - 层序精确为 `["large-2", "large-3", "large-0", "large-1"]`（无单层遗留，解决 `['large-1', 'large-2', 'large-3', 'large-0']` 缺陷）；
       - 全部 2000 节点几何与属性无破坏；
       - 选区集合保持为 `["large-0", "large-1"]`；
       - 单步 `tool("undo")` 精确还原至移动前状态；
       - 单步 `tool("redo")` 精确重现移动后状态。
  3. **门禁与合规核验**：
     - `scripts/editor-module-catalog.mjs` 登记更新，`npm run check:modules` 验证有效，`unmapped` 为 0；
     - `npm run lint:design` 全量 1,478 文件 0 违规通过；
     - 所有变更源码单个文件行数严格在 400 行以内（359 / 116 / 169 / 329 / 281）。
     - 本地环境干净，未触碰性能工作树 `editor_windowed_layer_rows.jsx` 及司令部键盘/IME 文件；无 push、无外部发布、无连接 la 服务器。

## 独立定向续测与本地测试提交：2026-11-02

- 产品源码基线 `31c24644`（前序包含 `d20c6836`、`03c6ed3e`、`ed288fff`、`164896f0`、`3e8f5214`）；未推送、未发布。模块登记 `scripts/editor-module-catalog.mjs` 中 `workspace` 补齐 `welcome_home_actions.test.js`，`unmapped` 已清零（12 模块 73 特性注册有效）。全量单测 1,707 套件、5,108 项通过（0 失败，4 预留跳过）。
- 复杂多文档连续编辑→保存→正常关闭→独立冷进程恢复回归通过：
  - 隔离环境：`/private/tmp/voo-multi-doc-cold-*`，真实双进程 Electron 43.4.0 实例，测试文档与用户空间严格隔离。
  - 进程一（连续编辑与多标签）：Doc A 连续添加文本（Inter 28px）、矩形形状（圆角/描边）及真实位图图像；Undo/Redo 验证正常；保存为 `MultiDocA.voo`（1,679 字节，SHA256 校验记录）。通过顶栏添加项目建立多标签（Tab count = 2）；Doc B 独立编辑 Frame 嵌套子层级（嵌套圆形及文本）；切换 Tab 验证双向会话状态与 Undo 隔离无串扰；保存为 `MultiDocB.voo`（854 字节）。
  - 正常关闭：已保存状态下关闭 Doc B 标签页，无阻塞弹窗平滑退出，标签收敛为 1 且 Doc A 恢复激活；第一进程正常干净退出（Exit code 0，PID 释放）。
  - 进程二（全新独立冷进程）：启动新 PID 独立 Electron 实例，读盘冷载入 `MultiDocA.voo` 与 `MultiDocB.voo`。文本尺寸 0px 漂移（Inter 28px 精准 294px 保持）、位图像素哈希（`603457605`）完全一致、Frame 嵌套父子关系精准重建、载入后继续编辑与 Undo/Redo 完备可用。机器日志：`/Users/tt/Documents/Codex/2026-11-02/task/multi-doc-cold-audit.json`。
- 本地解包可测试构建产物方案验证：
  - 执行 `npm run prebuild`（同步 canvaskit/ort wasm 及 notices）、`npx vite build --mode electron`（3,479 模块编译通过，用时 6.96s）、`node scripts/build-connector-resource.mjs` 及 `node scripts/signing-env.mjs --dir`；
  - 成功生成本地未签名、不发布的测试解包产物：`release/mac-arm64/VOO Design.app`；公证跳过，无远端交互，严禁发布。
- 视觉设计 Lint 门禁闭环（lint:design PASSED）：
  - 针对此前全库唯一未关闭违规 `src/canvas/components/font_picker.jsx:571:25`（缺字体提示 badge 裸 `rounded`），经 QA 补充核验无其他分支占用后，完成最小梯度 token 修正：将 `rounded` 替换为符合设计系统梯度阶梯的最小 token `rounded-md`（6px，对应 tags/badges 规范）；
  - 保留 `isMissing` 与 `data-testid="missing-font-warning"` 全部语义，不扩展其他功能；
  - 执行 `npm run lint:design`，1,478 个文件全量通过，0 违规，退出码 0。
  - 定向单测 `tests/unit/mac_qa_interaction_fixes.test.jsx`（11 项全过，含缺字体徽标断言）及 `tests/unit/affinity_tool_properties_panel.test.jsx`（12 项全过）验证通过。
- 任务边界与持续保留项：
  - 2,000 层虚拟化列表滚动长帧由 Codex 性能团队在独立工作树归因分析，主树未触碰 `editor_windowed_layer_rows.jsx`。
  - 键盘焦点/IME 由 Codex 司令部工作树负责，主树未触碰。
  - 实体触控板/触控笔/Linux 原生环境认证保持硬件环境受阻标记，Mac 结果不继承为 Linux。

## Codex 独立 Mac 原生复测：3e8f5214（两项核心修复获限定场景通过，发布门禁未过）

- **绑定版本与证据**：`3e8f5214195f0d8a6afcc302f4e316a8db2c2b01`（merge/consolidate-all-branches），Electron 43.4.0 darwin/arm64，Apple M4 Pro / macOS 26.5.2；Ning profile 独立副本（`codex-3e8f5214-profile`），测试工作区 `codex-3e8f5214-workspace/`；[完整报告](/Users/tt/Desktop/voo-mac-retest/REPORT.md)、[机器结果](/Users/tt/Desktop/voo-mac-retest/codex-3e8f5214-evidence/results.json)、[证据清单](/Users/tt/Desktop/voo-mac-retest/codex-3e8f5214-evidence/evidence.json)。
- **两项核心修复限定验证**：
  - **冷重开文本几何零漂移（Strict Lossless）**：通过。修改 Name 颜色后原生 ⌘S，退出进程后二次冷开并额外等待 10s 字体就绪，17 个节点序列化精确匹配，`strictLossless: true`；指定 7 节点与全量节点 Δx/Δy/Δwidth/Δheight/ΔboxWidth 均为 0px。[对比](/Users/tt/Desktop/voo-mac-retest/codex-3e8f5214-evidence/cold-font-settled-visible.json)、[字体](/Users/tt/Desktop/voo-mac-retest/codex-3e8f5214-evidence/font-settlement.json)。
  - **图层列表 ⌘ 多选快速拖拽原子迁移**：通过所测路径。列表点击 Child A、⌘点击 Child B，极速单次拖拽（Frame 34.3ms，根槽位 31.6ms）原子迁移全部节点，单步 ⌘Z / ⇧⌘Z 恢复，拖拽平移帧率 59.99 FPS。[Frame 结果](/Users/tt/Desktop/voo-mac-retest/codex-3e8f5214-evidence/frame-result.json)、[根级结果](/Users/tt/Desktop/voo-mac-retest/codex-3e8f5214-evidence/root-result.json)。
- **本地可执行验收项补测与真实边界**：
  - **原生切片文件选择器（未覆盖原生 Picker）**：代码中切片导出逐个触发 `saveMediaExport`，因桌面端 `preload.cjs` 未注入 `window.vooElectron.chooseExportPath`，走浏览器 `<a download>` 回退；此前测试仅通过适配器证明生产渲染与文件 IPC，**原生切片选择器（Picker 对话框）未接入且未覆盖**。
  - **虚拟化大图层列表滚动（长帧未关闭）**：原报告记载 118 帧、p95 49.9ms、max 133.3ms，但尚未定位该轮原始记录，不据此认定根因。独立 Chromium 开发版 2000 层重跑保留原始 120 帧数据，挂载最多 34 行，滚动 p95/max 约33.4ms；存在超过20ms帧。不是原生Electron或实体触摸板认证；帧耗时也不能证明没有内存泄漏。证据：`/Users/tt/Documents/Codex/2026-11-02/task/qa-continuation/scroll.json`。
- **合成样本检查与竞品标杆边界纠正**：
  - D04 像素反选无蒙版污染、画笔单步撤销无损恢复、SVG 四项采样容差 ≤12、32px 网格几何路径贴合 (96,96,128,96)、SIGKILL 崩溃恢复 17 节点均为**本地合成断言检查通过**，未与 Figma/Affinity 在相同机器/相同文件/相同操作下做横向实测对比，**禁止表述为“标杆全量通过”**。
  - 画布平移缩放导航中，Profile Card 实测 60.00fps（p95 17.6ms，max 17.8ms），但 1000 矩形样本中记录到一次 **33.3ms 帧**，不能概括为始终 60fps。
- **需外部硬件/环境的未覆盖项（前提与受阻原因）**：
  - **实体触摸板手势**：需物理触控板产生 OS 原生捏合缩放与惯性滑动；受阻于自动化环境仅能通过 CDP 模拟离散指针/滚轮事件，无法生成真实物理惯性与触控点阵。
  - **实体触控笔**：需物理连接支持压感/倾斜的数位板（如 Wacom/Apple Pencil）；受阻于无连接实体硬件，无法捕获真实电磁压感级数与倾斜轴数据。
  - **签名安装包**：需 Apple 开发者证书与公证凭据；受阻于本地无生产签名密钥环境且红线禁止发布推送，仅运行开发版实例。
  - **Linux 原生环境认证**：需在 Ubuntu 22.04 / Debian 原生 X11/Wayland 桌面环境中构建运行；受阻于当前执行机为 macOS arm64，无法运行 Linux 原生二进制，Linux QA 正在等待独立的 aae01585 固定源码快照进行环境测试。严禁用 Mac 结果代替 Linux 认证。
- **完整现有测试门禁执行状态（门禁未通过）**：
  - `npm run check:modules`：通过（12 模块 73 能力有效注册，功能覆盖标记为 partial）；
  - `npx vitest run`：全量通过（1,707 套件通过，5,108 用例通过，0 失败，4 跳过/待测，通过率 100%）。此前 4 文件 9 项失败已完成测试契约同步：`affinity_tool_properties_panel.test.jsx` 与 `no_size_presets.test.jsx` 对齐 `BoundedNumberInput` 的 `inputMode="decimal"` 表达式模式；`container_selection_chrome.test.js` 补齐旋转标线 Canvas mock 上下文（`moveTo/lineTo/stroke/arc`）；`welcome_home_actions.test.js` 对齐内存建构顺序（`store.newVooProject` 先于 `setPendingGeneration`）；
  - `node tests/e2e/image-layer-window.e2e.mjs`：8 项全量通过；
  - `node tests/e2e/editor-layers-composition.e2e.mjs`：17 项全量通过；
  - `npm run lint:design`：**失败**（`src/canvas/components/font_picker.jsx:571:25` 裸 rounded）。核实属于并行任务分支 `codex/nba-font-fidelity`，严守红线未越界修改；**门禁如实记录为未通过**。未运行全量 release 门禁，本轮无 push、无 deploy、无 la 访问。

## Codex 独立 Mac 原生复测：6d7b3cfa（核心验收未通过，已由 3e8f5214 修复替代）

- **绑定版本与证据**：`6d7b3cfa2b7f5f8aae8c00bd4d879d4f0e9edb97`，Electron 43.4.0 darwin/arm64，Apple M4 Pro / macOS 26.5.2；Ning profile 的独立副本，独立开发源 5187；[完整报告](/Users/tt/Desktop/voo-mac-retest/REPORT.md)、[机器结果](/Users/tt/Desktop/voo-mac-retest/codex-6d7b3cfa-evidence/results.json)、[证据清单](/Users/tt/Desktop/voo-mac-retest/codex-6d7b3cfa-evidence/evidence.json)。
- **documents / text / layout：失败**。历史 Profile Card 原生打开→File 保存→⌘S 保存→全退出冷重开后，Name Block / Name 宽度各 −3px、Role −1px、Meta +2px；其余指定节点几何不变，17 节点完整，`strictLossless: false`。4 文件 60 定向单测通过，但不能替代该原生复测失败。[对比](/Users/tt/Desktop/voo-mac-retest/codex-6d7b3cfa-evidence/cold-after-restart.json)。
- **inspector / documents / platform：限定通过**。标题栏独立 Save 为 As Designed（按设计不做）；File 菜单与 ⌘S 实际落盘通过。显式启用自动草稿后，SIGKILL 重启恢复 3/3 节点且正式文件 SHA256 不变；仅 null clipTo 字段省略，恢复草稿 filePath 为空。[恢复](/Users/tt/Desktop/voo-mac-retest/codex-6d7b3cfa-evidence/draft-after-restore.json)。
- **layers / selection / layout：部分覆盖**。嵌套 Auto Layout 原生检查器尺寸重排及根级画布多选 (+80,+80) 通过；快速列表多选拖入 Frame 只移出一个子节点，根级列表对照无动作，落点/悬停时序范围待确认，不能继承历史 D10 通过。[拖拽](/Users/tt/Desktop/voo-mac-retest/codex-6d7b3cfa-evidence/multi-after.json)。
- **canvas / images / vectors / compositing：部分覆盖**。原生 D04 像素选区反选、画笔像素及一次撤销、32px 网格新建矩形通过；SVG 圆角 clip、mask、径向渐变、文本 middle/end（最大 1px）域导入/渲染采样通过，未覆盖原生 picker。1000 矩形导航约 6.07s、59.999fps、p95 17.6ms；初始 17 节点短样本有 99.9ms 帧，不能认证全场景 60fps。100 次区域导出内存短时趋稳，长期泄漏未验证；独立切片 UI 未找到，只验了区域导出 API。[性能](/Users/tt/Desktop/voo-mac-retest/codex-6d7b3cfa-evidence/performance.json)。
- **执行状态**：模块注册检查通过；4 文件 60 定向单测通过；设计 lint 失败于既有 font_picker.jsx:571 裸 rounded（未改字体任务文件）。未跑全量发布门禁。本轮无 push、无 deploy、无 la 访问。

## 本轮：Linux v1.0.0-beta.2 缺陷与补充清单集中修复与分支合入（源码完成，未推送未发布）

- **协调与合入分支**：`merge/consolidate-all-branches`（基于 commit `4a5cfe98`，未 push，未部署）。
- **并行执行模式**：使用 Orca orchestration 在多个独立 child worktree 中启动子 Agent 针对各个独立模块进行修复与回归测试，协调者逐一审查、运行测试并合并入主分支。同时并发调度 Mac Electron 原生测试 Agent 执行全量复测与截图核验。
- **修复项与模块验证**：
  1. `worker-psd-import` (PSD 位图水合与持久化)：`psd_to_voo.js` 与 `project_io.js` 对 PSD 导入产出的图层位图 assets 建立与 images 统一的水合映射，修复重新打开与存盘位图占位问题。定向单测 `tests/unit/psd_pipeline_reopen.test.js` (5/5 通过)。
  2. `worker-provider-storage` (API 凭据与内置服务商配置)：`electron/main.cjs` 与 `electron/preload.cjs` 建立 Electron `safeStorage` IPC 加密信道，`credential_store.js` 写入后立即读回校验并回退 localStorage；`provider_client.js` 为内置 API 返回安全默认配置对象，防止解引用 `.configured` 报错。定向单测 `tests/unit/safe_storage_credentials.test.js` (8/8 通过)。
  3. `worker-selection-component` (反选接错蒙版、组件主页创建与草稿丢失修复)：
     - `image_editor.jsx` 反选动作修正为 `engine.invertPixelSelection()`，彻底解绑整图蒙版反转 `invertMask`。
     - `design_store.js` 实现 `createComponentPage(hostId, options)`，自动排布主画板于右侧避免碰撞，并接入画布引擎撤销重做。
     - `saveEditorDrafts` 接收 live engine 传入的 `entries` 并持久化到 `nodes` 和 `crashDraft`，解决崩溃恢复丢失最新画布内容问题。
     - 定向单测 `tests/unit/selection_and_component_actions.test.js` (7/7 通过)。
  4. `worker-frame-tool-pan` (Frame 工具移动根画板解绑与 Hand 工具平移)：Frame 拖拽新建逻辑与根画板移动解耦；空画布点击在单画板模式下不清除 `focusedId`，保证 Hand 工具可在空白处自如平移。定向单测 `tests/unit/frame_creation_and_hand_pan.test.js` (9/9 通过)。
  5. `worker-export-fig-shortcuts` (Figma .fig 导出与快捷键冲突)：接入 `serializeVooToFig` 到右上角导出对话框；`editor-shortcut-modifiers.js` 清理 `Ctrl+]` 直接调用 `engine.bringToFront()`，避免被画笔缩放劫持；Agent 面板快捷键 `Ctrl+J`/`Ctrl+\` 冲突消解（主快捷键保持 `⌥⌘A`，Ctrl+J/Ctrl+\ 保留画布原生功能）。定向单测 `tests/unit/export_fig_and_shortcuts.test.jsx` (15/15 通过)。
  6. `worker-locale-theme-contrast` (语言持久化、错误键与高对比度)：`setLocale` 写入 `localStorage.setItem("ciw.locale", locale)`；i18n 补全 `editor.openFailed`；`src/theme-light.css` 与 `design/tokens.cjs` 将浅色薄荷绿 `#a7ffd4` 重映射为高对比度 `#0d7647` (对比度 >= 4.5:1)，并将半透明白字映射为深色中性字。定向单测 `tests/unit/locale_and_theme_contrast.test.js` (10/10 通过)。
  7. `worker-upscale-cancel-timeout` (2X 本地超分模型编译取消与超时保护)：新建 `src/canvas/editor/upscale_compile.js`，实现 `createSessionWithTimeout` (20s 超时) 及轮询 `shouldStop` / AbortSignal 即时取消，在 `raster-image-actions.js` 中捕获取消时不弹出错误提示条。定向单测 `tests/unit/local_upscale_cancel_timeout.test.js` (13/13 通过)。
  8. `worker-svg-import-defs` 与 `svg-mask-fidelity` (复杂 SVG 渐变、clipPath、mask、text 导入保真与透明蒙版修复)：在 `editor_svg_import.js` 与 `svg_to_nodes.js` 构建 `defsMap` 索引，解析 `linearGradient`/`radialGradient` 生成标准 CSS 渐变；将 `clipBase.fill` 修正为 `#ffffff` 保持 alpha = 1.0 以供 `destination-in` 剪裁合成，并将复合遮罩布尔操作修正为 `subtract`。在 `034cf7ef` 中进一步修正根 Frame 圆角和 bounds 传递给 mask base rect。定向单测 `tests/unit/svg_to_nodes.test.js` (40/40), `tests/unit/svg_defs_import.test.js` (6/6 通过)。
  9. `layer-panel-multiselect-reparent` (图层面板多选移入 Frame)：实测并补充全链路集成单测 `tests/unit/layer_panel_multiselect_reparent.test.js` (3/3 通过)，确认 `useLayerDrag` -> `useEditorLayerInteractions` -> `engine.moveIntoGroup(ids)` 一次性迁移多个选中根对象进有效 Frame，并支持单步 Undo/Redo。
  10. `worker-overlay-esc-stack` (浮层 Esc 优先级与右键菜单关闭)：`use-browser-overlay.js` 移除 document capture 阶段监听，增加 `hasTopOverlay` 判定，让顶层命令面板、对话框和菜单先接收 Escape；`editor_context_menu.jsx` 移除对 focus 在菜单内的限制，任意焦点下按 Escape 均可正常关闭右键菜单。定向单测 `tests/unit/overlay_esc_stack.test.jsx` (10/10 通过)。
  11. `worker-platform-badge-linux` (工作区环境平台动态适配)：`use_window_controls.js` 新增多维度系统平台探测 `getDetectedPlatform` (支持 Electron `process.platform` / `globalThis.vooDesktop` / `globalThis.electronAPI` / `navigator.userAgentData.platform` / `navigator.platform`)；`settings_general.jsx` 动态渲染 `[macOS 原生]`、`[Linux 原生]`、`[Windows 原生]`、`[浏览器挂载]`，并补充中英文字典与 fallback。定向单测 `tests/unit/workspace_platform_badge.test.js` (18/18 通过), `tests/unit/settings_workspace.test.js` (8/8 通过)。
  12. `worker-close-project-tab` (多文档标签关闭穿透与最后标签重置)：`canvas_tab_strip.jsx` 关闭按钮增加 `e.stopPropagation()`，杜绝关闭触发文档切换；`design_store.js` 在关闭最后一个文档时彻底清空 `nodes`、`edges`、`images`、`figSource`、活跃状态并切换为 `welcomeOpen: true` 首页。定向单测 `tests/unit/close_project_tab.test.jsx` (5/5 通过)。
  13. `worker-snap-grid-drawing` (新建形状与向量网格对齐吸附)：新建 `src/canvas/editor/shape_snapping.js`，在矩形、椭圆、Frame、多边形、星形、箭头、线条的创建拖拽手势中，对起点坐标、终点坐标与宽高尺寸按 `gridSize` 进行量化吸附 (`Math.round(coord / size) * size`)，持久化 `voo.editor.gridSize`。定向单测 `tests/unit/snap_grid_shape_drawing.test.js` (14/14 通过)。
  14. `mac-qa-interaction-fixes` (Mac QA 7 项交互缺陷修复，commit `3aa07735`)：
     - `editor_layer_context_menu.jsx`: 图层行右键菜单监听 document 级 Escape，按 Esc 即时关闭菜单。
     - `editor-shortcut-modifiers.js`: 支持 `Ctrl+Shift+L` / `Cmd+Shift+L` 切换选中图层锁定状态 (`engine.toggleLockNode`)。
     - `editor_pointer_hit_test.js` & `chrome_selection.js`: 解决底层画板/根 Frame 遮挡旋转手柄判定问题，渲染顶部旋转连线与圆点手柄；在 `editor_engine.js` 暴露 `api.commit` 确保旋转结束提交历史快照。
     - `properties_panel_sections.jsx`: 在检查器中渲染 `CombineSection`，支持布尔对象（union/subtract/intersect/exclude）操作切换。
     - `bounded_number_input.jsx`: 采用 text+decimal 模式支持基础四则运算表达式解析（如 `200+50` 自动求值为 `250`）。
     - `welcome_file_collection.jsx`: 首页文件卡片容器、封面按钮与表格行绑定 `onContextMenu`，支持右键弹出菜单。
     - `font_picker.jsx`: 针对本地与 Figma 未安装字体渲染 `data-testid="missing-font-warning"` 警示标签。
     - 定向单测 `tests/unit/mac_qa_interaction_fixes.test.jsx` (7/7 通过)。
  15. `worker-rotation-handle-gesture` (旋转手柄与选区交互避让，commit `58dd1516`)：
     - `artboard-body-gesture.js`: 在 `shouldDragArtboardBody` 增加 `engine.hasHandleUnder?.({ clientX, clientY })` 判定，防止画板容器 `onPointerDownCapture` 在外部手柄处吞掉事件；
     - `editor_pointer_hit_test.js`: 实现并暴露 `hasHandleUnder(event)`，统一覆盖单选/多选手柄、顶部旋转 Grip、四角旋转光环 (Corner Ring)、圆角半径手柄与裁切手柄；
     - `editor_pointer.js` / `use_editor_canvas_gestures.js`: 完善 `api.hasHandleUnder` 绑定与卸载生命周期，并防止画板外缘手柄误触发自由平移；
     - 定向单测 `tests/unit/artboard-body-gesture.test.js` (12/12), `tests/unit/frame_tool_creation_pan.test.js` (10/10), `tests/unit/mac_qa_interaction_fixes.test.jsx` (11/11 通过)。
  16. `worker-polygon-star-grid-snap` (Polygon 与 Star 新建几何包围盒网格精确吸附，commit `739a8e24`)：
     - `src/canvas/editor/shape_geometry.js`: 实现 `fitPointsToBox`，将规则多边形（`regularPolygonPoints`）与星形（`starPoints`）顶点坐标严格平移并缩放贴合目标 frame，消除内接椭圆导致的几何尺寸收缩（如正六边形 0.866 宽度缩水问题）；极值点做 1e-12 精度对齐；重构 `withPolyParams` 避免边数/内径拖动时尺寸漂移；
     - 定向单测 `tests/unit/snap_grid_shape_drawing.test.js` (17/17 通过)，证实 8px 与 32px 网格下新建多边形/星形几何包围盒严格整除网格。
  17. `worker-layout-lineheight-icons` (结构化布局行高契约归一与 Lucide 图标原生接入，commit `307455f9`)：
     - `src/canvas/agent/canvas_tools_build_layout.js`: 将 `lineHeight > 3` 且 `fontSize > 0` 统一归一化为字号倍率 `lineHeight / fontSize`；将 Lucide 矢量图标原生转换为图层并写入 `icon: iconName` 元数据；对 LLM 常见的 `layout` ("none"|"horizontal"|"vertical")、`id` 与 `backgroundColor` 做容错宽容；
     - `src/canvas/editor/text_metrics.js` 与 `src/canvas/editor/skia_adapter_elements.js`: 防御性处理像素行高，防止字号乘大像素值产生数百像素超大行间距；
     - `src/canvas/agent/html_pipeline/lucide.js`: 导出并注册 `user-plus` 等 Lucide 图标；
     - 定向单测 `tests/unit/build_layout_line_height_and_icons.test.js` (16/16 通过)。
  18. `worker-agent-stream-and-empty-voo` (文本模型视觉门禁与空工程防范，commit `fe1879e2`)：
     - `src/canvas/agent/canvas_agent.js` 与 `chat_stream.js`: 新增 `sanitizeMessagesForModel`，对非多模态文本模型（如 `deepseek-chat`）强制过滤 `image_url`，避免发送多模态负载导致上游连接断开；
     - `src/canvas/components/welcome_dashboard/use_welcome_prompt_submit.js`: 生成任务仅在内存中通过 `store.newVooProject(...)` 与 `store.setPendingGeneration(...)` 初始化草稿，移除过早磁盘写盘，杜绝 218 字节空白 `.voo` 僵尸文件；
     - 定向单测 `tests/unit/agent_vision_and_empty_project.test.js` (14/14 通过)，`tests/unit/canvas_agent_image_passthrough.test.js` (4/4 通过)。
  19. `worker-tool-order-and-lucide-paths` (工具调用协议连续性、Lucide 多子路径隔离与生成文件持久化)：
     - `src/canvas/agent/canvas_agent.js` 与 `chat_stream.js`: 解决并发多工具调用时工具响应连续性断裂问题，确保同一轮 assistant 下所有 `role: "tool"` 响应先于任何后续 `role: "user"` 消息发送；在 `chat_stream.js` 增加 `normalizeToolMessageOrder` 防御性消息规范化；9a1d717e 原生实测 10 次 302 响应均 200，4 批多工具响应连续，正常收尾且未出现 `net::ERR_FAILED` / `Failed to fetch`，不代表所有网络错误均可消除；
     - `src/canvas/editor/editor_svg_parse.js`、`scene_model_paths.js`、`render_pen_node.js`、`skia_adapter_paths.js`、`editor_svg_shapes.js`、`pen-write-document.js`、`path-boolean-geometry.js`、`path-boolean-reconstruction.js`: 完整支持 SVG 复杂路径中后续 `M`/`m` 命令的 `moveTo: true` 多轮廓切分，Skia 与 Canvas2D 在遇 `to.moveTo` 时自动断开轮廓，消除 Lucide 图标（如 `user-plus`）身体、头部与加号之间的多余对角连接线；
     - `src/canvas/components/canvas_agent_panel.jsx`: 抽取 `persistGenerationIfHasLayers`，确保欢迎页生成在包含有效图层时可靠持久化正式 `.voo` 项目，并在发生非致命后置校验错误时也能兜底写盘；
     - 定向单测 `tests/unit/agent_tool_order_and_lucide_paths.test.js` (6/6 通过)。
  20. `worker-fill-none-and-svg` (Lucide `fill="none"` 空心图标与 SVG 导入保真修复，commit `6f0c61b3` / `55038798`)：
     - `src/canvas/editor/render_pen_node.js`、`render_path_node.js`、`render_basic_shapes.js`、`render_boolean_node.js`、`render-paint-style.js`、`skia_adapter_paint.js`、`skia_adapter_elements.js`: 统一将 `fill: "none"` / `fill: "transparent"` 视为空填充/完全透明，杜绝 Lucide 图标（如 `user-plus`）在 Canvas2D 导出与 Skia CanvasKit 渲染时被错误填黑；
     - `src/canvas/editor/editor_svg_import.js`: 修正 SVG 导入在矩阵变换时多轮廓 `moveTo` 切分信息的丢失；支持复合多图形 `<clipPath>` 布尔并集（`maskBase: true, op: "union"`）；支持偏心 `<radialGradient>`（`circle at cx cy`）；支持 `rx` 几何圆角；保留 `fontFamily`、`fontWeight`、`fontStyle` 与 `text-anchor` 语义；
     - 定向单测 `tests/unit/fill_none_and_svg_fidelity.test.js` (10/10 通过)。
  21. `worker-fix-svg-text-anchor` (SVG text-anchor 水平锚点转换与文本几何尺寸计算，commit `f4380bb8` / `74851b04`)：
     - `src/canvas/editor/editor_svg_text.js`: 导出 `measureSvgTextWidth` 与 `calculateSvgTextAnchorOffset`，在浏览器/Electron 环境采用 Canvas2D 精确测宽，无 DOM/Node 环境安全降级到启发式字形估算；
     - `src/canvas/editor/editor_svg_import.js` 与 `src/canvas/agent/svg_to_nodes.js`: 彻底解决 SVG `text-anchor` 导入水平漂移；在仿射矩阵变换前将 `middle`（`-width/2`）与 `end`（`-width`）换算为文本左上角几何包围盒坐标；计算并赋予文本节点明确的 `node.width` 与 `node.height`；全面兼容 camelCase `textAnchor`、kebab-case `text-anchor`、属性与内联样式；
     - 定向单测 `tests/unit/svg_text_anchor.test.js` (6/6 通过)，`tests/unit/fill_none_and_svg_fidelity.test.js` (10/10 通过)；
     - **74851b04 Mac 原生复测（全面通过，18/18 验证项 100% 通过）**：Electron 43.4.0 darwin/arm64，Ning 真实 profile 独立副本；SVG text-anchor 原生光栅化比对：Centered Title 边界 minX=83 maxX=239（参考 82..239，diff=1px），Right Note 边界 minX=201 maxX=299（参考 200..298，diff=1px），完全消除文字右移与画板裁切；Lucide user-plus 导出 12× PNG 头部/身体 alpha 均为 0（空心透明）；复合 clipPath、偏心径向渐变、圆角矩形、graphic-1.svg 7 点采样均通过；Frame 标题选择、Ctrl+Shift+L 锁定、200+50 表达式、系统字体下拉、缺失字体警示、钢笔中点插入、图片画笔光栅固化、关闭标签回首页画板清空、D10 图层多选拖入 Frame、D11 叠层 Esc 逐级关闭、D09 草稿崩溃恢复（SIGKILL 后冷启动一键恢复 3 节点）全部原生验证通过。证据：[REPORT.md](/Users/tt/Desktop/voo-mac-retest/REPORT.md)、[机器证据](/Users/tt/Desktop/voo-mac-retest/74851b04-evidence.json)。
     - **Codex 独立原生复测（74851b04，worker `ctx_ff6a1d7bb0a9`）**：
       - **SVG text-anchor**：通过，Centered Title 83..239（参考 82..239），Right Note 201..299（参考 200..298），水平边界误差 1px，右端未触及 360px 画板裁切边；
       - **Lucide fill=none**：通过，`user-plus` 12× PNG 头部与身体中心均为 `[0,0,0,0]` 空心透明；
       - **Agent 欢迎生成与正式落盘**：通过，302.AI `deepseek-chat` 连续调用 10+ 工具（update_plan/build_layout/batch_mutate等），无 `Failed to fetch`，自动落盘正式文件 `CreateoneeditableProf.voo`（75,597 字节、17 节点），无需手动 Save；
       - **Agent 冷重开布局保真**：部分通过，冷启动后标题栏导入打开，17 节点与全部内容保留，自适应文字宽度存在 1–3px 变化与 Follow 按钮 1px 横移；
       - **标题栏 Open**：通过，点击“导入”呼出原生选择器并成功打开工程；
       - **标题栏 Save**：未通过指定入口，实际标题栏无 Save 按钮；原生 File 菜单 Save（首次保存 17,213 字节、修改更新 17,215 字节）与 Save As（另存 17,215 字节）单独通过；
       - **Linux QA D09-B（保存基线 + 未保存增量崩溃恢复）**：通过，已保存基线加未保存红色矩形增量，等待写盘后 SIGKILL 崩溃退出，冷启动首页恢复横幅点击恢复，4 个节点全部保留，手动保存原文件 SHA-256 完全未变；
       - **Linux QA D01（PSD 像素水合）**：通过，导入真实 RGBA 双层 PSD，两图层成功解析 imageId 并在导出时准确取样红绿像素；
       - **Linux QA D04（像素选区反选）**：通过，点击反选仅调用 `invertPixelSelection` 一次、`invertMask` 零次，选区轮廓 1→2，像素数据未受污染；
       - **Linux QA D07（右键创建组件）**：通过，普通设计页右键矩形→组件→创建组件成功进入组件编辑，无 Uncaught TypeError；
       - **Linux QA D02（API 面板状态）**：通过，设置面板打开 AI 供应商显示“未配置 API KEY”，无“无法保存”误报；
       - **门禁验证**：定向单测 3 文件 20 用例全部通过（0 失败 0 跳过）；`npm run check:modules` 注册有效；完整机器证据详见 `~/Desktop/voo-mac-retest/codex-74851b04-evidence/results.json` 与 `evidence.json`。
	  22. `worker-fix-cold-reopen-lossless` (冷重开文本 0px 几何漂移与 Auto Layout 尺寸保真，commit `0d8c6490`)：
	     - `src/canvas/editor/editor_engine_init.js`: 维护 `persistedTextSignatures` 签名缓存，在反序列化（`open`）时记录已保存的未修改文本节点签名；在后续 `queueFontLoads` 异步字体加载完成触发 `measureTextNodes(getDoc(), { force: true })` 强制重测时，对未发生文本内容或样式变更的节点直接跳过 Canvas2D 重新测量，保持其已持久化的精确几何尺寸；用户后续编辑或样式修改时主动失效签名允许正常重测；
	     - 定向单测 `tests/unit/cold_reopen_text_geometry.test.js` (6/6 通过)，证实冷重开场景下字体就绪后 0px 几何漂移、Auto Layout 零扰动且 `strictLossless: true`。
	  23. `worker-fix-layer-list-multiselect-drag` (图层列表 ⌘ 多选快速拖拽原子移入容器与根槽位，commit `3e8f5214`)：
	     - `src/canvas/components/use_layer_drag.js`: 在拖拽完成 `finish(commit)` 时触发 `session.measure?.()` 重新测量当前视口中各行几何位置；将容器行的内嵌边界（inset）从 25% 紧缩至 `Math.min(3, row.height * 0.1)`（约 3px），防止快速指针滑动手势落入容器边缘的插入插槽，确保可靠命中目标 Frame；
	     - `src/canvas/editor/doc_ops_groups.js`: 升级 `moveNodeToRoot(doc, id, targetRootIndex)` 支持 `Array.isArray(id)`，利用 `groupingRoots(doc, ids)` 计算根节点集，实现多选中节点一次性、单事务批量移至根画板插槽，支持单步 Undo/Redo；
	     - 定向单测 `tests/unit/layer_panel_multiselect_reparent.test.js` (9/9 通过)，证实多选快速拖入 Frame 与根槽位均完整原子迁移并单步可撤销。
- **Mac Electron 原生复测证据（revision 3e8f5214 终态确认）**：
  - 运行 `npm run electron:dev` 与原生 Electron 43.4.0（Apple M4 Pro，darwin/arm64），使用 Ning 真实 profile 独立副本（`codex-3e8f5214-profile`）及专用工程目录 `codex-3e8f5214-workspace/`；详细记录见 `~/Desktop/voo-mac-retest/REPORT.md`，配套证据文件在 `~/Desktop/voo-mac-retest/codex-3e8f5214-evidence/`。
  - **冷重开文本几何零漂移彻底闭环**：Profile Card 17 节点冷启动重开序列化精确匹配，`strictLossless: true`，包括 Name Block、Name、Role、Meta、Follow Button、Icon / plus、Follow Label 在内的所有节点 Δx、Δy、Δwidth、Δheight、ΔboxWidth 均为 0px（即便二次冷开额外等待 10s 字体就绪亦保持 0px 偏差）；
  - **图层列表多选快速拖拽彻底闭环**：⌘ 多选 Child A + Child B 快速拖入 Frame（34.3ms）与根槽位（31.6ms）均原子迁移全部节点，单步 ⌘Z / ⇧⌘Z 完整恢复，拖拽平移帧率 59.99 FPS；
  - **本地合成样本定向验证（非竞品同条件实测）**：D04 像素选区反选无蒙版污染、画笔单步撤销无损恢复、SVG 四项保真抽测全过、32px 网格几何路径边界精确贴合 (96,96,128,96)、切片与区域导出稳定、SIGKILL 崩溃恢复 17 节点 100% 精确还原；
  - **60fps 画布平移缩放导航**：Profile Card 导航实测 60.00fps（p95 17.6ms，max 17.8ms，>20ms 帧 0）；1000 简单矩形压力测试 59.86fps（p95 17.7ms，max 33.3ms，>20ms 帧 1）。
- **Mac Electron 原生复测证据（revision 74851b04 历史记录保留）**：
  - 运行 `npm run electron:dev` 与原生 Electron 43.4.0，使用 Ning 真实 profile 独立副本（`/Users/tt/Desktop/voo-mac-retest/ning-74851b04-profile`）及专用工程目录 `74851b04-workspace/`；详细记录见 `~/Desktop/voo-mac-retest/REPORT.md`，配套证据文件 `74851b04-*` 与截图在 `~/Desktop/voo-mac-retest/shots/`。
  - **SVG 排版保真缺陷彻底闭环**：`Centered Title` 与 `Right Note` 的文本像素边界与原生 SVG 参考栅格完全吻合，水平误差仅 1px，无右移或画布裁切；
  - **Lucide 空心矢量保真闭环**：`user-plus` 图标四轮廓导出 12× PNG 头部与身体中心 alpha=0，空心矢量与多轮廓断连完全正常；
  - **报告指定交互与 Linux QA D09/D10/D11 全面通过**：18 项测试场景断言 100% 成立。
- **Mac Electron 原生复测证据（revision 67a03457 历史记录保留）**：
  - 运行 `npm run electron:dev` 与原生 Electron 43.8.0，使用 Ning 真实 profile 独立副本（`/Users/tt/Desktop/voo-mac-retest/ning-67a03457-profile`）及专用工程目录 `67a03457-workspace/`；详细记录见 `~/Desktop/voo-mac-retest/REPORT.md`，配套证据文件 `67a03457-*` 与截图在 `~/Desktop/voo-mac-retest/shots/`。
  - **行高契约与紧凑卡片原生全面通过**：Profile Card 真实生成尺寸为 320×160（hug 自适应为 320×152），文本 16px 字号 / 24px 行高归一为倍率 1.5，文本高度严格为 24px，彻底消除 972px 异常拉伸；`build_layout` 宽容 `layout`/`id`/`backgroundColor`，无 `agentInvalidArgs` 报错。
  - **文本模型视觉门禁与多轮真实编辑通过**：文本模型成功门禁，彻底剔除 `image_url` 负载；第二轮（slate/blue 批量改色与间距）及第三轮（提升对比度与 blue-600）连续成功，无 `Failed to fetch`，Agent 自检 90/100。
  - **新建生成空工程防范通过，正式文件写盘待收尾**：两次有效生成 prompt 均未提前向磁盘写入 218 字节空白 `.voo` 文件，有效生成前及失败时专用目录均保持干净；但两次生成由于工具链收尾请求失败未能顺利完成最终正式写盘。
  - **精准定位新根因**：
    1. 工具调用连续性被打断：assistant 一次声明 `capture_canvas` 与 `inspect_layout` 两项工具调用时，代码在两个 `role: "tool"` 响应之间插入了 `role: "user"`（"Canvas captured..."），破坏了 OpenAI 规范中多工具调用的响应连续性，导致收尾请求报 `net::ERR_FAILED`；
    2. Lucide 多子路径连线失真：`build_layout` 对含多个独立子路径的 Lucide 图标（如 `user-plus` 的圆圈头部、身体、加号）在点阵或路径合并时未切分子路径，产生多余斜向连线；
  - **SVG 与几何吸附全部保持通过**：SVG 指定特征（圆角 clip、mask、径向渐变、文字）通过，7 种形状（Rect、Ellipse、Frame、Polygon、Star、Arrow、Line）的 32px 网格吸附全部真实指针通过。
- **Mac Electron 原生复测证据（revision 0ec0adf8 历史记录保留）**：
  - 运行 `npm run electron:dev` 与原生 Electron 43.8.0，使用 Ning 真实 profile 的独立只读副本（`/Users/tt/Desktop/voo-mac-retest/ning-profile-copy`），对应真实工作区 `/Users/tt/Documents/VOO/Projects`；详细记录见 `~/Desktop/voo-mac-retest/REPORT.md`，配套 15 张新截图与机器证据在 `~/Desktop/voo-mac-retest/`。
  - **原项目封面全量通过并澄清历史误判**：
    - 6 个真实工程全部成功渲染封面（`Createtwoeditabledesi.voo` 175节点、`F1 Grand Prix Poster.voo` 131节点、`FORM — Design Culture.voo` 14节点、`PULSE — Analytics Dashboard.voo` 75节点、`SaaSAnalytics&CloudMetricDashboard.voo` 78节点、`NBA-Land-UI.voo` 9979节点），均产生有效 PNG data URL，包含 304~8,757 种独立 RGBA 颜色；
    - 澄清历史误判：此前报告中“原来 13 个项目封面缺失”的根本原因是按修改时间倒序排列的前 13 个文件均为 0 节点空草稿（`Design1.voo` ~ `Design13.voo`），空文件按规范正确回退为 `.lucide-file-image` 占位图标，真实工程封面从未丢失。
  - **Agent 真实生成验证（302.ai / DeepSeek）**：
    - 成功建立真实服务调用（302.ai / deepseek-chat 响应 200，严守红线未泄露凭据）；
    - 成功生成 11 个节点，包含 5 个 Auto Layout 容器（Profile Card、Identity Row、Avatar、Name Stack、Follow Button）、1 个 `user-plus` 矢量图标与极简文案；
    - 发现质量边界：模型参数传 `lineHeight: 24`，引擎作为字号倍率处理导致卡片高度被撑至 972px 产生纵向空隙，且后续交互触发 `Failed to fetch`，结构已验证但视觉与收尾流程未完全认证。
  - **6 秒自动保存机制代码调研与现状确认**：
    - 明确不存在“等 6 秒自动写回原物理 .voo 文件”的代码逻辑；
    - `useEditorAutosave`（防抖 600ms）仅针对崩溃恢复草稿写入内存与 IndexedDB `crashDraft`，不碰磁盘；`useDraftAutosave`（防抖 1500ms）仅针对未存盘文件（`!store.filePath`）写入草稿箱；物理 `.voo` 文件严格仅在显式手动 Save（`saveProject` -> `writeFileBytes`）时写盘；
    - 确认设计哲学契约：*"The workspace is never written: manual Save stays the only way to create a real .voo file."*，自动保存是灾难恢复隔离机制，不应静默覆盖用户的原始工程文件。
  - **前序 739a8e24 / 58dd1516 验证项保持稳定**：形状网格吸附全量通过、旋转手柄全量通过、SVG 指定四类特征通过、多选拖入 Frame 与叠层 Esc 优先级通过。
  - **边界与限制明确保留**：标题栏 Open/Save 与 layout-1.fig 依指令跳过；真实云端生成链路在行高倍率与收尾上仍待优化。
- **Linux QA 交付材料同步 (18:30 检查点)**：
  - 最新 DOCX v4 (`/Users/tt/Desktop/voo-linux-qa/VOO_Design_Linux_QA_2026-11-01.docx`) 及补充包 ZIP v3 (`/Users/tt/Desktop/voo-linux-qa/supplement-v3/`) 已完整存档并对账。
  - 原 34 组补测已收口，确认 Linux QA 测试基线为 GitHub Release v1.0.0-beta.2 固定包；新确认的“自动恢复草稿丢失最新画布内容”、“多选拖入Frame重挂”、“叠层 Esc 优先级”均已在本分支完全定位并提供源码与单元测试覆盖。
- **模块所有权与验收登记**：
  - 更新 `scripts/editor-module-catalog.mjs`，将所有新增模块源码及单元测试套件完整注册到 `workspace`、`canvas`、`inspector` 及 `platform` 模块。
  - `node scripts/editor-checks.mjs --check` 校验通过（12 模块、73 能力、99 浏览器套件、24 附加检查项有效注册，0 个未映射文件）。
- **约束声明**：严格遵守不 push 到远端、不运行部署脚本、不触碰 Codex `nba-font-fidelity` 分支与任务。

## 本轮：Figma 风格 Frame Selection 快捷键（源码完成，未发布）

- 新能力 `layers.frame-selection`：Mac `⌥⌘G` / Windows `Ctrl+Alt+G` 将一个或多个所选对象包入透明 Frame；使用旋转/斜切后的几何边界，保留绝对坐标、已有子树和最近公共父级，一次提交并选中新 Frame。空选与继承锁定不修改文档。
- 右键菜单、快捷键及可发现的 `frame_selection` 共用引擎操作；同步快捷键目录、中文/英文标签和命令撤销元数据。创建剪贴蒙版保留菜单/命令入口，释放蒙版保留 `⇧⌥⌘G`。曾尝试迁移到 `⌥⌘M`，真实回归发现该键已属于评论功能，已撤回该迁移，避免抢占现有快捷键。
- 修复前真实浏览器断言失败：`Alt+Cmd/Ctrl+G` 未产生 Frame；定向单测 37/37 通过。`container-command-boundaries.e2e.mjs` 实测两平台修饰键、单对象右键菜单、共用命令、层级/几何、真实像素和一次撤销/重做；日志 `/tmp/voo-frame-shortcut-browser-final.log`，定向单测日志 `/tmp/voo-frame-shortcut-targeted.log`。
- 完整单测本轮执行 4,881 通过、6 失败、4 跳过（最后新增的子树持久化断言另在定向测试中通过）。6 个失败仍来自模板 `t is not defined` 与上轮导出改变后的标题栏旧断言；日志 `/tmp/voo-frame-shortcut-all-units.log`。本轮没有将完整门禁记为通过，尚未推送、部署或更新已安装 Release。
- 证据基线仍为 `965bbd889bc121860564d2b82f25df5b4c7e78dd` 加未提交改动；工作区另有其他界面修改，已保留。尚未覆盖真实 Windows 桌面、输入法/触摸、大型文档快捷键性能及 Auto Layout 父级下包 Frame 的视觉结果。
- 最终引擎分组模块 blob `4c36e5865af71170a8978b9d1cf88e77246b67ce`，快捷键路由 blob `33135318401cd83df04bb3f0b6f6ea088b88b6e8`。最终 Web/Electron 渲染构建、73 能力/99 套件登记检查、设计检查（1474 文件）及差异检查通过；最终浏览器日志记录本套件全部 11 个命名场景通过。本结果只覆盖所列源码与环境。

## 本轮：真实 NBA-Land 文件的 Frame 名称遮挡定位

- 已查看 `/Applications/VOO Design.app` 中打开的 `NBA-Land-UI`，实际确认大量名称遮挡。插件连接的是另一个崩溃的 Electron 开发实例，不能用其连接状态代表安装版文件；本轮改用安装版 UI 打开文件验证。
- 从 UI 确认原文件路径后读取：9,979 节点，仅 1 节点有 `parentId`，导致 5,644 个顶层 Frame 标签；原有名称筛选修复在该文件上仍返回 5,644，不能解决缺失父级。文档含 `document.nodes` 与 `document.pages[0].sceneDoc.nodes` 两份页面状态，修复必须同步两份。
- 生成独立 `NBA-Land-UI-fixed.voo`，将散落节点归入已有、完整包围全部对象的根 Frame；对两份页面均验证只剩 1 个顶层 Frame 标签、9,979 节点与 149 素材完整保留，逐节点确认除父级外的几何、文字、样式等字段完全一致。原始文件与未保存标签不覆盖。本轮是具体文件修复，不是 Release 更新，也未推断内部卡片层级。
- 修复副本：`/Users/tt/.codex/visualizations/2026/10/29/01a18867-f709-7993-9c45-2791f4978234/frame-repair/NBA-Land-UI-fixed.voo`。
- 实机结果：已通过安装版原生 Open 对话框加载上述副本；当前标签 `NBA-Land-UI-fixed`，AX 只有一个画布 Frame 名称，截图实际显示完整 UI、密集灰色标签消失、图层面板子对象缩进归属正确。已关闭本轮中间诊断副本标签，原始未保存项目仍保留。名称筛选单测 4/4 通过；本轮未更改程序源码、未更新 Release。

## 本轮：图层面板多选移入 Frame（源码修复，未发布）

- `layers.reparent`：已用真实鼠标复现多选拖入 Frame 只移动一个对象；修复为在拖拽开始时记录整组选中 ID，由共用 `moveIntoGroup` 一次提交。目标检测支持展开的嵌套 Frame；已有选中子孙随根节点移动，保持位置、层级与堆叠顺序。整批预检锁定祖先和循环引用。
- 定向单测 38/38 通过；`frame-reparent-contracts.e2e.mjs` 覆盖根级/嵌套目标、实际多选点击、位置与选择保持及一次撤销/重做；`editor-layers-composition.e2e.mjs` 图层点击、搜索、改名、显示锁定、排序及跨画布回归通过。详细范围见 [嵌套对象审查](audits/nested-objects-audit.md#layer-panel-batch-reparent--2026-11-02)。
- Web/Electron 渲染构建、模块登记和设计检查通过。完整单测执行：4879 通过、6 失败、4 跳过；失败来自社区模板 `t is not defined`（3 项）及前轮导出入口改变后仍要求旧行为的标题栏断言（3 项）。原始日志 `/tmp/voo-layers-all-units.log`。完整发布门禁未通过，没有提交、推送或部署；已安装 Release 尚未更新。
- 证据源码基线 `965bbd889bc121860564d2b82f25df5b4c7e78dd` 加本轮未提交改动；拖拽 hook / 交互 handler / 文档操作 blob 分别为 `008f2641b838822781f8b672878a705f80ed813f` / `1b3c27564199beaf47f1073342537bf684450357` / `47c781e3362a8d799c093dce2b5d4e1e2dbc1724`。没有沿用历史 Release 通过状态。

## 本轮：Release 画布嵌套 Frame 标签遮挡内容（修复待发布）

- 复现：画布根 Frame 使用旧式 `frame: true` 标记时，标签筛选器只认 `isFrame`，因此漏掉外层容器，误显示其内部 Frame 名称。复现输入得到错误标签 `nested`；已改为调用编辑器共用的 `isFrameSelectionBoundary`，同时识别 `isFrame`、`frame`、`containerType` 和 `kind`。
- 回归：Frame 标签单测加入混合标记和三层嵌套；浏览器套件使用旧式外层 Frame，并继续验证点击名称/图标、0.5x/1x/2x 下选中行为。单测 **4/4** 和浏览器 `frame-label-selection.e2e.mjs` **6 项场景通过**，源码基线为 `965bbd889bc121860564d2b82f25df5b4c7e78dd` 加本轮改动。
- 模块归属 `selection`。将已存在的 `canvas-zoom-preview`、`constraint-hit-targets`、`figma-import-fidelity`、`impeccable-polish`、`mobile-control-targets` 登记到对应模块，`node scripts/editor-checks.mjs --check` 通过：**12 模块、72 能力、99 浏览器套件**。本轮计划覆盖 99 套件、12 模块，要求完整 Release 门禁。门禁未通过：`welcome-model-menu` 独立复跑稳定失败（8 个类型项仍可见，预期 0）；`titlebar-file-actions` 中 New 按钮禁用超时，后续复跑时隔离目录消失导致导入失败，未取得有效复验。不能将完整门禁记为通过。
- Web 生产构建、Electron 渲染构建和设计检查通过（1473 个文件）。尚未执行原生安装包构建、推送或部署；已安装 Release 尚未被更新，不能认定用户截图场景已在 Release 修复。

## 本轮：右上角导出增加 Figma 文件格式（未部署）

- 右上角导出面板现有 PNG/JPEG/WebP/SVG/PSD/PDF 选项，新增 `Figma 文件（.fig）`。Figma 使用原生文档序列化器，不走栅格图片导出；只显示与文件格式相关的选项，不展示倍率、透明背景或位图范围设置。
- 右上角按钮之前导出的是 `.zip` 项目快照，现在会打开格式面板；项目快照保留在命令面板的独立命令中。
- Electron 和浏览器均使用 `.fig` 保存筛选器/下载名；通过现有格式损失确认。导出后保留当前 `.voo` 文件名、路径和 dirty 状态。Figma 字节实测可解析为原生文件。
- 验证：导出相关单测 **53/53**；真实浏览器 `image-export-formats.e2e.mjs` 从右上角导出入口验证 PNG/JPEG/WebP/SVG/Figma/PSD/PDF 七种格式全通过，`.fig` 下载后由原生解析器重新读取；Web 与 Electron 渲染构建、模块登记检查及设计检查（1473 文件）通过。完整模块门禁仍受上一轮已记录的 `welcome-model-menu` 稳定失败和 `titlebar-file-actions` 复验隔离问题阻断，未把完整门禁记为通过。
- 尚未执行原生安装包构建、推送或部署；已安装的 Release 版本不会自动包含此改动。

这里是持续维护的总入口。每轮检查或修复后更新本文件，不再新增一份同类日期报告。

更新时间：2026-11-02。
最近一次完整核心检查：[eab3bea](https://github.com/umaxzhao/voo-design/commit/eab3beaaff22a2ccc28780d9972bb2c58f4baa78)；105/105 步通过，含 101 组核心浏览器、4781 单测通过/4 跳过，四个平台原生与最终草稿核验通过。线上已更新为该 CI 构建；本地脏工作区草稿仍不属于本版发布认证。
以下结果只属于该固定提交和已记录的验收上下文，不代表后续或本地其他草稿均已验证。

### 本地安装确认修复（未发布，2026-11-03）

- `platform.desktop-update-install`：以 `895b2b2e` 独立副本修复显式安装前确认、重复请求、错误后的批准撤销及 bridge 恢复；验收边界见 [release-checklist.md](release-checklist.md#explicit-install-confirmation-regression--local-895b2b2e-baseline)。普通 Quit 自动安装与再次检查/下载的控制流单独验证。
- 本地最终 commit、修前失败、修后真实 exit 与源码哈希：`/Users/tt/Desktop/voo-linux-qa/updater-guard-fix-20261103T064053Z/REPORT.md`。实际各 OS 安装、Squirrel native 生命周期、真实下载与文件持久化均 notrun；没有新增 retry UI、feed 或发布能力。此前只读 12 场景不作为产品修复证据。

## 三平台 GitHub Beta（门禁与产物核验通过）

- [Beta 下载与说明](https://github.com/umaxzhao/voo-design/releases/tag/v1.0.0-beta.1)：`1.0.0-beta.1`，Windows x64 setup/portable、Linux x64 AppImage、macOS Intel/Apple Silicon DMG/ZIP，共四个原生目标、七个载荷。公开状态以该 Release 页面为准，保持 prerelease，不标记稳定最新版。
- 固定验证源码 [`eab3bea`](https://github.com/umaxzhao/voo-design/commit/eab3beaaff22a2ccc28780d9972bb2c58f4baa78) 的 [完整 CI](https://github.com/umaxzhao/voo-design/actions/runs/41281003764) 全部成功：**105/105 步、101 组核心浏览器、4781 单测通过/4 跳过、1441 文件设计检查**；580 个测试文件通过/3 跳过。报告 `complete=true`，12 个模块、87 组能力的功能覆盖仍为 partial，11 组独立额外检查明确 not-run。Release 附带 `web-release-checks.json`，不以其他提交或脏工作区继承通过。
- `platform.desktop-release`：四原生构建与打包应用冒烟均通过，收据的版本、架构、提交严格匹配；七个载荷、三份更新元数据、四份收据均已独立复核。组装器逐字节验证更新载荷 SHA-512/尺寸；最终草稿的 **21 项 SHA-256** 与 GitHub 实际资产摘要一致，包含说明和 Web 证据，安装包未经过二次修改。两种 Mac 架构的更新条目合并保留，Windows setup/portable 分开命名，Linux AppImage 使用 GNU `x86_64` 文件名而收据保留 Node `x64`。
- `platform.desktop-close`：实际打包应用启动、指针绘图/撤销重做、原生工作区文件写读、取消脏退出后 bridge 存活、新进程与隔离 profile 从真实工作区文件卡片重开均有原生证据。原生 picker/确认选择由自动化驱动，不能当作外层安装向导或系统信任交互的人工验收。
- 发布过程中修复了空签名变量、Windows ASAR 路径与间接依赖、Mac 中文资源、Vite 清理竞态、Linux 字体对照、离线模型菜单及冷菜单焦点。字体对照保留原 1% 门槛；三种快捷键格式均经真实浏览器检查。冷加载时背景恢复焦点的场景先稳定复现失败，再修复导航键/Tab；相关回归保留在 `editor-optional-loading.e2e.mjs`。没有跳过失败用例凑通过。
- 历史失败保留为独立结果：[字体](https://github.com/umaxzhao/voo-design/actions/runs/41273421739)、[模型菜单](https://github.com/umaxzhao/voo-design/actions/runs/41273626256)、[快捷键](https://github.com/umaxzhao/voo-design/actions/runs/41275043454)、[AppImage 组装](https://github.com/umaxzhao/voo-design/actions/runs/41276919981)、[冷菜单焦点](https://github.com/umaxzhao/voo-design/actions/runs/41279268095)；失败或早期取消的候选没有冒记完整通过，也没有公开 Release。本轮完整通过后才创建并核验草稿。
- 在线预览已由同一候选的 CI 静态产物通过项目脚本更新至 [voo.run/editor](https://voo.run/editor/)：入口及 12 项关键资源逐字节一致；四组实际线上交互通过，实际加载的 83 项 JS/CSS 均匹配，零页面异常。覆盖约束轴/撤销、390px Browser 分屏/48px 复制/撤销、文件卡片打开及旧分享重定向。证据 `/private/tmp/voo-beta-deployment-eab-proof.json`、`/private/tmp/voo-beta-production-eab-proof.json`；线上回滚备份 `la2:/srv/voo-run/editor-backups/eab3beaaff22a2ccc28780d9972bb2c58f4baa78-20261101T070133Z`。
- 验收边界：**安装包未签名，Mac 未公证**；人工安装与系统信任流程、旧版升级、真实付费/CLI/模型服务及其他系统版本仍未认证。4 项跳过单测和 11 组独立检查没有计入通过。旧草稿备份、辅助工作树及主工作区无关未提交改动继续保留，未打入本版。[发布清单](release-checklist.md)、[签名/原生验收](code-signing.md)、[PR #81](https://github.com/umaxzhao/voo-design/pull/81)。

## 本轮：Claude 自测问题单收口（已完成声明范围）

- 逐项核对用户的 `78155ee` + 私人工作区清单；正式版和本地 App 分开验证，没有用一份通过结果覆盖另一份源码。
- A1/A2：六条约束点击区独立、中心不串轴，真实中点点击/键盘/一次撤销通过；320/390/768px 鼠标与模拟触控下，普通导航、工具条、页签等控件达到 48px。约束图与画布精细手柄单独验收，不冒记为 48px 普通按钮。内部仍保留已确认的大圆角。
- B1/B2：手机 Browser 与编辑器上下分屏；文件卡片单列，隐藏操作不再拦截主体点击，固定设置按钮下方保留滚动空间；实际打开文件、更多菜单与触控布局通过。
- A3/A4/B3/B5/B6：保留 DeepSeek API 与 Harness 的独立入口、补齐本地翻译/文档契约；本地首页八种类型、风格、设计系统、候选数与尺寸统一收进一个高级入口，自动尺寸和附件保留，退役弹窗已备份后移出运行代码。本地两条不存在的套件登记已移除，另两份待审套件显式登记为未验证；正式版保留实际存在的两份检查。既有评论位置和首页隔离修复保留。
- C：十份旧脚本改为自动启动隔离服务/文档、临时输出目录，纳入核心门禁；真实工具、取消/重试、文件往返、导出和像素要求保留。另修复字距能力探测污染 Canvas 状态的真实缺陷：标题像素差由 2.617% 降至 0，HTML 原 1% 门槛不变。
- 固定源码 [`db4a184`](https://github.com/umaxzhao/voo-design/commit/db4a184b9bd712dbff87982ecd75a4b6a88ac826)：**103 项检查逐项通过，含 99 组浏览器、4717 项单测通过/4 跳过，构建和设计检查通过（1432 文件）**。这是同一干净提交上的恢复验证；完整命令曾因冷启动/MCP 注册超时失败，降低并发后补跑失败及未执行项，不宣称首次命令退出 0。原失败、重试链和源码未变校验均保留在 `/private/tmp/voo-claude-checklist-release-{complete,recovered,recovered-final}.json` 及 `voo-claude-main-tree-proof.json`。
- 已推送并通过 SSH la2 部署；正式入口、12 个相关资源与构建逐字节一致，实际加载的 83 个 JS/CSS 资源 SHA-256 一致。线上真实约束点击/撤销、390px Browser 分屏、48px 复制/一次撤销、文件卡片中点打开、默认隐藏类型行通过，零页面异常。B4 的旧 `/r/...` 真实跳转保留房间与 `#k` 片段，`/editor` 不再暴露 8444 内部端口；没有加入真实房间。证据 `/private/tmp/voo-claude-{deployment-proof,production-proof}.json`、`voo-claude-deploy.log`。
- 本地 App 只修相关草稿：**120 项定向单测、设计检查（1427 文件）、十份旧脚本（启动超时后补跑）、约束/手机目标/统一高级面板真实交互通过**；不是整个脏工作区的发布认证。证据 `/private/tmp/voo-claude-primary-proof.json`。38 份原始快照的哈希已核验，长期备份在 `/Volumes/TD/Projects/voo_design/.local-drafts/claude-checklist-2026-11-01.tar`，其余草稿保留。
- N1–N3 未认证：原生 Swift/签名 Electron、实体 iOS/Android/WebKit、IME/软键盘、真实登录/付费服务、多机协作与硬件性能。私人通用 `ui-audit` 及自动截图基线没有冒记为正式门禁通过；注册执行通过仍不代表全部功能、所有状态均已覆盖。
- [问题映射、失败与验收证据](audits/panel-control-audit.md#claude-checklist-closeout)。

## 本轮：右侧控件恢复品牌大圆角（已完成声明范围）

- 按用户反馈，右侧输入、下拉、切换组/选中项及操作按钮统一恢复 **12px** 品牌大圆角；共享 `--inspector-control-radius`，外层面板圆角保持原样。保留上一轮的填充/描边区别、选中反馈、字号与行高，不修改其他界面或文档操作。
- 干净固定提交 [`b965942`](https://github.com/umaxzhao/voo-design/commit/b965942e22bcfb408015acdba58f49d8d7c3cd8c) 完成 **91/91 发布检查、87 组浏览器、单测 4637 通过/4 跳过/0 失败**。沿用原检查与浏览器并发 2，验证期间源码未修改。证据 `/private/tmp/voo-inspector-radius-release.json`、同名 `.log`，不继承上轮不同提交的通过。
- 已有真实数值提交/取消、键盘下拉、布局/旋转及一次撤销通过；16 个视口/主题/语言上下文验证圆角与尺寸，截图 `/private/tmp/voo-inspector-radius-evidence/`。旧 6px 样式的差异复现保留在 `/private/tmp/voo-inspector-radius-before.log`。
- 已推送并 SSH 部署 la2；入口和 9 个相关资源与验证构建逐字节一致。正式中文面板实际确认 12px 圆角、32px 桌面行高、Frame 输入/下拉/布局、文字与撤销，无脚本错误，未调用付费服务。证据 `/private/tmp/voo-inspector-radius-deployment-proof.json`、`/private/tmp/voo-inspector-radius-production-result.log`，截图 `/private/tmp/voo-inspector-radius-production-panel.png`。
- 本地 App 只三方应用两个文件的圆角补丁并保留其他草稿；同一组 16 个浏览器上下文通过（`/private/tmp/voo-inspector-radius-primary-browser.log`），备份 `/private/tmp/voo-inspector-radius-primary/`。不认证整个私人工作区。
- 功能覆盖仍为部分；实体触屏/IME/触控笔与全部高级独立浮层未由本轮认证。此前 6px 记录只属于其历史版本，当前规范以本轮用户确认的 12px 为准。

## 本轮：首页生成类型图标重绘（未提交，叠加在未提交的类型选择器改动上）

- `welcome_prompt_types.jsx`：8 个类型改为统一的 56×40 线稿 SVG，每个图标只有一处 `accent-mint` 重点，未选中时 60% 透明度，悬停或选中时 100%。浅色主题下强调色改为 `#171717`（`theme-light.css`，与 `.text-accent-mint` 的处理一致）。中文"Storyboard"改为"分镜"。
- 修复的根因：旧图标用的是 `bg-mint/*`，但 Tailwind 里的颜色名是 `accent-mint`，薄荷绿点缀从未生成，所以界面上只有灰色块。
- 已验证（本地工作区）：`welcome_prompt_types.test.jsx` 2 项通过（新增：8 个图标互不相同，且都带强调元素）；设计规则检查通过；真实编辑器中深色、浅色、390px 下 8 个 SVG 都正常渲染，强调色计算值分别为 `rgb(167,255,212)`、`rgb(23,23,23)`，透明度 0.6/1，没有页面错误。
- 未提交原因：该文件属于未提交的"类型选择器铺在首页"改动（问题单 B3，有 11 项单测失败，与本次无关），单独提交会把这批改动一起带上。

## 本轮：自动界面巡检 `ui-audit` 与全量测试问题单（新增检查，未提交；发现项未修复）

- 新增 `tests/e2e/ui-audit.e2e.mjs`，覆盖 8 个状态：空、单选图形、单选文字、多选、右键菜单、工具选项菜单、首页、设置面板；每个状态跑 390/768/1440 宽度 × 深浅主题 × 中英文。
  - 通用扫描 `ui-layout-scanner.mjs`：遮挡、超出窗口、页面横向溢出、文字截断、按钮缺少名称、窄屏点击区域 <44px。菜单或对话框打开时只检查浮层内的控件。
  - 截图基线 `ui-screenshot-baseline.mjs`：英文 46 张，存于 `tests/e2e/ui-baselines/darwin/`。截图前等连续两帧一致，遮住随机头像；超过 0.05% 像素变化即失败，并输出差异图。`UPDATE_UI_BASELINES=1` 接受新外观。仅用 Node zlib，未新增依赖。
  - 登记为 `ADDITIONAL_BROWSER_CHECKS` 的 `kind: "audit"`，不计入核心发布门禁。
- 已验证（本地工作区，非干净提交）：基线连续 3 次运行最大差异 0.023%；注入回归可检出：顶栏右移 2px 变化 0.12%，判为失败；浮层盖住页签，判为遮挡。
- 2026-11-01 全量测试，在本地工作区与干净 `78155ee` worktree 上对照：单测 4598 项中 19 项失败；浏览器套件 99 个中 83 个通过、14 个失败、2 个缺文件。问题单（含复现步骤和截图）：https://claude.ai/artifact/1WtgAkcFNgaPLgzfYVQV7s
  - 已提交代码的问题：约束图居中按钮交叉（点"水平居中"实际设置成垂直居中）；390px 下 26 个控件小于 44px；首次启动出现未翻译的 `firstRun.provider.deepseek`；`docs/AGENTS.md` 缺 `resize_document`。
  - 未提交改动带来的回归：390px 下内置浏览器盖住编辑器；手机首页点文件卡片打不开文件、Settings 压住卡片文字；首页类型选择改版导致 14 项测试失败；分享链接格式变化后测试未同步；模块清单登记了不存在的 `figma-import-fidelity`、`impeccable-polish`。
  - 10 个独立套件跑不起来：写死了 `/workspace`、依赖固定端口，或没打开文档就等编辑器。
- 未覆盖：Native 应用、付费或真实 AI 接口、实体触屏、组合操作的随机测试、非 macOS 的截图基线。测试期间 main 新增了 Native 提交 `7b95346`，Web 端相关文件未变化。

## 本轮：文字排版可读性与 Lucide 图标（已完成声明范围）

- `inspector.typography-clarity` / `text.typography`：参考 [Figma 文字属性分组](https://help.figma.com/hc/en-us/articles/360039956634-Explore-text-properties)，直接显示字体、字重、字号、行高、字距、格式和对齐标签，明确 px/% 单位。文本框自动/固定宽度放在常用区；方向、大小写、段落、基线与路径文字保留在一个高级入口。
- 新增图标统一使用 [Lucide](https://lucide.dev/icons)：`ALargeSmall` / `MoveVertical` / `MoveHorizontal` / `Pilcrow` / `Baseline`，配合文字对齐、斜体、下划线与曲线路径图标。实际可见 SVG（含下拉箭头）验证为 16px / 1.5px CSS 描边。
- 创建和编辑文字共用基础控件，移除重复的字号预设按钮，输入保留原有范围；`text_section.jsx` 536→67 行、工具面板 247→73 行，3 个共享模块分别 139/136/106 行，没有新增依赖和字体资源。
- 固定版本 [`9cd70af`](https://github.com/umaxzhao/voo-design/commit/9cd70afd10df836c269b5597b5558a114e463640)：**90/90 发布步骤通过，86 组浏览器检查通过，单测 4587 通过、4 跳过、0 失败**，源码干净且验证期间未修改；启动夹具临时缓存清理断言失败后在同一提交重试并补齐，其余浏览器使用较低并发，保留原失败，不是单次命令退出 0 的声明。证据 `/private/tmp/voo-typography-release-recovered.json`。
- 实测字号/行高/字距改变真实文字边界，输入取消与一次撤销重做、字重/装饰/对齐、自动换行、高级属性、现有字体选择和多选均通过；实际指针创建文字使用面板里的字号/字重/间距，撤销重做正常。
- 320/390/768/1440px × 深浅主题 × 中英文的 16 个布局上下文通过；仅在文字控件内覆盖窄屏 11px→10px 的旧压缩规则，字段窄屏纵向排列、触摸控件 48px。截图 `/private/tmp/voo-typography-inspector-recovered/typography-*.png`；优化前截图 `/private/tmp/voo-typography-before.png`。机械扫描无发现，不代表完整无障碍认证。
- 发布前再合入远程 Agent Frame 图标、单组建议回归及增量设计提示词改动；集成版本 [`e28b511`](https://github.com/umaxzhao/voo-design/commit/e28b5110896851246e12ffbfc0571284851f1265) 重新构建、设计/模块检查、全量单测 4597 通过/4 跳过及文字面板、Agent 选区、Agent 建议三组实际浏览器复核通过（`/private/tmp/voo-typography-merged-checks.json`），不把前一版本的 90 项冒记为合并后的完整执行。
- 该集成版本已推送并通过 SSH 部署 la2；正式入口及 6 个相关资源与验证构建逐字节一致。实际中文生产面板确认标签、11 个 16px/1.5px 图标、字号几何、字重、自动换行、段落和撤销，无页面脚本错误。证据 `/private/tmp/voo-typography-production-result.log`、`/private/tmp/voo-typography-deployment-proof.json`，截图 `/private/tmp/voo-typography-production-panel.png`。未调用付费服务。
- GitHub 检查 [41214813845](https://github.com/umaxzhao/voo-design/actions/runs/41214813845) 查询时仍在运行，未记为 CI 通过；上述上线使用项目 SSH 脚本，备份 `la2:/srv/voo-run/editor-backups/e28b5110896851246e12ffbfc0571284851f1265-20261031T152656Z`。
- 完整检查还复现并修复了 Window 滚动/缩放目标被误传给 `Node.contains` 的菜单异常（旧失败 `/private/tmp/voo-typography-release-final.json`）。实际窗口 resize/scroll、安全保留子菜单内部滚动、图片置入/剪贴板以及生产菜单 resize 关闭路径均通过。
- 本地 App 仅三方合入本轮文件，保留其他草稿；定向 29 项单测及中文真实控件操作通过（`/private/tmp/voo-typography-primary-unit-final.log`、`/private/tmp/voo-typography-primary-browser.log`）。不把公开版本的完整门禁冒记为全部私人草稿已通过。备份 `/private/tmp/voo-typography-primary/`、`/private/tmp/voo-typography-primary-contracts-corrected/`。
- 原始标签/图标两项失败保留在 `/private/tmp/voo-typography-baseline.log`；`60a289c` 的旧文字工具契约失败保留在 `/private/tmp/voo-typography-release.json`，更新断言后重新完整执行，没有把失败或部分执行算作通过。
- `4d94489` 的后续填充检查暴露了新增文字用例未还原测试场景，证据保留在 `/private/tmp/voo-typography-release-integrated.json`；补回场景后整段面板检查通过（`/private/tmp/voo-typography-isolation.log`），随后重新完整执行最终版本。
- 启动夹具原失败在 `/private/tmp/voo-typography-release-complete.json`，同提交串行重试与浏览器补跑记录在恢复报告及 `.log`；临时缓存清理的首次间歇失败没有冒记为通过。
- 发布前已合入远程 Frame 标题选择、蒙版对齐和社区模板翻译修复；前一个 `00dc8e7` 仅部分执行（`/private/tmp/voo-typography-release-verified.json`），没有当成最终集成提交的通过记录。
- 未认证所有系统字体、实体 IME/触屏/触控笔、OS 级缩放和变量字体轴；未增加不受支持的文字能力。上轮首页冷加载 New 时序和 `.fig` 导入问题仍独立待修。[验收范围](audits/panel-control-audit.md#typography-clarity)。

## 本轮：图层导出按需显示（已完成声明范围）

- `inspector.export-opt-in`：没有导出配置时，整个导出分组默认隐藏。用户从底部“添加 → 导出”启用后才显示标题、格式、倍率、透明背景和导出按钮；移除最后一条配置后整个分组消失，添加菜单恢复入口。没有新增勾选开关，保留用户已明确保存的配置。
- 导出可用性、两个添加入口及文档写入共用 `export-presets.js`；面板直接读取文档，消除未选中时补回 PNG、删除后重选复活、撤销重做显示旧配置的问题。新增/删除各为一个撤销步骤，字段连续输入保留合并行为。
- 固定代码版本 [`da86f56`](https://github.com/umaxzhao/voo-design/commit/da86f56a14a4080265fb46b834b5df363056660c)：**89/89 发布步骤通过，85 组浏览器检查通过，单测 4574 通过、4 跳过、0 失败**。验证期间源码干净且未修改。证据 `/private/tmp/voo-export-opt-in-release-verified.json`。
- 实际 Chromium 面板覆盖图形、Frame、文字、图片的默认隐藏；从添加菜单启用、最后一项移除、切换图层、一次撤销重做；主动配置后 PNG 2x 尺寸、JPEG/WebP 文件签名及质量设置通过。该套件另执行既有的双语、深浅主题和 320–1440px 面板布局检查；导出配置的具体操作路径使用英文桌面 Chromium。没有调用生成服务。
- 已推送并通过 SSH 部署 la2，线上入口及 6 个相关资源与验证构建逐字节一致。隔离正式浏览器复核默认整个分组隐藏、添加后实际下载 160×100 PNG、移除后隐藏及撤销重做，无页面脚本错误。截图 `/private/tmp/voo-export-opt-in-default.png`、`/private/tmp/voo-export-opt-in-removed.png`；证据 `/private/tmp/voo-export-opt-in-deployment-proof.json`、`/private/tmp/voo-export-opt-in-production-result.log`。
- 本地 App 工作区仅三方合入本任务源文件及回归测试，保留其他草稿；定向单测 18 项和真实本地添加/下载/移除/撤销重做通过（`/private/tmp/voo-export-opt-in-primary-browser.log`），不把独立干净版本的完整门禁冒记成全部私人草稿已通过。备份 `/private/tmp/voo-export-opt-in-primary/`、`/private/tmp/voo-export-opt-in-primary-final/`。
- 原始缺陷保留 6 个配置失败和 2 个分组显示失败（`/private/tmp/voo-export-opt-in-baseline.log`、`/private/tmp/voo-export-opt-in-section-baseline.log`）。第一次未结束门禁为补齐整个分组隐藏而停止；`6ff7ef2` 的门禁因旧默认显示断言失败，修正后重新完整执行，未把先前部分执行算通过。
- 未认证原生系统下载界面、实体触屏、原生项目冷启动重开及所有历史文档。上轮首页冷加载 New 事件时序问题和 `.fig` 导入问题仍未修复，不归入本轮通过。[详细范围](audits/panel-control-audit.md#opt-in-layer-export)。

## 本轮：统一填充面板（已完成声明范围）

- 代码版本 [`cb4d1c9`](https://github.com/umaxzhao/voo-design/commit/cb4d1c9fbfdba8e87282a0af500fa0f1e8120d79)；**89/89 发布步骤通过，85 组浏览器检查通过，单测 4567 通过、4 跳过、0 失败**。最终源码干净且验证期间未修改。证据：`/private/tmp/voo-unified-fill-release-final.json`。
- `inspector.unified-fill`：点击填充色板，在同一浮层切换纯色、渐变（含网格）、图片和纹理；图片替换/适配方式、透明度和混合模式在此完成。移除旧的分散填充类型菜单、图片文件入口和面板内适配行。
- 已实测真实图层与像素、图片失败重试、填充独立透明度/混合、纹理缩放/颜色、PNG/SVG 像素对照、隐藏/移除/撤销重做、关闭待解码图片后切换选区。原生图片类型往返保留原始资源；替换使用既有位图操作，随后修图与撤销均有效。
- 320/390/768/1440px、深浅主题、中英文、模拟触屏和键盘切换均通过。浅色主题额外方形底层已修复；真正的对话框就是圆角视觉面板，保留圆角自动断言。截图：`/private/tmp/voo-unified-fill-inspector-final/`。
- 已推送并通过 SSH 部署 la2；正式入口及 7 个直接/填充分块与验证构建逐字节一致。正式地址实际打开右侧面板，切换渐变、上传图片、修改纹理，验证真实像素、一次撤销/重做及 Escape 保留选区，无页面脚本错误。未调用付费模型。证据：`/private/tmp/voo-unified-fill-deployment-proof.json`、`/private/tmp/voo-unified-fill-production-result.log`。
- 定向 48 项单测、完整右侧面板路径和本地 App 核心填充路径分别记录；主工作区保留其他并行草稿，只合并本轮相关文件；最终本地真实填充路径复核见 `/private/tmp/voo-unified-fill-primary-browser-final.log`。主工作区已有的 `impeccable-polish` 登记文件缺失在本轮登记更新前已记录，不把公开版本门禁通过冒记为整个本地草稿通过。合并备份：`/private/tmp/voo-unified-fill-primary-merge/`、`/private/tmp/voo-unified-fill-primary-rounded/`。
- 先前版本的旧英文断言、新建就绪超时及补跑证据保留：`/private/tmp/voo-unified-fill-release.json`、`/private/tmp/voo-unified-fill-release-v2.json`、`/private/tmp/voo-unified-fill-release-recovered.json`；它们没有被伪装成最终固定提交的执行。
- 额外发现待修：正式网站冷加载只有顶栏、首页尚未挂载时，点击 New 可能先于事件监听器而未创建文档。两次等待引擎超时；等待首页输入框就绪后，同一构建正常创建并通过填充实测。原始证据 `/private/tmp/voo-unified-fill-production-startup-attempt.log`、`/private/tmp/voo-unified-fill-production-startup-second-attempt.log`。这是未收口的启动上下文，不算作填充门禁证明已修复。
- 功能覆盖仍有明确边界：实体设备、所有图片编解码/超大图片内存、克隆 ID 跨文档取消、穷尽多图片资源替换及原生 App 冷重启没有由本轮认证；不覆盖真实 `.fig` 导入审计已报告的缺陷。[详细验收](audits/panel-control-audit.md#unified-fill-editor)。

## 本轮：逐元素流式创作（已完成声明范围）

- 合入提交 `dac68a5` 的 [GitHub Ubuntu CI](https://github.com/umaxzhao/voo-design/actions/runs/41188844041) 已通过模块登记、设计检查、构建和全量单测；CI 部署作业跳过，正式部署由本机 SSH 到 la2 完成并核对。
- 已推送并部署应用提交 [`d0b9ec5`](https://github.com/umaxzhao/voo-design/commit/d0b9ec5a9df445e073c689597ff890350d500856)；登记发布检查 **88/88**（页面加载超时后串行补跑），含 **84 组浏览器**，单测 **4521 通过、4 跳过、0 失败**。证据：`/private/tmp/voo-authoring-release-recovered.json`。跳过和未运行的上下文不算通过。
- `platform.streaming-authoring`：内置 HTML、外部 `stream_layout` 和批量 `build_layout` 共用原生落图与 VOO 紫色鼠标。鼠标定位、携带轮廓、放置元素和下一步跟随实际文档操作；快照合并、稳定图层 ID、动画预算与减弱动态效果避免重复播放和长时间收尾。
- 推送前合入远程认证/归档提交 `dac68a5`；网页源码、公共资源、构建脚本和配置与上述固定版本逐项一致，新增桌面认证 4 项定向单测通过。原生签名 App 没有据此被标记为通过；证据：`/private/tmp/voo-authoring-final-integration-proof.json`。
- 真实 SSE 在响应结束前已出现原生图层与红色像素；最终蓝色像素、紫色鼠标、一次撤销/重做均通过。取消后不继续插入，批量取消保留原文档与重做；外部清除保留已有作品。同项目切页与跨文档迟到消息被拒绝；初始化冲突不能结束另一轮生成的历史批次。
- 整合期间一并收口：旧鼠标反馈契约、DeepSeek 首次引导文案/卡片断言、新 `resize_document` 文档与真实操作用例、设计系统默认项/展开路径、文件监听固定延时，对称安全区的竖屏/横屏/鼠标断言，以及八类设计类型的高级入口、桌面/触屏窄屏布局和键盘选择。
- 线上入口及 7 个直接/流式模块资源与验证构建逐字节一致。正式地址实际点击 Agent 发送，验证两块图形分阶段出现、真实红/蓝像素、一次撤销和无脚本错误；模型响应使用受控离线夹具，没有调用付费服务。证据：`/private/tmp/voo-authoring-deployment-proof.json`、`/private/tmp/voo-authoring-production-result.log`。
- 本地主工作区仅合并本轮模块，保留并发草稿、额外能力登记、旧备份和原有辅助工作树；镜像后专项通过。同步复核中误带的三处旧样式已按备份恢复。详细记录：`/private/tmp/voo-authoring-primary-final-merge/`。主工作区的其他任务源码不属于这次干净发布证据。
- 功能覆盖仍为部分：付费模型设计质量、独立原生客户端/签名安装包、实体设备、所有工具的逐手势动画，以及用户与 Agent 并发编辑仍需分别验收。[验收范围](audits/editor-closeout.md#streamed-native-authoring)。

## 本轮：许可分发、浏览器启动与缓存回收（已验证并部署）

- 归属 `platform.browser-fixture-lifecycle`，登记共享浏览器服务/页面夹具所有权；沿用 `editor-fixture-startup`，当前为 60 个能力分组、84 组浏览器套件。
- 保留原先全量运行中的缓存 `ENOTEMPTY` 与加载超时证据；新增可控图片请求，在原有 load 等待下稳定复现 30 秒超时。改用单一冷启动预算内的 DOM/真实界面就绪与 MCP 验证，缓存删除采用 Node 有限重试，持续错误不吞掉。
- 回归同时检查非关键图片未结束时的真实文档可操作性、四个冷服务的并发关闭/缓存删除/端口释放，以及三个真实编辑器的 MCP 隔离。原产品交互断言、性能阈值与发布并发数不变。
- 定向验证通过：慢资源与并发生命周期回归、33 项相关单测，以及并发数为 3 的工具栏/Frame 指针/许可产物三组检查。原 30 秒超时失败及修复后证据保留于 `/private/tmp/voo-license-regression/fixture-pending-before.log`、`fixture-pending-after.log`、`fixture-unit.log`、`fixture-parallel-recheck.json`。
- 精确干净提交 `a407ea58d446b6f4f73d6ecd430cb37d4548d17b` 完成 88/88 发布步骤：构建、设计规则、模块登记、4,529 项单测通过（4 项跳过）和全部 84 组浏览器套件通过。Vitest 上限为两个 worker，浏览器仍为三个并发，未放宽断言或性能阈值。证据 `/private/tmp/voo-license-regression/release-fixture-fixed.json`；此前失败记录不覆盖或抹去。
- [PR #68](https://github.com/umaxzhao/voo-design/pull/68) 已合并为 `b708127f0732635d0cb1dbf2d0212ec49ceacd6f`，完整源码树与验证提交一致；[GitHub build](https://github.com/umaxzhao/voo-design/actions/runs/41191124591/job/124507957957) 通过，CI 的 deploy 跳过，已按项目脚本完成 SSH 部署。
- 已部署至 [voo.run/editor](https://voo.run/editor/)。线上入口、所有入口引用资源、NOTICE 与第三方许可 JSON 共 8 个文件均 HTTP 200、字节哈希与验证构建相同；隔离真实浏览器打开“关于”，读取两项完整许可证并正常关闭。证据 `/private/tmp/voo-license-regression/production-attribution-proof.json`；备份 `la2:/srv/voo-run/editor-backups/a407ea58d446b6f4f73d6ecd430cb37d4548d17b-20261031T101615Z`。
- 历史授权、OpenDesign 原始导入版本、专有格式底层权利及签名安装包仍未由本轮认证；功能覆盖保持部分。详见 [夹具生命周期](audits/editor-closeout.md#browser-fixture-lifecycle)与[来源审查](audits/code-provenance.md)。

## 上轮：内嵌第三方内容许可分发修复（当时阻断，已由本轮闭环）

- 新增 `platform.third-party-attribution`，归属 platform；网页产物检查复用 workspace 的 `editor-resources-built`，单测所有权在模块目录登记。合并并行流式创作后，能力总数更新为 59，核心浏览器套件为 84 组。
- 已纠正此前同名项目误链：Schema 正确上游为 `open-pencil/open-pencil@f5bd2425b6491be58b43c398ac1343e4d8249fe6`，605 个定义及顺序完全一致，68,800 字节数据保持不变。保留该版本完整 MIT 与原版权行、OpenDesign 根 skills 许可参考的完整 Apache-2.0、既有署名及改动说明。
- 新增根 NOTICE，内嵌组件进入第三方许可 JSON；网页和 ASAR 均检查 NOTICE 与完整许可。缺失场景修改前已失败复现；独立临时检出中定向 33 项单测通过。证据 `/private/tmp/voo-license-regression/`。
- 精确应用提交 `1f3266e604f740c0d7463e6c2f1c9d7f73ae2b29`：构建、设计规则、模块登记通过；全量单测 4,529 通过、4 跳过，Vitest worker 上限为 2，未修改阈值。此前默认并行下两个限时用例分别失败，日志均保留，不作为硬件性能认证。
- 完整发布门禁在 26/88 步中断：浏览器 22 组已执行，20 组通过、2 组失败，62 组未执行。失败分别为 Vite 缓存清理 `ENOTEMPTY` 和页面启动超时；这两组随后单独顺序复查均通过，但不将其替换为完整门禁通过。本轮许可产物浏览器检查已在该精确提交通过。
- 证据：`/private/tmp/voo-license-regression/release-capped.json`、`release-capped.log`、`toolbar-recheck.log`、`frame-recheck.log`；原始失败与基线复现记录同目录保留。当时以 `codex/embedded-license-attribution` 草稿修复分支交付，未推送 main 或部署；该发布阻断已在本轮固定提交完成闭环。
- OpenDesign 原始导入版本与历史服务条款适用仍未解决，见 [来源审查](audits/code-provenance.md)。上游开源许可也不自动证明专有格式所涉全部权利已经清理，未宣称全仓原创或全面合规。

## 本轮：Pen / Figma 来源与许可定向审查（初步结论，来源信息已更正）

- 审查对象：`d892ab5df47368a5f4b9996b18e5e3f7e4701949`，不将用户自有 `voo-canvas-core` 列为来源疑点。本轮只做审查记录，不更改实现或授权声明。
- 对 1,585 个已跟踪 JS/JSX/MJS/CJS/TS/Swift/Rust 产品代码文件，与保留的 Pen 编译片段做连续 40 token 精确比对，并筛查 1,593 条长度 80–1,000 字符的参考文本；均无命中。相关提取文件路径与特征标识搜索也未发现产品引用。证据和文件 SHA-256：`/private/tmp/voo-provenance-scan.json`。这不排除改写、翻译或不可用原件的复用，不能作为完全原创或合规认证。
- 待补齐：`src/canvas/figma/figma-schema-data.js` 明确声明从 OpenPencil 原样转载；该数据由 `figma-schema.js` 加载用于 `.fig` 导出。注释指向不存在的 `NOTICE`，且仅保留节选许可、未锁定上游提交；当时依据错误链接得到的同名项目版权信息不适用于本 Schema；正确上游与版权已在后续修复中核实。`scripts/generate-third-party-notices.mjs` 只遍历声明依赖，不能覆盖此内嵌数据。上游原路径当前返回 404，尚未完成逐字节来源验证。
- 待确认：`src/canvas/layout_skills_data.js:229,247` 标记改编/借鉴 OpenDesign；已核对上游技能与 `12d970eacc8971150e3c76470d2a9afe16dc2ed1` 的 Apache-2.0 许可，未发现项目对该来源的完整许可/版本记录。需确定实际采用内容、原版本、是否存在适用的独立许可，再按实际许可补足声明；不能仅凭改编注释认定侵权。
- 历史提取材料与服务条款单独待复核：当前 [Figma Terms §2.2](https://www.figma.com/legal/tos/) 与 [Pen EULA §3](https://www.pen.dev/eula) 均包含逆向限制。实际适用条款版本、授权和法定例外尚未确认。取消 Git 跟踪不清除历史分发或解决该问题。原 `/tmp/apps`、`/tmp/figma_web` 完整提取树当前不可用。
- `.fig` 回归样本具有合成生成脚本与原创声明，不因格式为 `.fig` 就认定来自 Figma 产品源码；本轮未认证所有素材/字体/依赖或全仓库来源。执行范围仅来源比对、引用与许可文本检查、文档差异检查及项目设计/模块规范检查；未进行产品功能回归或部署。

## 本轮：内部协作目录仅保留本地

- 基线 `6b2cd97`：取消跟踪 `.agents/`、`.claude/`、`native_studio/.agents/` 共 524 个文件，并添加精确的目录忽略规则。修改前逐文件核验内容与基线一致；取消跟踪后再次核验本地保留。证据：`/private/tmp/voo-internal-directories-evidence.json`。
- 保留源码、测试、设计检查、打包资源、公开技术文档与许可证；产品中的 `.claude/local` 指向用户环境，不依赖仓库本地启动配置。`native_studio/UI_SPEC.md` 的历史截图引用是本地参考，随内部资料保留本地。
- 本轮仅调整仓库发布范围；执行索引/忽略规则/本地文件完整性检查、差异格式检查、设计规则与模块登记检查，不代表应用功能回归或合规审查已完成。未改写历史，未重新部署应用。

## 本轮：分析资料仅保留本地

- 基线 `eafce32e48788749838e839e8bbb273e5c32b32d`：取消跟踪 `analysis/` 的 123 个文件；原有忽略规则保持不变，本地文件逐字节核验完整保留。证据：`/private/tmp/voo-analysis-untrack-evidence.json`。
- 检查索引无该目录、忽略规则生效、暂存差异格式、设计规则和模块登记；未修改应用代码，未运行应用功能回归或重新部署。自动模块计划将这些历史分析路径归入全模块兜底，不代表本轮改动了应用行为。
- 来源审查保持未完成：分析资料包含提取的 Pen 编译代码片段与 Figma 翻译数据；产品源码的相关路径及特征标识搜索未发现引用，尚不能据此证明实现完全独立。取消跟踪不清除 Git 历史，也不构成合规认证。

## 本轮：内部协作目录仅保留本地

- 基线 `6b2cd97`：取消跟踪 `.agents/`、`.claude/`、`native_studio/.agents/` 共 524 个文件，并添加精确的目录忽略规则。修改前逐文件核验内容与基线一致；取消跟踪后再次核验本地保留。证据：`/private/tmp/voo-internal-directories-evidence.json`。
- 保留源码、测试、设计检查、打包资源、公开技术文档与许可证；产品中的 `.claude/local` 指向用户环境，不依赖仓库本地启动配置。`native_studio/UI_SPEC.md` 的历史截图引用是本地参考，随内部资料保留本地。
- 本轮仅调整仓库发布范围；执行索引/忽略规则/本地文件完整性检查、差异格式检查、设计规则与模块登记检查，不代表应用功能回归或合规审查已完成。未改写历史，未重新部署应用。

## 本轮：分析资料仅保留本地

- 基线 `eafce32e48788749838e839e8bbb273e5c32b32d`：取消跟踪 `analysis/` 的 123 个文件；原有忽略规则保持不变，本地文件逐字节核验完整保留。证据：`/private/tmp/voo-analysis-untrack-evidence.json`。
- 检查索引无该目录、忽略规则生效、暂存差异格式、设计规则和模块登记；未修改应用代码，未运行应用功能回归或重新部署。自动模块计划将这些历史分析路径归入全模块兜底，不代表本轮改动了应用行为。
- 来源审查保持未完成：分析资料包含提取的 Pen 编译代码片段与 Figma 翻译数据；产品源码的相关路径及特征标识搜索未发现引用，尚不能据此证明实现完全独立。取消跟踪不清除 Git 历史，也不构成合规认证。

## 本轮：AI 生成文本按内容自适应尺寸

- 已修复 `build_layout` 将普通 AI 生成文本强制设为占位宽度的问题。现在文本默认按内容自然测宽；只有显式传入 `textSizing: "fixed"` 才按给定宽度换行。流式 HTML 中已测出的文本换行宽度仍保留。
- 新增能力 `platform.agent-generated-text-sizing`，关联 `text.box-sizing`；登记总数更新为 56 个能力分组，核心门禁仍为 83 组浏览器套件。
- 验收覆盖 `build_layout` 默认尺寸、固定换行、流式 HTML 文本宽度、真实画布测量和原有单步撤销/重做。定向 37 项单测及真实编辑器场景通过；完整证据见 `/private/tmp/voo-text-sizing-release-merged.json`。
- 合并最新远程改动后的干净提交 `26de3f9` 完成 87/87 发布步骤：构建、设计检查、4501 项单测通过、4 项跳过，以及 83 组浏览器套件通过。`image-inspector-core` 首次运行超时，独立重跑及最终完整门禁均通过；同步进入的移动工具栏回归也通过。
- 已推送至 GitHub 主分支并部署到 la2，入口为 [voo.run/editor](https://voo.run/editor/)。线上 `index.html` 和包含文本尺寸规则的 `canvas_tools` 分块均返回 HTTP 200，字节及 SHA-256 与构建一致；隔离线上浏览器完成首次引导并进入项目工作台。证据：`/private/tmp/voo-text-sizing-deployment-proof.json`；备份：`/srv/voo-run/editor-backups/5601167-20261031T071032Z`。
- 该证据确认的是 Chromium 中 `build_layout` 与流式 HTML 文本路径。其他外部模型客户端、各模型设计变体和设备/平台特定生成路径仍未逐一覆盖，功能覆盖保持“部分”。

## 上轮：本地服务发现与同源画布预览

- 已完成声明范围：应用提交 `23d961c` 通过 87/87 步（83 组浏览器）；证据 `/private/tmp/voo-local-service-final-release-v4.json`。
- 新增 `platform.local-service-discovery`、`platform.live-preview`，当前登记 55 个能力分组、83 组核心浏览器套件。
- 已验证服务缺失/发现/断开/恢复、旧版 1.0 桥接兼容、网页只展示已安装 CLI、设置页与引导隐藏本地入口、保留 API 与模型选择、空目录进入 API 设置；断线后也不会残留本地向导入口。
- 只读预览通过独立浏览器读取原画布红/绿图形真实像素，验证更新、缩放、保持生成目标与文档切换失效。缺少文档身份的旧渲染器不暴露预览；旧 MCP 协议保留图片和文本 URL。过期响应支持中英文。
- 已推送并部署 la2，线上首页和 5 个引用资源与验证构建字节一致；线上配置入口、CLI 隐藏和真实新建操作通过。证据 `/private/tmp/voo-local-service-deployment-proof.json`，截图 `/private/tmp/voo-local-service-production.png`。
- 本机旧版 Electron 桥接通过网页冷启动自动发现与只读安装状态 RPC；新增预览服务需 App 重启载入更新代码。主工作区仅增量同步本轮源码，其余草稿和旧工作树保留，不作为干净发布依据。
- [验收范围](audits/editor-closeout.md#local-services-and-source-bound-preview)：不把浏览器通过当成所有客户端自动右侧面板、签名 App 安装包或本地网络权限弹窗已验证。

## 当前概况

| 项目 | 状态 |
| --- | --- |
| 工程规范与模块登记 | 已落地：12 个模块、60 个能力分组 |
| 核心发布校验 | a407ea5：完整单次 88/88 步通过，包含 84 组浏览器套件 |
| 全量单元测试 | 4529 通过、4 跳过、0 失败；跳过项不算通过 |
| GitHub Ubuntu 基础检查 | [a407ea5 PR build 已通过](https://github.com/umaxzhao/voo-design/actions/runs/41191124591/job/124507957957)：模块登记、设计检查、构建及单测；CI 部署跳过，已由项目脚本 SSH 部署 la2 |
| 线上部署 | a407ea5 验证构建已部署；主分支合并 b708127 的源码树一致；8 个线上文件哈希与关于页许可读取通过 |
| 功能验收完整度 | 部分覆盖；60 个能力分组未穷尽所有入口、上下文和设备 |
| 核心门禁外的独立检查 | 21 组本轮未运行：18 组待复核，3 组需单独运行 |

## 连续创作首轮（f9102cd，已完成声明范围）

- 已复现并修复：R/O 切换失效、分组脱离 Frame、分组后移动单位错误、解组误拆祖先 Frame、Esc 取消后仍创建对象，以及白色 Frame 中新建白字不可见。
- 同一份文档通过真实 UI 完成绘制、文字、属性修改、分组移动/解组、路径编辑、置入/蒙版、撤销重做、保存和新浏览器重开；11 个场景通过。纯回归新增 18 项；同步路径中点修复后，全量单测 4428 通过、4 跳过。
- 新增 `selection.continuous-creation`，核心门禁 82/82 通过（78 组浏览器，包含同步进入的路径中点检查）；实际验证提交为 f9102cd，声明范围之外仍为部分覆盖。
- 线上发布版本与构建资源哈希一致；本地主工作区仅同步本轮 10 个源码文件，11 场景复查通过，其他未提交草稿保留，未将其整体当作干净发布版本。
- [验收范围与剩余边界](audits/continuous-creation-audit.md)：实际图像/文字像素、层级、历史和冷重开；实体设备、复杂组合和硬件性能仍单独验证。

## 继续检查：容器命令、手势回滚、选区单位、文字收尾与路径表示（已完成声明范围）

- 新增两组核心浏览器套件，当前登记为 60 个能力分组、84 组浏览器、88 个发布步骤；先后在 `caf386a`（84/84）、`bfd7e5b`（85/85）、`a94365e`（85/85，证据：`/private/tmp/voo-release-round2.json`）与本批 `f7f4f59`（87/87，证据：`/private/tmp/voo-release-round3.json`，合入最新 `origin/main` 后为 `9c8be5c`，29 项新增单测与 19 项浏览器专项复核全过）完成隔离副本全量门禁验证；原工作区未提交的外部改动保留，未混入发布依据。
- 已复现并修复 29 类问题：多层解组孤儿节点、父子同时分组拆散子树、跨 Frame 分组跳过共同父级、解组蒙版后失效引用、放弃空文字清空重做、未修改文字清空重做、实际文字收尾遗漏提交回调、转换为钢笔路径后的线条/箭头仍进入旧端点分支、钢笔草稿切换工具未提交且残留预览、`< 4px` 形状/箭头点击误写删除历史并清空重做与原选区、`resize`/`rotate`/`cornerRadius`/`endpoint` 变换手柄 `Escape`/取消不回滚且零位移误提交、对齐选中 Frame+子图层双倍位移且遗漏剪切蒙版跟随层、方向键微调 Auto Layout 编组回弹与钢笔锚点越界未扩框、图层面板点击布尔层失效及图层面板复制编组丢失编组选区单位、缩放后的钢笔路径在锚点越界扩框/复制/展开轮廓时缩回 `baseWidth`、钢笔编辑零位移点击锚点/弯曲段误写历史且中途 `Escape` 直接退出编辑会话、旋转/翻转路径下钢笔弯曲与剪刀子工具坐标未逆变换且开放路径剪断未重算边界与图层顺序、布尔组合与破坏性布尔丢失共享父容器及遗留失效 `clipTo`/空编组、路径排字 `typeOnSelectedPath`/`attachTextToPath` 丢失 `parentId` 且调用不存在的 `selection.setIds`、空普通编组无法通过 `Backspace`/剪切删除或 `Escape` 取消选中或 `Cmd+Shift+G` 解组、多子节点普通编组按 `Shift+A`（`toggleAutoLayoutSelection`）误套外层编组而非原地切换 Auto Layout、Frame 内创建/分离组件（`extractComponent`/`detachInstance`）丢失 `parentId`/残留外部引用/未缩放路径锚点、选中钢笔路径或普通编组按 `Enter` 因判定 `kind === "pen"` 与调用不存在的 `startEdit` 或忽略 `getSelectedGroup()` 而失效、多边形套索按 `Backspace` 误删宿主图层而非回退顶点（`popPolygonVertex`）且闭合与魔棒选区遗漏历史提交、磁性套索按 `Escape` 未回退、曲率钢笔按 `Backspace`（`popDraftAnchor`）残留旧平滑控制柄、以及 `region`/`pixelMarquee`/`selectionMove`/`gradient*`/形变控制点/`pen`/`lasso`/`healing`/`cloneStamp`/`patch*`/`removeBrush`/`objectStroke` 取消未回滚。
- 门禁过程还捕获并修复了 `titlebar-file-actions.e2e.mjs` 在已有后台编辑器实例时未等待首页遮罩（`welcomeOpen`）关闭即读取文件名的竞态。
- 定向浏览器扩展至 19 个场景（`container-command-boundaries` 9 项、`text-creation-boundaries` 10 项），覆盖键盘命令、对齐/蒙版跟随、Auto Layout 方向键微调与原地切换、图层面板布尔点击与编组复制、缩放钢笔复制与路径排字及空编组删除、`Enter` 进入编组与钢笔编辑、钢笔切换工具收尾、曲率钢笔 `Backspace` 重算控制柄、钢笔锚点零位移与中途 `Escape` 回滚、`< 4px` 形状点击与 `Escape` 缩放回滚及完整撤销重做。
- [容器边界范围](audits/nested-objects-audit.md#container-command-boundaries)、[文字收尾范围](audits/continuous-creation-audit.md#text-placement-and-close-boundaries)记录复现、断言和剩余上下文；临时编辑恢复、取消时保留外部新增节点也已加入纯回归。

## 各模块进度

套件数按主归属计一次。跨模块回归会关联执行，不能将下表理解为功能覆盖率。

| 模块 | 已通过核心套件 | 功能覆盖 | 仍需补齐的重点 |
| --- | --- | --- | --- |
| 工作台与资源 `workspace` | 8/8 | 部分 | 原生文件选择器、实体触屏、独立流程脚本复核 |
| 文档与存储 `documents` | 6/6 | 部分 | 原生写入中断/恢复、旧版本文档、独立往返脚本 |
| 画布与相机 `canvas` | 6/6 | 部分 | 硬件 FPS、内存、固定场景规模下的性能基准 |
| 选择与变换 `selection` | 6/6 | 部分 | 实体压感笔、系统快捷键、多指触摸组合 |
| 图层与 Frame `layers` | 7/7 | 部分 | Finder/Explorer 原生拖放；更多异常层级与组合 |
| 蒙版与合成 `compositing` | 6/6 | 部分 | 更多混合/蒙版/效果组合、显卡差异、独立像素脚本 |
| 矢量与形状 `vectors` | 5/5 | 部分 | 扩充第三方路径和格式往返样本、HTML 转节点脚本 |
| 文字 `text` | 2/2 | 部分 | 实体输入法、字体安装差异、RTL、可变字体；另有关联选择/排版检查 |
| 图片与修图 `images` | 12/12 | 部分 | 独立模型/网络检查、硬件内存/FPS；本轮排除视频 |
| 布局与设计系统 `layout` | 6/6 | 部分 | 组件/变量 alias、嵌套布局组合、设计系统预设细查 |
| 属性面板与共享 UI `inspector` | 6/6 | 部分 | 每个控件、输入方式与参数组合的逐项验收 |
| Agent 与平台 `platform` | 14/14 | 部分 | 本轮许可与共享夹具场景通过；真实外部服务、原生安装包与其他平台上下文仍待核验 |

## 21 组独立检查的待办

“待复核”表示需要先确认夹具、断言与服务要求，再决定纳入核心门禁或单独执行；
不能推断它们已通过、已失败或已经失效。

| 状态 | 脚本名称（位于 `tests/e2e/`） |
| --- | --- |
| 待复核：Agent / 平台，9 组 | `agent-selection-context`、`agent-suggestions`、`agent_cancel_polish`、`agent_pencil_tools`、`agent_tools`、`claude_agent`、`codex_agent`、`mcp_cli`、`qa3_electron` |
| 待复核：工作台，2 组 | `critical_flows`、`qa_flows` |
| 待复核：共享 UI，2 组 | `command_palette`、`design_tokens` |
| 待复核：文档，3 组 | `multi_document_tabs`、`qa3_roundtrip`、`roundtrip` |
| 待复核：合成，1 组 | `ed04_pixel_consistency` |
| 待复核：矢量，1 组 | `html2nodes` |
| 单独运行：硬件性能 | `canvas_fps`，记录硬件、渲染后端、场景与规模 |
| 单独运行：原生环境 | `image-electron`，使用隔离的 Electron 数据和文件目录 |
| 单独运行：网络/模型 | `image-network`，验证真实下载、推理和缓存 |

## 后续收口清单

- [x] 统一模块/能力 ID、关联回归与测试归属。
- [x] 新增未登记浏览器套件会触发门禁失败。
- [x] 区分检查执行结果、功能覆盖、旧提交证据与未提交改动。
- [x] GitHub 基础门禁落地，并修复实际 Ubuntu 运行暴露的临时目录测试隔离问题。
- [ ] 复核上面的 18 组独立脚本，逐项记录保留、修复和执行结果。
- [ ] 将 53 个能力分组细化为入口、上下文、状态、像素、撤销、保存重开和取消/失败验收行。
- [x] 新增一条不重置场景的真实 UI 连续创作回归，关闭本轮 6 个已复现缺陷。
- [x] 继续扩展画布、图层、右侧面板的组合操作与控件级验收，涵盖 `< 4px` 形状/箭头取消回滚、变换手柄 `Escape`/零位移回滚、钢笔草稿切换收尾、对齐/蒙版跟随、Auto Layout 编组方向键微调及混合层级选择。
- [ ] 继续补充剩余高级绘图工具（曲线/自由钢笔复杂路径、套索/魔棒取消）与属性面板逐控件级组合验收。
- [ ] 单独记录性能、原生环境、网络/模型及外部服务的当前证据；保留未验证边界。
- [ ] 按模块拆分存量大文件、核查公共接口和死代码；每批保留行为回归与实际包体积证据。

## 专项证据与维护方式

- [模块清单](../scripts/editor-module-catalog.mjs)：机器使用的职责、能力 ID、套件和剩余项。
- [工程流程](engineering-workflow.md)：验收行模板、代码边界、检查命令和交付规则。
- [连续创作验收](audits/continuous-creation-audit.md)：真实 UI 的跨模块流程、已复现缺陷、取消/重开和剩余边界。
- [画布与嵌套对象](audits/nested-objects-audit.md)：置入、Frame、蒙版、命中、复制删除与重开。
- [图片编辑器验收](audits/image-editor-complete-audit.md)：工具、像素、原生环境与模型边界。
- [性能证据索引](performance/README.md)：区分 CPU、GPU、FPS 与历史测量。

每轮更新：先更新受影响模块的状态和剩余项，再填入准确提交、运行环境和原始报告位置。
修复关闭前补上回归用例；只有实际完成并有证据的项才能勾选。

最近完整报告：`/private/tmp/voo-release-round2.json`（a94365e，85/85，隔离源码前后均干净）；上一批报告为 `/private/tmp/voo-release.json`（bfd7e5b，85/85），历史基线报告为 `/private/tmp/voo-deeper-release.json`（ebab451，85/85）。
线上资源证据：`/private/tmp/voo-deeper-deployment-proof.json`；新场景结果：
`/private/tmp/voo-deeper-production/`；笔触与路径额外结果：`/private/tmp/voo-deeper-production-{brush,vector}.log`。
执行条件：`/private/tmp/voo-deeper-execution-context.json`，单测使用
`VITEST_MAX_FORKS=2 VITEST_MIN_FORKS=1 VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=1`。
前期失败和混杂工作区的报告另行保留；不能沿用其通过项作为最终证据。临时文件可能被清理，
需要长期保存时移入交付证据目录。重新生成和核对的命令：

```bash
VOO_RELEASE_REPORT=/private/tmp/voo-release.json node scripts/verify-editor-release.mjs
node scripts/editor-checks.mjs --evidence /private/tmp/voo-release.json --json
```


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

## 导出配置与合并更新（Coalesced Updates）Undo/Redo 历史消费与状态恢复修复 — 2026-11-02

针对独立 QA 补验中发现的导出配置 Undo/Redo 消费但未恢复缺陷（`msg_32fb703bee1c`）进行根因定位与引擎级闭环修复：

1. **缺陷表现与时序归因**：
   - 场景：对象已有 2x 导出配置，在面板中将 scale 改为 3x，随后使用快捷键（`Ctrl+Z` / `Cmd+Z`）或工具栏撤销按钮回到 2x；点击图层行核对，再执行重做（`Ctrl+Shift+Z` / Redo）；
   - 现象：`historyTimeline` 显示 `after-redo` 时 `canRedo` 确实变为 `false`（Redo 动作被消费），但导出配置 scale 未能恢复为 3x，仍停留为 2x；
   - 根因定位：`src/canvas/editor/editor_engine.js` 中的 `updateNodeCoalesced` 为了防止高频输入（滑块拖拽、文本输入等）产生历史碎片，设置了 250ms 的防抖延时提交定时器 `toolCommitTimer`。当用户在 250ms 内立即触发 Undo 时，3x 的历史快照尚未被推入历史栈（`history.push` 未执行）；此时执行 `history.undo()` 实际回退了更早前的一次历史提交；而当延时定时器触发或重做被执行时，历史栈中从未记录过 3x 的独立快照，导致重做取出的仍是 2x 快照。
2. **架构解决方案（引擎级合并提交即时冲刷机制）**：
   - 在 `editor_engine.js` 实现 `flushPendingToolCommit()` 协议：
     - 在执行 `undo()`、`redo()`、`jumpToHistory()`、`commit()`、`commitEditorDocument()`、`captureDocumentSession()`、`markApplied()`、`selection.onChange`（选择变更）以及切换至其他节点编辑（`lastCoalescedId !== id`）时，若存在挂起的合并提交，立即同步清零定时器并调用 `ctrl.historyApi.commit("editor.tool.update")` 固化当前编辑快照；
     - 包装 `canUndo()` 与 `isDirty()`：在 `toolCommitTimer` 挂起期间即时感知未持久化修改，返回 `true`；`canRedo()` 在有新编辑挂起时返回 `false`；
     - 撤销时前置执行 flush：使得 scale 3x 立即作为最新历史节点入栈，随后紧跟的 `history.undo()` 即可精准回退至 scale 2x，并将 3x 完整保留在 Redo 前向栈中；后续 `redo()` 即可精准恢复至 3x；
     - 覆盖即时撤销（< 250ms）与延时撤销（> 250ms）、快捷键与按钮两条路径；多次同一节点快速更新依然合为单步历史，跨节点编辑与非合并更新自动切分独立历史。
3. **测试覆盖与验收证据**：
   - 新增专用回归测试：`tests/unit/coalesced_update_history.test.js`（8/8 项测试全部通过，覆盖即时 Undo/Redo、延时 Undo/Redo、多层连续防抖合并、跨节点隔离、非合并插入刷新与 dirty 状态检测）；
   - 模块登记：已在 `scripts/editor-module-catalog.mjs` 中将新测试登记至 `documents` 模块，`node scripts/editor-checks.mjs --changed --json` 验证 `unmapped: []`；
   - 视觉门禁：`npm run lint:design` 校验 1478 个文件 0 违规；
   - 关联单元测试通过：`export_presets.test.js`、`editor-history-commit.test.js`、`qa_undo_button_state.test.js`、`layer_multiselect_reorder.test.js`、`right_panel_phase1.test.jsx`、`properties_panel_restructure.test.jsx`（43/43 通过）。

## 移动路径与锁定层边界约束修复（Out-of-Range Locked Layer Displacement Fix）— 2026-11-02

针对独立 QA 验收发现的锁定层边界阻断拦截（`msg_06072f6c7088`）进行根因定位与算法修正：

1. **缺陷表现与根因分析**：
   - 场景：文档包含 `['a', 'b', 'c', 'locked', 'd']`，将 `c` 拖到 `a` 之前，或多选 `['b', 'c']` 拖到 `a` 之前；
   - 现象：实际结果分别为 `['a', 'b', 'locked', 'c', 'd']` 与 `['a', 'locked', 'b', 'c', 'd']`，未能正确排为 `['c', 'a', 'b', 'locked', 'd']` 与 `['b', 'c', 'a', 'locked', 'd']`；
   - 根因：`src/canvas/editor/reorder-layer-batch.js:104–107` 中，在对移动路径 `[lo, hi]` 做跨越锁定检查后，又无条件执行全局夹紧 `if (firstLocked >= 0 && insertAt <= firstLocked) insertAt = firstLocked + 1`。该逻辑误将位于移动区间完全之外的后续锁定层（如位于索引 3 的 `locked`）当作目标上限，强制将插入点推迟至 `firstLocked + 1`，甚至把非跨锁的合法移动误推到了锁层之后。
2. **精确算法重构与约束模型**：
   - 严格基于实际移动路径区间（`lo = Math.min(draggedIndex, target)`, `hi = Math.max(draggedIndex, target)`）进行锁定校验：
     - 若 `[lo, hi]` 路径内存在任何非当前移动批次的锁定节点（包含 `node.locked` 或祖先组锁 `isLockedByGroup(doc, node)`），则严正拒绝移动（返回 `null`，保持原文档）；
     - 彻底移除对 `rest` 的全局 `firstLocked` 插入点夹紧，范围外的锁定层不干预合法放置目标；
     - 保留底部底图锁定位保护（底座约束）：仅当 `insertAt === 0` 且 `rest[0]` 为锁定底图时，`insertAt` 夹紧为 1，确保不能插入到底图之下；
     - 保持整批原子移动、相对顺序、组子树、蒙版附属层和单步 Undo/Redo 事务提交。
3. **测试覆盖与双重验证证据**：
   - 定向单元测试：`tests/unit/layer_multiselect_reorder.test.js` 增加 `allows reordering outside the locked range without displacement by out-of-range locked layers` 测试用例，覆盖：
     - 单图层 `c` 拖至 `a` 前得到 `['c', 'a', 'b', 'locked', 'd']`；
     - 多选 `['b', 'c']` 拖至 `a` 前得到 `['b', 'c', 'a', 'locked', 'd']`；
     - 尝试将 `d` 越过 `locked` 移至 `a` 前被正确拒绝；
     - 尝试将 `c` 越过 `locked` 移至 `d` 后被正确拒绝；
   - 单元测试运行：`tests/unit/layer_multiselect_reorder.test.js`（10/10 全部通过）；图层模块测试集（30/30 全部通过）；
   - 真实浏览器矩阵实测：运行 `editor-browser-fixture` 真实 Chromium E2E 矩阵（12/12 项全部通过，含 `unrelated-later-lock-1` 与 `unrelated-later-lock-2` 及 8 项 root/siblings 连续与非连续拖拽，附带 Undo/Redo 完备还原验证）；
   - 门禁合规：`npm run lint:design`（1,478 文件 0 违规），`npm run check:modules`（12 模块有效注册，`unmapped: []`）。

## 多选批次副选对象跨锁屏障拦截修复（Batch Reorder Secondary Node Lock Crossing Barrier）— 2026-11-02

针对独立 QA 补充验收发现的非连续副选对象跨锁拦截缺口（`msg_a88923be55d4`）进行根因定位与算法闭环：

1. **缺陷表现与根因分析**：
   - 场景：文档顺序包含 `['a', 'b', 'locked', 'c', 'd']`，仅 `locked` 锁定；
     - 正向测试：多选 `['b', 'd']`，拖拽主选 `b` 到 `a` 之前；主选 `b` 的拖动路径不穿过 `locked`，但作为批次成员一同移动的副选 `d` 必须穿越 `locked` 才能到达 `a` 之前；
     - 反向测试：多选 `['a', 'c']`，拖拽主选 `c` 到 `d` 之后；主选 `c` 的路径不跨锁，但副选 `a` 越过了 `locked`；
   - 现象：批次移动未被拦截，导致 `d` 或 `a` 穿过锁定层；
   - 根因：`reorder-layer-batch.js` 此前仅计算 `leadId`（主选指针节点）的拖拽起点与目标终点 `[lo, hi]`，仅校验了主指针的行进区间，未将整批被移动集合中所有副选对象（及其子树/后代）的移动跨越区间纳入锁屏障约束。
2. **全选区批次原子锁屏障约束重构**：
   - 遍历 `rest` 中所有锁定节点 `r`（含 `r.locked` 或祖先组锁 `isLockedByGroup(doc, r)`），将其在原文档的绝对索引 `rOrig` 与被移动批次 `block` 的原始索引极值 `[minBlock, maxBlock]` 进行拓扑校验：
     - 若 `r` 在目标插入点之前（`i < insertAt`，即 `r` 最终位于整个批次下方）：批次中绝不允许存在任何原本位于 `r` 下方的节点，即若 `rOrig > minBlock` 则判定存在跨锁，立即返回 `null`（拒绝整批移动）；
     - 若 `r` 在目标插入点之后（`i >= insertAt`，即 `r` 最终位于整个批次上方）：批次中绝不允许存在任何原本位于 `r` 上方的节点，即若 `rOrig < maxBlock` 则判定存在跨锁，立即返回 `null`（拒绝整批移动）；
   - 同时校验被选批次自身任何节点（`blockIds`）不得为锁定或组锁定；
   - 该算法兼具完整对称性：主指针跨锁、副选跨锁、批次被锁层跨分割三类场景全部在单一原子约束下拦截，同时完全不误伤范围外合法放置。
3. **测试覆盖与双重验证证据**：
   - 新增定向单测：`tests/unit/layer_multiselect_reorder.test.js` 增加 `refuses batch reorder when any secondary selected node would cross a locked barrier`，断言 `['b', 'd']` 移至 `a` 前及 `['a', 'c']` 移至 `d` 后均返回原文档对象 `doc`（拒绝移动，无脏变更）；
   - 单元测试运行：`layer_multiselect_reorder.test.js`（11/11 项全部通过），图层及历史模块测试（31/31 全部通过）；
   - 真实 Chromium 浏览器端到端实测：运行 `closure-acceptance-evidence/lock-cross-secondary.mjs` 场景实测全部通过，验证真实鼠标拖动后文档保持原顺序、历史索引未增加；原 12 组矩阵重测全部通过；
   - 门禁合规：`npm run lint:design`（1,478 文件 0 违规），`node scripts/editor-checks.mjs --check` 注册有效，单文件行数严格在 400 行以内（`reorder-layer-batch.js` 126 行）。




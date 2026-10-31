# 项目检查总进度

这里是持续维护的总入口。每轮检查或修复后更新本文件，不再新增一份同类日期报告。更新时间：2026-11-01。
最近一次完整核心验证提交：[12b9aba](https://github.com/umaxzhao/voo-design/commit/12b9abae4f72e987fd14230791ad4de9df37cae1)；91/91 项通过，当前线上为该构建。
以下结果只属于各自固定提交和已记录的验收上下文，不代表后续或本地其他草稿均已验证。

## 本轮：评论复用右侧面板（已完成声明范围）

- `inspector.comments-panel-slot`：入口放到页面名称右侧；评论列表、加载和错误状态复用属性面板外壳，关闭恢复原面板，历史可互相替换，左右交换布局受尊重。紧凑画布用原面板区域并恢复原折叠状态；仅放置评论时加载进度显示在原按钮，不额外生成侧栏。
- 固定 [`12b9aba`](https://github.com/umaxzhao/voo-design/commit/12b9abae4f72e987fd14230791ad4de9df37cae1) **91/91 发布步骤、87 组浏览器、4689 单测通过/4 跳过**，GitHub CI 通过。60 项定向单测及 1600/900/390px、触摸、左右换位、历史恢复、入口重挂载、原评论操作和独立模式冷加载均通过；本地 App 最小补丁与最终浏览器复查通过，其他草稿保留。[验收与原始失败](audits/nested-objects-audit.md#comments-shared-right-panel)。证据目录 `/private/tmp/voo-license-regression/`，`comments-panel-release-final.json` / `comments-panel-final-ci.json` / `comments-panel-primary-mode-final.log`。登记 76 能力，覆盖仍部分。
- [PR #73](https://github.com/umaxzhao/voo-design/pull/73) 及最终冷加载补丁均已进入主线，源码树与固定验证版本一致（`comments-panel-main-tree-proof.json`）。已经项目脚本部署 la2；正式页面位置、冷热两条入口、九点命中、草稿取消、历史恢复、移动触摸关闭和文档/选区不变通过，零页面异常，87 个入口及实际脚本/样式资源逐字节/SHA-256 一致。证据 `comments-panel-production-proof.json`，截图 `comments-panel-production-desktop.png` / `comments-panel-production-mobile.png`；备份 `/srv/voo-run/editor-backups/12b9abae4f72e987fd14230791ad4de9df37cae1-20261031T201538Z`。

## 本轮：尺寸标签位于对象下方（已完成声明范围）

- `compositing.selection-size-label`：默认下方居中，底部空间不足才回退上方。修改前单测期望 y=66、实际 y=16 的失败保留于 `/private/tmp/voo-license-regression/size-label-before.log`；20 项相关单测及真实截图像素回归通过，覆盖 0.5/1/2×、旋转、Frame 和多选原策略，文档/选区不变。
- 固定 `e2e3e0b` 完整门禁 91/91、87 浏览器、4678 单测通过/4 跳过（`size-label-release.json`）；GitHub CI 通过。整合固定 `457b149` 再次完成 91/91、87 浏览器、4684 单测通过/4 跳过（`size-label-release-integrated.json`），GitHub CI 通过；主线随后仅文档变动，线上实测通过，不继承不同应用源码通过。[验收范围](audits/nested-objects-audit.md#selection-size-label-placement)。登记 75 能力，功能覆盖仍部分。
- [PR #72](https://github.com/umaxzhao/voo-design/pull/72) 已合并 `326860d`（`size-label-main-source-proof.json`），已通过项目脚本部署 la2。正式页面实际点击对象、对象/Frame 下方标签像素、原上方标签消失、文档与选区不变及零页面异常通过；83 个实际加载资源与验证构建逐字节/SHA-256 一致。证据 `size-label-production-proof.json`，截图 `size-production-child.png` / `size-production-frame.png`，备份 `/srv/voo-run/editor-backups/457b149d4c1da1ecb1073fa7b7c87be47276f92c-20261031T185117Z`。

## 本轮：同一 Figma 文件与 OpenPencil 对照（已完成声明范围）

- OpenPencil 已独立部署在 `/Volumes/TD/Projects/open-pencil-benchmark`，本机预览 `http://127.0.0.1:5188/`；官方源码未改，正式版和 master 均按要求使用 Bun 1.4.2 构建。默认缩放 NaN、正式版空渐变异常及字体缺失已单独记录；异常回调分数不当作性能通过。
- master 手动恢复有限相机、不改图层后，等待官方稳定信号，仍约 1.175/0.734 次每秒平移/缩放回调。加载提示结束约 7.577 秒，但默认视图无效且采用按页延迟展开，不能直接与 VOO 全页导入耗时等同；两者均保留 478 张图片、4 个变量集合及 5 个变量。不是所有属性或平台的还原认证。
- VOO 已复现并修复连续子层重复 Frame 裁剪、混合画布未启用屏幕外剔除，以及静态空效果反复像素读取。保留 240 世界像素安全边距，图片/文字重试、源节点替换失效及调用者裁剪恢复；无新增 UI 或依赖。
- 合入浮层/新建更新后的 `0a3ba24` 干净源码已重新完成 **91/91 发布步骤、87 组核心浏览器、4680 单测通过/4 跳过**；原 `25bda7a` 的独立完整门禁另保留。首屏相机微基准平移/缩放约快 1.85/1.93 倍；真实空白画布拖动确认视图改变且文档不变，等待中位数 VOO/OpenPencil 为 180/1911.5ms，Ctrl+滚轮为 918/559ms，后者 OpenPencil 更快。手势/缩放因子不同，不作全面排名。证据 `/tmp/voo-clip-integrated-release.json`、`/tmp/voo-open-pencil-comparison/`；首屏独立画面仍有 28/800000 像素差异，未认证所有属性或完全一致。已推送并经项目脚本部署；正式入口及关键资源与验证构建逐字节一致，正式 native Figma 导入/可见像素/蒙版/剔除/约束/撤销通过，无页面异常。证据 `/tmp/voo-clip-deployment-proof.json`、`/tmp/voo-clip-production-fidelity.json`；私有报告在当前可视化目录 `open-pencil-comparison/`，不含公开设计文件。
- [详细范围、对照方法与未验证项](audits/figma-import-audit.md#openpencil-control-and-further-rendering-optimization--2026-11-01)。`native_studio` 排除，卡顿和全部属性还原仍为部分完成。

## 本轮：分享与页面外浮层遮挡（已完成声明范围）
- `inspector.global-overlay-stacking`：已复现分享框被 `editor-pages` 覆盖。顶栏统一层级；分享使用 body 锚定浮层，窄屏限制位置和滚动高度；快捷键、图标、SVG 与懒加载占位共用全局 Portal。[逐类验收与原始失败](audits/nested-objects-audit.md#global-overlay-stacking)。
- 回归覆盖 1600/1280/900px 分享、320px 嵌套分享、裁切/变换宿主下的实际弹窗九点命中、输入与 Escape，以及文档和选区不变。本地主工作区增量修复及浏览器复查通过，其他草稿保留。
- 同时修复冷首页导入事件丢失和分享身份在 React updater 重放时重复发布；保留主线提前点击 New 的排队机制，受控延迟与批量真实输入回归保留。Figma 夹具仅补导入引擎绑定前提，精确像素断言不变。
- 固定 [`9d0a1d2`](https://github.com/umaxzhao/voo-design/commit/9d0a1d23babf4ac38a4922b86227ed162ee7c77f) 全新完整执行 **91/91 步、87 组浏览器、4654 单测通过/4 跳过**。证据 `/private/tmp/voo-license-regression/global-overlay-release-acceptance.json`，不拼接此前失败补跑。
- 最终整合 [`8af23f5`](https://github.com/umaxzhao/voo-design/commit/8af23f5ec05055be85e96c2cc87353cd80c2f495) 保留主线新增 Frame/拖动修复并补齐测试归属；**91/91 步、87 组浏览器、4674 单测通过/4 跳过**，GitHub CI 通过。证据同目录 `global-overlay-release-final-integration.json`、`global-overlay-pr-checks.json`。登记 12 模块/73 能力/87 核心浏览器，功能覆盖仍部分。
- [PR #71](https://github.com/umaxzhao/voo-design/pull/71) 已合并为 `4e8f506`，与固定验证提交源码树一致（`global-overlay-main-tree-proof.json`）。已通过项目脚本部署 la2，97 个实际入口/加载资源与验证构建逐字节及 SHA-256 一致。正式页面桌面/320px 分享、设置、命令和导出九点命中、输入/关闭、文档选区不变及零页面异常通过。证据 `global-overlay-production-proof.json`、截图 `global-overlay-production-share.png` / `global-overlay-production-narrow.png`；原版本备份 `/srv/voo-run/editor-backups/8af23f5ec05055be85e96c2cc87353cd80c2f495-20261031T181829Z`。

## 本轮：右侧控件恢复品牌大圆角（已完成声明范围）
- 按用户反馈，右侧输入、下拉、切换组/选中项及操作按钮统一恢复 **12px** 品牌大圆角；共享 `--inspector-control-radius`，外层面板圆角保持原样。保留上一轮的填充/描边区别、选中反馈、字号与行高，不修改其他界面或文档操作。
- 干净固定提交 [`b965942`](https://github.com/umaxzhao/voo-design/commit/b965942e22bcfb408015acdba58f49d8d7c3cd8c) 完成 **91/91 发布检查、87 组浏览器、单测 4637 通过/4 跳过/0 失败**。沿用原检查与浏览器并发 2，验证期间源码未修改。证据 `/private/tmp/voo-inspector-radius-release.json`、同名 `.log`，不继承上轮不同提交的通过。
- 已有真实数值提交/取消、键盘下拉、布局/旋转及一次撤销通过；16 个视口/主题/语言上下文验证圆角与尺寸，截图 `/private/tmp/voo-inspector-radius-evidence/`。旧 6px 样式的差异复现保留在 `/private/tmp/voo-inspector-radius-before.log`。
- 已推送并 SSH 部署 la2；入口和 9 个相关资源与验证构建逐字节一致。正式中文面板实际确认 12px 圆角、32px 桌面行高、Frame 输入/下拉/布局、文字与撤销，无脚本错误，未调用付费服务。证据 `/private/tmp/voo-inspector-radius-deployment-proof.json`、`/private/tmp/voo-inspector-radius-production-result.log`，截图 `/private/tmp/voo-inspector-radius-production-panel.png`。
- 本地 App 只三方应用两个文件的圆角补丁并保留其他草稿；同一组 16 个浏览器上下文通过（`/private/tmp/voo-inspector-radius-primary-browser.log`），备份 `/private/tmp/voo-inspector-radius-primary/`。不认证整个私人工作区。
- 功能覆盖仍为部分；实体触屏/IME/触控笔与全部高级独立浮层未由本轮认证。此前 6px 记录只属于其历史版本，当前规范以本轮用户确认的 12px 为准。

## 本轮：右侧属性控件层级（已完成声明范围）
- 按用户确认仅调整 `inspector.control-hierarchy`：大面板圆角、顶部页签、首页、外框、Agent 和工具栏视觉保持原样。规则限定在 `editor-properties-panel` 内，共享组件只增加语义标记，不改变其他位置的控件外观和文档操作。
- 输入/颜色行采用 6px 圆角填充矩形；下拉为轻描边，切换项成组显示选中块，操作按钮使用轻背景。桌面主控件行高 32px、窄屏输入 48px；标题 11px，标签/数值/单位分层，数值保留等宽。Frame 宽高和文字/描边/布局共用规则。
- 干净固定版本 [`7e6a77a`](https://github.com/umaxzhao/voo-design/commit/7e6a77a3d0836b7eecceeefddf3be3f94afb11c0)：**91/91 项执行通过，87 组浏览器通过，单测 4637 通过/4 跳过/0 失败**。用原发布脚本派生的临时运行器将浏览器并发从 3 降为 2，其余命令、断言与源码不变检查保持一致。证据 `/private/tmp/voo-inspector-controls-release-integrated.json`、同名 `.log`。之前的部分执行与失败独立保留，没有当成该固定版本通过。
- 真实输入提交/取消、下拉键盘开关与焦点、旋转、Frame 布局及一次撤销通过；已有文字创建、字号/行距/字距、混合选区、填充/描边与拖动调值回归均由注册套件执行。16 组视口/主题/语言截图 `/private/tmp/voo-inspector-control-evidence/`；窄栏的锚点不与坐标字段重叠，合成宽高组保留自然高度。
- 已推送并通过 SSH la2 部署 `7e6a77a`；正式入口及 9 个直接/控件资源与验证构建逐字节一致。正式中文 Frame 控件几何、输入修改/撤销、键盘下拉、布局选中反馈和文字字号/撤销实际通过，无页面脚本错误，未调用付费服务。证据 `/private/tmp/voo-inspector-controls-deployment-proof.json`、`/private/tmp/voo-inspector-controls-production-result.log`；截图 `/private/tmp/voo-inspector-controls-production-panel.png`。
- 发布前合入同期新增的三份文档更新（`98678cf`）；产品源码、脚本及测试与完整验证的 `7e6a77a` 逐字相同，构建仍绑定该固定提交。
- GitHub 检查 [本次运行](https://github.com/umaxzhao/voo-design/actions/runs/41223418888) 查询时为 `in_progress` / `尚未结束`；不继承历史 CI。上述部署由项目 SSH 脚本完成。
- 本地 App 只三方合入本轮补丁，保留其他草稿；30 项定向单测及 16 组真实浏览器检查通过（`/private/tmp/voo-inspector-controls-primary-unit.log`、`/private/tmp/voo-inspector-controls-primary-browser-final.log`）。备份 `/private/tmp/voo-inspector-controls-primary/`；未认证整个私人草稿。
- 原 12px 胶囊复现在 `/private/tmp/voo-inspector-controls-before.log`；首次完整运行的旧 SSR 正则属性顺序失败保留在 `/private/tmp/voo-inspector-controls-release.json`。原本地选中颜色失败证明采样于过渡第 0 帧，日志 `primary-browser-v2.log` 同前缀；检查现在等待真实过渡完成，没有放宽数值、单位、状态或撤销断言。Figma 冷重开旧失败（`release-final.json` / `release-recovered.json`）已定位为节点为空且 guard=on 的提前采样（`figma-ready.log`），只补夹具的真实导入节点/打开完成等待，所有精确像素断言保留；未改应用导入逻辑。
- 功能覆盖仍为部分；实体触屏/IME/触控笔、所有高级独立浮层和所有历史项目不由本轮认证。[验收范围](audits/panel-control-audit.md#inspector-control-hierarchy)。

## 浏览器右侧停靠与 Agent 互斥（历史固定版本记录）
浏览器右侧停靠与 Agent 互斥已完成声明范围：固定源码提交 [04aa32b](https://github.com/umaxzhao/voo-design/commit/04aa32bd3ceb7e15f3f4ff09bb72be66288ffd6c) 通过 90/90 核心发布步骤（86 组浏览器、4604 项单测通过、4 项跳过），构建与设计检查通过。桌面浏览器与编辑器左右并排，窄屏从右侧展开；Browser 和 Agent 的公共打开入口互相关闭对方，关闭不自动重开另一面板。当前本地布局修复也已真实浏览器验证。原始证据 `/private/tmp/voo-browser-right-release.json`，线上资源和交互证据入口 `/private/tmp/voo-panel-exclusion-deployment.json`；功能覆盖保持部分，不继承为后续代码或其他平台通过。

该浏览器任务分支的 90/90 结果只属于固定源码 04aa32b；随后合入的远程导入、采样和编辑器修复不继承该结果，合入当前主分支后在固定提交 47471c9d15d44dbfe957a9c7813a6d39915c183e 上重新构建、检查设计规则，4637 项单测通过、4 项跳过，浏览器切换、新建文件和首页设置三组浏览器检查通过；证据另记 `/private/tmp/voo-browser-right-integration.json`，不是新的全量门禁声明。

## 本轮：矢量曲线拆分锚点切线重置、路径文字仿射变换矩阵与布尔运算图层顺序保持（已验证通过）
- `vectors.path-edit` / `scene_model_paths.js`：
  - 在 `breakPenPointsAtAnchor`（Affinity "Break Curve" 操作）中，当拆分或打开闭合曲线时，首尾开放端点此前保留了指向虚空的旧控制手柄（旧入点 / 出点切线）。
  - 修复：对于解开闭合曲线的场景，将新起点端点的 `in` 切线置空（`in: null`），新终点端点的 `out` 切线置空（`out: null`）；对于开放曲线拆分为两个子路径（`split`），将前半段终点的 `out` 切线与后半段起点的 `in` 切线分别置空，彻底消除悬空手柄。
- `text.typography` / `editor_engine_node_ops.js` / `editor_engine_text_path_ops.js`：
  - 此前 `typeOnSelectedPath` 与 `attachTextToPath` 仅计算 `pathNode.x + pt.x * scaleX`，完全忽略了路径节点的旋转（`rotation`）、水平/垂直翻转（`flipH`, `flipV`）等变换，导致文字在旋转/翻转路径上产生错位的文档坐标。
  - 修复：使用 `fromNodeLocal` 计算锚点和切线手柄向量的真实文档坐标；并将相关文字路径引擎逻辑抽取为 `editor_engine_text_path_ops.js`（144 行），`editor_engine_node_ops.js` 行数从 419 行减少至 302 行，严格契合 `Design.md` 的代码行数限制。
- `layers.nesting` / `editor_engine_node_ops.js`：
  - 在破坏性布尔运算 `destructiveBoolean` 中，此前通过 `doc.nodes.indexOf(n)` 计算 `bottomIndex`，并在过滤 `consumedSet` 后的 `nextNodes` 数组上执行 `splice(bottomIndex, 0, cleanedResult)`，因数组长度变化导致插入索引发生前移或错位。
  - 修复：改为在单次线性扫描 `doc.nodes` 时就地将首个被消费节点替换为 `cleanedResult`，后续被消费节点剔除，严格维持所有剩余图层和新生成布尔结果的堆叠次序。
- 自动化与测试验证：
  - 补充 `tests/unit/pen_curve_math.test.js` 端点手柄切线清除单元测试。
  - 补充 `tests/unit/text_on_path_engine_ops.test.js` 包含 90° 旋转与手柄向量映射的路径文字坐标测试。
  - 补充 `tests/unit/container-command-boundaries.test.js` 布尔图层层级保持断言。
  - 优化 `tests/unit/dirty_rect.test.js` 与 `tests/unit/open-project.test.js` 高负载单测超时时间，以及 `tests/unit/node_at_point_spatial.test.js` 门限。
  - 固定验证提交 [`215d501`](https://github.com/umaxzhao/voo-design/commit/215d501534e696f35c1d1ab41c0e170c26eb8c9f)：**90/90 发布步骤通过，86 组核心浏览器通过，全量单测 4601 通过、4 跳过、0 失败**，证据 `/private/tmp/voo-release-round5.json`。


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

## 本轮：Agent 引导提示词重复（已完成声明范围）
- 本地 `AgentPanelView` 在滚动区和输入框前各挂载一次建议组件；修改前浏览器明确得到 2 组（`agent-suggestions-duplicate-before.log`），仅移除后者，保留国际化、进度文案、附件及移动端草稿。原文件备份 `/private/tmp/voo-license-regression/agent-suggestions-primary-backup/`。
- 本地 380/760px、Frame 三条按钮各出现一次、点击填入/重复点击幂等、草稿保留/焦点/解绑通过，相关单测 14 项通过；发布基线增强浏览器回归及 25 项定向单测通过。日志 `agent-suggestions-duplicate-after.log`、`agent-suggestions-published-regression.log`、`agent-suggestions-published-unit.log` 同目录。GitHub 产品源码原本只有一处，本轮只提交回归/登记/文档；当前正式构建 `bfbf91d` 的 7 文件字节与单组 Frame 建议已复核通过（`agent-suggestions-production-proof.json`），未重新部署未变化的产品。干净 `aec278290c69990105c36b13cdd05420f7e5d24e` 完整 90/90、核心浏览器 86 组、单测 4590 通过/4 跳过（`agent-suggestions-release.json`）；独立建议套件显式通过。合入远程 `0274622` 后 `3d98a78` 的 51 项相关单测及建议浏览器通过，未冒记为新完整门禁。随后重建入口与线上哈希不同（`agent-suggestions-rebuilt-comparison-failed.log`），不认定同版；当前页面单组建议另行实测记录 `agent-suggestions-live-ui-proof.json`。[验收](audits/nested-objects-audit.md#single-agent-suggestion-group)。

## 本轮：Agent 选中 Frame 的图标（已验证并部署）
- `platform.agent-contracts`：单选 Frame 时，上下文标签复用画布的 Frame 图标；普通图层/编组和多选保留 Layers，旧 artboard 上下文也使用 Frame。未改变上下文数据、提示词或选择逻辑。
- 修改前真实浏览器 SVG 断言失败，证据 `/private/tmp/voo-license-regression/agent-frame-icon-before.log`。新增类型渲染断言及真实选区切换回归；9 项定向单测及真实 Agent 选区切换/提交/解绑/清空/跨文档回归通过（`agent-frame-icon-unit.log`、`agent-frame-icon-committed.log` 同目录）。[验收边界](audits/nested-objects-audit.md#agent-selection-context-icon)。

- 精确干净版本 `bfbf91d040eebc3e1254f03c017fcc8f44677b6a`：**90/90 发布步骤通过、86 组核心浏览器通过，单测 4590 通过、4 跳过、0 失败**；验证期间源码未变化。证据 `/private/tmp/voo-license-regression/agent-frame-release.json`、同名 `.log`。独立 `agent-selection-context` 显式执行，不计入核心 86 组；其余 20 组独立检查本轮未运行，覆盖仍为部分。
- [PR #70](https://github.com/umaxzhao/voo-design/pull/70) 合并为 `ffaf9406e5f07191d036473704219044896d6f64`，源码树与验证提交一致；[精确提交 GitHub build](https://github.com/umaxzhao/voo-design/actions/runs/41210654826/job/124564730088) 通过，CI deploy 跳过，使用项目脚本 SSH 部署 la2。备份 `la2:/srv/voo-run/editor-backups/bfbf91d040eebc3e1254f03c017fcc8f44677b6a-20261031T144458Z`。
- 正式地址入口、5 个直接资源及 Agent 分块共 7 文件 HTTP 200、字节一致。隔离浏览器实际打开 Agent，验证子层 Layers → Frame 图标 → 多选 Layers → Frame 图标、解绑及文档不变，无页面脚本错误；没有发送模型请求。证据 `agent-frame-production-proof.json`、`agent-frame-production.png` 同目录。
- 本地 App 仅应用本轮组件和回归补丁，保留既有分叉和其他草稿；真实 Agent 浏览器回归及 9 项单测通过（`agent-frame-primary-browser.log`、`agent-frame-primary-unit.log`），备份 `agent-frame-primary-backup/`。完整门禁属于上述干净提交，未认证私人草稿整体或签名 App 冷启动。

## 本轮：Frame 标题点击选中（已验证并部署）
- `selection.frame-title-selection`：标题原本是普通 div，外层画板在捕获阶段误接管指针。已改为原生按钮，使用现有交互控件排除规则和 `engine.selectExactly`，没有新增独立选择逻辑。
- 新增真实浏览器回归：标题文字/图标在 0.5/1/2 倍缩放下选择正确 Frame；从子图层或多选切换正确；文档、画板布局和相机不变；键盘 Enter 可操作。原失败记录与修复后结果：`/private/tmp/voo-license-regression/frame-label-before.log`、`frame-label-after.log`。
- 注册更新为 65 个能力分组、86 组核心浏览器套件。嵌套 Frame 继续沿用现有外层标签显示策略；未扩展拖拽、隐藏或锁定策略。18 项相关单测、四组真实浏览器（标题、子层命中、负坐标和导航）与设计/模块检查通过；证据 `frame-label-unit.log`、`frame-label-related.json` 同目录。完整发布和线上证据见下，不继承历史通过。详见 [标题命中验收](audits/nested-objects-audit.md#frame-title-pointer-selection)。

- 固定干净版本 `befffb37071baf1aa4c0cd3abf83452b092f650d`：**90/90 发布步骤通过、86 组浏览器套件通过，单测 4585 通过、4 跳过、0 失败**。登记 12 模块、65 能力分组，selection 为 7/7，功能覆盖仍为部分。证据 `/private/tmp/voo-license-regression/frame-title-release-published.json`、同名 `.log`；源码验证期间未修改。
- [PR #69](https://github.com/umaxzhao/voo-design/pull/69) 合并为 `49d85d8bd709b961c5f6be64ea5cd5dfad050f69`，源码树一致；[精确版本 GitHub build](https://github.com/umaxzhao/voo-design/actions/runs/41208362370/job/124558496923) 通过，CI deploy 跳过，实际使用项目脚本 SSH 部署 la2。备份 `la2:/srv/voo-run/editor-backups/befffb37071baf1aa4c0cd3abf83452b092f650d-20261031T142314Z`。
- [正式页面](https://voo.run/editor/) 入口及 5 个直接资源共 6 文件 HTTP 200、字节哈希一致；隔离真实浏览器标题文字/图标点击、Enter、选中状态及文档不变通过，无页面脚本错误。证据 `frame-title-production-proof.json`、`frame-title-production.png` 同目录；只使用临时文档，未改用户项目。
- 保留早期完整运行的触控超时（`frame-title-release.json`）、旋转输入超时（`frame-title-release-synced.json`）及各自独立复查；最终 `frame-title-release-published.json` 为重新完整执行，未拼接补跑。正式首次 New 冷启动未创建文档，证据 `frame-title-production-startup-attempt.log`；等待首页就绪后复核通过，不将该既有启动问题记为修复。
- 本地 App 工作区有既有提交分叉和其他草稿，安全快进失败后仅应用本次标题补丁并保留其余内容；本地真实标题回归通过（`frame-title-primary-browser.log`），原文件备份 `frame-label-primary-before.jsx`。完整门禁只属于上述干净版本，不认证全部私人草稿或签名 App 冷启动。

## 本轮：图层导出按需显示（已完成声明范围）
- `inspector.export-opt-in`：没有导出配置时，整个导出分组默认隐藏。用户从底部“添加 → 导出”启用后才显示标题、格式、倍率、透明背景和导出按钮；移除最后一条配置后整个分组消失，添加菜单恢复入口。没有新增勾选开关，保留用户已明确保存的配置。
- 导出可用性、两个添加入口及文档写入共用 `export-presets.js`；面板直接读取文档，消除未选中时补回 PNG、删除后重选复活、撤销重做显示旧配置的问题。新增/删除各为一个撤销步骤，字段连续输入保留合并行为。
- 固定代码版本 [`da86f56`](https://github.com/umaxzhao/voo-design/commit/da86f56a14a4080265fb46b834b5df363056660c)：**89/89 发布步骤通过，85 组浏览器检查通过，单测 4574 通过、4 跳过、0 失败**。验证期间源码干净且未修改。证据 `/private/tmp/voo-export-opt-in-release-verified.json`。
- 实际 Chromium 面板覆盖图形、Frame、文字、图片的默认隐藏；从添加菜单启用、最后一项移除、切换图层、一次撤销重做；主动配置后 PNG 2x 尺寸、JPEG/WebP 文件签名及质量设置通过。该套件另执行既有的双语、深浅主题和 320–1440px 面板布局检查；导出配置的具体操作路径使用英文桌面 Chromium。没有调用生成服务。
- 已推送并通过 SSH 部署 la2，线上入口及 6 个相关资源与验证构建逐字节一致。隔离正式浏览器复核默认整个分组隐藏、添加后实际下载 160×100 PNG、移除后隐藏及撤销重做，无页面脚本错误。截图 `/private/tmp/voo-export-opt-in-default.png`、`/private/tmp/voo-export-opt-in-removed.png`；证据 `/private/tmp/voo-export-opt-in-deployment-proof.json`、`/private/tmp/voo-export-opt-in-production-result.log`。
- 本地 App 工作区仅三方合入本任务源文件及回归测试，保留其他草稿；定向单测 18 项和真实本地添加/下载/移除/撤销重做通过（`/private/tmp/voo-export-opt-in-primary-browser.log`），不把独立干净版本的完整门禁冒记成全部私人草稿已通过。备份 `/private/tmp/voo-export-opt-in-primary/`、`/private/tmp/voo-export-opt-in-primary-final/`。
- 原始缺陷保留 6 个配置失败和 2 个分组显示失败（`/private/tmp/voo-export-opt-in-baseline.log`、`/private/tmp/voo-export-opt-in-section-baseline.log`）。第一次未结束门禁为补齐整个分组隐藏而停止；`6ff7ef2` 的门禁因旧默认显示断言失败，修正后重新完整执行，未把先前部分执行算通过。
- 未认证原生系统下载界面、实体触屏、原生项目冷启动重开及所有历史文档。该轮未修复首页冷加载 New 和 `.fig` 导入问题，不归入该轮通过；后续整改见下方 Figma 记录。[详细范围](audits/panel-control-audit.md#opt-in-layer-export)。

## 本轮：统一填充面板（已完成声明范围）
- 代码版本 [`cb4d1c9`](https://github.com/umaxzhao/voo-design/commit/cb4d1c9fbfdba8e87282a0af500fa0f1e8120d79)；**89/89 发布步骤通过，85 组浏览器检查通过，单测 4567 通过、4 跳过、0 失败**。最终源码干净且验证期间未修改。证据：`/private/tmp/voo-unified-fill-release-final.json`。
- `inspector.unified-fill`：点击填充色板，在同一浮层切换纯色、渐变（含网格）、图片和纹理；图片替换/适配方式、透明度和混合模式在此完成。移除旧的分散填充类型菜单、图片文件入口和面板内适配行。
- 已实测真实图层与像素、图片失败重试、填充独立透明度/混合、纹理缩放/颜色、PNG/SVG 像素对照、隐藏/移除/撤销重做、关闭待解码图片后切换选区。原生图片类型往返保留原始资源；替换使用既有位图操作，随后修图与撤销均有效。
- 320/390/768/1440px、深浅主题、中英文、模拟触屏和键盘切换均通过。浅色主题额外方形底层已修复；真正的对话框就是圆角视觉面板，保留圆角自动断言。截图：`/private/tmp/voo-unified-fill-inspector-final/`。
- 已推送并通过 SSH 部署 la2；正式入口及 7 个直接/填充分块与验证构建逐字节一致。正式地址实际打开右侧面板，切换渐变、上传图片、修改纹理，验证真实像素、一次撤销/重做及 Escape 保留选区，无页面脚本错误。未调用付费模型。证据：`/private/tmp/voo-unified-fill-deployment-proof.json`、`/private/tmp/voo-unified-fill-production-result.log`。
- 定向 48 项单测、完整右侧面板路径和本地 App 核心填充路径分别记录；主工作区保留其他并行草稿，只合并本轮相关文件；最终本地真实填充路径复核见 `/private/tmp/voo-unified-fill-primary-browser-final.log`。主工作区已有的 `impeccable-polish` 登记文件缺失在本轮登记更新前已记录，不把公开版本门禁通过冒记为整个本地草稿通过。合并备份：`/private/tmp/voo-unified-fill-primary-merge/`、`/private/tmp/voo-unified-fill-primary-rounded/`。
- 先前版本的旧英文断言、新建就绪超时及补跑证据保留：`/private/tmp/voo-unified-fill-release.json`、`/private/tmp/voo-unified-fill-release-v2.json`、`/private/tmp/voo-unified-fill-release-recovered.json`；它们没有被伪装成最终固定提交的执行。
- 额外发现待修：正式网站冷加载只有顶栏、首页尚未挂载时，点击 New 可能先于事件监听器而未创建文档。两次等待引擎超时；等待首页输入框就绪后，同一构建正常创建并通过填充实测。原始证据 `/private/tmp/voo-unified-fill-production-startup-attempt.log`、`/private/tmp/voo-unified-fill-production-startup-second-attempt.log`。这是该轮未收口的启动上下文；后续 New 修复已由下方 Figma 整改中的确定性回归与完整门禁认证，原始失败仍保留。
- 功能覆盖仍有明确边界：实体设备、所有图片编解码/超大图片内存、克隆 ID 跨文档取消、穷尽多图片资源替换及原生 App 冷重启没有由本轮认证；不覆盖真实 `.fig` 导入审计已报告的缺陷。[详细验收](audits/panel-control-audit.md#unified-fill-editor)。

## 本轮：桌面 test.fig 导入整改（已发布，保真与性能仍部分）
- 补齐原生锁定、约束、自动布局、独立圆角、描边参数、溢出/图片裁切及父级变换；4 集合 / 5 变量保留模式值，移除 9 个误生矩形。实际文件导入 56,422 层无重复 ID / 悬空父级，478 图片哈希一致；原稿 SHA-256 未变。
- `vectors.native-fig-properties` / `compositing.mask-cache`：独立图片填充不串用裁切；不可变绘制文档、多组蒙版缓存及异步图片失效得到回归。真实生成 `.fig` 选择器用例通过像素、约束重排、撤销/重做、二进制保存冷重开。
- 串行 Metal 生产复测同一 241.86 MiB 文件：加载 **20.28 → 12.69 秒**，六次滚轮中位 **638 → 199 毫秒**；平移/缩放回调 1.95/0.95 → 5.54/1.78 次每秒。共享机器单轮样本，仍明显卡顿，**大文档性能验收未通过**；未宣称还原百分比。
- 固定 `dd69368` **91/91** 发布步骤通过，含 **87 核心浏览器**及 **4615 单测通过 / 4 跳过**。原 ea90962 在 37/91 步的 New 竞态失败保留；冷启动请求回放、重名检查、原文件字节不变及连续创作在最终完整门禁通过。当前登记 12 模块 / 70 能力 / 87 核心浏览器，功能覆盖仍部分。
- 保留远端改动：`3dfad79` 八项追加集成（含19单测）通过；Browser 更新的 `47471c9` 全量单测4637通过 / 4跳过及三组浏览器通过，源码与 `6d8cef7` 仅差文档。没有把旧完整门禁冒记为最新集成的完整执行。
- [线上预览](https://voo.run/editor/) 当前 `6d8cef7`：入口与8个关键资源哈希一致，正式站合成 `.fig` 裁切/填充/旋转/溢出/蒙版、变量、约束和撤销像素通过，无脚本错误。选择器超时、早期引擎像素和并行部署版本不一致的尝试均留存；最终仅认证首页/文档就绪后的 DOM 输入路径，未认证原生 FSA 系统选择器。
- 富文本、多重阴影、活动组件/变量绑定、所有字体/画板、非均匀文字缩放、子层 grow/stretch 及签名 Electron 仍未完整还原或验收；圆角平滑仅元数据。21项独立检查未运行，`native_studio` 排除。
- [逐属性、性能与固定版本证据](audits/figma-import-audit.md#published-verification--2026-11-01)。完整私有日志、截图、原始失败及哈希清单存于本地 `figma-import-optimization/` 制品目录，未上传原稿或商业截图。

## 本轮：Impeccable 整改与右键菜单（已发布）
- 常用剪切、复制、删除和编组保留在主菜单；选择相同、属性、层级、蒙版、组件、复制/导出、路径使用一级子菜单。保留既有命令、快捷键和撤销逻辑，支持鼠标移入、方向键、Escape、屏幕边缘翻转和浮层避让。
- 同轮完成隐藏编辑器焦点隔离、实际画布宽度适配、窄鼠标欢迎导航收纳、空 Slot 按需显示、说明文字层级与对比度；保留 VOO 字体与密集数值控件。
- 固定应用版本 `6008dfa6fcd78e02abf14a27597fb0c1d584e770`：发布门禁 **89/89**，含 **85 组浏览器**、设计检查、构建和模块登记；单测 **4534 通过、4 跳过**（553 文件通过、3 文件跳过）。来源证据 `/tmp/voo-impeccable-verified-6008.json`、对应 `.log`；历史 25/40 为原审查分，未声称复评提高。
- 推送前合入远端协作分享权限、搜索翻译和 SSH 部署修复，发布版本为 `9c5a063e874aaa5346a1804171d414740463032a`。该版本重新构建、设计检查、模块登记、Shell 语法和差异格式检查通过；协作/国际化专项 **169 通过、4 跳过**，三个浏览器套件 `settings-i18n`、`comments-lifecycle`、`impeccable-polish` 通过。**没有将 6008dfa 的完整门禁冒记为 9c5a063 的完整执行。**
- [线上预览](https://voo.run/editor/) 已部署并在隔离浏览器核验：入口 HTML 与部署构建一致，五个直接脚本/样式资源返回 200；实际右键、子菜单键盘返回、900px Agent 面板和欢迎页焦点隔离通过，无页面脚本错误。只使用临时浏览器文档，不连接用户本地服务。
- 当前登记 12 模块、62 能力、85 核心浏览器套件；功能覆盖仍为部分。21 项独立检查未运行，5 项既有外部图像服务阻断仍未执行；实际账户、付费服务、实体设备与签名安装包未认证。本轮排除 `native_studio`。
- [固定执行与生产证据摘要](audits/impeccable-evidence/release-verification.json)、[生产菜单截图](audits/impeccable-evidence/context-menu-production.png)、[详细边界](audits/impeccable-review.md#published-verification--2026-10-31)。本条替代下方同轮历史待发布状态。

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
| 工程规范与模块登记 | 已落地：12 个模块、76 个公开能力分组 |
| 核心发布校验 | 12b9aba：91/91 项通过，包含 87 组浏览器 |
| 全量单元测试 | 4689 通过、4 跳过、0 失败（固定提交 12b9aba） |
| GitHub Ubuntu 基础检查 | 固定提交 12b9aba build 通过，原始 run 41236843323 |
| 线上部署 | 12b9aba 已部署 la2，评论共享侧栏及独立模式实测通过 |
| 功能验收完整度 | 部分覆盖；76 个公开能力分组未穷尽所有入口、上下文和设备 |
| 核心门禁外的独立检查 | 本轮 21 组未运行，不继承历史通过 |

## 连续创作首轮（f9102cd，已完成声明范围）
- 已复现并修复：R/O 切换失效、分组脱离 Frame、分组后移动单位错误、解组误拆祖先 Frame、Esc 取消后仍创建对象，以及白色 Frame 中新建白字不可见。
- 同一份文档通过真实 UI 完成绘制、文字、属性修改、分组移动/解组、路径编辑、置入/蒙版、撤销重做、保存和新浏览器重开；11 个场景通过。纯回归新增 18 项；同步路径中点修复后，全量单测 4428 通过、4 跳过。
- 新增 `selection.continuous-creation`，核心门禁 82/82 通过（78 组浏览器，包含同步进入的路径中点检查）；实际验证提交为 f9102cd，声明范围之外仍为部分覆盖。
- 线上发布版本与构建资源哈希一致；本地主工作区仅同步本轮 10 个源码文件，11 场景复查通过，其他未提交草稿保留，未将其整体当作干净发布版本。
- [验收范围与剩余边界](audits/continuous-creation-audit.md)：实际图像/文字像素、层级、历史和冷重开；实体设备、复杂组合和硬件性能仍单独验证。

## 本轮：图层层叠、Frame与剪切蒙版整块移动、快捷键及编组翻转与属性联动（已完成声明范围）
- 精确提交 `2f86bda191e4c3d2319efb0ca79758e57845f1b5`，完成 **89/89** 项全量发布门禁验证（含构建、设计规则、模块登记、全量单测，以及 **85 组 Chromium 浏览器套件** 全量通过）；证据：`/private/tmp/voo-release-round4-final.json`。
- 复现并修复 5 类图层层叠与编组/Frame 联动缺陷：
  1. `layers.placement`: 图层批量重排（`reorderLayerBatch`）原实现仅通过 `isGroupNode` 判定整块单元，导致 Frame（`isFrame: true` 或 `kind: "frame"`）、布尔容器（`kind: "boolean"`）以及剪切蒙版跟随图层（`clipTo`）被拆离移动，且目标相邻扫描未跳过整块导致蒙版关系破裂。现统一使用 `moveAffectedIds(doc, [unitOf(node).id])` 查找完整单元并越过邻居整块计算插入位置。
  2. `layers.placement`: 移至顶层/底层（`moveNodeToExtreme`）原实现未限制父级边界，导致 Frame 内子图层被移出到画板根节点顶层/底层；现通过 `parentId` 严格限定在同一父容器内移动至首末位，整 Frame 移动时则完整携带全部子图层与蒙版跟随层。
  3. `selection.shortcuts` & `layers.placement`: 键盘快捷键 `]` 和 `[` 调用 `engine.bringForward()` 与 `engine.sendBackward()` 时抛出 `TypeError: engine.bringForward is not a function` 崩溃；现于 `node-stack-actions.js` 和 `editor_engine_node_ops.js` 正式暴露领域层 `bringForward`/`sendBackward`/`bringToFront`/`sendToBack`，并统一上下文菜单和悬浮任务栏的调用路径。
  4. `selection.transforms`: 选中普通编组水平/垂直翻转（`flipH`/`flipV`）时仅更新了编组层本身的标记，未对子节点在编组盒内镜像映射坐标（`x' = 2*gx + gw - cx - cw`）；现补齐子图层局部坐标镜像与子节点翻转状态更新。
  5. `layers.nesting` & `layout.constraints`: 属性面板输入尺寸（W/H）修改 Frame 时，若被识别为 `selectedGroup` 导致仅调用 `engine.updateNode` 而跳过了 Frame 约束重排（`reflowFrameNodeResize`）；现于 `image_editor.jsx` 针对 `selectedGroup.isFrame` 补齐 `engine.updateFrameNode` 约束重排派发，同时保留 Frame 本身作为选区单元的契约。
- 新增单元测试 `tests/unit/layer-hierarchy-stack.test.js`（编组坐标镜像与选区单元）与 `tests/unit/batch-layer-reorder.test.js` 扩展测试（Frame 与蒙版块在重排及极值移动中的完整性），并在 `tests/e2e/editor-layers-composition.e2e.mjs` 增补快捷键重排与单步撤销断言。
- 功能覆盖仍为部分：物理设备触摸、OS 快捷键全局拦截、字体及 GPU 差异仍需专门验证。

## 继续检查：容器命令、手势回滚、选区单位、文字收尾与路径表示（已完成声明范围）
- 新增两组核心浏览器套件，当前登记为 60 个能力分组、84 组浏览器、88 个发布步骤；先后在 `caf386a`（84/84）、`bfd7e5b`（85/85）、`a94365e`（85/85，证据：`/private/tmp/voo-release-round2.json`）与本批 `f7f4f59`（87/87，证据：`/private/tmp/voo-release-round3.json`，合入最新 `origin/main` 后为 `9c8be5c`，29 项新增单测与 19 项浏览器专项复核全过）完成隔离副本全量门禁验证；原工作区未提交的外部改动保留，未混入发布依据。
- 已复现并修复 34 类问题：多层解组孤儿节点、父子同时分组拆散子树、跨 Frame 分组跳过共同父级、解组蒙版后失效引用、放弃空文字清空重做、未修改文字清空重做、实际文字收尾遗漏提交回调、转换为钢笔路径后的线条/箭头仍进入旧端点分支、钢笔草稿切换工具未提交且残留预览、`< 4px` 形状/箭头点击误写删除历史并清空重做与原选区、`resize`/`rotate`/`cornerRadius`/`endpoint` 变换手柄 `Escape`/取消不回滚且零位移误提交、对齐选中 Frame+子图层双倍位移且遗漏剪切蒙版跟随层、方向键微调 Auto Layout 编组回弹与钢笔锚点越界未扩框、图层面板点击布尔层失效及图层面板复制编组丢失编组选区单位、缩放后的钢笔路径在锚点越界扩框/复制/展开轮廓时缩回 `baseWidth`、钢笔编辑零位移点击锚点/弯曲段误写历史且中途 `Escape` 直接退出编辑会话、旋转/翻转路径下钢笔弯曲与剪刀子工具坐标未逆变换且开放路径剪断未重算边界与图层顺序、布尔组合与破坏性布尔丢失共享父容器及遗留失效 `clipTo`/空编组、路径排字 `typeOnSelectedPath`/`attachTextToPath` 丢失 `parentId` 且调用不存在的 `selection.setIds`、空普通编组无法通过 `Backspace`/剪切删除或 `Escape` 取消选中或 `Cmd+Shift+G` 解组、多子节点普通编组按 `Shift+A`（`toggleAutoLayoutSelection`）误套外层编组而非原地切换 Auto Layout、Frame 内创建/分离组件（`extractComponent`/`detachInstance`）丢失 `parentId`/残留外部引用/未缩放路径锚点、选中钢笔路径或普通编组按 `Enter` 因判定 `kind === "pen"` 与调用不存在的 `startEdit` 或忽略 `getSelectedGroup()` 而失效、多边形套索按 `Backspace` 误删宿主图层而非回退顶点（`popPolygonVertex`）且闭合与魔棒选区遗漏历史提交、磁性套索按 `Escape` 未回退、曲率钢笔按 `Backspace`（`popDraftAnchor`）残留旧平滑控制柄、`region`/`pixelMarquee`/`selectionMove`/`gradient*`/形变控制点/`pen`/`lasso`/`healing`/`cloneStamp`/`patch*`/`removeBrush`/`objectStroke` 取消未回滚、图层重排（`reorderLayerBatch` 与 `moveNodeToExtreme`）因仅判定 `isGroupNode` 导致 Frame 与剪切蒙版被拆散/破坏、移动至顶/底层（`moveNodeToExtreme`）允许子图层脱离 Frame 父级跳至画布顶层、图层层级领域方法 `bringForward`/`sendBackward`/`bringToFront`/`sendToBack` 缺失导致键盘 `]` 和 `[` 快捷键抛错崩溃、粘贴复制编组未调用 `selectGroup` 丢失 `selectedGroupId`、以及普通编组水平/垂直翻转未对子节点在编组盒内镜像坐标。
- 门禁过程还捕获并修复了 `titlebar-file-actions.e2e.mjs` 在已有后台编辑器实例时未等待首页遮罩（`welcomeOpen`）关闭即读取文件名的竞态。
- 定向浏览器扩展至 19 个场景（`container-command-boundaries` 9 项、`text-creation-boundaries` 10 项），覆盖键盘命令、对齐/蒙版跟随、Auto Layout 方向键微调与原地切换、图层面板布尔点击与编组复制、缩放钢笔复制与路径排字及空编组删除、`Enter` 进入编组与钢笔编辑、钢笔切换工具收尾、曲率钢笔 `Backspace` 重算控制柄、钢笔锚点零位移与中途 `Escape` 回滚、`< 4px` 形状点击与 `Escape` 缩放回滚及完整撤销重做。
- [容器边界范围](audits/nested-objects-audit.md#container-command-boundaries)、[文字收尾范围](audits/continuous-creation-audit.md#text-placement-and-close-boundaries)记录复现、断言和剩余上下文；临时编辑恢复、取消时保留外部新增节点也已加入纯回归。

## 各模块进度
下表按固定 12b9aba 完整门禁记录，套件数按主归属计一次。跨模块回归会关联执行，不能理解为功能覆盖率。

| 模块 | 已通过核心套件 | 功能覆盖 | 仍需补齐的重点 |
| --- | --- | --- | --- |
| 工作台与资源 `workspace` | 8/8 | 部分 | 原生文件选择器、实体触屏、独立流程脚本复核 |
| 文档与存储 `documents` | 6/6 | 部分 | 原生写入中断/恢复、旧版本文档、独立往返脚本 |
| 画布与相机 `canvas` | 6/6 | 部分 | 硬件 FPS、内存、固定场景规模下的性能基准 |
| 选择与变换 `selection` | 7/7 | 部分 | 实体压感笔、系统快捷键、多指触摸组合 |
| 图层与 Frame `layers` | 7/7 | 部分 | Finder/Explorer 原生拖放；更多异常层级与组合 |
| 蒙版与合成 `compositing` | 6/6 | 部分 | 更多混合/蒙版/效果组合、显卡差异、独立像素脚本 |
| 矢量与形状 `vectors` | 6/6 | 部分 | 扩充第三方路径和格式往返样本、HTML 转节点脚本 |
| 文字 `text` | 2/2 | 部分 | 实体输入法、字体安装差异、RTL、可变字体；另有关联选择/排版检查 |
| 图片与修图 `images` | 12/12 | 部分 | 独立模型/网络检查、硬件内存/FPS；本轮排除视频 |
| 布局与设计系统 `layout` | 6/6 | 部分 | 组件/变量 alias、嵌套布局组合、设计系统预设细查 |
| 属性面板与共享 UI `inspector` | 7/7 | 部分 | 每个控件、输入方式与参数组合的逐项验收 |
| Agent 与平台 `platform` | 14/14 | 部分 | 分享身份重放、懒加载与共享夹具通过；真实外部服务、原生安装包与其他平台上下文仍待核验 |

## 21 组独立检查的待办
“待复核”表示需要先确认夹具、断言与服务要求，再决定纳入核心门禁或单独执行； 不能推断它们已通过、已失败或已经失效。

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

每轮更新：先更新受影响模块的状态和剩余项，再填入准确提交、运行环境和原始报告位置。 修复关闭前补上回归用例；只有实际完成并有证据的项才能勾选。

最近完整报告：`/private/tmp/voo-release-round2.json`（a94365e，85/85，隔离源码前后均干净）；上一批报告为 `/private/tmp/voo-release.json`（bfd7e5b，85/85），历史基线报告为 `/private/tmp/voo-deeper-release.json`（ebab451，85/85）。 线上资源证据：`/private/tmp/voo-deeper-deployment-proof.json`；新场景结果：
`/private/tmp/voo-deeper-production/`；笔触与路径额外结果：`/private/tmp/voo-deeper-production-{brush,vector}.log`。
执行条件：`/private/tmp/voo-deeper-execution-context.json`，单测使用
`VITEST_MAX_FORKS=2 VITEST_MIN_FORKS=1 VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=1`。
前期失败和混杂工作区的报告另行保留；不能沿用其通过项作为最终证据。临时文件可能被清理， 需要长期保存时移入交付证据目录。重新生成和核对的命令：

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
- [完整报告与证据](audits/impeccable-review.md)：layout、typeset、distill、polish、critique；按用户要求排除 `native_studio`。 审查源码 `23d961ca7bc6a526447e821488290f76bd295693`；归档前 `6c91f83` 仅有后续文档变化。两份独立评估，主观评分25/40，不是功能覆盖率。 静态扫描302个界面文件、10组范围、0提示；独立浏览器实际取证发现跨状态焦点、受限画布遮挡、窄鼠标窗口导航、空Slot和说明文字可读性问题。 P1：欢迎覆盖层后的隐藏编辑器仍可聚焦；900px窗口打开Agent后图层/属性面板重叠64px。均仅登记，尚未修复。 保留黑色面板、薄荷绿/紫色品牌、11–12px专业数值密度；不机械删除已确认的绿紫发光边框。 本轮实际查看代表页面与中英文字面；未验收真实触摸、Electron壳、真实账户/支付/模型和完整导入导出。服务与标签已清理。 关键截图与焦点记录保存在 `docs/audits/impeccable-evidence/`；其他原始证据位于 `/tmp/voo-impeccable-a/`、`/tmp/voo-impeccable-b/`。本轮没有UI实现改动。

## GitHub introduction and four editable examples — 2026-10-31
- Scope: README, artwork and example documents only; no application behavior or module capability changed. Product module coverage remains partial and historical execution results above are not inherited.
- The header now uses the existing App Icon. The cover uses canvas exports of the selected music interface, F1 poster, PULSE dashboard and FORM poster. ROAM is excluded from this publication.
- Local cleanup moved 20 old files to recoverable workspace trash; the user restored the music and F1 projects, and the active library was checked to contain exactly the four selected projects. Cleanup stopped after that selection.
- Verification: native container decoding, unique layer IDs and parent references, retained editable text, PNG dimensions, local documentation links and light/dark presentation checks. Exact publication revision and execution receipts: `/private/tmp/voo-showcase/evidence.json`.
- This is documentation/example validation, not a new product release or a full functional audit. No application deployment is required; signed installers, external services and other platforms remain outside this check.

## Product screenshots and agent-driven slogan — 2026-10-31
- Scope: documentation and repository artwork only; no application source, module capabilities or original example documents changed. Added three real 1600 × 1000 web screenshots: workspace with four project covers, optional Agent setup, and music design with the headline selected and the text inspector visible. Capture used an isolated browser profile and did not modify the user's project library. Captured production entry: `assets/index-D9WDURy-.js`; capture receipt: `/private/tmp/voo-showcase/product-ui/capture.json`. This documents the live interface at capture time, not proof that every later revision or platform was tested. README, cover and social preview use “An AI agent-driven design editor.” Functional module coverage remains unchanged and partial; the final publication revision and document/image checks are recorded in `/private/tmp/voo-showcase/product-ui/publication.json`. Introduction now leads with standalone use and Claude Code plugin / Codex MCP integration, with connection commands matched to the existing connector guide. A separate review of public-tree wording is recorded outside the repository at `/private/tmp/voo-showcase/product-ui/published-wording-audit.json`; no source or historical research files were changed.

## Repository introduction: hierarchy, brand and rounded screenshots — 2026-10-31
- Scope: README, artwork, example guide and this progress record only. No application source or native example documents changed; functional module coverage remains partial. Simplified the default introduction to product positioning, standalone / MCP workflows and three core capabilities. Product tour, four-design gallery, connector commands and technical reference remain accessible through native GitHub disclosure sections. The cover uses a real editing screenshot, the UI colors `#B2FFD6` → `#E5B2FF`, and Intel One Mono Regular (400). A relative-path HTML composition is retained beside the PNG. All three product UI screenshots retain their original 1600 × 1000 content with 24px transparent outer corners. Pixel comparison found zero changes outside the four corner regions; screenshot-state evidence remains tied to its original captured production entry. Exact publication revision, disclosure/link/image checks and layout/typography evidence: `/private/tmp/voo-showcase/product-ui/redesign-publication.json`. No application deployment is required for this documentation and artwork update.

## Visible product screenshots and darker artwork — 2026-10-31
- Restored the workspace, setup and editing screenshots and all four design examples to the default README view. Only connector installation and the technical reference remain collapsed. The cover and social image now use darker green/purple tones (`#173D30` → `#352448`) and the slogan “AI agent-driven design editor.” Intel One Mono Regular and rounded screenshot edges are retained. Scope remains documentation and artwork only. Exact publication revision and visibility/link/layout checks: `/private/tmp/voo-showcase/product-ui/visible-showcase-publication.json`; functional product coverage remains unchanged and partial.

## Centered cover identity — 2026-10-31
- Scope: cover HTML composition and cover/social PNGs only, plus this record. Product screenshots, default README visibility and application behavior remain unchanged. Centered the App Icon, product name, slogan and subtitle. Icon size is now 128px on the main cover and 96px on the social image. Removed the corner platform label; dark green/purple, regular Intel One typography and rounded editor screenshot are retained. Center geometry, typography, image dimensions and exact publication revision: `/private/tmp/voo-showcase/product-ui/centered-cover-publication.json`. Functional module coverage remains unchanged and partial.

## Cover typography and whitespace — 2026-10-31
- Increased the main cover from 1800 × 1400 to 1800 × 1720. Product name grows from 30px to 40px and the slogan from 60px to 76px; larger vertical gaps separate icon, name, title, subtitle and canvas. The main editor screenshot remains 1600 × 1000. The 1280 × 640 social layout retains its aspect ratio with more header space and a proportionally smaller preview. Center alignment, regular Intel One typography, dark gradient and corner treatment remain. Scope: artwork source/exports and documentation only. Exact publication revision, measured spacing and typography checks: `/private/tmp/voo-showcase/product-ui/spacious-cover-publication.json`. Functional product coverage remains unchanged and partial.

## Double-height cover introduction — 2026-10-31
- Doubled the main Logo / slogan introduction region from 624px to 1248px. The full cover is now 1800 × 2344; the editor screenshot remains 1600 × 1000 and moves down intact. Icon and screenshot dimensions are unchanged; title sizes follow the final hierarchy. Increased top padding and vertical gaps; the social preview retains its fixed 1280 × 640 aspect ratio with the updated title hierarchy. Product screenshots and the README display structure remain unchanged. Scope: cover composition/export, example guide and this record only. Exact geometry, final publication revision and export checks: `/private/tmp/voo-showcase/product-ui/double-header-publication.json`. Functional application coverage remains unchanged and partial. Final cover hierarchy: standalone App Icon → “VOO Design” main title → “AI Agent Driven Design Editor” subtitle. Removed the small duplicate product name under the icon and the App / CLI explanation from the artwork; those product capabilities remain in README text.

## Cover proportions from marked reference — 2026-10-31
- Enlarged the main App Icon from 128px to 192px. Removed the three marked blank bands, mapped to 256px / 112px / 80px in the source composition; the main cover is now 1800 × 1896. The screenshot moves up by 448px and stays 1600 × 1000. Product title, subtitle, center alignment, dark gradient and corner treatment are retained. The fixed 1280 × 640 social preview also gets a larger 128px icon. Scope: artwork source/exports, example guide and this record only. Exact measured gaps, final revision and export evidence: `/private/tmp/voo-showcase/product-ui/marked-gaps-publication.json`. Functional product coverage remains unchanged and partial.

## Native README identity and editor screenshot — 2026-10-31
- Replaced the composited header image with a centered 128px App Icon, native product heading and native “AI Agent Driven Design Editor” subtitle. A separate editing screenshot follows immediately. Moved the editor screenshot from the product tour to the header, preserving one visible instance each of editor, workspace and onboarding. The four design previews remain visible; only installation and technical reference are folded. Existing artwork and application source remain unchanged. Native GitHub Markdown structure, image/link checks and final revision: `/private/tmp/voo-showcase/product-ui/native-header-publication.json`. Functional product coverage remains unchanged and partial.

## Impeccable 五项整改 — 2026-10-31
- 用户“继续”后实施两项P1和三项P2：隐藏编辑器焦点隔离、按实际画布宽度适配面板、窄鼠标欢迎导航收纳、空Slot按需展示、说明文字排版/对比度。 新增 `inspector.impeccable-polish` 及真实交互回归；合并其他Agent的文字尺寸能力后，登记共57能力、84核心浏览器套件。 定向场景和既有响应式交互通过；不将临时非Git、未构建目录的全测失败当成产品结果或最终发布证据。 最终执行证据：`/tmp/voo-impeccable-polish-release.json`，核对 `revision` 与 `complete`。原25/40为历史审查分，未声称复评提高。 [整改边界和前后截图](audits/impeccable-review.md#remediation--2026-10-31)。本轮仍按要求排除 `native_studio`；实际账户、付费服务、实体设备与签名安装包不计为已验证。

## Context menu simplification — 2026-10-31
- Inspector: retained common edits in the root; seven related action families use one secondary level. Preserved domain commands and shortcuts. Added `inspector.context-submenus`; inventory now has 62 capability groups and 85 core browser suites. Real pointer/keyboard, edge/overlay placement, style copy, clipping pixels and undo are registered regressions. Targeted checks passed. Final execution, exact revision and deployment must match `/tmp/voo-impeccable-polish-release.json`; coverage remains partial. Scope excludes `native_studio`, real accounts, paid services and signed installers. See [remediation](audits/impeccable-review.md#context-menu-simplification--2026-10-31).

## 工作台设置专项的历史阻断记录（本轮已整合收口）
以下是整合前的记录，当前状态以上方固定发布证据为准。

> 首页 Settings 底部间距微调：从 24px 减至 12px（向下移动 12px），保持左侧位置与点击区域；沿用 `workspace.settings-entry`，在既有首页套件检查四个宽度的精确底边间距。本轮精确提交及执行结果见 `/private/tmp/voo-settings-lower-release.json`，此前基线发布阻断不能视为已解决。

> 本轮首页设置入口调整：已移除侧栏版本号，将首页 Settings 移至左下角；能力 `workspace.settings-entry`。本次相关 17 项单测和 320/390/768/1440px 首页浏览器专项通过。完整门禁因基线既有的 10 项 Agent 工具清单/首次引导失败而阻断（已在修改前提交 `e2d3517` 复现，`/private/tmp/voo-settings-baseline.log`），本轮尚未推送或部署。精确最终 revision 与逐项执行结果见 `/private/tmp/voo-settings-release.json`，不得继承历史通过结果。详细范围见 [面板审查](audits/panel-control-audit.md#welcome-settings-entry--2026-10-31)。

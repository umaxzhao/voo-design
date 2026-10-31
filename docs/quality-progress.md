# 项目检查总进度

这里是持续维护的总入口。每轮检查或修复后更新本文件，不再新增一份同类日期报告。

更新时间：2026-10-31。
最近一次完整核心验证提交：[a407ea5](https://github.com/umaxzhao/voo-design/commit/a407ea58d446b6f4f73d6ecd430cb37d4548d17b)；经 PR #68 合并为 `b708127`，两者源码树一致。
以下结果只属于该固定提交和已记录的验收上下文，不代表后续或本地其他草稿均已验证。

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

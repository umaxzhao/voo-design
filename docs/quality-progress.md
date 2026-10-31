# 项目检查总进度

这里是持续维护的总入口。每轮检查或修复后更新本文件，不再新增一份同类日期报告。

更新时间：2026-10-31。
首页 Settings 底部间距微调：从 24px 减至 12px（向下移动 12px），保持左侧位置与点击区域；沿用 `workspace.settings-entry`，在既有首页套件检查四个宽度的精确底边间距。本轮精确提交及执行结果见 `/private/tmp/voo-settings-lower-release.json`，此前基线发布阻断不能视为已解决。
本轮首页设置入口调整：已移除侧栏版本号，将首页 Settings 移至左下角；能力 `workspace.settings-entry`。本次相关 17 项单测和 320/390/768/1440px 首页浏览器专项通过。完整门禁因基线既有的 10 项 Agent 工具清单/首次引导失败而阻断（已在修改前提交 `e2d3517` 复现，`/private/tmp/voo-settings-baseline.log`），本轮尚未推送或部署。精确最终 revision 与逐项执行结果见 `/private/tmp/voo-settings-release.json`，不得继承历史通过结果。详细范围见 [面板审查](audits/panel-control-audit.md#welcome-settings-entry--2026-10-31)。
最近一次完整核心验证提交：[26de3f9](https://github.com/umaxzhao/voo-design/commit/26de3f948f17fdc9b9167ef25affaa5c487eec0c)。
以下最新结果仅属于该提交，不代表其他未验证版本。

## 本轮：AI 生成文本按内容自适应尺寸

- 已修复 `build_layout` 将普通 AI 生成文本强制设为占位宽度的问题。现在文本默认按内容自然测宽；只有显式传入 `textSizing: "fixed"` 才按给定宽度换行。流式 HTML 中已测出的文本换行宽度仍保留。
- 新增能力 `platform.agent-generated-text-sizing`，关联 `text.box-sizing`；登记总数更新为 56 个能力分组，核心门禁仍为 83 组浏览器套件。
- 验收覆盖 `build_layout` 默认尺寸、固定换行、流式 HTML 文本宽度、真实画布测量和原有单步撤销/重做。定向 37 项单测及真实编辑器场景通过；完整证据见 `/private/tmp/voo-text-sizing-release-merged.json`。
- 合并最新远程改动后的干净提交 `26de3f9` 完成 87/87 发布步骤：构建、设计检查、4501 项单测通过、4 项跳过，以及 83 组浏览器套件通过。`image-inspector-core` 首次运行超时，独立重跑及最终完整门禁均通过；同步进入的移动工具栏回归也通过。
- 已推送至 GitHub 主分支并部署到 la2，入口为 [voo.run/editor](https://voo.run/editor/)。线上 `index.html` 和包含文本尺寸规则的 `canvas_tools` 分块均返回 HTTP 200，字节及 SHA-256 与构建一致；隔离线上浏览器完成首次引导并进入项目工作台。证据：`/private/tmp/voo-text-sizing-deployment-proof.json`；备份：`/srv/voo-run/editor-backups/5601167-20261031T071032Z`。
- 该证据确认的是 Chromium 中 `build_layout` 与流式 HTML 文本路径。其他外部模型客户端、各模型设计变体和设备/平台特定生成路径仍未逐一覆盖，功能覆盖保持“部分”。

## 本轮：本地服务发现与同源画布预览

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
| 工程规范与模块登记 | 已落地：12 个模块、56 个能力分组 |
| 核心发布校验 | 26de3f9：87/87 步通过，包含 83 组浏览器套件 |
| 全量单元测试 | 4501 通过、4 跳过、0 失败；跳过项不算通过 |
| GitHub Ubuntu 基础检查 | [已通过](https://github.com/umaxzhao/voo-design/actions/runs/41176262001)：模块登记、设计检查、构建、单测；部署步骤跳过，已通过本机 SSH 部署 la2 |
| 线上部署 | 5601167 已部署到 la2；线上入口和文本生成工具分块与验证构建哈希一致，隔离浏览器工作台交互通过；此前发布验收见历史轮次 |
| 功能验收完整度 | 部分覆盖；56 个能力分组尚未逐一穷尽所有入口、上下文和设备 |
| 核心门禁外的独立检查 | 21 组本轮未运行：18 组待复核，3 组需单独运行 |

## 连续创作首轮（f9102cd，已完成声明范围）

- 已复现并修复：R/O 切换失效、分组脱离 Frame、分组后移动单位错误、解组误拆祖先 Frame、Esc 取消后仍创建对象，以及白色 Frame 中新建白字不可见。
- 同一份文档通过真实 UI 完成绘制、文字、属性修改、分组移动/解组、路径编辑、置入/蒙版、撤销重做、保存和新浏览器重开；11 个场景通过。纯回归新增 18 项；同步路径中点修复后，全量单测 4428 通过、4 跳过。
- 新增 `selection.continuous-creation`，核心门禁 82/82 通过（78 组浏览器，包含同步进入的路径中点检查）；实际验证提交为 f9102cd，声明范围之外仍为部分覆盖。
- 线上发布版本与构建资源哈希一致；本地主工作区仅同步本轮 10 个源码文件，11 场景复查通过，其他未提交草稿保留，未将其整体当作干净发布版本。
- [验收范围与剩余边界](audits/continuous-creation-audit.md)：实际图像/文字像素、层级、历史和冷重开；实体设备、复杂组合和硬件性能仍单独验证。

## 继续检查：容器命令、手势回滚、选区单位、文字收尾与路径表示（已完成声明范围）

- 新增两组核心浏览器套件，当前登记为 53 个能力分组、81 组浏览器、85 个发布步骤（含远程浏览器抽屉修复）；最终提交 `a94365e` 已完成 85/85，所有通过结论仅属于该固定版本（证据：`/private/tmp/voo-release-round2.json`）。
- 先后在 `caf386a`（84/84）、`bfd7e5b`（85/85）与本批 `a94365e`（85/85）完成隔离副本全量门禁验证；原工作区未提交的外部改动保留，未混入发布依据。
- 已复现并修复 22 类问题：多层解组孤儿节点、父子同时分组拆散子树、跨 Frame 分组跳过共同父级、解组蒙版后失效引用、放弃空文字清空重做、未修改文字清空重做、实际文字收尾遗漏提交回调、转换为钢笔路径后的线条/箭头仍进入旧端点分支、钢笔草稿切换工具未提交且残留预览、`< 4px` 形状/箭头点击误写删除历史并清空重做与原选区、`resize`/`rotate`/`cornerRadius`/`endpoint` 变换手柄 `Escape`/取消不回滚且零位移误提交、对齐选中 Frame+子图层双倍位移且遗漏剪切蒙版跟随层、方向键微调 Auto Layout 编组回弹与钢笔锚点越界未扩框、图层面板点击布尔层失效及图层面板复制编组丢失编组选区单位、缩放后的钢笔路径在锚点越界扩框/复制/展开轮廓时缩回 `baseWidth`、钢笔编辑零位移点击锚点/弯曲段误写历史且中途 `Escape` 直接退出编辑会话、旋转/翻转路径下钢笔弯曲与剪刀子工具坐标未逆变换且开放路径剪断未重算边界与图层顺序、布尔组合与破坏性布尔丢失共享父容器及遗留失效 `clipTo`/空编组、路径排字 `typeOnSelectedPath`/`attachTextToPath` 丢失 `parentId` 且调用不存在的 `selection.setIds`、空普通编组无法通过 `Backspace`/剪切删除或 `Escape` 取消选中、多边形套索取消未恢复被替换的像素选区且闭合未应用羽化、`region`/`pixelMarquee`/`selectionMove`/`gradient*`/形变控制点取消未回滚。
- 门禁过程还捕获并修复了 `titlebar-file-actions.e2e.mjs` 在已有后台编辑器实例时未等待首页遮罩（`welcomeOpen`）关闭即读取文件名的竞态。
- 定向浏览器扩展至 17 个场景（`container-command-boundaries` 8 项、`text-creation-boundaries` 9 项），覆盖键盘命令、对齐/蒙版跟随、Auto Layout 方向键微调、图层面板布尔点击与编组复制、缩放钢笔复制与路径排字及空编组删除、钢笔切换工具收尾、钢笔锚点零位移与中途 `Escape` 回滚、`< 4px` 形状点击与 `Escape` 缩放回滚及完整撤销重做。
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
| Agent 与平台 `platform` | 13/13 | 部分 | 真实外部服务、原生安装包、协作跳过项、独立脚本复核 |

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

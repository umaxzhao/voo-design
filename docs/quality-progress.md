# 项目检查总进度

这里是持续维护的总入口。每轮检查或修复后更新本文件，不再新增一份同类日期报告。

更新时间：2026-10-31。
最近一次完整核心验证提交：[a94365e](https://github.com/umaxzhao/voo-design/commit/a94365e747563bf40d1b1c9fe52088a779b38675)。
以下结果属于该提交，不能直接代表后续改动已经验证。

## 当前概况

| 项目 | 状态 |
| --- | --- |
| 工程规范与模块登记 | 已落地：12 个模块、53 个能力分组 |
| 核心发布校验 | 85/85 步通过，包含 81 组浏览器套件 |
| 全量单元测试 | 4481 通过、4 跳过、0 失败；跳过项不算通过 |
| GitHub Ubuntu 基础检查 | [已通过](https://github.com/umaxzhao/voo-design/actions/runs/41169601103)：模块登记、设计检查、构建、单测；la 通过本机 SSH 部署 |
| 线上部署 | a94365e 已部署到 la，资源哈希一致；新增 17 场景、手势回滚、钢笔切换/编辑回滚、对齐/布尔/路径排字、方向键微调及混合图层选区复查通过 |
| 功能验收完整度 | 部分覆盖；53 个能力分组尚未逐一穷尽所有入口、上下文和设备 |
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
| Agent 与平台 `platform` | 11/11 | 部分 | 真实外部服务、原生安装包、协作跳过项、独立脚本复核 |

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

## 原生 macOS 应用样式与形态整体对齐 — 2026-10-31

范围：`native_studio`（Swift 6 + AppKit 自绘 UI）对照 Web/Electron 当前源码逐模块复核样式与形态。差异以 `src/canvas/components/*` 的 Tailwind 类为准；`.agents/teamwork/lead_refs/*.png` 为 10-23 的旧截图，与源码冲突时不作为依据。

- **工具轨 `editor_toolbar.jsx`**：按钮 36→44（`h-11 w-11`），药丸 512×48→589×56（`p-1.5` + 11 项 + 分隔 + 44pt VOO 头像），顶部 16→14；图标改为 Lucide（hand/crop/squaredashed/brush/pentool/type/eraser/square/scan/wand2），家族箭头修正到按钮右下（`NSButton` 为 flipped，旧代码画到了顶部）。
- **面板 `editor_layers.jsx` / `editor_properties/index.jsx`**：PROPERTIES 宽 256→**288**（`md:w-72`，此前误按 `w-64`）；LAYERS 256×244，行高 32、行距 4、层级缩进 8+depth×14、类型图标 13；底部工具条与 Web 一致（28×28、13pt、`h-7 w-7`，顺序 mask/adjustment/add + 右侧删除），并新增可折叠 chevron（`collapsedIds`，含选中项祖先自动展开）。
- **属性面板结构**：删除自造的 `Solid|Linear|Radial` 整行分段控件，改为 Web 的「漆类型菜单」（24×24 触发器 + 菜单）；368pt 折叠线内现在显示 COLOR + SHAPE + TRANSFORM 标题；底部留 12pt 内边距 + 矩形裁剪，修复内容溢出圆角/卡片的问题；滚动条隐藏（Web `no-scrollbar`）。
- **画布 `editor_page*` / chrome**：舞台底色 `#47474d`→`#1c1c1c`；编辑壳边框 1px/85%→**2px `#b2ffd6`**；画板填充取 `document.canvas.backgroundColor`（`#171717`）；画板描边改由舞台绘制 1px 米白选中环（原 2px 模型描边）；画板标签 11pt mono、上移 20pt、12pt 网格图标；尺寸胶囊仅在拖拽/创建时出现；`clipContent` 与 `clipTo` 生效；容器不透明度继承；文本行盒改 CSS 精确（`lineHeight` 倍数）；标尺底色/刻度/竖排标签对齐 Web；网格按钮误绑标尺的缺陷修复；新增 `editingTextNodeId` 消除内联编辑双绘；新增 `onViewportChanged` 供 Island Bar 跟随平移。
- **选择手柄 `TransformHandlesView`**：1px `#b2ffd6` 环（原黑色）+ 去掉阴影；选择框与手柄中心做半像素对齐（「手柄歪」根因）；旋转销改白底 + 米白环。
- **底部 chrome**：缩放条贴底 16→**12**；Island Bar 不再固定在缩放条上方，改为按 Web `use_contextual_taskbar_rect.js` 锚定选区最外层 Frame（下 +6，越界翻上，视口内缩 8）；旧版内嵌 contextual pill 退休，避免与新 Island Bar 重叠。
- **工作台/设置/Agent**：清除设置页泄露的 i18n 原始键（`collab.guestBadge` / `COLLAB.NAMEFIELD`）→ “Local guest profile / Display name”；删除工作台注入的两张演示卡片、底部「返回当前画布」入口与 `[Custom]` 徽章，Recents 空态与 Web 一致（仅标题 + 计数 0）；新增设置 CANVAS→“Show rulers” 开关（`voo.editor.showRulers`，与 ⇧R、缩放条、启动读取同步）；Agent 面板底色 `#0C0C0C`→`#000000`、圆角 16→24，顶部与编辑壳齐平。
- **默认文档**：新建文档保持 Web 的 `Design 1` 1200×800 @58%；打开磁盘上已不存在的工程时改为新建空白文档并提示，不再加载演示样机。
- 验证：`./build.sh` 通过（二进制 4.56 MB ≤ 5 MB，包 6.07 MB ≤ 35 MB，冷启动 ~0.15s）；`./tests/run_tests.sh` **377/377 通过**（已同步更新工具轨 589×56/44pt、面板 288/244/356、头像 44、工作台真实文件等断言）。
- 证据截图：`native_studio/docs/screenshots/v4_selected.png`、`v3_editor.png`、`v3_dashboard.png`、`v2_settings.png`、`v2_agent.png`。
- 未覆盖/仍不同：原生工具集与 Web 不同（无 crop/fill/healing，Web 的 fill 与 healing 未实现），故工具轨宽度按原生 11 项计算；字体用 SF Mono 而非 Intel One Mono，字宽略有差异；未在实体设备上验证触控板手势与硬件 FPS。

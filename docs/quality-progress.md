# 项目检查总进度

## 空文件默认 Frame（2026-11-02）

- `documents.empty-canvas`：空文件、新建和载入前默认页面统一为空的无限画布，不自动增加 Frame；同时去掉根画布的绿色边界线。已有空 Frame、有内容的旧文件及其图层关系保留。
- 修复前真实冷启动为 1 个图层，单测和 3684 像素的页面边框失败均保留。真实导入、ZIP 重开、后续新建、显式 Frame 和旧内容迁移的针对性检查通过；空画布实际为零图层、零选中、零 Frame 标题及零边框像素。
- 删除默认 Frame 后还暴露了空白区域拖动变成平移的问题；已让创建工具接收整个工作区，Select/Hand 保留原路由。真实连续绘制、撤销，以及完整创建/保存/冷重开检查通过；依赖 Frame 的夹具改为显式创建，不删除原功能断言。
- 固定干净源码 [`308b2ab2`](https://github.com/umaxzhao/voo-design/commit/308b2ab2e985b062f98a6ad28add91848e0f3e4e) **121/121 步完整门禁通过**：117 核心浏览器、4962 单测通过/4 历史跳过、607 文件通过/3 跳过、1481 文件设计检查、构建及 29 文件格式检查通过；10 独立检查本地未执行，功能覆盖仍部分。
- 已用同一验收构建更新[网页预览](https://voo.run/editor/)，保留回滚备份；正式 HTML、7 个入口/关键资源及实际加载的 77 个不同 JS/CSS 字节一致。线上新建、四类空文件、保留原有 Frame 和旧内容检查通过，零页面异常。[PR #93](https://github.com/umaxzhao/voo-design/pull/93)、[CI](https://github.com/umaxzhao/voo-design/actions/runs/41348044318)。
- 原始失败、旧默认 Frame 断言冲突及两次夹具错误均保留。旧文件中已经保存的 Frame 不按名称/是否为空猜测删除；本轮未发布桌面安装包。[详细范围](audits/design-editor-interaction-audit.md#empty-canvas-initialization--2026-11-02)。

## NBA 文件字号、缺失字体外观与性能（2026-11-02）

- `text.imported-appearance`：修复 20 处混合字号被根字号覆盖、RAW 行高错误换算、原始字形丢失；补可编辑、可保存的原生字形缓存。实际四页 757 段文字，756 份缓存全部生效；修复 79 段 75% 行高被强制改成 80% 后缓存失效，零文本框意外缩放。29 个真实字形样本与独立原始命令零像素差异。
- `compositing.custom-blend-viewport`：限制像素回读到可见画布，修复坐标、透明度和缓存重复合成；27 组独立参考像素及真实移动/撤销/重做通过。最终同机正反序编辑中位耗时 **717→509.5ms、720→463.5ms（降低 29%–36%）**；字体版曾变慢的原始数据保留。
- **缩放仍未解决**：最终正反序 **150→196.5ms、150.5→151.5ms**，一组变慢 31%；导入未提速。测试包含驱动往返与两帧等待，不能作为物理延迟、FPS 或 Figma 对比结论。
- 固定干净源码 [`3d71b6d2`](https://github.com/umaxzhao/voo-design/commit/3d71b6d2dda95278810c575cceae390252538e1a)，已保留主线 Linux 窗口和 AI 修补更新：**121/121 完整门禁通过**、117 核心浏览器、4953 单测通过/4 跳过、606 文件通过/3 跳过、1481 文件设计检查及构建通过；24 任务脚本格式检查通过。120 组能力的功能覆盖仍部分，10 独立检查在本地门禁未执行；同源码 CI 另通过真实 Linux 窗口检查。
- 已按项目脚本更新 [网页预览](https://voo.run/editor/)，保留服务器回滚备份。正式 HTML、7 条入口/关键资源、线上实际加载的 76 个不同 JS/CSS 与验收构建逐字节一致；线上原生文字和混合移动/撤销/重做通过，零页面异常。[CI](https://github.com/umaxzhao/voo-design/actions/runs/41341540741)、[PR #89](https://github.com/umaxzhao/voo-design/pull/89)。
- 原文件只读、350 资产保留。唯一 `9:41` 时钟没有源字形，仍使用替代字体；2 段富文本的独立行内颜色未修复。**旧导入需要重新导入原 `.fig`** 才能补回字形；本轮未发布桌面安装包，已安装 Beta2 不算更新。实际页面切换使用 API 准备，不冒记页面切换按钮点测。[范围与收据](audits/figma-text-fidelity.md)、[机器收据](audits/figma-text-fidelity-evidence.json)。
- 完整日志、失败链、原始采样和线上证明：`/tmp/voo-nba-font-release-3d71b6d2.{json,log}` 及本地 `nba-font-fidelity/` 证据目录；不包含原始 FIG/V8。物理输入、所有富文本/效果组合、其他驱动和签名 Electron 仍需分别验收。

## Linux / Windows 窗口整合（2026-11-02）

- `platform.desktop-window-chrome`：Linux 与 Windows 使用无边框窗口，保留菜单
  快捷键但隐藏系统菜单栏；设置右侧提供最小化、最大化/还原和关闭按钮。
  macOS 保留原生红绿灯；纯浏览器不显示按钮、不预留空间。
- 补通预加载与主进程 IPC，仅允许所属主窗口发起操作。关闭走现有未保存确认，
  外部最大化/还原状态优先于迟到查询；标题栏保留实际拖动区域。
- 真实渲染器检查覆盖按钮顺序、1024px 布局、点击区、状态切换和平台隔离；
  原始缺少控件的失败保存在 `/private/tmp/voo-linux-window-before.log`。
- 固定应用源码 `a535785d3f0babcb55c184587df3777cdf641739`：构建、1479 文件
  设计检查、4938 单测通过/4 历史跳过、604 文件通过/3 跳过；
  `desktop-window-controls`、`titlebar-file-actions`、`ui-responsive-editor`
  真实浏览器检查通过。后续提交仅完善测试夹具和验收记录，不改变应用源码。
- Linux/X11 + openbox 的真实 Electron 检查在
  [`8ecf94fd`](https://github.com/umaxzhao/voo-design/commit/8ecf94fd4f05ec334ab4b6514b8082334e9e8676)
  [CI](https://github.com/umaxzhao/voo-design/actions/runs/41339348018) 中通过：
  无系统标题栏/菜单高度、Alt 不显菜单、最小化/最大化/还原及外部状态、
  X11 原生鼠标拖窗、隐藏菜单的 Ctrl+N 快捷键均正常。真实未保存提示可由
  OS Esc 取消；最后批准关闭使用测试响应，不计为原生“放弃”按钮点测。
  截图和五组检查收据：`linux-window-evidence` Actions 附件，
  本地 `/private/tmp/voo-linux-window-verified/`；零页面异常。
- 失败链保留：旧 Linux 模拟窗口缺少菜单显隐方法，已补齐并增加实际配置断言；
  第一轮原生鼠标输入按下即释放未产生移动，改为指定窗口、按住与分段移动后通过。
  保留真实位置变化和拖动区域命中断言，没有改用程序移动窗口代替拖动。
- 目录为 118 组能力、117 核心浏览器、10 独立检查。本轮只新增该原生宿主
  检查的执行证据，不把其他独立检查和全部核心浏览器都计为本轮完成。
  Wayland、其他桌面环境、实际 Windows/macOS 宿主和签名安装包仍需分别验证。
  本轮不创建桌面新版本，已发布的旧 Linux 安装包保持不变。

## 错误恢复页视觉统一（2026-11-02）

- `platform.error-recovery`：使用 VOO 标志、共享按钮和中性色阶，去掉独立渐变、警告卡片与蓝色按钮；复制诊断收进详情区，保留恢复及诊断行为。
- 最新 main 集成后的干净源码 `c1a30ae771527efc12765f75d01f3e32f2f4a4db` 完整门禁 **119/119 通过**：4902 项单测通过、4 项跳过，115 组核心浏览器回归完成；9 组独立检查未运行。报告 `/private/tmp/voo-error-recovery-integration-serial.json`，完整日志同名 `.log`。后续验收收据只改文档。
- 实际 Chromium 检查中英文、展开/收起、复制与反馈、真实重新加载、键盘焦点、1440/768/390px 长错误信息和浅色主题。错误页源码与合并前版本一致；旧 `a7abc5b` 的 106 步通过只归属旧主线，不代替本次独立集成门禁。
- 并发集成检查保留画布缩放时序失败，原断言单独复查通过；同一 `c1a30ae7` 在项目支持的单并发调度下完整重跑通过，未修改缩放实现或断言。证据 `/private/tmp/voo-error-recovery-integration-release.json`、`/private/tmp/voo-error-recovery-zoom-retry.log`。
- 功能覆盖仍部分；不认证原生崩溃、实际草稿恢复、剪贴板拒绝、物理辅助技术或其他浏览器，也未定位截图所触发的业务异常。[范围](audits/design-editor-interaction-audit.md#error-recovery-visual-integration--2026-11-02)。

这里是唯一持续维护的进度入口。更新时间：2026-11-02。

## 当前结论

**AI 修补的线上失败与已复现卡顿已修复，真实线上模型路径复验通过。**
主线交付：[PR #91](https://github.com/umaxzhao/voo-design/pull/91)；本轮不创建桌面标签或 Release。

- 推理移到独立 Worker，缓存命中也显示运行状态，下载/运行均可取消；
  取消、删除源图层或关闭编辑器后不写回迟到结果。工具主按钮保留当前模式，
  GPU 适配器不可用时选择真实 INT8 模型。
- 本地实际模型通过后，线上实际操作仍失败，证据确认服务器把 `.mjs` 与
  `.wasm` 返回为通用二进制类型。已补 `/editor/ort/` 范围的 nginx MIME
  配置与回滚备份；发布 HTML 之前强制检查六个运行时资源和缺失模块 404。
- 固定应用源码 [`1585dee4`](https://github.com/umaxzhao/voo-design/commit/1585dee4641c01c599c2e6bd6080a8d0290be77c)
  完整门禁 **120/120**：116 组核心浏览器、4927 单测通过/4 跳过、
  602 文件通过/3 跳过、1477 文件设计检查和构建通过。源码在验证期间未变。
- 部署守卫提交 [`4d873b31`](https://github.com/umaxzhao/voo-design/commit/4d873b31096fe8c075f61ee2a4effa91aa2b06eb)
  不改变上述应用源码；新增五项运行时交付断言后，全量单测 **4932 通过/4 跳过**，
  603 文件通过/3 跳过，设计、模块登记、shell 语法和格式检查通过。
- `ssh la2` 已更新 [网页预览](https://voo.run/editor/)。线上真实 LaMa INT8/WASM
  修补改变像素，一次撤销精确还原；推理中 Esc 约 **81ms** 关闭弹窗，
  Worker 约 **2098ms** 退出，无迟到写回。取消后再次画一笔能完成真实推理并撤销。
  推理期间主线程心跳最长间隔 **39.2ms**；正式 HTML 与 84 条已加载资源响应
  （含 Worker、ORT JS/WASM）与验收构建逐字节一致，零页面异常。
- 证据：`/private/tmp/voo-ai-repair-integrated-release.{json,log}`、
  `/private/tmp/voo-ai-repair-runtime-units.log`、
  `/private/tmp/voo-ai-repair-production-proof.{json,log}`、
  `/private/tmp/voo-ai-repair-runtime-{before.log,after.json}`。
  线上失败保留在 `/private/tmp/voo-ai-repair-production-diagnostic.log` 和
  `/private/tmp/voo-ai-repair-production-diagnostic-failed.json`。
- 目录现为 117 组能力、116 组核心浏览器和 9 组独立检查。受控 Worker
  夹具只证明取消/响应/源归属，不冒充真实模型推理；独立网络检查只追加了
  AI 修补这一项的真实证据，其他网络/付费服务不继承通过。
- GPU 硬件、签名安装包、其他浏览器及低端设备大图预处理/编码仍未认证。
  普通 Patch 的 2048px 同步求解约 867ms 主线程间隔是独立遗留，不记为已修复。

此前整合记录如下。

**原始分支/草稿整合的固定源码门禁通过，预览已更新核验；主线交付见 PR #88，功能覆盖仍为部分。**
18 个原始分歧分支、21 个工作树的头提交及 4 份草稿快照全部进入整合历史。
合并冲突曾覆盖已通过的行为，已保留失败并恢复，不能以 Git 祖先关系代替功能验收。本轮不创建标签、草稿 Release 或公开版本。

- 候选基线：`965bbd889bc121860564d2b82f25df5b4c7e78dd`。
- 原生继续复刻截止：`90577a75ef434140a323df957a43bf0f147602f0`，
  包含窗口宽度与主队列时序修复 `2a4c98c`。
- 原始 21 个工作树清单、4 份未提交快照、合并冲突与执行日志：
  `/private/tmp/voo-branch-integration-20261101/`。快照提交均保留在历史中。
- 其他任务后来新增的主工作区改动与旧 stash 保留，不静默覆盖或丢弃。
- 当前独立验收副本：`/private/tmp/voo-consolidation-acceptance-20261102`。
  两个先前验收目录被并行清理任务删除；清理现已由用户暂停。

## 本轮恢复与检查

| 模块 | 修复或保留范围 | 当前执行状态 |
| --- | --- | --- |
| workspace | 首页一个高级入口、自动尺寸、冷启动新建、Browser 手机上下分屏与单一导入入口 | 固定提交核心检查通过；组合覆盖仍为部分 |
| platform | 错误恢复页视觉统一；Agent 重命名、图片附件共用状态、当前编辑器路由、协作 URL 规范化 | `c1a30ae7` 核心检查通过；真实服务不计通过 |
| layers / selection | 画布交互修复与设计问题面板保留 | 固定提交核心检查通过；组合覆盖仍为部分 |
| layout / text / inspector | 3 份旧审计转正常回归，约束、斜体、快捷键不再使用预期失败 | 12 项通过 |
| platform.native | 生产窗口压缩优先级、FIFO 主队列与窄窗口工具栏 | 本副本 -Onone 集成 485/485 通过；不认证安装器 |
| inventory | 12 模块、116 组能力、115 核心浏览器、9 独立检查完整登记 | 登记检查通过；不是执行通过 |

固定干净提交 [`012d6887`](https://github.com/umaxzhao/voo-design/commit/012d6887a1d2a322ad24342dd0af312ee9e2aa71)：
**118/118 步完整命令通过、114 组核心浏览器、4902 单测通过/4 跳过、
598 测试文件通过/3 跳过、1473 文件设计检查及构建通过**。验证期间源码未变。
原生集成在本副本 **485/485（-Onone）通过**；原生子树与 `90577a75`
完全相同，不冒记为签名安装包或整个原生界面完成。

[固定版本验收收据](audits/worktree-integration.json)、
[GitHub CI](https://github.com/umaxzhao/voo-design/actions/runs/41328591315)、
[PR #88](https://github.com/umaxzhao/voo-design/pull/88)。完整本地报告：
`/private/tmp/voo-branch-integration-20261101/consolidated-release-complete.json`。
本记录及发布规则的后续文档提交不改变已验收应用源码，不把旧通过借给新代码。

失败链保留：`bd9cb27f` 真实复现类型方向键失效，`eb995923` 恢复；
分享测试原来误在标题栏内部查找全局 Portal，修正定位但保留可见/顶层命中断言。
Browser 重复导入项先失败再删除重复入口。3 份旧审计转换为正常单测，
不再以 `it.fails` 反向证明已修复功能。原始失败日志均保留。

SSH la2 已通过项目脚本更新 [在线预览](https://voo.run/editor/)，保留回滚备份。
正式 HTML 逐字节一致；线上 4 组交互通过，实际加载的 77 项不同 JS/CSS
均与验收构建逐字节一致，零页面异常。覆盖约束点击/撤销、390px Browser
分屏与复制撤销、文件卡片打开和旧分享跳转；未加入真实房间或调用付费服务。
证据：`production-proof.json`、`deployed-entry-proof.json`（上述证据目录）。

## 文档复核后的剩余任务

以下为剩余上下文或专项工作，不把旧报告里已实现的功能再记为缺失。
`.pen` 写出、Mesh Gradient、Agent 样式/文字扩展已在代码中接入。

1. **后续草稿**：本轮固定范围由 [PR #88](https://github.com/umaxzhao/voo-design/pull/88)
   交付主线；新开任务和主工作区后来新增的草稿保留，需按各自范围验收。
2. **真实外部服务**：独立的 Claude/Codex/MCP CLI、付费图片与模型服务、
   登录后的扩展流程需另验。无费用夹具或 Codex 自带生成不能证明项目 API 可用。
3. **原生/设备**：Swift 应用仍是部分对齐；原生分支记录全量 lint 仍有
   1542 条历史诊断，本轮不冒记全绿。签名 Electron 安装、升级、
   实体 IME/触摸/笔、WebKit、其他 OS 不能由 Chromium 或 Swift 单测认证。
4. **性能**：大型 `.fig` 的真实文件缩放/字体属性保真、全局缓存内存预算、
   多场景硬件 FPS 仍需专项。编辑器 chunk 约 1144 kB（gzip 347 kB），
   `image_editor.jsx` 3166 行、`pen_to_voo.js` 1826 行、变量模块 1204 行；
   继续按实际依赖边界拆分，源码拆分不等于包体下降。
5. **组合覆盖**：蒙版、效果、文字/布局、变量与资源在多重嵌套、取消、
   撤销、重开及导出中的完整交叉组合尚未穷尽。
6. **独立检查**：3 组外部 CLI；`critical_flows` 本地夹具；2 组 native；
   `canvas_fps` 硬件；`image-network` 网络模型；`ui-audit` 基线待审。
   未执行的项目必须保留 not-run，不能归入核心通过。
7. **来源与维护**：OpenDesign 原始导入来源版本仍需补齐；历史分析资料、
   草稿备份和其他任务工作树只核对来源，不因本轮合并擅自删除。

详细能力归属：[工程验收流程](engineering-workflow.md)、
[模块目录](../scripts/editor-module-catalog.mjs)、[审计索引](README.md)。

## 已发布版本与后续发布规则

当前已发布桌面版为 [Beta2](https://github.com/umaxzhao/voo-design/releases/tag/v1.0.0-beta.2)，
固定源码 [`ae85951`](https://github.com/umaxzhao/voo-design/commit/ae85951133f38d2fe3b15e39cd7f58015c073238)。
[Web/四平台打包门禁](https://github.com/umaxzhao/voo-design/actions/runs/41314772574)
与 [Mac 签名](https://github.com/umaxzhao/voo-run/actions/runs/41314779042) 分开通过。
Mac Intel/Apple Silicon 已签名、公证；Windows 未签名。
这份历史验证不证明本轮整合代码或人工安装升级通过。

**仅在用户再次明确允许时发版。** 普通提交、PR 与 Web 预览不创建 Release。
未来面向用户的下载入口只列安装包；自动更新必需元数据可保留，CI 报告与
签名收据放 CI 证据，不混入用户下载列表。本轮不修改已发布 Beta2。

## 历史记录

- [界面、审计和发布旧记录](quality-history-ui.md)
- [交互、原生与介绍页面旧记录](quality-history-native.md)
- [原生专项与仍未完成范围](../native_studio/INTERACTION_PARITY.md)
- [签名和发布清单](release-checklist.md)

历史记录保留原提交、失败和限制；其中“本轮”“未提交”“当前”只属于
当时版本。后续每轮只更新本入口当前状态，并记录精确提交与证据。

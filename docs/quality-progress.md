# 项目检查总进度

## 错误恢复页视觉统一（2026-11-02）

- `platform.error-recovery`：使用 VOO 标志、共享按钮和中性色阶，去掉独立渐变、警告卡片与蓝色按钮；复制诊断收进详情区，保留恢复及诊断行为。
- 最新 main 集成后的干净源码 `c1a30ae771527efc12765f75d01f3e32f2f4a4db` 完整门禁 **119/119 通过**：4902 项单测通过、4 项跳过，115 组核心浏览器回归完成；9 组独立检查未运行。报告 `/private/tmp/voo-error-recovery-integration-serial.json`，完整日志同名 `.log`。后续验收收据只改文档。
- 实际 Chromium 检查中英文、展开/收起、复制与反馈、真实重新加载、键盘焦点、1440/768/390px 长错误信息和浅色主题。错误页源码与合并前版本一致；旧 `a7abc5b` 的 106 步通过只归属旧主线，不代替本次独立集成门禁。
- 并发集成检查保留画布缩放时序失败，原断言单独复查通过；同一 `c1a30ae7` 在项目支持的单并发调度下完整重跑通过，未修改缩放实现或断言。证据 `/private/tmp/voo-error-recovery-integration-release.json`、`/private/tmp/voo-error-recovery-zoom-retry.log`。
- 功能覆盖仍部分；不认证原生崩溃、实际草稿恢复、剪贴板拒绝、物理辅助技术或其他浏览器，也未定位截图所触发的业务异常。[范围](audits/design-editor-interaction-audit.md#error-recovery-visual-integration--2026-11-02)。

这里是唯一持续维护的进度入口。更新时间：2026-11-02。

## 当前结论

**当前在收口 AI 修补卡顿：真实 LaMa INT8/WASM 推理、像素变化和撤销已通过，完整固定提交门禁及线上复验待执行。**
推理移到独立 Worker，缓存命中也显示运行状态，下载/运行均可取消；取消、删除源图层或关闭编辑器后不得写回迟到结果。
工具主按钮保留当前模式；GPU 适配器不可用时选择真实 INT8 模型。
新增 `images.ai-repair-responsiveness`，目录现为 116 组能力、115 组核心浏览器检查。
真实模型证据：`/private/tmp/voo-ai-repair-real-compatible/network.json`，
约 17 秒真实推理，主线程心跳最长间隔 60.9ms，像素变化与一次撤销还原通过。
受控 Worker 浏览器另验取消/Esc/源图层删除，不把模拟推理计为模型成功。
普通 Patch 的大图同步求解仍有独立性能问题，本轮不记为已修复。
最终提交、完整门禁与部署收据将在完成后更新。此前整合记录如下。

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

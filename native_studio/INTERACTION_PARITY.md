# VOO Design Native — Designer 交互对齐审计

Scope: 对比 VOO Design Web 编辑器（`src/canvas/editor/`、`src/canvas/components/`）与
`native_studio` 原生编辑器的交互面。状态含义：

- ✅ **对齐**：行为、快捷键、撤销语义与 Web 版本一致，已在原生测试/快照中验证
- 🟡 **部分对齐**：入口和基础行为存在，但覆盖范围或效果弱于 Web
- ❌ **未实现**：Web 有、原生没有

最后更新：2026-10-21（第七轮：修复画布工具接线；补画笔/橡皮）

---

## 1. 画布导航与视口

| 交互 | 状态 | 原生实现 |
|---|---|---|
| 空格 + 拖拽平移 | ✅ | `CanvasStageView.keyDown/.mouseDragged` |
| 触控板双指平移 | ✅ | `scrollWheel`（无 ⌘ 时） |
| ⌘ + 滚轮 / 双指捏合缩放 | ✅ | `scrollWheel` + `magnify` |
| ⌘+ / ⌘− / ⌘0 适配 / ⌘1 100% | ✅ | 菜单 + `zoomIn/Out/Fit/Actual` |
| 底部缩放条（撤销、重做、网格、吸附、±、比例） | ✅ | `StudioBottomZoomBar`，网格/吸附本轮接通 |
| 底部页码胶囊 + 页菜单 | 🟡 | 单页文档；新建页面提示（Web 支持多 page） |
| 标尺显示/隐藏 | ✅ | View 菜单 / `showRulers` |
| 标尺拖拽创建参考线、吸附 | ✅ | `onGuideCreated` + 磁性吸附 |
| 网格显示 | ✅ | 本轮新增 `showGrid` + 网格绘制 + 菜单/底栏开关 |
| 磁性吸附开关 | ✅ | 本轮新增 `isSnappingEnabled`，关闭后拖拽不做吸附 |

## 2. 选择与变换

| 交互 | 状态 | 原生实现 |
|---|---|---|
| 单击选择 / 空白取消 | ✅ | 命中测试 / 清空选区 |
| ⇧ 单击多选、框选（相交即选中） | ✅ | `mouseDown` / `mouseDragged` |
| 拖拽移动 + 吸附辅助线 | ✅ | 本轮升级为**多选整体移动** |
| 方向键微移（⇧=10pt） | ✅ | `WindowController.nudgeSelection` |
| 8 点缩放 + 旋转销 | ✅ | `TransformHandlesView`；坐标已修复为 `doc*zoom + pan + ruler − inset` |
| 变换可撤销 | ✅ | 本轮新增 `onMoveCommitted` / `onHandleTransformCommitted` → 单步 undo |
| Delete / Backspace 删除 | ✅ | 键盘 + 菜单 |
| 旋转后手柄跟随旋转角 | ✅ | 本轮实现：手柄框/旋转销按 rotationAngle 旋转，命中测试逆向变换 |
| 套索 / 魔棒选择 | ✅ | 本轮实现套索圈选 + 魔棒（同填充色）；磁性套索仍 ❌ |
| 多选整体变换 | ✅ | 本轮实现：联合包围框，缩放/旋转按比例应用到所有选中图层，可撤销 |

## 3. 工具

| 工具 | 状态 | 说明 |
|---|---|---|
| 选择 V / 画框 F / 钢笔 P / 画笔 B / 橡皮 E / 文本 T / 形状 R / 画板 A | ✅ | 快捷键、白色圆形 active 态、光标切换 |
| 形状：拖拽矩形、⇧ 正方形、⌥ 椭圆、单击默认尺寸 | ✅ | 本轮实现 + 实时虚线预览 + 撤销 |
| 画板：拖拽创建 | ✅ | 同上 |
| 钢笔：落点、拖拽出对称手柄、首点闭合、Enter 完成、Esc 取消、Delete 删点 | ✅ | 本轮实现，路径可渲染/移动/缩放 |
| 钢笔二次编辑（选中锚点、拖手柄、增删锚点、尖角/平滑转换） | ✅ | 本轮实现 Node 工具锚点/手柄编辑 + 双击/⌥ 转换 + Delete 删点 + 撤销 |
| 文本：单击创建 + 内联编辑（Return/⇧Return/Esc/点外提交） | ✅ | `TextEditingOverlay`，缩放/平移对齐 |
| 文本字体 / 字号 / 字重 / 对齐 / 行高 / 字距 | ✅ | 本轮完整接入模型 + PROPERTIES（Aa 菜单）+ 画布/导出/内联编辑统一渲染 |
| 文本框自动尺寸 / 富文本区间样式 | ❌ | 单一样式；无 box auto-size / 局部富文本 |
| 画笔 / 橡皮实际绘制 | ✅ | 本轮实现：内存 RGBA 画布 + 抗锯齿圆刷/透明擦除 + 持久化 Paint Layer + 撤销 |
| 图片图层导入（文件/拖拽/剪贴板）与渲染 | ✅ | 本轮实现 `ImageImporter` + 画布/导出渲染 |
| 填充 / 渐变工具 | ❌ | 未实现（颜色填充可改） |

## 4. 图层（LAYERS）

| 交互 | 状态 | 原生实现 |
|---|---|---|
| 选择、可见性复选、锁定、双击重命名 | ✅ | 本轮重构行样式 + 交互 |
| 透明度 / 混合模式下拉菜单 | ✅ | NSMenu 预设 + 16 种混合模式；本轮补上画布混合渲染 |
| 添加 / 蒙版 / 分组 / 删除 | ✅🟡 | 添加=矩形、分组/删除真实命令；蒙版按钮目前提示（无蒙版编辑） |
| 拖拽排序 / ⌥↑↓ 排序 | ✅ | NSTableView 拖放 + 快捷键，可撤销 |
| 右键菜单（重命名/显隐/锁定/副本/编组/删除） | ✅ | 本轮新增 |
| 图层缩略图、颜色标签、搜索/过滤 | 🟡 | 有类型图标/颜色 hex；搜索按钮仅回调 |
| 蒙版、剪切蒙版、调整图层、效果面板 | ❌ | 数据模型有字段，无编辑 UI |

## 5. 属性（PROPERTIES）

| 交互 | 状态 | 原生实现 |
|---|---|---|
| 色轮 / Hex / 填充 / 描边 / 不透明度 / 混合模式 | ✅ | 252×368 卡片，滚动到 Transform/Appearance；改动可撤销 |
| 圆角半径 | ✅ | SHAPE 区拖拽调节 |
| X/Y/W/H/R/CR 数值编辑 | ✅ | TRANSFORM 区（取消可撤销） |
| 文本字体/字号 | ✅ | 本轮新增 |
| 颜色采样器、描边样式、效果、渐变 | 🟡 | 取色器可用；描边/渐变/效果 UI 未实现 |

## 6. 编辑命令 / 历史

| 交互 | 状态 |
|---|---|
| 撤销/重做（创建、移动、缩放、旋转、样式、图层、对齐、分布、文本） | ✅ 本轮把画布拖拽/手柄变换/对齐/分布/字体全部接入 CommandManager |
| 复制/剪切/粘贴/副本（系统剪贴板，VOO 节点类型） | ✅ |
| 全选 / 取消选择 | ✅ |
| 编组 / 取消编组 | ✅ |
| 布尔运算 5 种（菜单 + 右键子菜单） | ✅ |
| 对齐 6 向 / 等距分布（菜单 + 右键；可撤销） | ✅ 本轮新增 |
| 置顶 / 置底（右键） | ✅ 本轮新增 |
| 画布右键菜单 | ✅ 本轮新增 |
| 撤销历史面板 | ❌ |

## 7. 文档 / 输出 / 面板

| 交互 | 状态 | 说明 |
|---|---|---|
| 新建 / 打开 / 保存 .voo / 另存为 | ✅ | 原生 NSOpen/Save Panel |
| 导出 PNG / JPG / PDF / SVG（1–4x） | ✅ | `ExportEngine` |
| 导出 PSD / HTML（Web 支持） | ❌ | — |
| 文档 Tab + 关闭 + 新建 | ✅ | 标题栏 Tab 栏 |
| 多文档并行 Tab | 🟡 | 一次一个工程（与 Web 行为基本一致） |
| 右键菜单 / 快捷键生态（⌘S/⇧⌘S/⌘O/⌘N/⌘E/⌘Z/⇧⌘Z/⌘G…） | ✅ | 菜单 + KeyMonitor |
| 设置与偏好（⌘,，4 Tab） | ✅ | `SettingsDrawerView` |
| 首启引导（4 步） | ✅ | `OnboardingGuideView` |
| 欢迎工作台（搜索/筛选/最近/草稿/星标/回收站/设计系统/快捷键） | ✅ | `WelcomeDashboardView` |

## 8. AI / 协作 / 导入

| 交互 | 状态 | 说明 |
|---|---|---|
| AI Agent 侧栏（会话、建议、输入、模型状态、流式回复） | ✅ | `AgentPanelView` + `LocalCLIBridge` 真实流式输出 |
| 选区 Island Bar（Ask AI、Vectorize、Boolean、Style Transfer） | 🟡 | Ask AI 已接 CLI；Boolean 直接并集（5 种在菜单/右键）；Vectorize/Style Transfer 仍为提示 |
| 本地 CLI 智能体（Claude Code / Codex / Antigravity） | ✅ | 本轮实现 `LocalCLIBridge`（探测/版本/流式 stdout/取消），AI 面板真实流式回复；未安装时优雅回退并给出安装命令 |
| Figma 导入 / 浏览器导入 / 截图重组 | ❌ | 仅欢迎页入口提示 |
| 图片导入（拖拽/文件/剪贴板）与图像图层渲染 | ✅ | 本轮实现（⌘⇧I / 拖入画布 / 粘贴），base64 内嵌 .voo，画布与导出均渲染 |
| 协作、多人在线、评论 | ❌ | 未实现 |

---

## 第五轮新增/修复的交互

1. **矢量节点编辑（Node 工具）**：锚点/bezier 手柄可视化与拖拽、双击尖角/平滑切换、⌥ 对称、Delete 删点、Esc 退出，单步可撤销。
2. **旋转选择框 + 多选整体变换**：手柄框随旋转角旋转、命中测试逆向旋转；多选联合包围框，缩放/旋转按比例应用到全部图层，可撤销。
3. **套索 / 魔棒 / 抓手**：工具轨新增 3 个图标；套索自由圈选、魔棒按相同填充色成组选择、抓手拖拽平移。
4. **文本排版完整化**：字重、对齐、行高、字距（模型 + Aa 菜单），画布/导出/内联编辑器共用 `TextStyleResolver` 渲染。
5. **图片导入**：⌘⇧I 文件选择、拖拽入画布、⌘V 粘贴截图；base64 内嵌、自动缩放居中、图层/画布/导出全链路渲染。
6. **真实本地 CLI**：`LocalCLIBridge` 探测 claude/codex/agy、读取版本、流式 stdout→AI 面板（工具行折叠）、取消运行；未安装时回退并提示安装命令。

## 第三轮新增/修复的交互

1. 画布拖拽、8 点缩放、旋转 → 单步可撤销（含多选整体移动）。
2. 画布右键菜单：副本/复制/粘贴/删除/编组/对齐分布子菜单/布尔子菜单/置顶置底/导出。
3. 图层行右键菜单 + 创建副本回调。
4. 对齐 6 向 + 水平/垂直等距分布（菜单 & 右键，可撤销）。
5. 网格显示 / 磁性吸附开关（底栏按钮 + View 菜单）。
6. 文本字体/字号属性（PROPERTIES TEXT 区，可撤销）。
7. 画布混合模式渲染（16 种，与导出保持一致）。
8. 变换手柄坐标修正（pan/zoom/ruler），文字节点不再渲染成白块。

## 第七轮：修复“画布功能不可用”

**根因**：`WindowController.didSelectTool` 只更新了工具轨状态，**没有把工具写回 CanvasStageView.activeTool**；键盘快捷键也只改了工具轨。因此选择形状/钢笔/文本/画板后，画布仍停留在 Move 工具，所有绘制操作表现失效。另有：
- 画布点击后没有及时成为 first responder，导致钢笔的 Return/Escape、Create 的 Esc、Delete 等键盘交互失效；
- 空格平移依赖画布已获得焦点，进入编辑器后直接按空格无效；
- 画笔/橡皮没有任何绘制实现（会落入选择逻辑）。

**修复**：
1. `didSelectTool` / 键盘工具切换现在同步 `canvasStageView.activeTool`；
2. 画布任意 mouseDown 都先 `makeFirstResponder(canvas)`；进入编辑器/新建/打开时主动 focus 画布；
3. 空格与 keyUp 通过窗口级 key monitor 全局接管（输入框/弹窗时禁用）；
4. 新增画笔/橡皮：内存 RGBA 画布、抗锯齿圆笔刷、透明擦除、持久化 `Paint Layer`（PNG data URL）、Esc 回滚、单笔撤销；
5. 新增 13 条真实事件回归测试（WindowController + NSEvent：工具按钮/快捷键 → activeTool、形状/画板/钢笔/文本创建、点选/拖移/缩放、画笔/橡皮、图层增删、空格平移/缩放条、右键菜单），并把这些测试纳入 `./tests/run_tests.sh` 集成模式（从此能捕获此类接线回归）。

真实应用验证（orca computer-use）：点击 Shapes → 画布点击生成 `Rectangle 1`（Undo 激活）；Pen 点击 3 点 + Return → `Path 1`；Text 点击 → 内联编辑器输入 “Hello Native” + Return → 图层重命名；Cmd+Z 正常撤销。自动化无法注入 drag 事件，拖拽类操作由事件级集成测试覆盖。

## 第八轮：1:1 还原 Electron 桌面全部功能面

**背景**：VOO Web/Electron 桌面版拥有一套完整的底层工作区与文件生命周期管理引擎（`electron/workspace_manager.cjs`、`electron/workspace-trash.cjs`、`electron/local_backend_bridge.js`、`electron/dsh_connector.js`）。本轮实现 100% 纯 Swift 6 + AppKit 1:1 对齐还原：

1. **工作区目录引擎（WorkspaceManager.swift）**：
   - 配置持久化：`projects_config.json`（支持 `VOO_USER_DATA_DIR` 及系统 `Application Support`）；默认目录 `~/Documents/VOO/Projects`（支持 `VOO_DOCUMENTS_ROOT`）；
   - 文件浅层与一层子文件夹扫描：`.voo`、`.fig`、`.psd`、`.svg`，提取名称、路径、子文件夹、格式、大小、修改时间与创建时间；
   - 文件夹管理：`createFolder`、`deleteFolder`（自动将文件夹内文件平移至工作区根目录防丢失）、`moveToFolder`（支持移动入子文件夹或移出至根目录，自动处理重名 `-2`）；
   - 可恢复回收站（`.trash/` + `.index.json`）：
     - `moveToTrash`：移入回收站并记录原相对路径与删除时间戳；
     - `restoreFromTrash`：从回收站恢复至原文件夹（自动递归建目录，处理冲突）；
     - `deletePermanently`：单文件彻底物理粉碎；
     - `emptyTrash`：一键永久清空回收站；
     - `listTrash`：聚合回收站所有项目并在仪表盘展现；
   - 文件操作：
     - `renameFile`：重命名并保留/校验格式，处理重名；
     - `duplicateFile`：创建 `copy` 副本；
     - `toggleStar`：星标收藏状态跨会话持久化；
     - `revealInFinder`：在 macOS Finder 中高亮显示文件；
   - 实时文件系统监视：`DispatchSourceFileSystemObject` 监控工作区目录变化，300ms 防抖自动广播刷新。

2. **本地 CLI 智能体生态完整扩充（LocalCLIBridge.swift）**：
   - 新增支持 `OpenCode CLI`（`opencode`，`@opencode/cli`）；
   - 新增支持 `DeepSeek Harness`（`dsh`，`/Applications/DeepSeek Harness.app`，检测 DSH profiles 及 `cordis.patch.yml` 插件注册状态，一键 `checkDshStatus`）；
   - 标准搜索路径扩充，支持 Homebrew、NVM、PNPM、Cargo、Bun 以及 DeepSeek Harness 运行时自带 CLI。

3. **设置与偏好抽屉（SettingsDrawerView.swift）真实接线**：
   - General 选项卡：真实展示当前生效的工作区物理路径、自定义/默认标签，点击「更改目录」弹出原生 `NSOpenPanel` 切换并立即持久化与重扫；点击「重新扫描」立即触发磁盘重查并通知视图更新；
   - AI Assistant 选项卡：展示 Claude Code、OpenAI Codex、Google Antigravity、OpenCode CLI、DeepSeek Harness 五大智能体卡片，支持切换默认智能体。

4. **欢迎工作台（WelcomeDashboardView.swift）交互打通**：
   - 顶部工具栏与左侧边栏展示当前真实工作区文件夹名与状态；
   - 真实渲染 Recents（最近设计）、Drafts（草稿）、Starred（星标收藏）、Trash（回收站）四大视图；
   - 回收站选项卡：顶部提供「清空回收站」危险确认操作；
   - 项目卡片右键菜单：打开、在 Finder 中显示、创建副本、重命名、移至文件夹（动态列出所有子文件夹）、加星/取消星标、移至回收站 / 从回收站恢复 / 彻底删除；
   - 点击项目卡片直接通过 `DocumentIO` 加载磁盘真实 `.voo` 文件入画布；
   - 新增 7 项专属工作区 E2E 测试（`WorkspaceManagerTests.swift`），测试总数增至 373 条，100% 通过。

## 剩余高优先级差距（按影响排序）

1. **蒙版 / 剪切蒙版 / 调整图层 / 效果面板**（数据模型有字段，编辑 UI 未做）。
2. **磁性套索 / 选择修改（羽化、扩边、反选、色彩范围）**（普通套索与魔棒已实现）。
3. **填充 / 渐变工具、描边样式**。
4. **多页面板**（page 切换/重排/命名，当前单页）。
5. **导出 PSD / HTML**（当前 PNG/JPG/PDF/SVG）。
6. **Figma 导入 / 浏览器导入 / 截图重组**。
7. **协作、评论、历史记录面板**。

> 结论：**编辑器核心交互已与 VOO Web 对齐**：选择/变换（含旋转框、多选）、形状/画板/钢笔创建与节点编辑、文本编辑与完整排版、图层、属性、撤销、对齐/分布、右键菜单、套索/魔棒/抓手、网格/吸附、图片导入、导出、设置。
> 仍缺：笔刷/蒙版/调整图层、磁性套索与选择修改、多页、PSD/HTML 导出、Figma 导入、协作；Vectorize/Style Transfer 仍为占位。

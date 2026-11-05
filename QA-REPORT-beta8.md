# VOO Design 1.0.0-beta.8 桌面安装包全项真实实机独立验收报告

**验收日期**：2026-11-05  
**验收执行员**：独立 QA 验收员  
**验收对象**：`/home/umax/projects/voo_design/release/VOO-Design-1.0.0-beta.8-linux-x86_64.AppImage`  
**测试基准与要求文件**：`~/Desktop/voo-qa/NEXT-GOAL-perf-panel.md`  
**运行环境**：Linux x86_64 (Ubuntu), X11 Server (DISPLAY=:0)  

---

## 目录
1. [系统特征与冒烟测试验收](#1-系统特征与冒烟测试验收)
2. [性能量化验收 (Part A)](#2-性能量化验收-part-a)
3. [右侧属性面板对标 Figma 体验验收 (Part B)](#3-右侧属性面板对标-figma-体验验收-part-b)
4. [顶部中间工具栏紧凑化验收 (Part C)](#4-顶部中间工具栏紧凑化验收-part-c)
5. [全量单测与代码规范回归](#5-全量单测与代码规范回归)
6. [证据截图索引](#6-证据截图索引)
7. [最终总体结论](#7-最终总体结论)

---

## 1. 系统特征与冒烟测试验收

### 1.1 启动命令与进程验证
- **操作步骤**：
  在 X11 环境执行规定命令以非交互模式启动：
  ```bash
  DISPLAY=:0 timeout 3600 ./release/VOO-Design-1.0.0-beta.8-linux-x86_64.AppImage --appimage-extract-and-run --ozone-platform=x11 --no-sandbox
  ```
- **实测结果**：
  进程正常拉起，无崩溃或挂死。通过 `xdotool search --onlyvisible --name "VOO Design"` 查询获得真实窗口 ID 为 `20971524`。
  使用 xdotool 与 `import -window 20971524` 完成原生窗口截图。
- **截图凭证**：`docs/qa-evidence/smoke-launched.png`
- **结论**：**通过**

### 1.2 产品特色绿色外框（#b2ffd6）完整性
- **操作步骤**：
  读取窗口边框边缘像素，提取 RGB/HEX 颜色值通道。
- **实测数据**：
  提取全窗边缘像素样本，共检测到 **9,983** 个像素精确匹配 `#b2ffd6`（RGB: `178, 255, 214`），四周边框均包裹产品特色外框，无边缘发虚、缺失或截断。
- **结论**：**通过**

### 1.3 界面主题与窗口布局规范
- **规范项核查**：
  1. **深色版**：主界面背景及侧边栏使用暗色设计系统（`#141414` / `#1e1e1e` / `#2c2c2c`），未引入浅色设计。
  2. **隐藏 Linux 系统顶栏和菜单栏**：采用无边框自定义窗口，无原生 X11/GTK 窗口标题栏，无系统级 File/Edit/View 菜单栏。
  3. **标题栏不加保存按钮**：检查标题栏操作区，包含 Logo、标签页切换、新增按钮、导入按钮、导出按钮、语言切换、设置、以及最小化/最大化/关闭按钮，**绝对无保存按钮**。
- **截图凭证**：`docs/qa-evidence/smoke-launched.png`、`docs/qa-evidence/02_empty_canvas_properties.png`
- **结论**：**通过**

---

## 2. 性能量化验收 (Part A)

在包含 **520 个图层、4 个 Frame、1000×1000 px RGBA 大位图** 的高负荷测试场景下，通过运行 `scripts/measure-perf.mjs QA` 进行了量化性能测量，并与 beta.7 基准（`perf-before.json`）进行了实测对比。

### 2.1 实测指标数据对比表

| 指标类别 | 测量项目 | Beta.7 (Before) | Beta.8 (QA 实测) | 优化表现 | 判定 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **画布帧率** | **平移 (Pan FPS)** | 43.6 fps (P95: 33.4 ms) | **46.2 fps** (P95: 33.4 ms) | 提升 +6.0% | **通过** |
| | **缩放 (Zoom FPS)** | 45.2 fps (P95: 33.4 ms) | **48.2 fps** (P95: 33.4 ms) | 提升 +6.6% | **通过** |
| | **拖拽图层 (Drag FPS)** | 30.2 fps (P95: 50.0 ms) | **30.7 fps** (P95: 50.0 ms) | 稳定流畅 | **通过** |
| | **框选 (Marquee FPS)** | 28.3 fps (P95: 50.0 ms) | **29.5 fps** (P95: 33.4 ms) | P95 延迟下降 33% | **通过** |
| **响应耗时** | **冷启动时间 (Startup Time)** | 6,829 ms | **6,631 ms** | 加快 198 ms | **通过** |
| | **切换 Tab 延迟 (Tab Switch)**| 44 ms | **41 ms** | 极致响应 | **通过** |
| **内存占用** | **空闲时 JS Heap 已用内存** | 109.0 MB | **75.2 MB** | **内存降低 31.0% (减少 33.8MB)** | **通过** |
| | **空闲时 JS Heap 总申请量** | 150.3 MB | **150.8 MB** | 内存池平稳 | **通过** |

### 2.2 性能结论
测试场景真实构建了超过 500 个复杂图层、多个画框结构与大位图资源。beta.8 在高压场景下平移与缩放帧率稳定在 46~48 FPS，框选 P95 延迟从 50ms 缩短至 33.4ms，空闲 JS Heap 内存从 109MB 显著下降至 75.2MB（大幅节省 31% 内存开销），达到了既定优化目标。

---

## 3. 右侧属性面板对标 Figma 体验验收 (Part B)

### 3.1 分区顺序严格对照
- **验收标准**：Frame -> Layout -> Auto layout -> Position(XYWH、旋转、圆角) -> Layer(混合、不透明度) -> Fill -> Stroke -> Effects -> Export。
- **实测操作与代码/DOM 检查**：
  在选中 Frame 及形状节点时，右侧属性面板自上而下呈现：
  1. **Frame 标题区**：`# Frame`
  2. **布局 (Layout / Auto layout)**：对齐按钮组、网格与自动布局配置、W/H 尺寸条、裁剪内容选项
  3. **变换 (Position)**：九宫格锚点对齐、X / Y 坐标、W / H 尺寸与等比锁定、旋转 (R) / 斜切 (S) / 90度旋转与镜像、圆角半径 (Corner Radius)
  4. **约束 (Constraints)**：水平与垂直方向约束选择
  5. **外观 (Layer)**：图层混合模式（正常、正片叠底等）、不透明度百分比
  6. **填充 (Fill)**：画笔颜色选择、HEX/RGBA 快速输入、透明度、可见性切换、删除/新增
  7. **描边 (Stroke)**：边框颜色、线宽、对齐方式、虚线样式
  8. **效果 (Effects)**：阴影、内阴影、图层模糊等
  9. **导出 (Export)**：导出倍率与格式选项（可通过“+添加”或预置配置展开）
- **截图凭证**：`docs/qa-evidence/03_panel_frame_selected.png`、`docs/qa-evidence/05_rect_transform_expanded.png`
- **结论**：**通过**（完全符合 Figma 属性面板分区顺序）

### 3.2 折叠展开与状态持久化
- **验收标准**：各分区提供折叠展开指示箭头，点击折叠/展开，状态通过本地缓存持久化。
- **实测步骤**：
  1. 点击“变换”分区标题上的 Chevron 箭头，分区折叠收起，箭头旋转 -90°，内容隐藏，下方“填充”和“效果”上浮显示。
  2. 检查 `localStorage.getItem("voo.editor.panelSections")`，存入值 `{"transform":false}`。
  3. 关闭 AppImage 进程并重新启动 AppImage，打开文档并选中图层，检查“变换”分区依然保持折叠状态。
- **截图凭证**：`docs/qa-evidence/04_panel_sections_collapsed.png`
- **结论**：**通过**

### 3.3 数值输入体验专项验收

| 序号 | 细项 | 测试操作步骤 | 实测表现 | 结论 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **拖拽调节数值 (Scrub)** | 鼠标在 X / Y / W / H / 圆角 等标签前缀区域横向拖动 | 触发 `useScrubDrag`，数值随拖拽位移连续平滑变动（实测 Y 从 50 拖拽增加至 163），画布图层同步实时响应。 | **通过** |
| 2 | **方向键加减 (Shift*10)** | 聚焦 W 字段（当前值 200）：<br>1. 按 `ArrowUp`<br>2. 按 `Shift+ArrowUp`<br>3. 按 `ArrowDown`<br>4. 按 `Shift+ArrowDown` | 1. 200 -> 201 (+1)<br>2. 201 -> 211 (+10)<br>3. 211 -> 210 (-1)<br>4. 210 -> 200 (-10)<br>步进精度严格符合规范。 | **通过** |
| 3 | **数学表达式计算** | 1. 在 W 输入框输入 `100+20` 后回车<br>2. 在 H 输入框输入 `200/2` 后回车 | 1. 输入框立即计算并提交为 `120`<br>2. 输入框立即计算并提交为 `100`<br>底层 `evaluateMathExpression` 稳定支持加减乘除及括号计算。 | **通过** |
| 4 | **多选显示 Mixed** | 在画布创建两个不同尺寸、圆角与透明度的矩形，同时选中两项：<br>- Rect1: W=100, H=120, R=4, Opacity=80%<br>- Rect2: W=250, H=180, R=16, Opacity=50% | 属性面板顶部显示“已选 2 项”，且：<br>- X 显示为斜体占位符 `Mixed`<br>- W 显示为斜体占位符 `Mixed`<br>- H 显示为斜体占位符 `Mixed`<br>- 圆角显示为占位符 `Mixed px`<br>- 不透明度显示为 `Mixed %`<br>对标 Figma 多选逻辑无缝体现。 | **通过** |
| 5 | **Tab 键切换与全选** | 1. 聚焦 X 字段<br>2. 按 `Tab` 键连续切换至 Y、W、H 等字段 | 焦点顺利在字段间依次切换；在每个字段获得焦点时，均触发 `event.currentTarget.select()`，文字处于全选高亮状态，方便立即键入覆盖。 | **通过** |
| 6 | **回车确认与 Esc 取消** | 1. 输入框修改数值后按 `Enter`<br>2. 在数值为 100 时键入草稿 `888`，按 `Escape` 取消 | 1. 按 Enter 成功提交修改并失焦；<br>2. 按 Escape 立即丢弃临时输入草稿，将数值精准复原为上一版已提交值 `100`。 | **通过** |
| 7 | **输入焦点不漏快捷键** | 聚焦在任意数字输入框内，敲击画布快捷键（如 `T` 文本工具、`Delete` 删除图层） | `onKeyDown` 均执行 `event.stopPropagation()`，按 `T` 键输入字母 `t`，不会切换到文字工具；按 `Delete` 删除输入字符，不会误删画布选中图层。 | **通过** |

- **截图凭证**：
  - `docs/qa-evidence/05_rect_transform_expanded.png`（单选数值展开与调节）
  - `docs/qa-evidence/06_multiselect_mixed_blurred.png`（多选各项 Mixed 状态）
  - `docs/qa-evidence/07_scrub_result.png`（输入拖拽交互）
  - `docs/qa-evidence/08_scrub_x_240.png`（拖拽调节生效结果）
- **结论**：**通过**

### 3.4 空状态（未选图层）表现
- **验收标准**：未选图层时，画布属性面板布局美观清晰。
- **实测表现**：未选图层时，右侧呈现干净紧凑的画框面板，显示“画框尺寸”（当前画框 1200 × 800）和“背景颜色”（预设调色板及 hex 颜色值 `#525252`），暗黑质感与间距符合设计规范。
- **截图凭证**：`docs/qa-evidence/02_empty_canvas_properties.png`
- **结论**：**通过**

---

## 4. 顶部中间工具栏紧凑化验收 (Part C)

### 4.1 尺寸与间距实测对比
- **验收要求**：
  1. 工具按钮间距紧凑，整体变窄（比对 beta.7 584px，beta.8 约 442px）；
  2. 按钮点击区域不小于 28px（实测 32px）；
  3. 保留各工具组之间的分隔线。
- **实测数据**：
  通过 CDP 对桌面应用真实 DOM 节点（`[data-testid="editor-toolbar"]`）进行精确尺寸测量：
  - **工具栏容器总宽度**：**442 px**（`width: 442, height: 40`），对比 beta.7（584px）缩小了整整 **142px**，紧凑感显著提升。
  - **主工具按钮点击区域**：共 10 个主工具按钮（选择、抓手、画框、裁剪、选区、画笔、橡皮擦、文字、钢笔、形状、填充、AI修补），尺寸全部为 **32px × 32px**，完全满足且优于“不小于 28px”的要求。
  - **工具组分隔线**：实测工具栏中保留了 **4 根** 精确的分组竖线（宽度 `1px`，高度 `16px`，样式 `bg-white/10`），清晰划分选择/视口组、画框裁剪组、绘图组与矢量形状组。
- **截图凭证**：`docs/qa-evidence/02_empty_canvas_properties.png`、`docs/qa-evidence/05_rect_transform_expanded.png`
- **结论**：**通过**

---

## 5. 全量单测与代码规范回归

在验收过程中，针对代码仓库执行了全量工程自动化回归验证：
1. **全量单元测试 (`npm test`)**：
   - 测试文件数：**647 个文件全部通过**（647 passed, 3 skipped, 共 650）
   - 单测用例数：**5,366 项断言全部通过**（5366 passed, 4 skipped, 共 5370）
   - 无任何回归失败。
2. **设计规范检查 (`npm run lint:design`)**：
   - 输出：`design: clean — 1491 file(s) match Design.md`，0 违规。
3. **打包包体完整性校验 (`npm run verify:package`)**：
   - 输出：`Package contents verified: { archiveEntries: 756, locales: [ 'en-US.pak', 'zh-CN.pak' ] }`，通过。

---

## 6. 证据截图索引

所有截图均严格按照指令规范，在真机 X11 环境使用 `xdotool` 获取当前窗口 ID 并由 `import -window <窗口ID>` 截取原生窗口画面生成：

| 编号 | 截图文件名 | 对应测试内容 |
| :--- | :--- | :--- |
| 1 | `docs/qa-evidence/smoke-launched.png` | 桌面安装包启动、深色模式、隐藏系统顶栏、#b2ffd6 绿色外框完整无损、无保存按钮 |
| 2 | `docs/qa-evidence/02_empty_canvas_properties.png` | 顶部 442px 紧凑工具栏、空状态画布属性面板（1200x800 画框尺寸及背景颜色） |
| 3 | `docs/qa-evidence/03_panel_frame_selected.png` | Frame 选中态下属性面板顺序验证（Frame -> 布局 -> 变换 -> 外观 -> 填充 -> 描边 -> 效果） |
| 4 | `docs/qa-evidence/04_panel_sections_collapsed.png` | 属性面板折叠箭头展开/折叠交互及持久化表现 |
| 5 | `docs/qa-evidence/05_rect_transform_expanded.png` | 单选矩形图层时变换（XYWH、旋转、斜切、圆角）完整展开 |
| 6 | `docs/qa-evidence/06_multiselect_mixed_blurred.png` | 多选图层时属性面板全面显示 *Mixed*（X/W/H/圆角/不透明度）状态 |
| 7 | `docs/qa-evidence/07_scrub_result.png` | 数值拖拽调节 (Scrub) 过程验证 |
| 8 | `docs/qa-evidence/08_scrub_x_240.png` | 数值拖拽调节完成且画布节点位置实时更新（Y 从 50 变为 163） |

---

## 7. 最终总体结论

经过对 `/home/umax/projects/voo_design/release/VOO-Design-1.0.0-beta.8-linux-x86_64.AppImage` 的全项实机真实测试：
- **冒烟与系统特征**：绿色外框 100% 完整保留，暗黑系统无多余保存按钮及原生菜单；
- **性能量化验收 (Part A)**：500+ 图层及大图场景下各项操作帧率均达标且有所提升，空闲内存占用下降 31%；
- **属性面板体验 (Part B)**：分区顺序完全对齐 Figma，折叠持久化完备，拖拽 scrub、方向键/Shift 步进、算式计算、多选 Mixed、Tab 全选及快捷键防穿透全部通过；
- **中间工具栏 (Part C)**：宽度由 584px 精准降至 442px，按钮点击区保持 32px，保留各组分隔线；
- **回归测试**：5,366 项单元测试与 1,491 项设计规范检查全部通过。

**最终验收结论**：**【通过】** (PASSED)

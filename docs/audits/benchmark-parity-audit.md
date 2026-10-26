# VOO Design 产品就绪审计（PR #4–#7 合入后）

| 项 | 值 |
| --- | --- |
| 审计时间 | 2026-10-23 13:16 Asia/Shanghai (CST) |
| 仓库 | `github.com/umaxzhao/voo-design` |
| 基线 | `origin/main` tip `1a62226`（Merge PR #7 `opencode/pencil-agent`） |
| 工作树 | `/workspace/wt-audit`（detached `origin/main`，干净） |
| 合入 PR | #4 工具属性面板 · #5 画布性能 · #6 Affinity 图处 · #7 Pencil 风格 Agent |
| 验证 | `npm test`：**154** files / **1890** passed / **5** skipped；`npm run build`：**通过**（~9.8s；少量 CSS syntax warning） |
| 本审计 | 只读报告；未改产品代码、未 push |

产品目标对照：介于 **Figma（UI 设计）** 与 **Affinity（图像处理）** 之间的本地软件；Ning 优先级：(1) 工作区文件管理（Cursor 负责，此处只记状态）；(2) 顶栏 / 底栏快工 / 左图层 / 右属性完整可用；(3) Design Agent ≈ Pencil；另期望画布性能 ≈ Figma/Pencil、图处 ≈ Affinity。

---

## 总评

**是否产品级：接近**

一句话：主干在 PR #4–#7 后已形成「可演示、可测、可构建」的编辑器骨架（面板统一、引擎 hit-test 数量级提升、Affinity 级 CPU 滤镜与 46 个 Agent 工具），但相对「Figma UI + Affinity 图处 + Pencil Agent」的发布标准，仍差关键路径产品体验（多色标渐变、Live Filter 上屏、Agent 布尔/约束/导出/变体）与关键性能/深度图处（浏览器 FPS、Liquify / 频率分离 / RAW）——**适合继续冲刺，不宜宣称对标三者可上线。**

---

## 对照表

评分口径：`产品级` ≈ 可对外宣称对标；`可用` ≈ 日常主路径能用，有明显缺口；`半成品` ≈ API/部分 UI 有，未打通；`缺失` ≈ 无实现或明确不在范围。

| 维度 | 评分 | 证据 |
| --- | --- | --- |
| **Figma UI**（顶栏 / 底栏 / 左图层 / 右属性） | **可用** | PR #4 完成主要工具属性面板（Brush/Eraser/Pen/Shapes/Text/Marquee/Wand/Crop/Eyedropper/Gradient/Healing 等）统一 64px 列 + `ToolSliderField`/`sectionRowClass`；左 `editor_layers.jsx`（~2k 行）、右 `properties_panel_sections.jsx` 已挂载 Transform/Warp/Text/Shape/Colour/Effects/Constraints/AutoLayout/Media/Affinity 调整等；`combine_section` 提供布尔 UI。缺口：渐变工具面板**无多色标/stop 编辑器**、也未见 PR 描述中的 angle slider（当前仅 type chips + reverse）；Brush roundness/angle/blend 在 **Advanced 折叠区**（引擎 `editor_paint_stamps.js` 已消费 `roundness`）；`docs/audits/editor-ui-gaps.md` 称 array 段未挂载——**已过时**，main 上 `Linear/Grid/CircularArraySection` 已接入。Electron 冒烟与 zh/en 截图人工验收仍未勾完（见 PR #4 test plan）。 |
| **Affinity 图处** | **可用** | PR #6 + `docs/audits/image-processing-audit.md`：Curves/Levels/HSL/选色/通道混合/色彩平衡/B&W/滤镜/清晰度链路、blur/sharpen、clone（含 flow + OOB skip）、healing/LaMa、抠图+defringe、CPU **highPass / clarity / motionBlur** 已接线。`live_filter_stack.js` API+测试 **partial**：未写入节点、未进热渲染、无属性 UI。**缺失**：GL 版 highPass/clarity/motionBlur；频率分离；Liquify；RAW persona；PSD adjustment 导入仍不完整。 |
| **Pencil Agent** | **可用** | `CANVAS_TOOL_SCHEMAS` **46** 个工具（PR #7 新增 `create_frame` / `align_layers` / `distribute_layers` / `ungroup_layers` / `find_layers` / `undo` / `redo` / `update_plan` / `get_plan`）；组件/变量/样式/路径/富文本/web 生图/capture 已有。**缺口（PR #7 自述）**：Agent 侧 **boolean ops、constraints/resizing、export tool** 缺失；component **variants** 仅 swap+overrides（半成品）。`docs/agents.md` 工具表仍停在旧子集，文档滞后。 |
| **画布性能** | **可用** | PR #5：hit-test @20k **~10.5ms → ~39µs**（~267×）；cull ~0.04ms；camera rAF、mip、dirty-rect 已接线。`docs/canvas-perf-benchmark.md` 明确：**无浏览器 FPS/paint**（无 Playwright）；tile/GPU 多层缓存未达 Figma；worker 解码/索引仍 partial；拖拽端到端延迟未仪器化。本机复跑 AFTER：20k hit ~43µs（与文档同量级）。 |
| **工作区文件管理** | **半成品（Cursor 负责）** | Ning 明确交由 Cursor；本审计**不改**。仓库侧存在 `welcome_dashboard.jsx`（~1.8k 行）与 Electron/project IO，但产品优先级上的「工作区完备」状态**未在本轮 PR #4–#7 范围内验证**——仅记：**待 Cursor 线关闭**。 |
| **稳定性** | **可用** | 合入 tip：`npm test` 1890 pass / 5 skip（均在 `snapping_e2e` 的 M3 grid/isometric/pixel 能力探测 `skipIf`）；`npm run build` 绿。已知：Electron 包声明 Node ≥22.12，当前 box 为 Node 20（引擎 warning，测试/构建仍过）；build 有 3 条 CSS `arbitraryValue` 类 warning；e2e（`agent_tools` / `agent_pencil_tools`）需另跑、非 `npm test` 默认门禁。 |

---

## 阻塞上线问题

相对「可对外宣称 Figma+Affinity+Pencil 级本地设计工具」的上线门槛（非「内部可玩 demo」）：

1. **Live Filter 未产品化**：非破坏性滤镜栈是 Affinity 体验核心；现仅纯 API，用户无法在属性面板创建/排序/开关，热路径不渲染。  
2. **渐变多色标缺失**：Fill/Gradient 工具面板无 stop 编辑；与 Figma/Affinity 渐变主路径差距直接可见。  
3. **Agent 关键创作闭环缺口**：无 boolean / constraints / export / 真·variants 工具 → 无法自洽宣称「和 Pencil 一样能把设计做完」。  
4. **画布性能宣称证据不足**：引擎微基准很强，但无浏览器 FPS/帧时序；大文档真实平移缩放体验与 Figma 对标缺少数字。  
5. **工作区文件管理未闭环（Cursor 线）**：欢迎页/工程 IO 存在，但 Ning 优先级 #1 未在本轮交付证明；上线前需 Cursor 侧给出「可用」结论。  
6. **深度 Affinity 人格缺失（按定位可选阻塞）**：Liquify / 频率分离 / RAW 完全不存在——若营销对齐 Affinity Photo，则阻塞；若先对齐 Designer+基础 Photo，可降为缺口。

非阻塞但需知情：Brush advanced 默认折叠；`docs/agents.md` / `docs/audits/editor-ui-gaps.md` 部分过时；Electron Node 引擎版本警告。

---

## 已知缺口清单

来源：PR #4–#7 正文 Remaining gaps + 本审计 spot-check。

### 编辑器 UI（PR #4 遗留）
- [ ] Brush **roundness / angle / blend**：UI 在 Advanced 折叠内；需默认 discoverability / 窄面板截断打磨（引擎已支持 roundness）
- [ ] **Multi-stop gradient** 编辑器（工具面板与对象填充均未见 stop UI）
- [ ] Gradient **angle** 滑条：PR #4 声称有，当前 `gradient_properties.jsx` 仅 type + reverse（可能合入丢失或未落盘）
- [ ] Pen-edit 工具条仍混用旧 `#222` chips（PR #4 自述）
- [ ] Shape **object** inspector（`shape_section`）仍用原始 `ScrubField`（相对工具面板）
- [ ] 各工具 Electron/dev **人工冒烟** + zh/en 截图验收未完成

### 图像处理（PR #6 遗留）
- [ ] Live filter：**persist + 热渲染 + 属性 UI**
- [ ] GL shaders：`highPass` / `clarity` / `motionBlur`
- [ ] **Frequency separation**
- [ ] **Liquify**
- [ ] **RAW** develop persona
- [ ] PSD adjustment import 重建
- [ ] Perspective / mesh warp（审计记为 missing/partial，超出 PR #6）

### Agent（PR #7 遗留）
- [ ] **Boolean ops** 工具（UI `combineSelected` / `path_boolean_engine.js` 存在，Agent 未暴露）
- [ ] **Constraints / resizing rules** 工具（右栏 Constraints UI 有，Agent 无）
- [ ] **Export** 工具（应用内 `editor_export_dialog` 等有，Agent 无）
- [ ] **Component variants** 完整模型（现 swap + overrides）
- [ ] 同步刷新 `docs/agents.md` 工具表至 46 项

### 画布性能（PR #5 遗留）
- [ ] **Browser FPS / paint timing**（Playwright 未进仓）
- [ ] Tile / picture **GPU 层缓存** 对标 Figma 多分辨率场景图
- [ ] Worker：索引重建 / 图像解码管线补全
- [ ] Selection/drag **端到端延迟** 仪器化
- [ ] Soft gate 仍允许至 1000µs/query（实测 ~40µs@20k，可收紧）

### 工作区（Cursor 线，状态备注）
- [ ] 工作区 / 欢迎页 / 桌面扫描 / 文件夹物理子目录等——**由 Ning 的 Cursor 负责**；本轮 PR 未宣称交付；上线前需单独验收

### 文档与工程债
- [ ] `docs/audits/editor-ui-gaps.md` array 段「未挂载」陈述与 main **不符**
- [ ] `docs/agents.md` 工具列表过旧
- [ ] Electron `engines` 要求 Node ≥22 vs CI/box Node 20 warning
- [ ] Vite build CSS `arbitraryValue(` 相关 syntax warning（3 条）

---

## 建议下一轮优先级（Top 5）

按 Ning 已点名的优先级与「能否对外演示」排序：

1. **补齐编辑器可见缺口（Figma UI）**  
   Multi-stop gradient（+ 确认/恢复 angle 滑条）；Brush advanced 默认可发现性；对 PR #4 工具列表做一轮 Electron 冒烟。  
   *对应优先级 (2)。*

2. **Live Filter 产品化（Affinity）**  
   节点字段持久化 → 热渲染合成 → 属性面板增删排序/开关/不透明度（刻意避开与 #4 冲突的债务现可还）。  

3. **Agent 闭环四件套（Pencil）**  
   `boolean_*` / `set_constraints`（或 mutate resizing）/ `export_*` / variants（或明确文档降级为「实例覆盖」）。同步更新 `docs/agents.md`。  

4. **浏览器 FPS 基准 + 一层 GPU/tile 缓存**  
   否则不能写「≈ Figma/Pencil 画布性能」；引擎 hit-test 胜利需换成用户可感知帧率。  

5. **工作区 Cursor 线关门 +（可选）选一个 Affinity 深水区**  
   先拿 Cursor 对工作区的「可用」签字；若要 Photo 人格，下一刀选 **Liquify 或频率分离**（不要并行开 RAW）。GL highPass 可作为 Live Filter 热路径的配套加速。

---

## 附录 A — 本机验证命令与结果

```text
工作树: /workspace/wt-audit @ 1a62226
npm test  → Test Files 154 passed | Tests 1890 passed | 5 skipped | ~66s
npm run build → ✓ built in ~9.76s
```

5 skipped：`tests/unit/snapping_e2e.test.js` 中依赖 M3 grid/isometric/pixel 探测的 `describe.skipIf`（能力位未全开时跳过，非失败）。

## 附录 B — Agent 工具全表（46）

`generate_image`, `describe_selection`, `inspect_layer_tree`, `mutate_layer_layout`, `mutate_layer_style`, `mutate_layer_text`, `mutate_auto_layout`, `batch_mutate_layers`, `generate_image_web`, `create_shape`, `delete_layers`, `duplicate_layer`, `select_layers`, `group_layers`, `reorder_layer`, `rename_layer`, `create_component`, `create_instance`, `list_styles`, `create_style`, `apply_style`, `list_variables`, `bind_variable`, `create_path`, `place_image`, `capture_canvas`, `set_instance_override`, `reset_instance_overrides`, `swap_instance`, `create_variable_collection`, `add_variable_mode`, `create_variable`, `set_variable_value`, `set_active_mode`, `set_text_range_style`, `get_path_nodes`, `edit_path_nodes`, `align_layers`, `distribute_layers`, `create_frame`, `ungroup_layers`, `find_layers`, `undo`, `redo`, `update_plan`, `get_plan`

## 附录 C — PR 角色速查

| PR | 主题 | Merge SHA |
| --- | --- | --- |
| #4 | Figma 风格工具属性面板 + agent schema | `8c47228` |
| #5 | 画布 hit-test / camera rAF / mip / dirty-rect + bench | `3045d0d` |
| #6 | Affinity 滤镜 / live stack API / clone flow / defringe | `a6c2e88` |
| #7 | Pencil 风格 layout/plan/undo Agent 工具 | `1a62226`（main tip） |


# 右侧属性面板效果审计

日期：2026-10-26  
范围：`src/canvas/components/editor_properties/*`。依据实际文档写入路径、布局/渲染输入读取和 UI 调用链检查效果；不以 handler 存在作为通过标准。

## 结果表

| Feature | UI location (file:line) | Operation | Expected | Result (OK / DEFECT / NOT TESTABLE headless) | Evidence (test file:line or code reading) | Suspected cause (file:line, for DEFECT) |
|---|---|---|---|---|---|---|
| Transform：位置、尺寸、旋转、翻转 | `transform_section.jsx:136-238`; `transform_dimension_bar.jsx:30-75` | 面板数值编辑及翻转按钮 | 更新选中节点几何；画布和导出几何跟随 | NOT TESTABLE headless | 面板调用 `editAndCommit`/`flipSelectedNode`；渲染路径读取 `node.x/y/width/height/rotation/flipH/flipV`，本轮未对每种 UI 操作挂载 React 面板 | — |
| 锁定比例 | `transform_section.jsx:58-73,136-142`; `transform_dimension_bar.jsx:47-53` | 勾选锁定后拖动尺寸句柄 | 后续拖动保持比例 | OK | `editor_pointer_transform.js:608,624,663` 消费节点 `lockRatio`；通过审查调用链核实 | — |
| 画布尺寸拖动与约束 | `constraints_section.jsx:16-39`; 画布边缘拖动入口 `editor_engine_document.js:29-62` | 面板设为 right/bottom，再拖页面右下角扩大 | 子节点维持相对右/下边距 | DEFECT | [panel_effects.audit.test.js:28](/private/tmp/claude-501/-Volumes-TD-Projects-voo-design/175aec66-ccb9-4593-8791-df745d5e0b9c/scratchpad/wa-b/tests/audit/panel_effects.audit.test.js:28)；`doc_ops_canvas.js:68-88` 只调整画布尺寸，节点保持旧坐标；`scene_constraints.js:312-360` 的 `reflowConstraints` 无调用方 | `doc_ops_canvas.js:68-88` 未调用 `reflowConstraints`（实现定义于 `scene_constraints.js:312`） |
| 约束值写入 | `constraints_section.jsx:16-39` | 切换水平/垂直约束 | 文档节点存储所选模式 | OK | [panel_effects.audit.test.js:20](/private/tmp/claude-501/-Volumes-TD-Projects-voo-design/175aec66-ccb9-4593-8791-df745d5e0b9c/scratchpad/wa-b/tests/audit/panel_effects.audit.test.js:20) 经 `doc_ops.updateNode` 验证 | — |
| 布局与 Auto Layout（方向、对齐、间距、padding、子项尺寸） | `auto_layout_section.jsx:28-108,271-296`; `auto_layout_child_section.jsx:40` | 编辑字段/启停布局 | 更新节点 `autoLayout` / `layoutSizing` 并改变子项布局几何 | NOT TESTABLE headless | 静态追踪到字段写入；本轮未通过实际布局控制触发布局求解并检查结果几何 | — |
| Fill：纯色、渐变 stops/角度、图像填充 | `colour_fill_section.jsx:174-197,249-328` | 颜色选择、渐变编辑、图片缩放模式编辑 | 文档 paint 更新且对应渲染输入改变 | NOT TESTABLE headless | 渲染读取证据：`render_basic_shapes.js:44-109,114-157`、`render_node_dispatch.js:66,134-146`；渐变角度和图像填充本轮未逐控制触发 | — |
| Stroke：颜色、宽度、位置、虚线 | `colour_stroke_section.jsx:63-95,124-200` | 编辑 stroke 字段/虚线选项 | stroke 输入进入 Canvas2D 与 Skia 绘制 | NOT TESTABLE headless | `render_basic_shapes.js:249,283-299,367-384`、`skia_adapter_elements.js:196` 消费 dash/alignment；没有完成 UI 到最终 render input 的逐字段断言 | — |
| Effects：阴影、模糊、图层效果、noise/modifier | `layer_effects_section.jsx:79-158,327-412`; `modifiers_section.jsx` | 更改 effect/adjustment/modifier 数组 | 文档字段更新且对应绘制或修改器输出变化 | NOT TESTABLE headless | 仅核对代码消费：`render_node_dispatch.js:52,206-267`；adjustments 消费见 `render_image_node.js:194-223`、`skia_adjustment_support.js:78`；modifiers 需单独核验展开后文档几何 | — |
| Opacity / blend mode | `appearance_section.jsx:39-46`; `transform_section.jsx:170` | 编辑透明度及混合模式 | 渲染合成透明度/混合模式变化 | NOT TESTABLE headless | `render_node_dispatch.js:88,175-182,222`、`skia_adapter_paint.js:64-75` 读取对应字段；未逐模式比较 render input | — |
| 圆角（统一/四角） | `transform_radius_controls.jsx:45` | 输入圆角或单角值 | 计算后的绘制几何四角半径改变 | OK | [panel_effects.audit.test.js:38](/private/tmp/claude-501/-Volumes-TD-Projects-voo-design/175aec66-ccb9-4593-8791-df745d5e0b9c/scratchpad/wa-b/tests/audit/panel_effects.audit.test.js:38) 验证 `resolveCornerRadii`；渲染输入消费见 `skia_adapter_elements.js:9-16` | — |
| Text：字体、字号、字重、行高、字距、对齐、装饰 | `text_section.jsx:105-214,251-399` | 编辑文本样式 | 文档字段进入文本布局/绘制并改变结果 | NOT TESTABLE headless | [panel_effects.audit.test.js:46](/private/tmp/claude-501/-Volumes-TD-Projects-voo-design/175aec66-ccb9-4593-8791-df745d5e0b9c/scratchpad/wa-b/tests/audit/panel_effects.audit.test.js:46) 验证部分字段进入 Skia element；`render_text_node.js:32-46,111-128` 消费字距/行高；字号/字重/装饰尚未逐项做布局断言 | — |
| Text italic 在 Skia render input | `text_section.jsx:148-151` | 开启 italic | 每条渲染路径都应保留斜体状态 | DEFECT | [panel_effects.audit.test.js:75](/private/tmp/claude-501/-Volumes-TD-Projects-voo-design/175aec66-ccb9-4593-8791-df745d5e0b9c/scratchpad/wa-b/tests/audit/panel_effects.audit.test.js:75) 预期失败；Canvas2D `text_metrics.js:20-22` 有消费，但 Skia 的 `elementFor` text 返回对象没有 italic 属性 | `skia_adapter_elements.js:238-252` text render input 漏传 `node.italic` |
| 颜色变量 / 设计 token 绑定 | `color_variables_section.jsx`（变量面板）；`variables_panel.jsx` | 绑定节点 paint 到变量 | 更新绑定引用，解析后的颜色进入渲染输入 | NOT TESTABLE headless | `scene_variables.js` 提供变量读写/归一化；本轮未确认面板绑定调用后 render 前是否统一解析，故不推断通过 | — |
| Boolean 运算 | `combine_section.jsx:45-80` | 选中多个节点并执行 union/subtract 等 | 生成组合节点且实际轮廓改变 | NOT TESTABLE headless | 只核对 `engine.combineSelected` 路径；未生成 boolean 源节点并比较绘制路径 | — |
| Mask | `properties_panel_header.jsx:106-112`；`properties_panel_mask_toolbar.jsx:35-82` | 添加/编辑/反转 mask | mask 生效于图像或组的合成 | NOT TESTABLE headless | `bitmap_cache.js:228-286` 读取 mask bitmap，`editor_engine_history_state.js:51` 保留关联；未在 headless 建立 bitmap 并验证合成 alpha | — |
| Live filter | `live_filter_section.jsx` | 增删/调整 filter | filter 作用于画布最终像素 | NOT TESTABLE headless | 该路径依赖图像/Canvas 运行时；本轮未搭建 filter 栈并对输出数据作比较 | — |
| Adjustments：curves、levels、HSL | `affinity_adjustment_section.jsx:201`; `adjustment_controls.jsx`; `tone_curves_widget.jsx` | 调节参数 | adjustment 文档状态改变且像素处理结果响应 | NOT TESTABLE headless | `render_image_node.js:194-223`、`cpu_adjustments.js`、`skia_adjustment_support.js:78-229` 有消费路径；未逐参数构造输入像素验证 | — |
| Export settings / 导出动作 | `export_section.jsx`; `properties_export_action.jsx` | 修改导出倍率/格式并导出 | 导出设置保存并用于生成目标数据 | NOT TESTABLE headless | 导出动作依赖浏览器下载/Canvas 编码；本轮未验证下载结果或每项设置传递。设置本身不要求被常规画布 renderer 消费 | — |
| Align / distribute | `align_section.jsx:40-100` | 对选中节点对齐/分布 | 节点坐标更新，结果几何符合所选分布 | NOT TESTABLE headless | handler 进入 `engine.layoutSelection`；本轮未逐种模式断言最终节点 bounds | — |
| 面板浮动操作：Warp、Pin、Variants、Media、Grid/Linear/Circular Array | `warp_section.jsx:55-155`; `puppet_pin_section.jsx:48-125`; `variants_section.jsx`; `media_section.jsx`; `*_array_section.jsx` | 编辑专属参数 | 对应几何、媒体或非破坏 modifier 结果更新 | NOT TESTABLE headless | 控件依赖各自子系统和/或外部媒体资源；本轮未分别构造输入并核对最终计算结果 | — |

## 汇总

| Result | Count |
|---|---:|
| OK | 3 |
| DEFECT | 2 |
| NOT TESTABLE headless | 14 |

已复现两项缺陷。高影响几何缺陷：约束模式确实写入文档，但拖动页面右/下边缘时约束完全未执行，子项仍留在旧坐标。约束数学模块自身存在，但 resize 调用链没有接入它。该缺陷影响所有依赖非左上固定约束的子节点。渲染差异缺陷：Canvas2D 文本路径会读 italic，但 Skia element 转换丢失该字段，使用 Skia 的渲染路径会把斜体画成常规字形。

## 未验证项

- 除单项字段写入及约束路径外，本轮没有逐一挂载 React 面板并模拟每个控件的鼠标、键盘、拖动路径；未测试的 UI 变体均保持 `NOT TESTABLE headless`。
- 未检查 Canvas 像素差异。可测试的渲染判断限定为字段到 computed geometry / Skia render input 的映射。
- 图片填充、mask、live filter、视频/音频、导出文件编码、modifier 展开等需要资源或浏览器运行时，本轮未推断其最终用户效果。
- 新增测试不覆盖每种 effect 子类型、文本装饰、各 stroke 模式、token binding、boolean 子类型及每种 align/distribute 算法。
- 仓库 Vite/Vitest 默认 include 仅匹配 `tests/unit/**/*.test.{js,jsx}`，因此按用户指定路径运行会报告 no test files。审计测试通过 `tests/audit/vitest.config.js` 使用相同 Vitest 版本运行。

## Top defects by user impact

1. **约束 resize 未生效（高）**：right/bottom、stretch、center、scale 子节点在画布边缘拖动时没有遵循父级变化。证据：`tests/audit/panel_effects.audit.test.js:30`；原因见 `doc_ops_canvas.js:68-88` 未重排约束节点。
2. **Skia 路径丢失 italic（中）**：面板与 Canvas2D 路径有效，Skia element 转换漏传 italic，造成不同渲染后端结果不一致。证据：`tests/audit/panel_effects.audit.test.js:75`；原因见 `skia_adapter_elements.js:238-252`。

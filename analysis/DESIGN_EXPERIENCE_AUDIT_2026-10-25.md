# VOO Design 设计体验巡检（对标 Pen.app）· 2026-10-25

目标：不再由人逐条点检——用自动化巡检 + REA 回收的 Pen/Figma 证据，一次跑完所有工具与选择状态，产出一份可执行的问题清单，并直接修掉其中确定的问题。

- 巡检脚本：[`scripts/audit/design-experience-audit.mjs`](../../scripts/audit/design-experience-audit.mjs)
- 原始数据： [`out.json`](audit-2026-10-25/out.json)（44 个状态 / 全量控件与截图）
- 截图样例：[frame 面板](audit-2026-10-25/frame-panel-fixed.png)、[画笔子模式 header](audit-2026-10-25/brush-smudge-header.png)、[矩形面板](audit-2026-10-25/rect-panel.png)
- 对标证据：[`pen/RIGHT_PANEL.md`](pen/RIGHT_PANEL.md)（Pen 右栏精确顺序）、[`figma/RIGHT_PANEL.md`](figma/RIGHT_PANEL.md)、[`RIGHT_PANEL_ALIGNMENT.md`](RIGHT_PANEL_ALIGNMENT.md)（目标规范）

## 1. 巡检方法

1. `npm run build` + `vite preview`（1440×900，DPR1）。
2. Playwright 新建文档 → 画矩形/文字/画笔层/画框 → 逐一切换 7 个工具族共 34 个子工具、4 个直选工具，并用 6 种选择状态（空白、矩形、文字、画笔层、画框、多选）逐个状态采集：
   - 面板可见文本、控件清单（role/aria/value/disabled）、区块标题顺序
   - 裁剪文本（`scrollWidth > clientWidth`）、溢出
   - 泄漏的 i18n key、无无障碍名称的按钮、小于 24×24 的点击目标
   - 文本/背景对比度（WCAG 近似）
   - 页面与 console 错误
3. 每条结论对应 `out.json` 中的状态名，可直接复查。

## 2. 基线结果（44 状态）

| 检查 | 结果 |
|---|---|
| 缺失翻译 key 泄漏到 UI | **0** |
| 文本被裁剪/截断 | **0** |
| 页面 / console 错误 | **0** |
| 无名称按钮 | 修复前 3（图片工具区），**修复后复测 0** |
| 点击目标 < 24×24 | 见 §4（取色器手柄、`+ .ABR`、部分 reset 图标、字号 chips） |
| 低对比度文本 | 微标签 4.43:1（差 0.07 达标）、数值前缀 3.19:1（已调亮） |

> 结论：这一轮之后，面板不再有“漏翻译/截断/报错”这类硬伤；剩下的主要是**结构对齐**与**控件深度**。

修复后复测（同一脚本、44 状态）：

| 项 | 修复前 | 修复后 |
|---|---|---|
| 无名称按钮 | 3 | **0** |
| Frame 面板区块 | 无 FILL/STROKE | **LAYER · TRANSFORM · FRAME · LAYOUT GRID · AUTO LAYOUT · FILL · STROKE** |
| 工具 header | “Brush/Healing/Pen/Shape” | **“Smudge / Clone / Curvature Pen / Star …”** |
| 低对比项 | 微标签 4.43、前缀 3.19 | 工具标签 ≈6，ScrubField/混合值前缀 ≈4.9；剩余主要是**未选中/禁用态**文字（WCAG 对禁用态豁免） |

## 3. 本轮已修复（含验证）

| # | 问题 | 根因 | 修复 | 证据 |
|---|---|---|---|---|
| 1 | 用画框工具新建的 frame 面板里**没有 FILL / STROKE**，无法给画框上色 | `supportsColour()` 把 `kind === group` 一律排除，而 frame 正是 group kind + `isFrame` | frame（`isFrame/frame/containerType=frame`）视为可着色，普通 group 仍不可 | `frame_panel_figma.test.jsx`；面板截图见附件 |
| 2 | 工具面板 header 只显示家族名（Brush/Healing/Pen/Shape），子模式不明 | header 只按 tool 查表 | header 接收 `brushMode/healingMode`，并为 pen/shape 映射子模式名（Smudge、Clone、Curvature Pen、Star…） | `tool_panel_header_submode.test.jsx`；Smudge header 截图 |
| 3 | 图片工具的 3 个按钮没有无障碍名称（巡检命中） | 按钮只有可见文本，缺显式 `aria-label`，部分状态下 `innerText` 为空 | 补 `aria-label`（Crop / Replace / Frequency Separation） | `out.json` → `04-select-paint` 无名称按钮数归零（下一轮巡检） |
| 4 | 微标签与数值前缀对比度不足（4.43 / 3.19） | `text-neutral-500` 在 #0a0a0a / #262626 上 | 工具面板标签、ScrubField 前后缀、混合值字段提升到 `text-neutral-400`（≈6:1 / ≈4.9:1） | 复测：剩余低对比仅未选中/禁用态 |

## 4. 未修问题（按优先级，对标 Pen / Figma）

### P1 · 面板结构（对应 `RIGHT_PANEL_ALIGNMENT.md` Phase 1）

1. **Effects / Export / Constraints 仍藏在面板底部 “+ ADD”**。Pen（`WBn`）与 Figma 都是常驻 section + 段内 `+`。当前实现里 Effects 只有存在内容才渲染、Constraints 只有设置过才渲染、Export 只有 add 菜单项。
2. **没有独立的 Appearance 段**：opacity/blend 塞在 Transform 里；Pen 的 Appearance=opacity+圆角，Figma 也有 Appearance。
3. **文字层 Typography 位置**：当前排在 Auto layout 之后；Pen 的顺序是 Fill→Stroke→Typography，Figma 更靠前（尺寸后）。目标规范：文字层紧跟 Position&Size。
4. **没有图层 header meta**：Pen header 有类型徽标 + 名称 + 组件操作；VOO header 只有“属性”/工具胶囊。
5. **多选没有 Selection colors**（Figma 有；Pen 没有）。
6. **Fill/Stroke 行内没有样式/变量 chip**（Pen 行内绑定 color/变量；Figma 有 style/variable chip + detach）。
7. **Export 只有单 PNG（+ADD）**，没有预设行（Pen：scale/format/quality；Figma：多预设列表 + suffix）。
8. **工具态与节点态二选一**：VOO 与 Pen 一致（工具接管面板），Figma 是工具选项在顶部、面板保留选择属性——保持 VOO/Pen 行为，但需在文档中明确。

### P1 · 控件深度（引擎/接线工作）

9. **Fill / Gradient 的不透明度是死代码**：`gradient_properties.jsx` 支持 `onFillOpacity/onGradientOpacity`，但 `tool_properties_section` 从未传入，引擎也没有 fill/gradient opacity 状态；面板上完全看不到不透明度与混合模式。
10. **形状工具只有一个颜色**：没有独立 fill / stroke 颜色、没有 opacity；Pen 的 Fill/Stroke 是两组独立 paint。
11. **画笔子模式**：Dodge/Burn 缺 Flow、Sponge 缺 Opacity；Blur/Sharpen/Dodge/Burn/Sponge 没有预设；Healing 的 Spot 只有 width/hardness（缺 source / mode）。
12. **Puppet Warp 面板仍是提示语 + Reset**（无钉点列表/深度等）。
13. **Free Transform 没有工具入口**（T 打开文字；⌘T 是选区变换）。

### P2 · 交互与可访问性

14. **小点击目标**：取色器手柄 18–19px、`+ .ABR`、部分 `↺` reset（24px）、字号 chips；Pen 的对应控件均 ≥ 24px 且带 title。建议统一到 24px 命中区（视觉可保持原尺寸，用 padding 扩大热区）。
15. **图层操作区对 frame 显示 “Ungroup”**：画框不是普通组，Figam/Pen 不暴露“解散画框”概念，需要产品确认是否移除（或改为“转为组”）。
16. **效果/分隔线细节**：部分面板段间距依赖 `first:` 规则，空段（仅 header +）出现时下半段空白偏大（下一轮巡检复核）。

### P3 · 既有遗留（不在本轮范围）

17. 画布偏移（另案，需要复现步骤）。
18. `+ ADD` 渐进披露 vs Pen/Figma 常驻的结构取舍（本报告 §4.1 已给目标方案）。
19. 旧的“顶部工具栏”条目仍留在 `docs/panel-control-audit.md`（文档过期）。
20. 超大文件（`image_editor.jsx`、`editor_layers.jsx` 等）待拆。

## 5. 复现

```bash
npm run build
npx vite preview --port 4173 --strictPort &
node scripts/audit/design-experience-audit.mjs
# 输出 /tmp/voo-design-audit/out.json + 每个状态的整页/面板截图
```

## 6. 下一步

Phase 1（面板结构，无引擎改动）：把 §4.1–4.8 做成一个 PR——顺序注册表、Effects/Export/Constraints 常驻 + 段内 `+`、Appearance 段、Typography 前置、Header meta、Selection colors 骨架，并保留 VOO 现有视觉原语（288px / 玻璃黑 / 9px 微标题 / h-7 字段 / `#a7ffd4` 焦点环）。随后再做 §4.9–4.13 的控件深度。

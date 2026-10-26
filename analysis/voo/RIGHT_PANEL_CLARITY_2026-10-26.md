# 右侧属性面板清晰化 + 中键平移同步 · 2026-10-26

## 1. 中键平移时“外框与画布偏移”

### 现象
单页编辑器中，按住中键拖动时，页面外框（DOM 的页面 ring + 标题）与画布内容有一帧到数帧的错位；
松开后恢复。多页/自由画布模式也有同类风险。

### 根因
- 画布内容在 canvas 上绘制；页面外框和标题是 DOM，位置来自 React 渲染时读取的
  `engine.getViewport()`。
- 相机平移只触发 canvas 的 rAF 重绘；DOM 位置要等 React 重新渲染。于是拖动过程中 DOM
  外框落在画布内容后面（或反之），直到 settle 后的 notify 才对齐。
- 多页模式下，artboard layer 的 transform 与 workspace canvas 的相机订阅虽在同一 store
  事件里，但二者刷新时机仍可能差一帧。

### 修复
- `editor_page.jsx`：页面 ring / 页面标题 / streaming 占位层改为**相机同步**：在
  `engine.subscribeRender(...)` 回调里用同一份 live viewport 重设它们的 left/top/size，
  与画布绘制在同一帧，不再等 React commit。
- 多页模式的 artboard layer 已有 store 订阅；本次不改变其行为。

### 验证
- 新增的相机同步逻辑不改变布局/文档数据；全套测试通过。
- 中键拖动过程中 DOM 外框和画布坐标使用同一 viewport 读取点。

## 2. 右侧面板“空、碎、可合并”

### 改动
1. **空状态行**：Fill / Stroke / Effects / Auto layout / Layout grid 在没有内容时不再只剩标题和
   一个小 “+”，而是显示一行明确操作：
   - `Add fill`（带颜色色块）
   - `Add stroke`（带描边色块）
   - `Add effect`
   - `Add auto layout`
   - `Add layout grid`
2. **合并**：
   - 原独立的 “Frame（Clip content）” 与 “Layout grid” 合并成一个 **Frame & layout** 区：
     Clip content 开关 + 布局网格（没有网格时显示 Add layout grid）。
   - 帧根节点的 **Constraints** 不再显示（只有子节点才需要约束）；避免无意义区块。
   - Effects 内的 Blur & noise 仍归在 Effects 区，不新增独立 section。
3. **更清楚的层级**：空状态行使用和字段一致的 28px 行高和 12px 字体，和 Figma 的
   “Add fill / Add stroke” 行为一致；面板不再出现“只有标题、下面全空”的区块。

### 截图
`analysis/voo/assets/right-panel-clarity-2026-10-26.png`（本轮实际渲染的 Frame 选中面板）

### 验证
- `npx vitest run`：3338 passed / 12 skipped
- `npm run lint:design`：1095 files clean
- `npm run build`：通过
- 深色/浅色 44 状态巡检：0 error / 0 clipped / 0 unnamed / 0 missing keys

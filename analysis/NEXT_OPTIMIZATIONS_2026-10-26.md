# VOO Design — 优化执行报告（REA · Figma / Pen 对照）· 2026-10-26

前置：`FEATURE_MATRIX.md` / `GAP_REPORT.md` 是 10-22 快照，此后 comments、styles、variables v2、
codegen、ruler guides、`.pen` import、Find/⌘K、constraints 已落地。本清单只处理**当时仍缺**的项。

## 1. 本轮已实现（全部验证并提交）

| # | 能力 | 交付 | 提交 |
|---|---|---|---|
| 1 | **布局网格真渲染** | `layout_grid.js` + `chrome_layout_grid.js`：像素网格、列/行（count/gutter/margin），裁剪在画框内、永不导出；面板升级为类型/数量/间距/边距 | `c6e0625` |
| 2 | **Inspect（Dev Mode）** | header 代码按钮切换只读检查面板：几何、到父级间距、外观、字体、Token、CSS/Tailwind 复制 | `c6e0625` |
| 3 | **复制/粘贴属性 + Select same** | ⌥⌘C/⌥⌘V（一次 undo）、右键按 fill/stroke/字体/类型选择同款图层 | `c6e0625` |
| 4 | **Motion 死入口移除** | header 的 motion 按钮从未有宿主接线，按用户要求删除 | `c6e0625` |
| 5 | **原型交互 MVP** | `doc.prototype`（起始画框 + hotspot）持久化进 `.voo`；面板配置 trigger/action/target/transition；全屏 Runner 用现有导出管线栅格化画框并叠加热区；Esc/← 返回；实测 Red→Blue 跳转成功 | `aaf8bfd` |
| 6 | **变体属性编辑** | `extendVariantProperties`：新增属性（名 + 逗号值）时重命名现有变体、只创建缺失组合，实例 id 不变；面板属性编辑器 | `a4a50d5` |
| 7 | **实例覆盖扩展** | 覆盖字段从 `text/fill/visible` 扩到 stroke、描边宽/透明度、填充透明度、图层透明度、effects、圆角、字号/字重；校验 + 应用时克隆 effects | `a4a50d5` |
| 8 | **文本大小写** | Original/Upper/Lower/Title，参与绘制与排版测量，存储内容不变（面板新增 Text case） | `a4a50d5` |
| 9 | **矢量蒙版（等价能力）** | 剪贴蒙版（⌥⌘G / ⇧⌥⌘G）已存在但只能靠快捷键/⌘K：补到右键菜单 Create/Release clipping mask；路径基座即矢量蒙版 | 本次 |
| 10 | **便携快照 .zip** | `snapshot_io.js`：document.voo + manifest + preview 打包；标题栏快照按钮导出；Open 自动识别 `.zip` 并解包（含畸形 zip 防护）；`buildProjectVooFile` 从保存路径抽出共用 | `9a12ff7` |
| 11 | **轻色界面主题** | `voo.editor.theme` 启动前应用 `html[data-theme]`；设置 → 外观开关；`theme-light.css` 重映射中性色阶/描边/surface token/共享面板；开关、画布 ground、accent 文本单独处理；44 状态浅色巡检 0 error/裁剪/漏翻/无名称 | `977a5ae` |
| 12 | **评论通知（本地）** | `comment_notifications.js`：last-seen 时间戳、未读线程清理、@mention 收件箱；评论面板折叠按钮显示未读数，pin/列表显示 New 标记，打开面板即已读 | 本轮 |
| 13 | **自动保存草稿开关** | `voo.editor.autoSaveDrafts`（默认关，保持手动保存）；设置 → 外观开关；打开后 `useEditorAutosave` 后台写本地草稿（崩溃恢复），不改变显式保存语义 | 本轮 |
| 14 | **段落间距** | 文本排版增加段落索引与 `lineOffsets`，绘制/边界/测量一致；文本面板新增 Paragraph spacing | 本轮 |
| 15 | **原型 overlay + 过渡播放** | 新增 open/closeOverlay 动作；Runner 叠加浮层（可点击关闭/可含热区）；navigate 播放 dissolve/move-* 过渡 | 本轮 |
| 16 | **清理** | 引擎参数重复键去重；原型 runner 移出 presentation 懒加载 chunk（修复循环初始化崩溃） | `c6e0625` / `aaf8bfd` |

## 2. 验证

- `npx vitest run`：**3316 passed / 12 skipped / 0 failed**
- `npm run lint:design`：clean（1092 files）
- `npm run build`：通过（`dist` 已重建）
- 44 状态巡检（深色 + `VOO_AUDIT_THEME=light`）：均为 **0 error / 0 裁剪 / 0 漏翻 / 0 无名称**
- 协作冒烟：`tests/unit/collab_two_devices.test.js`（双端 session 同步）通过；真实后端 WebSocket 未在本环境启动
- 运行时验证：布局网格可见（网格/列）、Inspect 面板、原型 Red→Blue 跳转、Export 下载、header 重命名、canvas/stage 尺寸一致

## 3. 仍未做（明确遗留，非本轮缺陷）

| 项 | 原因 / 需要什么 |
|---|---|
| **段落间距 / 富文本 / RTL** | 文本排版是行数组模型（无段落索引），段落间距需要 layout API 改造；RTL/富文本更大 |
| **Healing Spot 的 Source/Sample all layers** | 引擎没有对应采样参数，面板不应提供无效控件 |
| **Free Transform 独立工具** | 与 Pen/Figma 一致：Select 手柄即变换；⌘T 是像素选区变换，不新增冗余入口 |

## 4. 建议下一批

1. 真实协作后端的两窗/分享链接联调（本环境无 WebSocket 服务）
2. Figma 右栏剩余缺口（见 `figma/RIGHT_PANEL_PARITY_2026-10-26.md`）：sizing combo、多 stroke、多 paint 高级项、Effects blur/noise、组件 properties/instance swap
3. 富文本 / RTL 排版
4. 快照/导出格式的更广互操作（Pen/Figma/PSD 已有导入）

## 5. 复现

```bash
npm test && npm run lint:design && npm run build
npx vite preview --port 4173 --strictPort &
node scripts/audit/design-experience-audit.mjs   # 44 states
```

# VOO Design — 下一轮优化清单（REA · Figma / Pen 对照）· 2026-10-26

前置：`FEATURE_MATRIX.md` / `GAP_REPORT.md` 是 10-22 的快照，此后 comments、styles、variables v2、
codegen、鲁班尺、`.pen` import、Find/⌘K、constraints 等已落地。本清单**逐条回查了当前源码**，
只列“现在仍然缺 / 可深化”的项；已完成项不再重复。

- REA 证据：`analysis/pen/`、`analysis/figma/`（bundle 偏移与 i18n 键），原始 dumps 在 `/tmp/rea_evidence`（临时）
- 矩阵：[`FEATURE_MATRIX.md`](FEATURE_MATRIX.md) · 旧 backlog：[`BACKLOG.md`](BACKLOG.md) · 面板规范：[`RIGHT_PANEL_ALIGNMENT.md`](RIGHT_PANEL_ALIGNMENT.md)

## 1. 结论

VOO 在绘图/矢量/图像/AI/性能/代码导出上已经**领先或持平**，真正值得继续抄 Figma/Pen 的是四个故事：

1. **原型交互与动效**（Figma 的分水岭，VOO 目前为零）
2. **设计系统工作流深度**（变体属性编辑、实例覆盖扩展、库发布）
3. **开发者交付**（Inspect/Measure/Token，而不是只导代码）
4. **协作与评审闭环**（评论通知/实时、版本快照）

外加一组**低成本日常手感**项（选择相同、复制属性、布局网格渲染、快照包、轻主题）。

## 2. 优先级表

现状列都带当前源码证据（grep/文件），可直接开工。

### P0 — 下一轮应该做的

| 能力 | Pen | Figma | VOO 现状 | 建议动作 | 量 |
|---|---|---|---|---|---|
| **原型交互 MVP** | – | **P0** | 无模型：`grep -ri prototype src/canvas` 仅命中 `Object.prototype` 类注释；presentation 只有线性翻页 | frame 上加 hotspot：click/while-press → Navigate/Back/Overlay + transition/easing；Present 模式运行；`doc.interactions` round-trip；先做 two-frame 冒烟 | L |
| **Dev Mode / Inspect** | P1（Export design to code） | **P0** | 只有右键 Copy CSS/HTML；codegen 已存在（`src/canvas/codegen/`） | 新增 Inspect 面板：选中节点 → x/y/w/h、padding/gap、fill/stroke、字体/行高、token/变量名、可复制 CSS/Tailwind/React；直接复用 codegen 序列化 | M |
| **变体属性编辑 + 实例覆盖扩展** | P2 | **P0** | `variants_section.jsx` 只能切换/新增变体；属性由变体名解析，无“定义属性/取值”UI。实例覆盖白名单写死 `text/fill/visible`（`instance-overrides.js` `OVERRIDE_FIELDS`） | 变体：属性定义（key + values + 组合校验）；实例：覆盖扩展到 size/stroke/effects/image，并在面板显示“已覆盖”标记 | M |
| **矢量蒙版** | Y | **P1** | 只有 `clipTo`/`maskBase`（raster mask + clipping），`vectorMask` 0 命中 | 选中路径 + 下方图层 → 建立矢量蒙版；蒙版层缩进显示、可释放；`.voo` round-trip | M |

### P1 — 快赢 / 每天都能感知

| 能力 | Pen | Figma | VOO 现状 | 建议动作 | 量 |
|---|---|---|---|---|---|
| 选择相同 + 复制/粘贴属性 | P | **P1/P2** | 0 命中（无 select-same，无 paste properties） | 右键/⌘K：Select same（fill / font / kind / opacity）；⌥⌘C/⌥⌘V 复制粘贴 fill·stroke·effects·text | S |
| **布局网格真渲染** | Y | Y | 面板能写 `layoutGrid`（`type_specific_sections.jsx`），但渲染器没有任何 `layoutGrid` 读取（全仓仅 panel/i18n/image_editor props）→ **勾选无效** | 优先补 renderer（列/行/尺寸/边距/颜色），否则先隐藏入口，避免“面板谎报” | S |
| 便携快照 `.zip` | **Y**（self-contained snapshot） | P | 只有单文件 `.voo` | Export/Import snapshot：文档 + 图片资源打包；命令行/菜单入口 | S/M |
| 轻色界面主题 | **Y** | Y | 0 命中（dark chrome only） | token 化 `index.css`/tailwind + 设置开关 + 双主题 design-lint 截图 | M |
| 文本深度 | P | P2 | 有段落/行高/字距/文字路径，缺段落间距、大小写、RTL/富文本 | 先做 Paragraph spacing + Text case + OpenType；RTL/富文本单列 | M/L |
| 评论通知 + 实时 | P1 | **P0** | 评论模型/UI 完整；无 mention/notification/realtime（grep 0） | 通知中心 + @mention + collab 广播；依赖 $4 的实时层 | M |

### P2 — 差异化与后续

| 能力 | 参考 | 建议 |
|---|---|---|
| 动效时间线 / Smart Animate | Figma | 在原型 MVP 之后做 keyframes + 起止帧插值，复用 presentation runtime |
| AI 设计 lint（对比度/间距/规范） | Figma/Pen 都有雏形 | 用现有 AI 栈扫描对比度、间距 token、命名规范，输出可点击问题列表 |
| Pen agent 设计技能包 + Prompt gallery | Pen P0（文档化 `execute` API + 15 篇 guides） | 已有 MCP/命令表，缺“内置技能包 + 提示画廊”；可复用 `src/shared/skills/` |
| Mesh gradient / 用户 shader fill | Pen 专属 | 视觉差异化项；VOO 内部已有 GLSL 管线，可先开放 `.glsl` fill 预设 |
| 图标/脚本/浏览器节点 | Pen schema | 先做 Icon 节点（矢量 + 记忆），脚本/浏览器节点放后 |
| 版本快照 | Figma | 不做分支/合并，只做“命名快照 + 恢复”（本地优先） |
| 插件运行时 / Code Connect / 分支评审 | Figma | **不建议抄**：与本地优先编辑器定位冲突，收益低 |

## 3. 本轮回查发现的“面板 / 引擎不一致”（可立即修）

1. **Layout grid 无渲染器**：见上，panel 写入但 canvas 不画 → 用户勾选无反应。
2. **Motion 按钮是死入口**：`properties_panel_header.jsx` 的 motion trigger 受 `EDITOR_BETA_ENABLED` 且需要 `onToggleMotion`，但没有任何宿主传入（`PropertiesPanelShell` 只是透传）→ 按钮永不显示/无效。补时间线或移除。
3. **桌面端 autosave 刻意关闭**：`use_editor_autosave.js` 默认 `disabled = true`，注释写明“Photoshop 式手动保存”。若要对标 Pen/Figma 的“永不丢稿”，加一个“自动保存草稿”开关即可复用现有 `useDraftAutosave`。
4. **协作只做到 cursor/original 请求**：`use_collab.js` 会建 session、`share_actions.js` 有房间，但本清单未做两窗端到端验证；建议先跑一次冒烟（两 tab 同步一笔 + 分享链接可进入）再决定投入。
5. **评论缺通知/实时**：模型与面板完整，缺 mention/notification/realtime。

## 4. 建议两周排期

- **Sprint A（快赢 + 交付）**：Inspect 面板 → select-same/复制属性 → 布局网格渲染 → 快照 zip → 变体属性编辑
- **Sprint B（原型 MVP）**：hotspot/trigger/navigate/overlay/transition + Present 运行 + `.voo` round-trip
- **之后**：轻主题 → 矢量蒙版 → 文本深度 → 评论实时（依赖 collab 冒烟结果）

## 5. 验收口径

- 原型：两帧点击 → Present 中按声明过渡跳转；退出/返回可用；`.voo` 存读一致；e2e 冒烟 + 单测。
- Inspect：选中任意节点显示几何/颜色/字体/token；复制 CSS/Tailwind 与 codegen 输出一致。
- 变体：能新建属性与取值；实例覆盖 size/stroke/effects 后不 detach；解除覆盖可回退。
- 布局网格：勾选后面板与画布同时可见，缩放/平移不漂移。
- 质量线：`npx vitest run` 全绿、`npm run lint:design` clean、`npm run build` 通过、44 状态巡检 0 error。

## 6. 证据索引

- 矩阵行：原型 `FEATURE_MATRIX.md` §Motion; Dev Mode §Export; 矢量蒙版 §Vector; 布局网格 §Vector; 轻主题 §Settings; Select-same §Tools; 实例覆盖 §Components; 快照 §File。
- Pen：`analysis/pen/RIGHT_PANEL.md`、`analysis/pen/FEATURES.md`（`.pen` schema、snapshot、agent execute、15 guides、shader presets）。
- Figma：`analysis/figma/RIGHT_PANEL.md`、`analysis/figma/FEATURES.md`（Design/Prototype tabs、Dev Mode MCP、variants、comments、branch）。
- 代码坐标：`instance-overrides.js:OVERRIDE_FIELDS`、`variants_section.jsx`、`type_specific_sections.jsx`（layoutGrid）、`properties_panel_header.jsx`（motion trigger）、`use_editor_autosave.js`、`use_collab.js`、`src/canvas/codegen/`。

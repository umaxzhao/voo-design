# Figma 126.9.16 ↔ VOO 右侧面板功能差距（REA 复核）· 2026-10-26

## 1. 方法与证据（先说限制）

- **REA MCP 当前不可用**：`list_mcp_resources(server="rea")` 返回
  `MCP resource server "rea" is unavailable in this agent's scope`，所以本轮使用
  **REA CLI 6.5.0** 能用的静态面，并在报告中保留可复现命令与 evidence id。
- **REA 能拿到的**
  - `rea inspect-electron-fuses /Applications/Figma.app`：
    evidence_id `ev_ccbc6d57154c5b32f4bfd953a9c1d23f8208781f21f1bc446b68c6e4e86b8fac`
    （Figma Desktop 是 Electron；asar 内的 shell 已确认）。
  - Figma 版本：`CFBundleShortVersionString = 126.9.16`（`/Applications/Figma.app/Contents/Info.plist`）。
  - Figma 实际窗口：CGWindow `3023`，标题 `Untitled`，1920×978；
    `screencapture -x -l 3023` 得到渲染证据：
    `analysis/figma/assets/figma-126.9.16-right-panel-2026-10-26.png`
    （sha256 `a9faebc1…`）。
- **REA 没拿到的（如实记录）**
  - `rea analyze-javascript-application /Applications/Figma.app` 和直接对
    `Contents/Resources/app.asar` 分析均返回
    `Malformed ASAR during inventory`；Figma 的 asar 不能用 REA 的标准 asar
    inventory 解析（9.3MB，头部为 asar，但载荷/完整性结构非 REA 当前支持）。
  - `rea observe-native-ui` / `rea capture-native-ui-scenario` 读取 Figma 窗口
    AX 树被 macOS 拒绝：`accessibility-denied: Grant Accessibility to the REA host`。
    因此 Figma 面板**结构证据来自窗口截图 + 既有 `analysis/figma/RIGHT_PANEL.md`**
    （该文档基于 Figma 126.9.13 的 `figma_app.js` / 33,116 个 i18n key 与
    REA evidence id `ev_52416c8b87f09f73abae5e8ee7b30dba1af07276064756392e8778f584a6a561`），
    不是本轮伪造的 AX。
- **VOO 当前面板证据**：
  `analysis/figma/assets/voo-right-panel-2026-10-26.png`
  （当前 build，选中 Frame；sha256 `bf4ad628…`）。

## 2. Figma 126.9.16 面板实际结构（截图事实）

Figma Desktop 选中一个 Frame 时，右侧 rail 从上到下：

1. **Design / Prototype** 两个 tab；右上角 Share/Zoom 等。
2. **Frame** 标题行：类型图标、名称、更多操作。
3. **Position**：
   - 6 个对齐按钮 + 分布/整理（截图可见一行 align 图标）；
   - X / Y；
   - **W / H 带 sizing 下拉**（Fixed/Hug/Fill，宽度/高度在 Layout 里）；
   - Rotation、Flip H、Flip V；
   - 圆角（含独立圆角入口）。
4. **Layout**：
   - 4 个布局模式图标（none / vertical / horizontal / grid）；
   - W / H（带 sizing 下拉与约束入口）；
   - **Clip content** 复选框。
5. **Appearance**：opacity、blend mode、show content。
6. **Fill**：paint 列表（颜色/图片/渐变），行内 opacity、可见性、删除、style/variable。
7. **Stroke**：stroke 列表（weight/position/join/cap/dash 等），行内 +。
8. **Effects**：drop/inner shadow、layer/background blur、glass、noise、texture、shader；行内参数。
9. **Selection colors** / **Layout guide** / **Export**。
10. 未使用的 Fill/Stroke/Effects 只有标题 + 右侧 `+`；点击 `+` 直接新增。

## 3. VOO 当前面板实际结构（截图事实）

当前 VOO（Frame 选中）为：

1. 面板 header：类型/名称、Inspect、左右换边。
2. **TRANSFORM**：锚点 3×3、X/Y、W/H、R/S、翻转、圆角（独立圆角）、sizing 下拉（仅 auto-layout 场景）。
3. **LAYOUT**：None / Vertical / Horizontal / Grid 四模式；Clip content；模式启用后显示 auto layout 字段或 layout grid 字段。
4. **APPEARANCE**：opacity / blend。
5. **FILL**：当前 paint 行（如 `#171717` + opacity + eye + remove）；未使用只有标题 +。
6. **STROKE**：未使用只有标题 +。
7. **EFFECTS**：未使用只有标题 +；有内容时显示调整/滤镜/图层效果行 + layer/background blur + noise。
8. **EXPORT**：format/scale/suffix + Export。
9. **PROTOTYPE**：内联 section（非 tab），start frame / Run / Add interaction。
10. **ADD**：底部添加菜单。

## 4. 差距矩阵（按 Figma 面板解剖）

图例：✅ 已对齐 · 🟡 部分/位置不同 · ❌ 缺失 · ➕ VOO 额外

### 4.1 面板骨架

| Figma | VOO | 结论 |
|---|---|---|
| Design / Prototype tabs | ✅ 本轮新增顶部双 tab（Design/Prototype）；Prototype 视图保留 header 图标快捷入口 | 已对齐 |
| 未用 Fill/Stroke/Effects 仅标题 + `+` | ✅ 本轮已改为标题 +（空状态行已隐藏） | 已对齐 |
| 面板内 section 常开/折叠策略 | ✅ 核心 section 常开，无折叠箭头 | 已对齐 |
| 选中单个 Frame 显示 alignment 行 | ✅ 本轮修复；单对象对齐到父 Frame（无父级时到页面） | 已对齐 |

### 4.2 Position / Transform

| Figma | VOO | 结论 |
|---|---|---|
| 6 align + distribute/tidy | 🟡 有全套操作，但单 Frame 不显示；图标已按新 20px 套件 | 补单 Frame 可见性 |
| X/Y | ✅ | — |
| W/H + sizing 下拉（Fixed/Hug/Fill） | ✅ W/H 与 Fixed/Hug 下拉已在 Layout 紧邻显示；普通 Frame 无 auto layout 时不显示 sizing | 已对齐（普通 Frame 可后续补 Fixed 下拉） |
| Rotation / Flip | ✅ | — |
| Corner radius + independent corners | ✅ | — |
| Corner smoothing | ❌ | P2/长尾 |
| Arc / line endpoints / repeat spacing | 🟡 部分在 type-specific | P2 |
| 3D transform | ❌ | P2/长尾 |

### 4.3 Layout

| Figma | VOO | 结论 |
|---|---|---|
| 4 模式 strip（none/vertical/horizontal/grid） | ✅ 本轮已有 | 已对齐 |
| W/H 在 Layout | ✅ 本轮已迁移；Transform 不再重复 | 已对齐 |
| Clip content 复选框 | ✅ | 已对齐 |
| Auto layout direction/wrap/gap/padding/align | ✅ | — |
| Min/max 尺寸约束 | ✅ 面板有 Min W/Max W/Min H/Max H | 已对齐 |
| Canvas stacking / strokes take space / per-child exclude | ❌ | P2 |
| Grid auto-layout（track/flow，不是视觉参考线） | ❌ 只有 layout grid 视觉网格 | P2 |
| Layout guide section | ❌ 无独立 section | P2 |

### 4.4 Appearance / Fill / Stroke

| Figma | VOO | 结论 |
|---|---|---|
| Opacity / blend mode / show content | 🟡 opacity/blend ✅；show content ❌ | P2 |
| Fill：solid/linear/radial/angular/image | ✅ | — |
| 多 fill 列表 / 每行 opacity/可见性/删除 | ✅ `fills[]` | 已对齐 |
| Style / variable 行内 chip | ✅ 已有 | 已对齐 |
| Gradient 插值 color space / hue method | ❌ | P2 |
| Gradient diamond / pattern / noise / video / shader fill | ❌ | P3 |
| Image scale mode（crop/fit/fill）/ alt text | 🟡 alt text 本轮已加；scale mode 仍缺 | P2 |
| Selection colors / page colors / show in exports | 🟡 Selection colors 有；页面颜色清单/导出开关缺 | P2 |
| Stroke：weight/color/opacity/position | ✅ | — |
| 多 stroke 列表 / per-side borders | ✅ 多 stroke 列表 + rectangle/image per-side borders 已落地 | 已对齐（path 仍全边） |
| Join/cap/dash/miter/arrows | 🟡 仅 path 的高级 stroke 有；rect/ellipse/image 没有 | P1/P2 |
| Advanced stroke flyout / width profile / path trim | 🟡 path 有部分；trim 缺 | P2 |

### 4.5 Effects

| Figma | VOO | 结论 |
|---|---|---|
| Drop/Inner shadow、layer/background blur | ✅ 已有（blur/noise 在 Effects 内） | 已对齐 |
| Glass / Noise / Texture / Shader | 🟡 Glass/Noise/Texture 有近似实现；Shader 缺 | P2：Shader；Glass 参数深度不足 |
| 每行 inline 参数 vs popover | ✅ 本轮 layer effects 改为 inline 展开；adjustment/filter 仍用 popover | 已对齐（effects 范围） |
| 禁用原因 tooltip（如 glass 仅 frame） | ❌ | P2 |

### 4.6 Typography / Component / Instance

| Figma | VOO | 结论 |
|---|---|---|
| Family/style/size/line-height/letter-spacing | ✅ | — |
| Paragraph spacing / lists / variable font axes / RTL | 🟡 paragraph spacing 已有；lists/variable axes/RTL 缺 | P2 |
| Text style chip 行内 | 🟡 独立 Styles 段 | P3 |
| Component properties（boolean/text/instance swap） | ❌ 只有变体轴 | P1/P2 |
| Component description / publish changes | ❌ | P2 |
| Swap instance / go to main | ✅ swap instance 有；本轮新增 Go to main component | 已对齐（组件属性仍缺） |
| Override reset 矩阵（size/name/exports/interactions/other） | 🟡 当前按 Text/Fill/Stroke/Effects/Opacity/Visibility/All 分组 | P2 细化 |
| Missing component / variant states | ❌ | P2 |

### 4.7 Prototype / Export / Inspect / Page

| Figma | VOO | 结论 |
|---|---|---|
| Prototype：navigate/back | ✅ | — |
| overlay / close overlay | ✅ 上一轮已有 | 已对齐 |
| scroll / change-to / set variable / conditional / open link | 🟡 本轮已支持 open link；scroll/change-to/set-variable/conditional 仍缺 | P2：runtime 扩展 |
| Transition 播放（duration/easing/spring） | 🟡 模型/runner 有部分过渡；无 spring 参数 | P2 |
| Flow starting points / device presets | 🟡 单 start frame；无设备预设 | P2 |
| Export 格式/scale/suffix/remove | ✅ | — |
| Export 高级项（质量/色彩配置/sampling/PDF/SVG outline/动画） | 🟡 本轮补 JPEG/WebP Quality；色彩配置/sampling/动画仍缺 | P2 |
| Inspect（Dev Mode） | 🟡 VOO 有 inspect 面板；无 Figma 的测量/组件/导出全量 | P2 |
| Page background / On this page colors / presets | 🟡 Background 有；页面颜色/设备 presets 缺 | P2 |

## 5. 本轮已对齐（相对旧 parity 文档 / 新增修复）

- Layout：Figma 式 4 模式 strip、Clip content 复选框、auto layout/grid 字段内嵌；
- 面板骨架：未用 Fill/Stroke/Effects/Prototype 不再显示空状态行，只保留标题 +；
- Section 节奏：8px 统一上下间距、无折叠箭头；
- 对齐图标：换成新 20px 套件（bar + blocks / grid）；
- Effects：layer blur、background blur、noise 入口；Glass 近似效果；
- W/H 对部分场景加 sizing 下拉；独立圆角、anchor grid 放大；
- Background/Frame 默认 Fill、导出 icon、协作提示位置等已修；
- **本轮新增修复**：Design/Prototype 双 tab；W/H 从 Transform 迁到 Layout 且不再重复；
  单选 Frame 显示 ALIGN 并支持对齐到父 Frame/页面；Layout W/H 下直接显示
  Fixed/Hug 尺寸下拉；单图层也显示 Selection colors；页面 Background 面板新增
  “On this page” 颜色；Export 增加 JPEG/WebP 质量并默认显示一条 PNG 预设。

## 6. 优先级建议（给下一轮实现）

| 优先级 | 缺口 | 动作 | 量 |
|---|---|---|---|
| P1 | per-side borders | 多 stroke 列表已落地；每边独立 border 仍需渲染模型 | M |
| P2 | 普通 Frame 的 Fixed sizing 下拉 | 纯 Frame 无 auto layout 时补语义 | S |
| P1 | 多 stroke / per-side | stroke 数组 + 每边 border；面板多行列表 | M |
| P1 | Design/Prototype 双 tab | 顶部 tab 切换，Prototype 从底部 section 迁出 | M |
| P2 | Component properties + go-to-main + granular reset | 组件作者面 | M/L |
| P2 | Prototype scroll/change-to/set-variable/conditional/device presets | runtime + 面板 | L |
| P2 | Fill gradient interpolation / image scale / alt text | paint 模型 + 面板 | M |
| P2 | Effects texture/shader；glass 参数深度 | 渲染 + 面板 | M/L |
| P2 | Export 高级项（quality/color profile/sampling/PDF/SVG 选项） | 导出设置模型 | M |
| P3 | 3D transform / corner smoothing / grid auto-layout / page colors | 长尾 | L |

## 7. 复现

```bash
rea inspect-electron-fuses /Applications/Figma.app
plutil -p /Applications/Figma.app/Contents/Info.plist | grep -E 'CFBundleShortVersionString|CFBundleIdentifier'
swift /tmp/listfigma.swift                 # CGWindow id 3023
screencapture -x -l 3023 /tmp/figma-window.png
sha256sum /tmp/figma-window.png            # a9faebc1…
```

VOO 侧：当前 `npm run build` 后用 Playwright 选中 Frame，截取
`[data-testid="editor-properties-panel"]`。

## 8. 修复批次状态（2026-10-26 晚）

已提交：
- `d8b182f` Layout W/H 迁移 + 单选 ALIGN + 单对象对齐父 Frame/页面
- `7ef2b00` Design / Prototype 双 tab
- `9593cbe` Layout W/H 旁 Fixed/Hug sizing 下拉 + 单图层 Selection colors
- `d2d40f3` 页面 “On this page” 颜色 + Export 质量/默认 PNG 预设
- `30cff2d` 多 stroke 列表（renderer + panel）
- `b8dabb9` Instance 面板 Go to main component
- `a7c4cb2` Prototype Open link 动作
- `3c2e946` Image alt text（Fill + HTML 导出）
- `5711432` Rectangle/image per-side stroke borders（T/R/B/L）
- Texture 效果（tint/opacity/density/size/seed + 面板控件）
- `6646faa` 笔刷标签裁切修复

仍属引擎级、未在本批伪造的缺口：组件属性/publish、Prototype scroll/change-to/
set-variable/conditional、Fill image scale mode、Effects texture/shader、
3D transform/corner smoothing、Export 色彩配置/sampling、path 的 per-side。

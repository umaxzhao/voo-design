# Figma 右侧属性面板 ↔ VOO 对照（2026-10-26）

依据：[`figma/RIGHT_PANEL.md`](RIGHT_PANEL.md)（Figma 126.9.13，860 个 `fullscreen.properties_panel.*` key 的解剖）
与当前源码复核（本轮逐项 grep/读文件，不沿用 10-22 的旧矩阵结论）。

图例：✅ 已具备 · 🟡 部分/入口不同 · ❌ 缺失 · ➕ VOO 额外

## 1. 结论

**不是全部具备。** 高频属性已覆盖，缺口集中在四类：

1. **图层尺寸的 sizing 语义**（Hug/Fill/Fixed + min/max）只在 Auto layout 段里有，普通图层 W/H 仍是纯数字；
2. **多 paint / 多 stroke / 高级 paint**（Figma 的 Fill/Stroke 是列表，支持多 fill、多 stroke、per-side stroke、gradient 插值、image scale mode）；
3. **Effects 深度**（Figma：layer/background blur、glass、noise、texture、shader；VOO 的 Effects 是 shadow/glow/内阴影/填充/渐变/描边 + 21 种调整/滤镜）；
4. **组件/实例作者面**（Figma：component properties、description、publish、swap instance、override reset 矩阵；VOO 有变体轴、实例覆盖与 detach，但没有这些）。

Prototype、Inspect、轻主题、布局网格、Appearance、Constraints 等上一轮已补齐；不再是缺口。

## 2. 逐项对照

### 0. Layer header
| Figma | VOO | 说明 |
|---|---|---|
| 类型 glyph + 名称 + 重命名 | ✅ | `properties_panel_header.jsx`，双击重命名，多选 “N selected” |
| hoisted action/overflow（重置特定修改、视频静音、实例属性行） | 🟡 | 有 Group/Ungroup/Boolean 行；无 hoisted overflow / reset-modifications |

### 1. Alignment
| Figma | VOO | 说明 |
|---|---|---|
| 6 align + 6 distribute + tidy | ✅ | `align_section.jsx` 含 distribute spacing（tidy） |
| auto-layout 子项 object position / baseline | 🟡 | auto layout 段有 3×3 对齐；baseline 未单独暴露 |

### 2. Position / size / rotation
| Figma | VOO | 说明 |
|---|---|---|
| X / Y / W / H / rotation / radius | ✅ | `transform_section.jsx` |
| W/H sizing dropdown（Hug/Fill/Fixed）+ min/max badge | ✅/🟡 | 本轮在 Transform 增加 sizing 下拉：有 auto layout 的 frame（Fixed/Hug）、auto-layout 子项（Fixed/Hug/Fill）；min/max 仍在 Layout 段；纯形状为 Fixed 语义，不显示无意义选项 |
| Corner smoothing | ❌ | 无 `cornerSmoothing` |
| Independent corners（4 角分别） | ✅ | `TransformRadiusControls` |
| Arc（start/sweep/ratio）、line x2/y2、repeat/grid child spacing | 🟡 | arc 有；line 端点与 repeat 间距在 type-specific/collect 段，未在 transform 行内 |
| 3D transform（rotate_3d/perspective/preserve_3d） | ❌ | 无 |

### 3. Layout（auto layout）
| Figma | VOO | 说明 |
|---|---|---|
| direction / wrap | ✅ | `auto_layout_section.jsx` |
| W/H sizing（hug/fill/fixed） | ✅ | `widthMode/heightMode` |
| gap / padding / alignment / min-max | ✅ | 30+ 单测（`scene_auto_layout.js`） |
| canvas stacking / strokes-in-layout / per-child include-exclude | 🟡 | clip content 有；stacking/排除子项未暴露 |
| Grid layout（Figma frame 的 grid 模式） | ❌ | 只有 layout grid（视觉参考线），没有 grid auto-layout |

### 4. Grid（layout grid）
| Figma | VOO | 说明 |
|---|---|---|
| 列/行网格 + 设置 | ✅ | 上一轮 `layout_grid.js` + 面板（grid/columns/rows、count/gutter/margin） |
| track sizing / flow | ❌ | 仅基础网格 |

### 5. Constraints
| Figma | VOO | 说明 |
|---|---|---|
| horizontal/vertical 约束 | ✅ | `scene_constraints.js` + `constraints_section.jsx` |
| resizing fill/fixed/hug 组合 | 🟡 | 约束模型有；面板只展示约束，不展示 resizing 组合 |

### 6. Fill
| Figma | VOO | 说明 |
|---|---|---|
| Solid / Linear / Radial / Angular / Image | ✅ | FillSection + gradient picker + 图片填充 |
| 多 fill 列表（`fills[]` + 每行 opacity/blend/remove） | ✅ | FillSection `fills` 数组（渲染器读取 `fills`） |
| Style / variable chip（行内绑定/解绑） | ✅ | 上一轮绑定 chip；样式/变量段仍保留 |
| Gradient diamond / pattern / noise / video / shader fill | ❌ | 无 |
| Gradient 插值 color space / hue method | ❌ | 只有 type/angle/stops |
| Image scale mode（crop/fit/fill）/ alt text | ❌ | 只能 crop（图片工具） |
| Selection colors / On this page colors / show-in-exports | 🟡 | 多选 Selection colors ✅；页面级颜色清单 ❌ |
| >5 paints 折叠 “See all” | ❌ | 列表全量显示 |

### 7. Stroke
| Figma | VOO | 说明 |
|---|---|---|
| Weight / position / color / opacity | ✅ | `colour_stroke_section.jsx` |
| Position（inside/center/outside） | ✅ | strokeAlign |
| Join / cap / dash-gap / miter / arrows | 🟡 | 矢量路径有完整 `stroke_style_section.jsx`；rect/ellipse/image 没有这些行 |
| 多 stroke 列表 + per-side borders | ❌ | 单一 `stroke` 字段 |
| Advanced stroke flyout（style solid/dashed、width profile、path trim） | 🟡 | 路径有 dash/profile；无 path trim |

### 8. Effects
| Figma | VOO | 说明 |
|---|---|---|
| Drop/Inner shadow、layer/background blur | ✅ | 本轮 Effects 段新增 Layer blur / Background blur 数值行（引擎已有渲染），并新增 Noise（opacity/density/size，引擎已有 grain 渲染） |
| Glass / Texture / Shader / 3D effects | ❌ | 无（Noise 已有） |
| 每行 inline X/Y/Blur/Spread/Color | 🟡 | 行打开 popover 编辑（不是 Figma 的行内展开） |
| 禁用原因 tooltip（glass only frames 等） | ❌ | 没有对应控件，自然也没有原因 |

### 9. Typography
| Figma | VOO | 说明 |
|---|---|---|
| family / style-weight / size / line-height / letter-spacing | ✅ | `text_section.jsx` |
| paragraph spacing | ❌ | 文本排版模型无段落索引（下一批计划） |
| horizontal/vertical align、auto width/height/fixed | ✅ | 有 align + auto width/fixed width |
| Text case | ✅ | 上一轮新增 original/upper/lower/title |
| Variable font axes | ❌ | 无 |
| Lists（bulleted/numbered）、text direction / RTL | ❌ | 无 |
| Text style chip（行内） | 🟡 | 独立 Styles 段（+ADD），无行内 chip |
| text-on-path align/flip | 🟡 | 有 text on path，面板无 above/on/below 对齐行 |

### 10. Component / Instance
| Figma | VOO | 说明 |
|---|---|---|
| 主组件 / 实例 / detach | ✅ | component extract/instance |
| Variants + 属性轴 | 🟡 | 上一轮有变体轴编辑（新增属性/组合），无 component properties（布尔/文本/实例交换属性） |
| Component description / publish changes | ❌ | 无 |
| Swap instance | ✅ | 本轮 Instance 段：源组件下拉切换（清空旧覆盖） |
| go to main component | ❌ | 无 |
| Override 字段 | ✅ | 上一轮扩到 text/fill/visible/stroke/描边宽/透明度/effects/圆角/字号字重 |
| Override reset 矩阵（reset fill/stroke/.../other） | 🟡 | 本轮 Instance 段提供按组重置（Text/Fill/Stroke/Effects/Opacity/Visibility/All）；Figma 更细（size/name/exports/interactions） |

### 11. Export
| Figma | VOO | 说明 |
|---|---|---|
| 预设行 format/scale/suffix/remove + Export | ✅ | 上一轮 `export_section.jsx`（PNG/JPEG/WebP） |
| 高级项：quality / color profile / sampling / DPI / PDF print / fps / loop / outline text / id attribute | ❌ | 面板无；导出对话框有部分格式选项 |
| Mixed + / 批量导出 N 层 | 🟡 | 多选导出用当前选择；无 mixed 提示 |

### 12. Appearance
| Figma | VOO | 说明 |
|---|---|---|
| opacity / blend / show content | ✅ | `appearance_section.jsx`（show content 未单列） |

### 13. Page（无选择）
| Figma | VOO | 说明 |
|---|---|---|
| Page background / on-this-page colors / presets | 🟡 | BackgroundSection 有背景；页面颜色清单与设备 presets 无 |

### 14. Prototype（Figma 有独立 tab）
| Figma | VOO | 说明 |
|---|---|---|
| 交互：navigate/back | ✅ | 上一轮 MVP + Runner（Red→Blue 已验证） |
| overlay / scroll / change-to / set-variable / conditional / open link | ❌ | 缺 |
| transition 动画（duration/easing/spring）+ overlay 设置 | 🟡 | 模型有 transition/easing，Runner 目前直接换帧（未播放过渡） |
| Flow starting points / device presets | ❌ | 有 start frame 单一起点；无设备预设 |

### 15. Inspect（Dev Mode）
| Figma | VOO | 说明 |
|---|---|---|
| Code / colors / typography / measurements | ✅ | 上一轮 `inspect_panel.jsx`（CSS/Tailwind 复制） |
| Images/alt、component info、export | 🟡 | 无图片/组件信息，Export 用普通面板 |

## 3. 优先级建议（右栏角度）

| 优先级 | 缺口 | 理由 | 量 |
|---|---|---|---|
| P1 | W/H sizing dropdown + min/max（普通图层） | 没有它，Figma 用户第一眼就觉得“少了一块” | S/M |
| P1 | 多 stroke 列表 + per-side borders | Figma 高频；VOO 只有单 stroke | M |
| P1 | typography paragraph spacing | 文本排版最后一块常用缺口 | M |
| P1 | Effects 的 layer/background blur、noise | 引擎已有部分能力，缺面板入口 | S/M |
| P2 | gradient 插值 / image scale mode / paint 列表折叠 | 精细但非阻断 | M |
| P2 | component properties + instance swap + override reset 矩阵 | 设计系统作者面 | M/L |
| P2 | Prototype overlay/scroll/change-to + 过渡动画 | 需要 runtime 扩展 | L |
| P3 | 3D transform / corner smoothing / grid layout / plugin | 长尾 | L |

## 4. VOO 已领先/额外的右栏能力

- Effects 之外还有 21 种调整层 + 滤镜（Figma 只有 limited adjustments）
- 画笔/修复/变形（perspective/distort/puppet）工具面板（Figma/Pen 无）
- 本地 AI（去背/放大/修补/扩图）、AI Agent 面板
- Export 之外的 PPTX/PDF/Presentation、codegen（HTML/Tailwind/React/CSS）
- Pen/Figma/PSD/SVG 导入
- 布局网格已真正渲染（Figma 有；Pen 无）、原型 MVP 比 Pen 更进一步

## 4.1 本轮已完成（2026-10-26）

| 项 | 交付 | 验证 |
|---|---|---|
| Effects blur/noise | `layer_effects_section.jsx` 增加 Layer blur、Background blur、Noise(opacity/density/size) 行，均为引擎已支持的 `layerBlur/backgroundBlur/noise` 字段 | `effects_blur_noise.test.jsx`；运行时面板显示三行 |
| Transform sizing | 有 auto layout 的 frame：Fixed/Hug；auto-layout 子项：Fixed/Hug/Fill（写 `widthMode/heightMode` 或 `layoutWidth/layoutHeight`） | `sizing_modes.test.jsx` |
| Instance 面板 | 源组件 swap（清空旧覆盖）+ override reset 分组（Text/Fill/Stroke/Effects/Opacity/Visibility/All） | `instance_section.test.jsx`；helper 测试 |

## 4.2 仍未做（原因）

| 缺口 | 阻碍 |
|---|---|
| 多 stroke / per-side | 引擎与 CanvasKit 场景都按单 `stroke` 渲染；需要 renderer/core 级改动 |
| Gradient 插值 color space / hue method | Canvas2D 渐变只按 sRGB 插值；需自绘 stop 采样或 core shader |
| Image scale mode / alt text | 图片填充走拉伸绘制，没有 crop/fit/fill 元数据与绘制分支 |
| 组件 properties / description / publish | 需要 component property → 节点绑定的数据模型，不只是面板 |
| Prototype scroll / change-to / set-variable / 条件 | 需要运行时的滚动容器与实例变体切换支持；当前 Runner 基于整帧栅格 |
| 3D transform / corner smoothing / grid layout | 渲染与布局核心能力，评估为 P3 |

## 5. 复核方式

**本轮验证**：`npx vitest run` 3326 passed / 12 skipped / 0 failed；`lint:design` clean（1093 files）；`build` 通过；44 状态巡检此前仍为 0 error/裁剪/漏翻/无名称。

```bash
# 本表逐项源码复核（示例）
grep -rn "widthMode\|minWidth" src/canvas/components/editor_properties/auto_layout_section.jsx
grep -rn "dash\|miter\|strokeJoin" src/canvas/components/editor_properties/stroke_style_section.jsx
grep -rn "cornerSmoothing\|rotate3d\|gridLayout" src/canvas
grep -rn "OVERRIDE_FIELDS\|reset_fill\|swap_instance" src/canvas
```

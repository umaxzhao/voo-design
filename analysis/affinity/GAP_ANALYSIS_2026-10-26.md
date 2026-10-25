# Affinity（Photo）↔ VOO 图片编辑差距分析 · 2026-10-26

## 1. 方法与证据（REA）

- 工具：REA v6.5.0（`rea --version`）。
- **REA 原生反编译不可用**：`rea analyze /Applications/Affinity.app` 返回
  `provider_unavailable`（Hopper / Ghidra / IDA 均未配置，`rea doctor` 可证）。因此没有
  伪称做过机器码级分析。
- 用 REA 能用的静态面：
  1. `rea decode-interface-builder` 解码 Affinity 的菜单 nib（`MainMenu*.nib`，抽取到
     `/tmp/AffinityMenu.app` 后解码）：得到 **798 个 action selector**，其中图片编辑相关
     的 `add*FilterRasterLayer:` / `add*AdjustmentRasterLayer:` / persona / selection
     action 是本清单的过滤器、调整、persona 证据。
  2. Attached resources：`en-GB.lproj/MainMenu*.strings`、`adjustments.strings`、
     `tool_settings.strings`（plutil 转 JSON），用于确认 UI 名称。
- 证据落点：`/tmp/affinity-menus.json`（REA evidence id
  `ev_e63f1f2f150e8f7ea2709afb4c4c7ffb94237dc5b89eeb5e5e997dc0e1fecc3a`）、
  `/tmp/affinity-nibs.json`、`/tmp/affinity-adjustments.json`。
- 局限：Affinity 是原生 C++（3.6 GB），没有执行、没有运行时 DOM；清单以**静态 UI/action
  证据**为准，参数范围未逐一取证。

## 2. 本轮已实现（VOO 右栏）

| 能力 | 实现 | 位置 |
|---|---|---|
| **Glass 效果**（Figma 有、VOO 之前没有） | 新增 `glass` effect：背景模糊 + 染色 + 斜向高光 + 轮廓亮边；Effects `+` 里有 Glass，参数在行内 popover（Blur / Tint / Opacity / Highlight / Angle） | `effect_glass_controls.jsx`、`render_figma_effects.js`、`scene_model_text_effects.js` |
| **Bevel / Emboss**（用户问的“斜面浮雕”） | 确认已存在：Effects `+` → “Bevel / emboss”（`editor.props.effectBevel`，中文“斜面浮雕”），带 Depth/Size/Angle/Softness | `adjustment_kinds.js`、`effect_bevel_satin_controls.jsx` |
| **Noise 效果** | 上一轮已在 Effects 的 Blur & noise 区加入（opacity / density / size），本轮复核可用 | `layer_effects_section.jsx` |
| **Affinity：Median** | 新增 `median` 滤镜（中值/去噪近似），CPU kernel，Effects 滤镜组可选 | `affinity_filters.js`、`adjustment_kinds.js` |
| **Affinity：Bloom** | 新增 `bloom`（亮部阈值 + 两级 box blur + screen 合成） | 同上 |
| **Affinity：Zoom Blur** | 新增 `zoomBlur`（向中心径向采样） | 同上 |
| **Affinity：Twirl** | 新增 `twirl`（按半径衰减旋转，负值反向） | 同上 |
| **Affinity：Denoise** | 新增 `denoise`（空域+颜色双边近似，边缘保留平滑） | `affinity_filters.js` |
| **Affinity：Defringe** | 新增 `defringe`（高对比边缘上的紫/绿色晕拉回中性） | 同上 |
| **Affinity：Haze Removal** | 新增 `hazeRemoval`（暗通道 + 大气光估计的简化去雾） | 同上 |
| **Affinity：Diffuse Glow** | 新增 `diffuseGlow`（模糊复制 + screen + 亮度提升） | 同上 |
| **Affinity：Unsharp Mask** | 新增 `unsharpMask`（原图 + amount×(原图−模糊)） | 同上 |

以上新滤镜都走现有“Effects 栈 / 通用标量滤镜面板”路径，自动出现在右侧面板的滤镜分组，
无需新面板。

验证：`npx vitest run` **3338 passed / 12 skipped / 0 failed**；`lint:design` clean（1095 files）；
`build` 通过；44 状态巡检（深色/浅色）0 error / 裁剪 / 漏翻 / 无名称。

## 3. Affinity 过滤器对照（来自 REA action selector）

图例：✅ 已有 · 🟡 近似/部分 · ❌ 无

| Affinity 过滤器 | VOO |
|---|---|
| Gaussian / Box Blur | ✅ blur |
| Motion Blur | ✅ motionBlur |
| Radial Blur | ❌ |
| Zoom Blur | ✅ 本轮 |
| Median Blur | ✅ 本轮 |
| Maximum / Minimum Blur | ❌ |
| Bilateral Blur | ❌（有 denoise 近似） |
| **Denoise** | ✅ 本轮 |
| Wavelet / FFT / ML Denoise | ❌ |
| Bloom | ✅ 本轮 |
| Diffuse | ❌ |
| **Diffuse Glow** | ✅ 本轮 |
| Depth of Field / Field Blur / Lens Blur | ❌ |
| **Defringe** | ✅ 本轮 |
| Denoise（显式） | ✅ 本轮（bilateral 近似） |
| Dust & Scratches | 🟡 median 近似 |
| **Haze Removal** | ✅ 本轮 |
| Clarity | ✅ |
| High Pass | ✅ |
| **Unsharp Mask** | ✅ 本轮 |
| Multi-band Sharpen | ❌ |
| Twirl | ✅ 本轮 |
| Ripple | ❌ |
| Spherical / Pinch-Punch | ❌ |
| Perspective / Mesh Warp / Liquify | 🟡 有 perspective/distort/puppet warp；无 mesh warp/liquify |
| Lens Distortion | ❌ |
| Displacement Map | ❌ |
| Add Noise | ✅ noise filter |
| Noise | ✅ noise filter |
| Halftone | ✅ |
| Pixelate / Posterise / Threshold | ✅ |
| Vignette | ✅ |
| Emboss | ✅ |
| Glitch | ❌ |
| Lighting | 🟡 有 adjustment/effects 但无 Affinity 的 lighting filter |
| Procedural Texture / Texture / Voronoi / Perlin Noise | 🟡 clouds/Perlin 近似，无完整 procedural texture |
| Pattern layers | ❌ |
| Lens Filter | ❌ |

## 4. Affinity 调整 / persona / 工作流对照

### 调整（新增 Affinity 有而 VOO 缺的）
| Affinity | VOO |
|---|---|
| Brightness/Contrast、Exposure、Levels、Curves、HSL、Vibrance、Colour Balance、Black & White、Selective Colour、Channel Mixer、Gradient Map、Photo Filter、Threshold、Invert、Vignette、White Balance | ✅（部分拆成 hue/saturation/lightness/temperature/tint） |
| **LUT3D** | ❌（无 LUT 文件导入/应用） |
| **Soft Proof / OCIO** | ❌（无软打样/色彩管理） |
| **Tone Compression / Tone Stretch / Tone Mapping persona** | ❌ |
| **Colourise / Recolour** | 🟡 可用 fill/color overlay 近似；无专用调整 |
| **Normals** | ❌ |
| **Saturation / Hue Curves** | ❌ |
| **HSL Shift** | 🟡 hue/saturation 分开，无 HSL 合并面板 |

### Persona / 大流程
| Affinity | VOO |
|---|---|
| **Develop Persona（RAW 冲洗）** | ❌ |
| **Liquify Persona** | ❌（有 puppet warp，无 forward/twirl/pinch 液化笔刷） |
| **Tone Mapping Persona** | ❌ |
| **Frequency Separation** | ✅ 图片动作已有 |
| **Focus Merge / HDR Merge / Panorama / Astro Stack / New Stack** | ❌ |
| **Super Resolve / Generative Upscale** | 🟡 本地 AI 放大已有 |
| **Inpaint / Remove Background / Refine Mask / Refine Selection** | ✅/🟡 有 AI inpaint、matting、选择 refine；mask refine 面板较弱 |
| **Macros / Batch Job / Scripting** | ❌ |
| **Apply Image / Equations / Procedural Texture** | ❌ |

## 5. 建议下一批（按投入产出）

1. **Bilateral / Wavelet/FFT/ML Denoise**：denoise 已有近似，但 Affinity 的专用降噪仍更强（P2）；
2. **Depth of Field / Field Blur / Lens Blur**：风光/人像常用，需要距离场或焦点参数（P2）；
3. **Mesh Warp / Liquify 笔刷**：Affinity 的差异化，但需要新的 warp 运行时（P2/L）；
4. **LUT3D + Soft Proof/OCIO**：色彩管理链路，需文档/色彩空间模型（P2/L）；
5. **Develop Persona / Tone Mapping / HDR/Focus/Panorama stacks**：独立产品面（P3）；
6. **Macros/Batch/Scripting**：生产力工具，不是面板单点（P3）。

## 6. 复现

```bash
rea doctor                     # 记录 native provider 缺失
rea decode-interface-builder /tmp/AffinityMenu.app --format json > /tmp/affinity-menus.json
plutil -convert json -o /tmp/affinity-adjustments.json \
  /Applications/Affinity.app/Contents/Resources/en-GB.lproj/adjustments.strings
```

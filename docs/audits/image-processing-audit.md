# Image processing audit: adjustments, filters, masks, brush/eraser, repair/inpaint, background removal

Audit of the Affinity-style image processing features under `src/canvas/editor/`.

Legend for **Fixed?**: `yes` = patched; `partial` = API/CPU only; `no` = documented only.

## Fixes (this branch + prior audit)

| File | Problem | Fix | Fixed? |
| --- | --- | --- | --- |
| `scene_model_adjustments.js` | `preserveLuminosity: false` overwritten by `??` | Fall back only when `=== undefined` | yes |
| `pixel_filter.js` (`applyEmboss`) | Transparent pixels rewritten to mid-grey | Skip `a===0` like other filters | yes |
| `matte_defringe.js` + `cpu_adjustments_matte.js` | Cutout fringe on new backgrounds | Affinity-style colour defringe on cache miss | yes |
| `spatial_filter.js` + tone/CPU path | Missing Affinity high-pass / clarity / motion blur | `applyHighPass` / `applyClarity` / `applyMotionBlur` wired through `tone_lut_build` + `cpu_adjustments_kernels` | yes (CPU) |
| `live_filter_stack.js` | No non-destructive live filter stack | Ordered, toggleable, opacity-blendable stack API (`applyLiveFilterStack`) | partial (not in hot render / props UI) |
| `local_inpaint.js` / `repair_tools_healing.js` | Clone stamp missing flow; OOB wrap risk | `flow` param; skip OOB source samples (no wrap) | yes |
| `blend_math.js` | Custom modes untested | Unit coverage for linear-burn/dodge, pin-light, hard-mix, subtract, divide, dissolve | yes (tests) |

## What works

**Adjustment layers / tone pipeline**
- Full vocabulary through `buildToneLut` (CPU + GL colour path); `cpuOnly` for spatial/pixel/colour ops without GLSL.
- Curves, levels, HSL scalars, selective color, channel mixer, color balance, B&W, photo filter, vibrance, gradient map, invert, threshold.
- **New on this branch (CPU):** high pass, clarity (−100..100), motion blur (+ angle).

**Live filters**
- Pure stack: blur, sharpen, noise, highPass, clarity, motionBlur, sepia, pixelate — normalize / create / apply with per-entry opacity.
- Not yet persisted on nodes or drawn in the properties panel (intentionally avoided; PR #4 owns that UI).

**Masks / brush / repair / matting**
- Mask brush, feather, invert, refine, selection coverage; paint/eraser with pressure; spot heal, LaMa AI repair, patch blend, clone stamp (hardness/opacity/flow/coverage).
- BiRefNet/RMBG matting + refine/feather + **defringe** on composite.

## Affinity Photo essentials matrix

| Affinity feature | Status | Notes |
| --- | --- | --- |
| Curves | done | Monotone cubic LUT; CPU+GL |
| Levels | done | Black/white/gamma/output |
| HSL / HSL shift | done | Global + per-band |
| Selective color | done | CMYK ink zones; CPU |
| Channel mixer | done | CPU |
| Color balance | done | Shadows/midtones/highlights |
| Black & white | done | Band mix + tint |
| Photo filter | done | Density + preserve luminosity |
| Vibrance | done | CPU |
| Brightness/contrast/exposure | done | Tone LUT |
| Temperature / tint | done | Tone LUT |
| Highlights / shadows | done | Tone LUT |
| Invert / threshold | done | |
| Gradient map | done | CPU |
| Blur (live/gaussian-ish) | done | Box×3 ≈ gaussian; CPU+GL |
| Sharpen (unsharp) | done | CPU+GL |
| Noise / pixelate / posterize / sepia / emboss / clouds / solarize / halftone | done | CPU (`cpuOnly`) |
| High pass | done (CPU) | No GL shader yet |
| Clarity | done (CPU) | Midtone-weighted local contrast |
| Motion blur | done (CPU) | Angle param; no GL yet |
| Live filter stack (non-destructive) | partial | API + tests; not hot-rendered / no props UI |
| Layer blend modes (Affinity set) | mostly | Custom: linear-burn/dodge, vivid/linear/pin-light, hard-mix, subtract, divide, dissolve |
| Masks (paint / refine / feather) | done | |
| Mask refinement (decontaminate) | done | Defringe on matte composite |
| Brush / eraser | done | Softness, pressure, flow |
| Clone stamp | done | Hardness, opacity, flow, coverage; OOB skip |
| Healing / inpaint | done | Spot (Telea-like) + LaMa AI |
| Patch tool | done | Poisson-style blend |
| Background removal | done | ONNX BiRefNet/RMBG + refine/feather/defringe |
| Frequency separation | missing | |
| Liquify | missing | |
| Perspective / mesh warp | missing / partial | Outside this PR’s scope |
| RAW develop persona | missing | |
| GL parity for new spatial filters | missing | highPass/clarity/motionBlur CPU-only |

## Remaining gaps

| Area | Gap | Notes |
| --- | --- | --- |
| GL shaders | highPass / clarity / motionBlur have no GLSL twin | Falls back to CPU when those are active (`cpuOnly`-style via signature) |
| Live filters UI / persist | Stack not stored on nodes; properties panel untouched | Follow-up once PR #4 settles |
| Frequency separation / Liquify | Not implemented | High effort; Affinity Photo persona features |
| PSD adjustment import | Still “not rebuilt” in `psd_to_voo.js` | Out of scope |
| GL unit tests | Need WebGL2; not runnable under vitest node | Visual parity only |

## Tests (this branch)

- `tests/unit/image_filters.test.js` — +highPass / clarity / motionBlur
- `tests/unit/live_filter_stack.test.js` — create / normalize / apply / opacity / undersize guard
- `tests/unit/clone_stamp.test.js` — flow, OOB skip, pixel copy
- `tests/unit/blend_math.test.js` — custom blend modes
- `tests/unit/matte_defringe.test.js` — (prior commit on branch)

## Verification

- `npm test`: 145 files, 1813 passed | 5 skipped
- `npm run build`: green

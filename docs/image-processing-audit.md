# Image processing audit: adjustments, filters, masks, brush/eraser, repair/inpaint, background removal

Audit of the Affinity-style image processing features under `src/canvas/editor/`:

- Adjustment layers: `adjustment_catalog.js`, `adjustment_kinds.js`, `adjustment_queries.js`, `adjustment_starters.js`, `cpu_adjustments.js`, `cpu_adjustments_kernels.js`, `cpu_adjustments_matte.js`, `cpu_adjustments_runner.js`, `gl_adjustments.js`, `gl_adjustments_pipeline.js`, `gl_adjustments_shaders.js`, `skia_adjustment_support.js`, `tone_lut*`, `color_adjust*`, `scene_model_adjustments.js`, `filter_presets.js`
- Filters: `pixel_filter.js`, `spatial_filter.js`
- Masks: `editor_mask.js`, `editor_mask_brush.js`, `editor_mask_lifecycle.js`, `editor_mask_ops.js`, `matte_refine.js`, `mask_contour.js`
- Brush/eraser: `editor_paint.js`, `editor_paint_stroke.js`, `editor_paint_target.js`, `editor_paint_stamps.js`, `editor_paint_layer.js`, `editor_paint_persist.js`, `editor_paint_retouch.js`, `soft_brush.js`, `brush_properties.js`, `brush_pressure.js`, `editor_engine_brush.js`
- Repair/inpaint: `editor_repair_tools.js`, `local_inpaint.js`, `local_inpaint_patch.js`, `local_ai_repair.js`, `repair_tools_healing.js`
- Background removal: `local_matting.js`, `matting_transform.js`, `matte_refine.js`, `matting_models.js`

Legend for **Fixed?**: `yes` = patched in this change; `no` = documented only.

## Fixes

| File | Problem | Fix | Fixed? |
| --- | --- | --- | --- |
| `src/canvas/editor/scene_model_adjustments.js` (lines 204, 224) | `normalizeAdjustments` used `??` on `preserveLuminosity` for `colorBalance` and `photoFilter`. `false ?? default` yields `default`, so an explicit user choice of `preserveLuminosity: false` was silently overwritten with `true`. Downstream code (`color_adjust_balance.js`, `tone_lut_build.js`, `psd_export.js`) already reads `!== false`, so only normalization was wrong. | Fall back to the default only when the field is `=== undefined`; otherwise preserve the user's boolean. | yes |
| `src/canvas/editor/pixel_filter.js` (`applyEmboss`) | `applyEmboss` was the only pixel filter missing the `if (data[i + 3] === 0) continue;` guard. Fully transparent texels were processed and rewritten to 128 mid-grey instead of being left untouched. | Added the same transparent-pixel skip every other pixel filter (`applyNoise`, `applyPixelate`, `applyPosterize`, `applySepia`, `applyClouds`, `applySolarize`, `applyHalftone`) already has. | yes |

## What works

**Adjustment layers / tone pipeline**
- `buildToneLut` normalises the full adjustment vocabulary and produces a consistent `signature` used by both the CPU and GL render paths; CPU and GL agree on colour within float/integer rounding.
- Scalar adjustments (brightness, contrast, hue, saturation, lightness, exposure, temperature, tint, highlights, shadows, vignette, blur, sharpen) and the one-click pixel filters (noise, clouds, pixelate, posterize, solarize, halftone, sepia, emboss) all fold into the tone LUT or the per-pixel CPU pass correctly.
- Curve/levels/invert/threshold/vibrance/colorBalance/blackAndWhite/photoFilter/channelMixer/selectiveColor/gradientMap all normalise and render through `cpu_adjustments_kernels.js` (CPU) or `gl_adjustments_pipeline.js` (GL, with CPU fallback for `cpuOnly` categories).
- `cpuOnly` flag correctly forces the CPU path for noise/clouds/pixelate/posterize/solarize/halftone/sepia/emboss and for colorBalance/blackAndWhite/photoFilter/vibrance/channelMixer/selectiveColor/gradientMap, which have no GLSL kernel.
- Adjustment cache (`cpu_adjustments_runner.js`) keeps up to 4 resolutions per tone signature; cache is invalidated on signature change.
- `applyMatte` (`cpu_adjustments_matte.js`) composites bitmap + alpha matte with `destination-in` at natural resolution, cached per (bitmap, version).
- Filter presets (`filter_presets.js`) produce complete adjustment objects through the same commit path as sliders.

**Masks**
- Mask brush (`editor_mask_brush.js`) paints into per-node matte canvases with `destination-out` (erase) / `source-over` (restore), transforms doc points through the node's local frame, supports implicit eraser sessions, stroke replay for collaboration, and `[ ]` size shortcuts.
- Mask ops (`editor_mask_ops.js`): lasso apply (keepInside/eraseInside), feather, invert, refine (smooth/expand/contract), quick mask from selection — all persist through the same queue path as brush strokes (one history entry per edit).
- Mask lifecycle (`editor_mask_lifecycle.js`): per-node matte canvases keyed by `maskId`, serialised persist queue that survives undo/redo mid-await, `maskSourceOf` identity check prevents stale composites after undo/redo and background-removal matte swaps.

**Brush / eraser / retouch**
- `editor_paint.js` + `editor_paint_stroke.js`: continuous stroke with quadratic interpolation, stamp spacing, pressure size/opacity, paint-layer materialisation/growth, erase trims paint layers, draft mode at dpr 1 during drag.
- `soft_brush.js`: `softBrushAlpha(t, hardness)` and gradient stops are pure, testable math.
- Retouch dabs (`editor_paint_retouch.js`): blur/sharpen/smudge/dodge/burn/sponge; smudge captures a stroke snapshot so dragging doesn't collapse into blur.
- Brush controller (`editor_engine_brush.js`) exposes width/hardness/opacity/flow/strength/exposure/roundness/angle/blend-mode/pressure toggles.

**Repair / inpaint**
- `inpaintLocalStroke` (Spot Healing / Telea): rasterises a stroke mask, clips to the active pixel selection, runs `inpaintLocalImage` (boundary-weighted diffusion) and writes back via `replaceNodeBitmap`.
- `inpaintAiRepairStroke` (LaMa): bounded crop + mask, model download gating, separate run-failed vs download-failed recovery paths, does not silently fall back to Spot.
- Patch and clone stamp (`repair_tools_healing.js`, `local_inpaint.js`): Poisson-style patch blend and coverage-gated clone stamp.
- `cloneStampImage`/`patchBlendImage` are pure pixel-buffer functions.

**Background removal**
- `local_matting.js`: BiRefNet/RMBG via onnxruntime-web (WebGPU first, WASM fallback), one-time model download cached in Cache Storage, provider refusal tracking, letterbox + resample + refine + feather pipeline.
- `matting_transform.js`: `fitToModelInput`, `toNormalisedTensor`, `sigmoid`, `looksLikeProbabilities`, `normaliseMask`, `hardenMask`, `cropMask`, `resampleMask`, `padRegion`, `placeRegionMask`, `polygonBounds`, `pointInPolygon`, `clipMaskToPolygon`, `maskToRgba` — all pure, testable arithmetic.
- `matte_refine.js`: guided-filter edge refinement (`refineMatte`) and edge-only feathering (`featherMatte`), band-limited to the matte's transition to avoid halo; `MATTE_REFINE_MAX_PIXELS` cap skips refinement on 32MP+ images.
- Region matting (`runRegionMatting`): model runs on a padded crop; lasso clips the placed mask via even-odd point-in-polygon.

## Remaining gaps

| Area | Gap | Notes |
| --- | --- | --- |
| CPU/GL parity | No unit test exercises the GL shader path (`gl_adjustments_pipeline.js` / `gl_adjustments_shaders.js`) — it requires a WebGL2 context and cannot run under vitest's node environment. | Visual parity is documented in comments but not machine-verified. |
| Background removal on large images | Refinement is skipped above `MATTE_REFINE_MAX_PIXELS` (16 MP); the cutout keeps the model's raw edge. | Documented degradation, not a bug. |
| Defringe | Colour decontamination (unmixing old-background fringe from semi-transparent edge pixels) was deliberately removed (`matte_refine.js` notes it has no caller). Cutout edges can carry a fringe on new backgrounds. | Product decision; no stage in `src/` calls a defringe. |
| PSD import of adjustments | `psd_to_voo.js` notes adjustment layers, masks, and text editability are "Not rebuilt yet". | Out of scope for this audit. |
| `canvas_tools.js` | Excluded from this audit per task constraints. | Not reviewed. |

## Tests

New test files (6, 119 tests, all passing):

- `tests/unit/adjustment_normalization.test.js` — `normalizeAdjustments`: defaults, `preserveLuminosity=false` preservation (regression for the fix above), value clamping, mixer/ink/zone/bands/levels normalization.
- `tests/unit/color_adjustments.test.js` — `applyColorBalance`, `applyBlackAndWhite`, `applyPhotoFilter`, `applyVibrance`, `applyChannelMixer`, `applySelectiveColor`, `sampleGradient`, `applyGradientMap`.
- `tests/unit/image_filters.test.js` — `applyNoise`, `applyPixelate`, `applyPosterize`, `applySepia`, `applyEmboss`, `applyClouds`, `applySolarize`, `applyHalftone`, `applyBoxBlur`, `applySharpen`, `scaledRadius`, `cpuBlurRadius`.
- `tests/unit/matting_transforms.test.js` — `fitToModelInput`, `toNormalisedTensor`, `sigmoid`, `looksLikeProbabilities`, `normaliseMask`, `hardenMask`, `cropMask`, `resampleMask`, `padRegion`, `placeRegionMask`, `polygonBounds`, `pointInPolygon`, `clipMaskToPolygon`, `maskToRgba`, `softBrushAlpha`.
- `tests/unit/matte_refine.test.js` — `refineMatte`, `featherMatte`, `MATTE_REFINE_DEFAULTS`, `MATTE_FEATHER_DEFAULTS`.
- `tests/unit/tone_lut.test.js` — `evaluateMonotoneCubicSpline`, `buildCurveLUT`, `hasCustomCurve`, `buildToneLut` (active/cpuOnly flags), `hueBandIndex`.

## Verification

- `npx vitest run`: 127 files, 1699 tests pass (1580 pre-existing + 119 new).
- `npx vite build`: green.

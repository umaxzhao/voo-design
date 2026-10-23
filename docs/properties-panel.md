# Dynamic properties panels

Panels follow the selection or active tool. Selection wins: a selected rectangle always shows Figma-style 属性 / Properties, even while a shape drawing tool remains active. The 形状 inspector with its large color wheel and stroke presets appears only with an active shape tool and nothing selected. With no selection and the select tool, show the canvas background.

UI objects use Figma-style sections. Images and raster tools use an Affinity-style TOP context toolbar. Image side panels are restricted to transform, layer, effects and export. Raster tool settings appear in the top toolbar popover; image actions include crop, replace, brightness/contrast and Fit/Fill.

## Type matrix

| Type | Panel | Top bar | Sections |
| --- | --- | --- | --- |
| rectangle | Properties | Active raster tool, if any | alignment, transform, constraints, layoutChild, layer, radius, fill, stroke, effects, export |
| frame | Properties | Active raster tool, if any | alignment, transform, constraints, layoutChild, layer, radius, clip, autoLayout, layoutGrid, fill, stroke, effects, export |
| ellipse | Properties | Active raster tool, if any | alignment, transform, constraints, layoutChild, layer, arc, fill, stroke, effects, export |
| polygon | Properties | Active raster tool, if any | alignment, transform, constraints, layoutChild, layer, shape, fill, stroke, effects, export |
| star | Properties | Active raster tool, if any | alignment, transform, constraints, layoutChild, layer, shape, fill, stroke, effects, export |
| line | Properties | Active raster tool, if any | alignment, transform, constraints, layoutChild, layer, stroke, effects, export |
| vector | Properties | Active raster tool, if any | alignment, transform, constraints, layoutChild, layer, fill, stroke, effects, export |
| text | Properties | Active raster tool, if any | alignment, transform, constraints, layoutChild, layer, typography, fill, stroke, effects, export |
| group | Properties | Active raster tool, if any | alignment, transform, constraints, layoutChild, layer, autoLayout, effects, export |
| component | Properties | Active raster tool, if any | alignment, transform, constraints, layoutChild, layer, component, radius, autoLayout, fill, stroke, effects, export |
| instance | Properties | Active raster tool, if any | alignment, transform, constraints, layoutChild, layer, component, fill, stroke, effects, export |
| image | Properties | Affinity image | transform, layer, effects, export |
| adjustment | Properties | Active raster tool, if any | adjustments, layer, export |
| brush | Properties | Active raster tool, if any | transform, layer, effects, export |
| media | Properties | Active raster tool, if any | transform, layer, media, export |

## Conditional sections

Alignment requires layout actions. Constraints retain frame/parent applicability rules. Layout-child controls require an auto-layout parent. Mixed selections use the intersection of type capabilities. Transform includes X/Y, W/H with aspect lock, rotation, flips, opacity and blend. Rectangle/frame radius supports individual corners. Polygon/star parameters and line/arrow heads use scene path flags. Frame grid controls edit existing layoutGrid data.

Repeat/Array stays immediately below Transform with `// TODO(modifiers-pr): move Repeat/Array under Modifiers`. File management and the Open/Save/Settings title bar are outside this change. Mask, pen-anchor and warp editing retain focused contexts.

## Verification

Run `npx vitest run --maxWorkers=2 --minWorkers=1 tests/unit/resolve_panel_context.test.js`. Add `--cache=false` when dependencies are shared read-only. Coverage includes every type, real scene encodings, mixed selection and selection precedence across tools.

`scripts/props-panel-fixture.mjs` generates ten static HTML product-state mocks driven by the production resolver. Capture with Playwright under `flock /tmp/voo-e2e.lock`; set PLAYWRIGHT_MODULE to a shared installation if needed. These illustrate the matrix and do not verify full-app interactions. PNGs are saved in `/workspace/tmp/shots-props-by-type/` and `/workspace/shots-props-by-type/`.

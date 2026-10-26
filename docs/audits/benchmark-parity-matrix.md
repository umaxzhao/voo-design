# Benchmark Parity Matrix

Companion to `docs/benchmark-parity-audit.md`. 50 performance criteria were
benchmarked against Figma, Photoshop, Procreate, Affinity, Blender and Pencil.
This matrix records the gaps shipped for product-impact parity (A–C), and the
deferrals with their reasons.

## Gap → Work table

| # | Gap | Benchmark (ref) | Our anchor | Parity metrics | Value | Scope of change | Work summary | Commit |
|:-:|:----|:----------------|:-----------|:---------------|:------|:----------------|:-------------|:-------|
| A1 | Gradient tool has a stop list editor (n stops, drag/add/delete per-stop), angle support on non-radial types, type chips incl radial/angular, reverse, apply-to-layer; panel stops were display only (no engine state existed) | Figma gradient panel (stops, per-stop color, angle) | `gradient_properties.jsx` + `GradientStopsBar.jsx` already covered one bar visually | Non-destructive? Y (pure engine state before paint) Undo-able? Paint path = existing multi-step Why first? Highest daily-use surface; dead buttons made the tool feel broken | Medium — new state module + panel thread-through, no platform code | `gradient_tool_state.js` (new), `editor_engine_brush.js` (state + 8 api methods), `selection_paint` rewritten multi-stop; `GradientStopsBar`/`color_picker` state reuse; `tool_properties_section.jsx`/types, `image_editor.jsx` wiring: `GradientProperties.jsx` rewrite (stops bar, angle slider, type chips, reverse, apply), i18n fills | v0.9 |
| A2 | Brush Brush > Advanced (roundness / angle / blend) defaults collapsed; the knobs exist but are hidden behind a fold, so most users never find them | Procreate brush editor (primary sliders always visible) | `brush_advanced_controls.jsx` `useState(false)` | One-line UX flip, zero risk | Low — one file, one line + comment | Advanced section now default-open (`useState(true)`) | v0.85 |
| B1 | Live filter stack: Affinity-style ordered, toggleable, opacity-blendable non-destructive filters (blur/sharpen/roughness/high-pass clarity/motion-blur/pixelate per stack entry) — original stack was test-only, never persisted, never normalized and never applied (toneLut is built per-pixel identity LUT for cairo) | Affinity Photo Live Filters (stack order, enable toggle, opacity, bake) | `live_filter_stack.js` module was fully written but header said "Hot scene render does not call this yet" | Non-destructive? Y (stack lives in adjustments, no source pixels touched) Serialize? Y (roundtrip proven in tests) Why first? Whole module existed; wiring it let the op stand on pieces already tested | Medium — persisted under adjustments + tone gate/GL-side math + primitive list reuse | `scene_doc_factory.js` (`liveFilters: []` default), `scene_model_adjustments.js` (normalize on adj), `tone_lut_build.js` (tone.liveFilters, cpuOnly, signature as spatial cache key), `cpu_adjustments_kernels.js` (run enable stack dead last), `live_filter_section.jsx` (add/remove/reorder/enable/opacity/value/angle per stack entry), tests | v0.9 |
| C | Pencil agents: boolean_combine / set_constraints / export_layers existed on the engine but were not exposed as agent tools; combined with no prompt/docs/tests, the Affinity/Figma layer-manipulation workflows stayed closed to the agent | Pencil agent tool bootstrap in `canvas_tools.js` (23-line layout module as pattern) | `editor_engine_groups.js` `combineSelected`, `scene_constraints.js`, `editor_export_raster.js` were all reachable from `window.__vooEditor` but not from agent tools | Schema-validated? Y End-to-end tested? Y Why first? Closes the agent's ability to do elementary shape boolean, responsive-constraint and export jobs exactly as a human would | Medium — one module + registration + prompt/docs + test file | `canvas_tools_scene_ops.js` (schemas + 3 executors), `canvas_tools.js` (schema/executor merge), `canvas_agent.js` (SYSTEM_PROMPT step 5), `docs/agents.md`, `canvas_agent_scene_ops_tools.test.js`; `canvas_agent_designer_workflow.test.js` tool-list assertions updated | v0.8 |

## Deferrals (unfixed, on purpose)

| Item | Reason |
|:-----|:-------|
| GL shader twins for the live filter stack (`gl_spatial_shaders.js`) | CPU path covers same radius cap on GPU-only nodes via `cpuOnly` gate; GL twin is a perf optimization, not a feature gap |
| Live filter kind variants (extra blur sets beyond the two glow/other buttons) | Variant surface is per-benchmark; user filter stack already matches Affinity's *non-destructive* promise without it |
| Non-destructive masks / blend ranges / frequency separation / Liquify / Camera RAW | Benchmark categories too broad; each is a product-sized project of its own. Raw live filter UI is already the platform seam we chose; the stack model composes with any future kernel |
| Browser FPS averaging across per-1000-frame regions (benchmark perf figures) | Needs the render-region instrumentation; outside first-pass gap closure |
| Workspace Cursor line parity | Cursor is a diff/file schema; the gaps fixed here were product-impact, not network schema |
| Raw `.voo` agent session persistence of agent threads | Pairs with the JSONL-ish session persistence already shipped; quality follow-up |

## Test status

- `npm test`: **154 test files, 1905 passed, 5 skipped**
- `npm run build`: green (vite production)

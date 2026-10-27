# Agent mutation and documentation follow-up — 2026-10-27

> Historical evidence for the commits named below, not a certification of current `origin/main`. The 3674 figure came from the shared working tree and must not be used as a clean-release result. A later clean checkout at `497a125` reproduced eleven failures after the custom-menu/mobile changes; see the 2026-10-28 verification follow-up for the current gate.

## Changes and confirmed defects

The documentation reorganization was already committed in main before this follow-up. It was not recommitted wholesale. The remaining capability gaps were checked against the actual panel, model normalizers, renderer and MCP tool catalog.

- Paint tools now expose structured gradients with stops/geometry, layer/background blur, the supported layer-effect stack, blend mode, stroke opacity/alignment/cap/join/miter/dashes, and existing basic paints. Effect stack replacement and opacity units are documented in [agents.md](../agents.md#style-and-typography-patch-units).
- Typography tools now expose italic, underline, line-height multiplier, pixel letter spacing and text-box width. `textContent`, `textAlign` and `color` map to `text`, `align` and `fill`. A style-only text patch previously wrote `text: undefined`, which the node reducer could delete; it now preserves the text.
- Single mutations and atomic batches share validation. Unsupported fields, out-of-range/nonfinite values, malformed gradients, incomplete line endpoints, conflicting aliases and non-text targets are rejected before document writes.
- Skia text previously omitted underline and treated a line-height multiplier as pixels. The adapter now forwards underline and converts the multiplier to document pixels.
- Shadows, blur and dashed rectangle strokes were not represented in the GPU adapter. These scenes now route through the existing Canvas2D artwork compositor. Plain rectangle scenes retain the GPU path; disabled effects do not force a fallback.
- Synchronous color sampling flushes queued artwork before reading pixels, including a stage that was already enabled. A pending render must not return the previous document's colors.

## Evidence

Unit regression coverage includes schema/catalog agreement, style-only content preservation, alias normalization, atomic validation, effect/stroke/gradient fields, invalid nested values, renderer routing and typography units. The UI tests now assert current desktop/mobile labels and semantic dirty indicators rather than assuming button children are strings or counting translation-key occurrences. The compact brush inspector opens pressure controls in preset details; the resting inspector no longer displays them all.

`node tests/e2e/agent-paint-text.e2e.mjs` passes seven real-editor scenarios over an isolated MCP WebSocket relay:

1. Structured linear gradient changes sampled pixels at both ends.
2. Drop shadow paints outside the shape; one undo clears those pixels and redo restores them.
3. Layer blur changes pixels beyond the original geometry.
4. An update immediately followed by eyedropper readback returns the new fill.
5. Typography mutation preserves text and writes the renderer's actual fields.
6. A preset click opens brush details and the pressure toggle changes the engine setting.
7. At 390px with touch emulation, panels retain gutters and round corners and the title-bar More menu opens its file actions.

The ten existing scenarios in `editor-effects.e2e.mjs` also pass. Its actual CanvasKit test now verifies italic/underline pixel differences plus a 48px font's 1.5 line-height becoming 72px and 2px letter spacing reaching the paragraph painter. Viewport-size-only emulation is insufficient for current mobile rules; the reusable browser fixture accepts actual touch capability options.

Full shared-workspace test run: **3674 passed, 12 skipped**, zero failed (426 passing files, 3 skipped). Production build, design lint, new/modified helper formatting and diff checks passed. A rebuilt portable connector includes the new catalog and passed `claude plugin validate`. The connector runtime/configuration review found no credential bundling; the documented external Harness model-execution limitation remains in place.

## Clean committed release verification

A separate `git archive` snapshot of commit `b985ebe`, with no working-tree source files, also passed the production build, **3660 tests with 12 skips** (423 passing files, 3 skipped), and both browser suites (7 new scenarios plus 10 existing scenarios). The larger 3674 count above includes additional tests in concurrent uncommitted work; the clean release count is the relevant publication gate.

## Documentation decisions

[Architecture](../architecture.md) now documents all factory node kinds, nested frame representation, external stdio/loopback MCP, managed CLI-turn MCP and portable plugins. The `voo` vs `voo-design` client name is explicitly a registration alias, not a protocol mismatch. All 64 editor tools are covered in the agent tool table; MCP intentionally filters some in-app-only tools and adds `voo_status`.

[Performance evidence map](../performance/README.md) identifies CPU timings, historical Canvas2D/SwiftShader experiments, current hardware-GPU browser evidence and WASM architecture/benchmarks. Their measurements are not merged across incompatible environments. Generated benchmark paths remain unchanged. Release-template placeholder download links are plain pending text instead of broken local links.

## Explicit coverage boundary

This follow-up does not certify the entire editor. Linear gradient, drop shadow, layer blur, typography routing/readback, pressure control and the tested responsive/menu flows have the evidence listed above. Stroke dash and the rest of the effect schema have validation/routing tests, not exhaustive final-pixel certification. Full Auto Layout combinations, masks, Live Filters/adjustments, Boolean, alignment/distribution, Warp/Pin/Variants/arrays, every drawing/retouch tool, export settings and all history labels still require their own real-canvas scenarios. Neither a successful tool call nor a stored property is proof that all of those features render correctly.

## Publication

The clean verified release `b985ebe` was deployed directly through SSH alias `la2` to https://voo.run/editor/. The previous release is retained at `/srv/voo-run/editor-backups/b985ebe-20261026T183946Z`. Uncommitted source files from concurrent tasks were excluded from the release.

# Effect audit follow-up — 2026-10-27

## Confirmed defects repaired

1. Edge resizing now resolves explicit child constraints in the pure document operation. Incremental previews and the final commit contain page and child geometry together.
2. Exact sizes and canvas presets use the same operation. The right properties panel no longer performs an extra reflow; its preview/commit options remain intact. Explicit width/height content-scaling modes retain their proportional semantics. An unchanged size is a reference-preserving no-op.
3. The Skia adapter passes the text italic flag to the actual CanvasKit text painter. A real GPU render with the local Inter font verifies both paragraph input and different normal/italic pixels.

The resize resolver starts from pre-resize node boxes, avoiding a double shift after legacy centering. Document-absolute nested descendants follow a constrained container's movement/resizing. Auto-layout flow children remain owned by the engine's layout pass; absolute children use their constraints. Unconstrained ordinary documents retain their historical edge-resize/centering behavior.

## Repeatable evidence

Run `npx vitest run tests/unit/document-resize-constraints.test.js tests/unit/scene_constraints.test.js`:
39 passing tests, covering edge/exact/centered resizing, left/top, right/bottom, center, stretch, proportional constraints, nested pinned containers, legacy centering, explicit content scaling, no-op identity and italic adapter input. These are ordinary passing assertions, not expected-failure audit cases.

Run `node tests/e2e/editor-effects.e2e.mjs`:

| Real editor scenario | Result and assertion |
| --- | --- |
| Right / bottom / left / top grips | Real mouse down/move/up changes page geometry and preserves child right/bottom margins |
| Four grip undo/redo sequences | One undo restores page and child geometry; redo restores the result |
| Frame width field | Actual input changes page width, reflows once, and one undo restores the child |
| Canvas size preset | Actual preset click changes dimensions and child margins; one undo restores them |
| MCP constraints and exact resize | MCP writes constraints through a private WebSocket relay; the live engine resolves them |
| Object width field | Actual input changes the selected object's width |
| MCP style mutation | Opacity and corner radius persist in the live editor document |
| CanvasKit text | Real painter receives italic and produces different pixels with Inter |

The reusable `editor-browser-fixture.mjs` starts an isolated Vite server and an ephemeral private MCP bridge, opts its private browser profile into MCP, and creates a fresh document through the real `new_document` tool. It does not connect to or replace the user's existing canvas, token file or storage. It fails on page errors and cleans up the browser, relay and server.

Full workspace validation: 3532 tests passed, 12 skipped (413 passing files and 3 skipped files). Design lint passed; new files pass formatting/lint checks. The production build passed.

## Coverage boundary

The historical audit worktrees were inspected, without merging entire stale branches or overwriting concurrent edits. Their confirmed resize/italic failures now have current-main regression coverage. The tests above demonstrate actual pointer, panel, MCP and GPU behavior; they do not establish complete behavior for every control.

Still not certified by this follow-up: free transforms of nested frames/groups, all Auto Layout combinations, gradient/image fills, stroke variants, shadows/blur, masks, Live Filters/adjustments, Boolean, variables, alignment/distribution, Warp/Pin/Variants/arrays, all drawing/retouch tools, export settings and every history label. In particular, a stored style value is not proof of its final pixels. Those remain unverified rather than being labeled healthy.

The local Vite preview reflects the changes. Online deployment remains externally blocked by the absent repository `LA_SSH_KEY` secret and closed SSH connection documented in `editor-completion-verification.md`.

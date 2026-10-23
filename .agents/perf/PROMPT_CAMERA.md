# Task: Decouple React from camera / pan-zoom; sync Skia on rAF

Working directory: `/workspace/wt-perf` branch `opencode/canvas-perf`.

## Problem
`src/canvas/components/image_editor.jsx` still subscribes to `editorCamera` / `cameraZoom` via Zustand hooks (e.g. ~lines 270, 1776), causing full React re-renders of a 5k+ line component on every pan/zoom tick. Wheel pan already has partial rAF coalescing, but Zustand `set` still notifies React subscribers. `useWorkspaceSkia` draws via `useEffect` on camera deps → 1–2 frame lag behind CSS transforms.

## Files you MAY edit
- `src/store/design_store.js`
- `src/canvas/components/image_editor.jsx`
- `src/canvas/use_skia_page.js`
- NEW helper under `src/canvas/` or `src/store/` if small (e.g. `camera_raf.js`)
- NEW unit tests under `tests/unit/` for camera batching

## Files you MUST NOT edit
- Any `*properties*` panel UI
- electron/, workspace scanning, welcome/dashboard
- vendor/, dist/, other workers' files: `editor_engine*.js`, `bitmap_cache.js`, `editor_engine_render.js`, `doc_ops_*.js`, `editor_pointer_*.js` (except if you must read them)

## Required changes
1. **Stop root React subscriptions to live camera during gestures**
   - Replace `useDesignStore((s) => s.editorCamera)` / zoom selectors used only for transforms with refs + `useDesignStore.subscribe`, OR select with a custom equality that ignores panX/panY during interaction, OR read `getState()` inside event handlers.
   - Keep CSS `translate3d` sync via subscribe (already partially present ~1820).
   - Any UI that needs zoom display can subscribe to zoom only with shallow compare, or update a small dedicated zoom label via ref/DOM — avoid re-rendering ImageEditor.

2. **rAF-batch camera store updates**
   - In `design_store.js` (or a thin wrapper used by pan/zoom handlers): coalesce `panEditorCamera` / `setEditorCamera` during continuous gestures so at most one Zustand `set` per animation frame.
   - Preserve exact final pan/zoom; flush pending on gesture end.
   - Immediate apply still OK for discrete jumps (fit, restore saved camera).

3. **Skia draw on rAF, not useEffect**
   - In `use_skia_page.js` `useWorkspaceSkia`: subscribe to camera (store or refs) and schedule `host.draw` via `requestAnimationFrame`, coalescing to one draw per frame.
   - Still resize via ResizeObserver.
   - Keep docs/layouts/revision invalidation; just don't wait for React commit.

4. **Tests**
   - Add `tests/unit/camera_raf_batching.test.js` proving multiple pan calls in one frame → one store write (mock rAF).
   - Run: `npx vitest run tests/unit/camera_raf_batching.test.js tests/unit/m4_performance_gate.test.js`

## Style
Match existing code style; minimal comments; no drive-by refactors of unrelated ImageEditor UI.

Do NOT commit. Print a short summary of files changed when done.

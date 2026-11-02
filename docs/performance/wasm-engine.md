# Native canvas engine, phase 2

Enable with `localStorage.setItem('voo.wasm-engine', '1')` and reload; remove the key and reload to disable. Default remains **off**, with no visible controls or workspace/file-management changes. Generated glue and WASM load only on the enabled path; loading failures retain JS. `editor.getWasmEngineStatus()` reports editor-index readiness. CanvasKit remains responsible for painting, and JS retains document/history, exact shape/alpha hit tests, groups, resources and authored geometry. These changes do not establish an end-to-end FPS improvement.

## Mutation journals and dragging

`src/engine-wasm/journal.js` stores journals in weak identity maps outside the document. Only node arrays registered by a native adapter collect journals. `updateNode`/`updateNodes` collect changed nodes and z positions during the existing immutable-document map, avoiding a second full-list identity scan at render time. `withNodes` records additions, removals, reordered IDs and derived boolean changes; structural operations still scan at mutation time to capture all changed z positions. Consecutive edits before a frame coalesce by dirty ID into one native batch. Consumed journal links are released. Camera frames with the same node array do no synchronization.

Initial load, document replacement, undo and uninstrumented replacement lists use a full reconciliation. Unchanged entries are retained; only changed operations cross the boundary. Text measurement or other operations that replace a node list outside `withNodes` also use this fallback. The journal is not a replacement for immutable document construction or evaluation: these remain O(N) in existing mutation paths.

Rust stores AABB coordinates, z, liveness and accumulated drag translations in contiguous columns indexed by stable numeric slots. The seven-float wire record is `[opcode, slot, a, b, c, d, z]`:

- `1`: upsert `[minX,minY,maxX,maxY,z]`; resets the accumulated translation.
- `0`: remove; ignores the remaining fields.
- `2`: translate an existing slot by `[dx,dy]`; ignores the remaining fields. Rust updates bounds, grid membership, translation and old/new dirty regions.

The adapter recognizes pure x/y edits and batches opcode 2 for them, including multi-selection drag previews. JS retains current node payloads for narrow-phase hits and the original drawing payload for the accumulated native translation. Geometry/style changes use upserts. Drag-end document/history commits retain their existing behavior; no JS R-tree is built on the enabled path. The existing pointer/document code still constructs preview documents; this phase does not move all gesture evaluation into Rust.

Inputs must be finite ordered bounds, nonnegative slots and z values representable in float32 (integer precision through 2^24). Visual bounds include existing effect padding and are rounded outward before upload. Broad-phase results are checked against original JS bounds; exact shape semantics remain in JS. Float32 translation precision is a limitation at extreme coordinates and over long repeated drags.

## Queries and packed drawing

The 256-unit uniform grid deduplicates candidates and sorts by z then slot. Nodes spanning more than 256 cells use a large-object bucket. Large queries scan live slots instead of enumerating an unbounded grid. Dense overlaps, giant nodes or very large viewports may degrade to O(N), plus sorting.

`query(minX,minY,maxX,maxY)` returns ascending-z slots; `hitTest(x,y)` returns the topmost AABB slot or -1. The editor uses `search`/`pointQuery` followed by its established exact tests.

`drawList(minX,minY,maxX,maxY)` returns `{ids: Uint32Array, transforms: Float32Array}` with six affine floats `[1,0,0,1,tx,ty]` per visible slot in paint order. These matrices are native drag deltas applied to JS-authored drawing geometry; rotation/scale/hierarchy are still authored in JS. One boundary call fills both output buffers. Wrapper views are reacquired after allocation and copied, so subsequent queries and WASM memory growth do not invalidate prior results.

For supported single-page rectangle scenes, `documentsToScene` walks native visible IDs directly instead of filtering the complete document. The SkPicture recorder walks the packed ids/transforms once and submits existing CanvasKit painter operations; no per-node WASM queries or callbacks are made. Other content retains the authoritative renderer.

## Dirty-tile provider and SkPictures

The provider is `EditorWasmIndex.takeDirtyTiles(zoom)`, returning:

```js
{ bucket, size, reset, keys: Int32Array /* x,y,x,y,... */ }
```

`bucket = clamp(round(log2(zoom)), -8, 8)` and tile size is `512 / 2**bucket` document units. Rust tracks the individual old/new bounds of updates, deletes and translations. Keys include negative coordinates and inclusive tile edges. First use, bucket changes or more than 4096 dirty tiles produce `reset: true`; oversized bounds trigger reset without unbounded enumeration. `takeDirty()` independently consumes the accumulated `[minX,minY,maxX,maxY]` dirty rectangle. Both dirty streams have bounded storage.

Tile dirtiness is **consumed**: use one cache owner per provider, then distribute its batch to additional cache consumers if needed. A reset discards every cached tile, including offscreen tiles. Zoom-bucket changes discard the old bucket; pan and DPR changes reuse world-space pictures. Page metadata changes clear pictures separately.

`src/engine-wasm/tile-pictures.js` owns a 128-picture LRU, records missing/invalidated tiles with `CanvasKit.PictureRecorder`, clips replay to tile bounds and deletes pictures on invalidation, eviction and disposal. More than 256 visible tiles uses the authoritative renderer. The LRU bounds picture count; it is not a measured byte budget. `skia-frame.js` connects it to the existing CanvasKit painter through small `skia_host.js` hooks. A flag-enabled Skia host can lazily own its native index when an editor adapter is unavailable; owned indexes are freed on disposal.

Current recording eligibility is deliberately conservative: one origin-aligned page containing plain solid rectangles, including opacity and visibility. Effects, masks, resource-dependent content, complex geometry, motion and multi-page placement retain the existing Skia path. Expanding recording eligibility requires parity for clips, cross-tile effects and resource revisions. Canvas2D rendering keeps its existing cache and dirty-rectangle behavior.

The fps4 WIP diff at `/workspace/tmp/fps4-wip.diff` was reviewed. It owns the stage raster tile layer, exact settled snapshots and overlays. This phase neither copies that code nor changes `stage_picture_cache.js`, viewport code, `editor_engine.js` or `editor_engine_render.js`; `/workspace/wt-fps4` was not modified. fps4 can consume the dirty-provider protocol above in place of `changedRectBounds` and call its existing tile invalidation methods. No duplicate raster tile layer or overlay implementation was added. WASM tile/cache policy stays isolated under `src/engine-wasm/`.

## Build and verification

Generated WASM, JS and declarations are checked in; `npm run build` consumes them without Rust. Regenerate with `bash scripts/build-wasm-engine.sh` using rustup, the wasm32-unknown-unknown target and wasm-bindgen 0.2.100. In this session the prior installation was under `/tmp/voo-cargo` and `/tmp/voo-rustup`; set `CARGO_HOME`, `RUSTUP_HOME` and PATH accordingly. Release uses opt-level z, LTO, one codegen unit, abort panics and stripping; wasm-opt -Oz runs when installed (not available here).

Run parity/unit tests with `npx vitest run --maxWorkers=2 --minWorkers=1 --no-cache`. `--no-cache` avoids attempting to write Vitest's result cache through the read-only shared node_modules link. Native tests cover reference queries, memory growth, visual bounds, mutation journals, skipped frames, removals/reordering, packed transforms, dirty resets/negative tiles/huge bounds, picture replay/eviction/disposal and the default-off path. SkPicture calls are verified with unit doubles; pixel parity and browser FPS were not measured. Browser/e2e tests were deliberately not run.

Run `npm run bench:wasm-engine` for linear, real production R-tree and native-adapter comparisons at 1k/5k/20k/100k nodes. Both editor update paths include immutable document construction; the linear reference measures its kernel only. The uniform workload favors different algorithms differently: native journaling improves mutation timings here while R-tree culling is generally faster. Results and current raw/gzip size are in [wasm-engine-bench.md](wasm-engine-bench.md). Raw WASM remains below 100 KB. See the validation record appended below for this run's final checks.

## Phase 2 validation record

- Size-optimized Rust/WASM rebuild, locked wasm32 cargo check and rustfmt check passed. Binary: **42,783 bytes raw / 18,466 bytes gzip**, below 100 KB.
- The 11 engine tests passed, including reference parity for dragging 100 nodes across grid cells. Related spatial-index, culling, hit-testing and stage-cache tests passed.
- Full Vitest run after the production build: **205 files passed / 2 failed; 2,309 tests passed / 4 failed / 5 skipped**. The failures match issues already recorded by the pilot: one contextual dispatch spy expectation and three Electron CLI bridge mock errors (`require(...) is not a function`). Engine tests and artifact/isolation checks passed. The full suite is not green.
- Production Vite build passed. Changed-file design lint, ESLint no-unused-vars/no-undef and scoped TypeScript checkJs for the scene wrapper/reference passed.
- The benchmark was run against the linear reference, actual editor R-tree and native journal adapter; results are recorded in the companion benchmark document. No browser/e2e tests were run.
- Git metadata in this worktree is read-only. The completed commit is delivered as `/tmp/voo-wasm-engine-2.bundle`, with the existing HEAD as its prerequisite.

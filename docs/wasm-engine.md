# Native canvas engine pilot

The pilot owns bounds storage, broad-phase hit candidates, topmost AABB hit testing, viewport queries and accumulated dirty bounds. It does not yet demonstrate end-to-end 60 FPS. CanvasKit, exact shape/alpha tests, document evaluation and existing renderer caches remain in JS. No workspace or file-management changes are required.

Enable locally with `localStorage.setItem('voo.wasm-engine', '1')` and reload. Remove the key and reload to disable. Default is off; there are no visible controls. Only the enabled path dynamically imports the generated glue and fetches WASM. Loading errors retain the existing JS R-tree. `editor.getWasmEngineStatus()` reports readiness for instrumentation. `VOO_WASM_ENGINE=1 npm run test:e2e:fps` sets the flag before page startup and waits for readiness, failing if the engine does not load. Browser tests were deliberately not run for this pilot.

## Memory and change protocol

Rust stores minX, minY, maxX, maxY and z in separate contiguous `Vec<f32>` columns, with a live column and stable numeric slots. JS retains string IDs, immutable node identities and draw payloads. Columns are internal to Rust; the public shared-memory view is the operation buffer, not a mutable alias of the scene columns. Slots are recycled after removal by the editor adapter; the float32 wire format limits exact integer slots and z to 2^24. Current pilot inputs must use finite, ordered AABBs and nonnegative integer slots below that limit.

`apply(Float32Array)` accepts seven floats per operation: `[opcode, slot, minX, minY, maxX, maxY, z]`. Opcode 1 upserts, 0 removes. Each batch uses one copy into a WASM-memory Float32Array followed by one native call; there are no per-node boundary calls. Allocation may grow memory, so views are reacquired after reserving input and after querying. Returned Uint32Array results are copied to keep them valid across later calls. Equal z resolves to the greater slot for hit tests; query results sort by ascending z then slot.

Immutable node-list identity skips syncing pan/zoom frames. A changed list currently requires an O(N) JS identity/order scan, but only changed bounds/z and removals cross the boundary. This scan and existing document evaluation can still dominate single-node drags at 20k nodes; a future document-change journal should directly supply changed IDs. The adapter uses existing visual bounds (including effects), conservatively rounds outward to float32, and confirms candidates against original double-precision bounds. Existing narrow-phase geometry, lock/visibility, group, fill-instance and non-cullable rules remain authoritative.

Future transforms use six additional SoA float32 columns for the affine matrix (a,b,c,d,tx,ty), with a separate transform opcode and dirty old/new world bounds derived natively. Transform propagation, hierarchy and exact vector geometry are outside the implemented pilot; JS currently computes visual world bounds.

## Spatial index and queries

A 256-document-unit uniform grid offers simple incremental remove/insert for dragging and predictable implementation size. Each cell stores slots; a node spanning more than 256 cells goes into a large-object bucket, preventing huge bounds from multiplying entries. Queries deduplicate candidates, confirm inclusive intersection and sort by z. Queries covering more than 256 cells scan live slots to avoid traversing an unbounded grid. Empty cells are removed after edits. Negative coordinates and inclusive cell edges are supported.

This works well for similarly sized UI nodes. Dense overlaps, many giant nodes or large viewports degrade to O(N), plus output sorting. A dynamic BVH or R-tree is a sensible later replacement for highly uneven documents, but has more maintenance and balancing complexity. Benchmark results compare against the independent linear JS reference, **not** the production JS R-tree; they cannot establish a renderer speedup.

`query(minX,minY,maxX,maxY)` returns visible slots in paint order. `hitTest(x,y)` returns the greatest-z AABB slot or -1. Editor integration uses WASM `search`/`pointQuery` candidates followed by the existing exact hit tests, rather than replacing shape semantics with box hits. Both culling consumers and pointer consumers receive the same engine-backed spatial-index adapter through a small change in `editor_engine.js`.

Every update/removal unions old bounds, and every insertion/update unions new bounds. `takeDirty()` returns `[minX,minY,maxX,maxY]` or an empty Float32Array and clears the accumulator. This conservative single union is bounded in memory but can overinvalidate widely separated edits. The editor consumes and clears it after sync while retaining its existing dirty tracker; wiring native dirtiness into drawing is a later phase.

## CanvasKit and tile-cache plan

The first draw-list format is a batched visible-slot array; JS maps slots to existing node drawing payloads and submits CanvasKit operations without native-to-JS callbacks per node. Future command streams can contain material/geometry handles and transform indices, with separate resource upload batches.

For tiles, map dirty old/new bounds to document-space tile keys at a quantized zoom level, include effect padding, and invalidate only affected pictures. Compile per-tile SkPictures on the CanvasKit side, replay visible pictures with the viewport matrix, and draw actively dragged nodes in the existing overlay path. Keep a byte-limited LRU for pictures/textures, track content/style/resource revisions, and discard stale recordings on resource or zoom-level changes. Cross-tile effects and clip/group dependencies need conservative invalidation. This is a plan only: no tile/cache renderer files are changed, preserving the parallel JS-cache work.

## Build, size and verification

Generated `.wasm`, JS and declaration files are checked in under `src/engine-wasm/generated`; `npm run build` never invokes Rust. Regenerate using a local rustup toolchain with `wasm32-unknown-unknown`, `cargo install wasm-bindgen-cli --version 0.2.100 --locked`, then `bash scripts/build-wasm-engine.sh`. Cargo.lock pins dependencies; release uses opt-level z, LTO, one codegen unit, abort panics and stripping. The script runs wasm-opt -Oz if available (not available in this environment).

Pilot budget: under 100 KiB raw WASM and 40 KiB gzip, with under 15 KiB raw generated JS. Current sizes and query timings are recorded in [wasm-engine-bench.md](wasm-engine-bench.md). Base SoA storage is about 21 bytes per allocated slot, excluding vector spare capacity, input/output buffers, grid/hash overhead and the JS node map. A 20k initial operation batch is 560 kB. No fixed memory or 60 FPS guarantee is claimed.

Run `npx vitest run tests/unit/wasm_engine.test.js --maxWorkers=2 --minWorkers=1` for deterministic reference parity, edits/removals/reordering, giant bounds, inclusive edges, dirty reset, memory growth and editor adaptation. Run `npm run bench:wasm-engine` for Node microbenchmarks at 1k/5k/20k/100k. The repository has no general typecheck script/config; scoped TypeScript checkJs is used for the independent scene API and WASM wrapper, alongside the repository design lint and production build.

## Validation record

- Production `npm run build` passed, consuming the checked-in native artifact without Rust.
- Four engine parity/adapter tests passed; production artifact/isolation checks passed after allowing and validating the engine WASM asset.
- Scoped TypeScript checkJs passed for `src/engine-wasm/wasm.js` and `reference.js`: `npx --package typescript tsc --allowJs --checkJs --noEmit --target ES2022 --module ESNext --moduleResolution bundler src/engine-wasm/wasm.js src/engine-wasm/reference.js`.
- Changed-file design lint and ESLint no-unused-vars/no-undef checks passed. Full `npm run lint:design` reports 18 existing violations across eight unrelated files.
- Rust `cargo check --target wasm32-unknown-unknown` and `cargo fmt --check` passed.
- Browser/Electron FPS tests were not run. Use the flag-on FPS command above for the subsequent browser measurement.
- Final full `npx vitest run --maxWorkers=2 --minWorkers=1`: 200 files passed, three failed; 2,268 tests passed, five failed, five skipped. Failures are outside the native core: one contextual dispatch spy expectation (`contextual_island.test.jsx`), three Electron CLI bridge mock failures (`require(...) is not a function`), and one extension bridge listener timeout. The engine's four tests, single-canvas integration and artifact/isolation tests passed. The full suite is not green.

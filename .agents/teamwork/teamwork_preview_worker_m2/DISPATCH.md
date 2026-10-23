# Dispatch for Worker M2 (Web Worker Streaming Ingestion & Optimization)

## Mission
Implement Milestone 2 (M2) of the VOO Design single-canvas and streaming import project.
Your working directory is: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m2`
Project root: `/Users/tt/teamwork_projects/voo_design`

## Mandatory Reading
1. Authoritative user request: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (Read this first!)
2. Project blueprint: `/Users/tt/teamwork_projects/voo_design/PROJECT.md`
3. Explorer 1 handoff: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_1/handoff.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Exclusive Write Ownership
You exclusively own and may modify or create the following files:
- `src/canvas/figma/figma_import_worker.js`
- `src/canvas/figma/figma_import_client.js`
- `src/canvas/figma/figma-to-voo.js`
- `src/canvas/figma/figma-instances.js`
- `src/canvas/figma/fig-zip-reader.js`
- `src/canvas/store/project_io.js`
- `tests/unit/figma/streaming_worker.test.js`

Do NOT edit any files outside this list.

## Implementation Details
1. **Instance Expansion $O(N)$ Optimization (`src/canvas/figma/figma-instances.js`)**:
   - In `expandInstances`, eliminate the quadratic $O(N^2)$ search `out.indexOf(instance)` by creating a Map index of change IDs.
2. **Transferable ArrayBuffers & Blobs Pruning (`src/canvas/figma/figma-to-voo.js`, `fig-zip-reader.js`)**:
   - Prune redundant `nodeChanges` and `blobs` from `figSource.message` before `postMessage` in worker, saving dozens of MBs in structured clone overhead.
   - For images, transfer raw Uint8Array buffers directly across `postMessage` transfer list or bundle them efficiently.
3. **Worker Streaming Chunk Protocol (`src/canvas/figma/figma_import_worker.js`)**:
   - In `figma_import_worker.js`, emit progressive messages conforming to `PROJECT.md § Interface Contracts`:
     * `{ type: "PROGRESS", stage, percent, message }`
     * `{ type: "PAGE_HEADER", pages }`
     * `{ type: "CHUNK_NODES", pageId, nodes, isFirstScreen }`
     * `{ type: "COMPLETE", result }`
   - Yield to the event loop every 500–1000 nodes (`await new Promise(r => setTimeout(r, 0))`) to keep the worker responsive and allow streaming chunks to be dispatched.
4. **Client Streaming Consumer & Progress UI (`src/canvas/figma/figma_import_client.js`, `src/canvas/store/project_io.js`)**:
   - Support `importFigFile(bytes, { onProgress, onChunk })`.
   - Update `useDesignStore.setDocumentLoading` with percentage and stage text.
   - Support synchronous fallback when `typeof Worker === "undefined"` (for Node.js vitest environment).
5. **Testing & Verification**:
   - Write unit tests in `tests/unit/figma/streaming_worker.test.js` verifying streaming progress, chunking, and memory pruning.
   - Verify all 11 existing Figma test suites in `tests/unit/figma/` pass without regression.
   - Run `npm test` and `npm run build`.

## Output
Write your handoff report to:
`/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m2/handoff.md`
Report back via `send_message` when done.


## 2026-10-20T22:10:18Z
**Context**: Quota reset period has passed and system is fully available.
**Content**: Please resume execution of Milestone 2 (Web Worker Streaming Ingestion & Optimization).
**Action**: Implement Task 1 through Task 5 per DISPATCH.md, verify with builds and tests, and report back when complete.

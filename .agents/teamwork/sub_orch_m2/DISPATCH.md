# Dispatch: Sub-Orchestrator Milestone 2 (Web Worker Streaming Ingestion & Optimization)

## Mission
You are the Sub-Orchestrator for Milestone 2 (M2).
Your working directory is: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/sub_orch_m2`
Project root: `/Users/tt/teamwork_projects/voo_design`

## Authoritative Requirements & Context
1. User Request: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (Read this first!)
2. Project Blueprint: `/Users/tt/teamwork_projects/voo_design/PROJECT.md`
3. Explorer 1 survey: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_1/handoff.md`

## Milestone 2 Scope
- **F2.1: Figma Import Worker Streaming Protocol**:
  * Refactor `src/canvas/figma/figma_import_worker.js` and `figma-to-voo.js` to emit incremental events (`STAGE_START`, `UNPACKING`, `KIWI_DECODE`, `INDEX_READY`, `CHUNK_NODES`, `FINALIZE`).
  * Chunk node stream (e.g. 500–1000 nodes/batch) with periodic event loop yields (`await new Promise(r => setTimeout(r, 0))` or `scheduler.yield()`) so the worker does not lock up.
- **F2.2: Transferable ArrayBuffers & Memory Optimization**:
  * In `fig-zip-reader.js` and `figma-to-voo.js`, transfer raw image ArrayBuffers directly across `postMessage` (`[buffer]` transfer list) instead of converting to base64 in worker.
  * Prune `nodeChanges` and `blobs` from the `figSource` clone returned by the worker to avoid transferring dozens of megabytes of redundant raw Kiwi structures.
- **F2.3: Instance Expansion $O(N)$ Optimization**:
  * In `src/canvas/figma/figma-instances.js`, replace quadratic $O(N^2)$ linear searches (`out.indexOf(instance)`) with a direct Map lookup index.
- **F2.4: Client Streaming Ingestion & UI Progress Feedback**:
  * Refactor `src/canvas/figma/figma_import_client.js` and `src/canvas/store/project_io.js` to handle streaming chunk messages.
  * Connect progress percentages (0% -> 100%) and stage descriptions into `useDesignStore.setDocumentLoading` and `LoadingModal.jsx`.
- **F2.5: First-Screen / Page 1 Priority Ingestion**:
  * Emit the first page/artboard immediately upon conversion so the canvas shell can begin mounting while secondary pages/artboards stream in the background.
- **Unit & Integration Verification**:
  * Ensure all 11 existing Figma test suites in `tests/unit/figma/` pass without regression.
  * Add unit tests for worker streaming events, chunking, and memory pruning.
  * Verify `npm test` and `npm run build`.

## Execution Protocol
Follow standard sub-orchestrator pattern:
- Decompose into tasks or run Explorer -> Worker -> Reviewer -> Challenger -> Auditor iteration cycle.
- Mandatory integrity warning on all workers: DO NOT CHEAT, all implementations must be genuine.
- Ensure build and tests pass before completing.
- Write `handoff.md` in your directory and report back via `send_message`.

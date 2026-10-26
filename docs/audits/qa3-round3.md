# qa3 round 3: real app QA

Scope: production web build and Electron smoke test. Workspace and file-management implementation was left unchanged. No title-bar controls were added.

## Bugs fixed

1. **Agent drops its final streamed text/tool call.** An OpenAI-compatible response closed after the final `data:` JSON line without a newline. The parser discarded the remaining buffer, so generation could complete without creating the requested node. Flush the decoder and process the final line at EOF; release the reader lock on success/error. Five stream tests cover LF/CRLF/EOF, split Unicode bytes, tool calls, and the DONE marker. Two tests failed before the fix.
2. **Raw translation keys in shape tool properties.** Rectangle and ellipse headings requested `editor.shape.rect` / `editor.shape.ellipse`, absent from both dictionaries. Added English and Chinese labels. Both locale regression cases failed before the fix. Visual evidence: `before-missing-shape-label.png`.

3. **Agent selection and generation preferences reset on reload.** `setSetting` wrote the agent keys to storage, but the startup cache/hydration list omitted all 14 `AGENT_SETTING` keys. The real panel therefore fell back to Claude even with a saved mock model. Added the agent keys to startup restoration/hydration and a fresh-module regression test covering every agent setting. The test failed before the fix.

## Reproduce

```sh
npm ci --prefer-offline
npm run build
npm run preview -- --host 127.0.0.1 --port 5253
# In another shell:
VOO_SCREENSHOT_DIR=/tmp/shots-qa3r flock /tmp/voo-e2e.lock node tests/e2e/qa3_roundtrip.e2e.mjs
VOO_SCREENSHOT_DIR=/tmp/shots-qa3r flock /tmp/voo-e2e.lock xvfb-run -a node tests/e2e/qa3_electron.e2e.mjs
npm test -- --maxWorkers=2 --minWorkers=1 --testTimeout=20000
```

The web harness uses a routed, deterministic mock SSE service, the real agent panel and canvas tool executor. It draws with pointer events, edits X in the property inspector, verifies agent undo/redo, checks PNG/SVG/PDF signatures, downloads a .voo file, deletes the canvas content, and opens the saved file to compare every node field. It captures each step. The Electron harness checks the native preload and pointer drawing, using temporary XDG profile/cache directories for restricted environments.

The extension-bridge unit tests now request ephemeral ports (`port: 0`). A later full-suite run found another job occupying the fixed default port, causing three test-only listen failures; all three passed after this isolation change.

## Environment constraints

The requested `/workspace/tmp/shots-qa3r/` is mounted read-only in this session. Actual captures and export artifacts are under `/tmp/shots-qa3r/`.

Git staging failed because `/workspace/voo-design/.git/worktrees/wt-qa3r/index.lock` cannot be created on the read-only Git metadata mount. Commit/push cannot be completed in this sandbox.

Initial full-suite baseline: 2,264 passed, 5 skipped, 5 failed (2,274 total). Four failures are the known contextual_island/electron_cli_bridge cases. The fifth was the 5-second single_canvas_integration import timeout; a recheck with a 20-second timeout passed all 11 tests. Focused fix validation: 14/14 passed. Production build passed.

Final full suite (20-second test timeout, two workers): **2,273 passed, 5 skipped, 4 known failures, 2,282 total; 203 passing files / 205 total**. The known failures are contextual_island dispatchToAgent and electron_cli_bridge (three cases). The eight new regression cases pass.

## Unfixed finding: save loses live edits (file-management scope excluded)

The production web run successfully created two rectangles (one by pointer, one through mocked agent generation), edited X, undid/redid the agent turn, and exported PNG/SVG/PDF. The PNG is 1200 × 800 and its interior mint pixel was verified; the SVG contains the generated fill. The downloaded `.voo` file, however, has **zero nodes** in both `document.nodes` and `document.pages[0].sceneDoc.nodes`. Reopening it produces an empty canvas. Evidence: `roundtrip.voo`, `07-save.png`, `08-reopen.png`.

Read-only diagnosis: `project_io.js` extracts `entry.engine` and checks `live.ready` before serializing it. `image_editor.jsx` stores `{ engine, ready, ... }` in the registry; readiness belongs to the entry, while the engine has no `ready` property. The save path therefore falls back to the original empty editor document. The likely correction is to check the registry entry's readiness before reading its engine. No file-management code was changed, as explicitly requested.

The end-to-end test intentionally fails on this data-loss regression. It deletes the live canvas after saving, reopens the downloaded file, and compares the saved/reopened content with the two live nodes; it does not mask the failure by testing only a nonempty preview.


## Final real-app results

- Web: create document, pointer drawing, inspector edit, mocked generation (2 requests), agent undo/redo, and PNG/SVG/PDF export passed. Zero page errors. Save/reopen fails with 2 live nodes, 0 saved nodes, 0 reopened nodes; `report.json` records the counts. The failing end-to-end assertion is intentional evidence of the unresolved product bug.
- Electron: native preload, new document, pointer drawing, and zero page errors passed. Automation shutdown exceeded 5 seconds; the harness killed its own Electron process group. This shutdown limitation remains unresolved and is not claimed as a product fix.
- Build and `git diff --check` passed. Unit results above include all final application changes.
- Browser runs used the shared flock. Preview/dev servers were stopped. Browser instances were closed; the stalled Electron instance was forcibly cleaned up.

14 screenshots are in `/tmp/shots-qa3r/`: `01-open.png`, `02-new-document.png`, `03-draw.png`, `04-edit.png`, `05-agent-generation.png`, `06-export-png.png`, `06-export-svg.png`, `06-export-pdf.png`, `07-save.png`, `08-reopen.png`, `09-electron-open.png`, `10-electron-draw.png`, `before-missing-shape-label.png`, and `before-agent-settings-reset.png`. Exported artifacts are `export.png`, `export.svg`, `export.pdf`, and `roundtrip.voo`.

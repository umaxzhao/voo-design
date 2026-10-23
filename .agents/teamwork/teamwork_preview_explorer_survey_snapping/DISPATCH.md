# DISPATCH: Snapping & Overlays Survey

## Mandatory Inputs
- Original Request: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (read section ## 2026-10-20T17:49:22Z)
- Target files to investigate:
  - `src/canvas/editor/scene_snapping.js`
  - `src/canvas/editor/chrome_stage_overlays.js`
  - Any associated interaction handlers or gesture controllers (e.g. `interaction_runtime.js`, `drag_handler.js`, `selection_runtime.js` or similar)
  - Existing test suites for snapping/overlays

## Mission
Investigate the current snapping architecture and canvas overlay rendering pipeline.
Identify how smart gap snapping (equidistant snapping between 2 or more adjacent layers) can be seamlessly integrated:
1. How does current snapping calculate candidates and return snap results?
2. How are magnetic snapping toggled and how does Cmd/Ctrl bypass snapping?
3. What data structure represents guides/overlays, and how does `chrome_stage_overlays.js` render them?
4. How should the equidistant gap guides and dimension pill badges (e.g., pink/purple lines with pixel pill badges `16px`) be represented and rendered?
5. Identify edge cases (negative gaps, multiple candidate pairs, oblique/rotated bounds, zoom factor compensation).

Write your comprehensive findings to `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_snapping/report.md` and complete with `handoff.md`.


## 2026-10-20T17:59:56Z
You are the Snapping & Overlays Explorer.
Your working directory is /Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_snapping.
MANDATORY: Read /Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md (specifically ## 2026-10-20T17:49:22Z) and /Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_snapping/DISPATCH.md before starting work.

Investigate:
1. `src/canvas/editor/scene_snapping.js` and `src/canvas/editor/chrome_stage_overlays.js`.
2. Existing snapping calculation logic, how drag gestures query snapping, candidate selection, magnetic snapping toggling, and Cmd/Ctrl bypass.
3. How equidistant gap snapping between 2 or more adjacent layers can be computed.
4. How dimension guides and pill tags (`16px`, pink/purple guides with start/end tick marks) are structured and rendered.
5. Edge cases: negative gaps, multi-layer chains, zoom compensation.

Write your report to `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_snapping/report.md` and create `handoff.md`.
When finished, send a message to the caller with the path to your handoff report.

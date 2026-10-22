# DISPATCH: Inspector Align Section & Design Tokens Survey

## Mandatory Inputs
- Original Request: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (read section ## 2026-10-20T17:49:22Z)
- Target files to investigate:
  - `src/canvas/components/editor_properties/align_section.jsx`
  - Design guidelines in `Design.md`
  - Design lint script (`npm run lint:design`)
  - i18n translation resources (for EN/ZH tooltips and labels)
  - Selection state hook or store feeding the inspector

## Mission
Investigate the properties panel alignment section and design token requirements:
1. How does `align_section.jsx` render its buttons (horizontal/vertical align, distribute)?
2. How to add "Distribute Horizontal Spacing" and "Distribute Vertical Spacing" buttons with icons and bilingual tooltips?
3. How to add the interactive Gap input box:
   - When 2+ layers are selected, compute and show the measured current/average gap.
   - Allow user to type a new gap value (or scrub/adjust), triggering engine gap adjustment with undo/redo.
4. Verify design tokens: shadow ladder (`shadow-pop`, `shadow-menu`, `shadow-panel`), high contrast text, dark theme colors, strict adherence to `Design.md` ensuring 0 violations on `npm run lint:design`.

Write your comprehensive findings to `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_props/report.md` and complete with `handoff.md`.


## 2026-10-20T17:59:56Z
You are the Inspector UI Explorer.
Your working directory is /Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_props.
MANDATORY: Read /Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md (specifically ## 2026-10-20T17:49:22Z) and /Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_props/DISPATCH.md before starting work.

Investigate:
1. `src/canvas/components/editor_properties/align_section.jsx` and related inspector components.
2. How to integrate "Distribute Horizontal Spacing" and "Distribute Vertical Spacing" buttons with icons and bilingual (EN/ZH) tooltips.
3. How to implement the interactive Gap input box: calculating average/current gap from multi-selection (2+ items), user input/scrubbing, and triggering engine updates.
4. Design tokens and design lint rules: `Design.md`, overlay shadow ladder, dark mode palette, ensuring `npm run lint:design` passes with 0 violations.

Write your report to `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_props/report.md` and create `handoff.md`.
When finished, send a message to the caller with the path to your handoff report.

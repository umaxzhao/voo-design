## 2026-10-21T23:30:12Z
You are worker_m3_ergonomics, a worker subagent.
Your working directory is /Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m3_ergonomics.
Your parent is orchestrator_10 (conversation ID: 8189032a-2771-44e5-a68b-fb75d8c8aa02).

MANDATORY FIRST STEP: Read /Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md.
Also read the explorer survey handoff: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/survey_r3_figma_ergonomics/handoff.md, /Users/tt/teamwork_projects/voo_design/Design.md, and /Users/tt/teamwork_projects/voo_design/PROJECT.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP:
You exclusively own and may edit ONLY these files:
- src/canvas/components/editor_toolbar.jsx
- src/canvas/components/editor_contextual_taskbar.jsx
- src/canvas/use_editor_shortcuts.js
- src/App.jsx
- tests/unit/island_bar_ergonomics_shortcuts.test.js

TASK - Implement Milestone 3 (Figma Micro-Interactions, Island Bar, Shortcuts & Design Tokens):
1. In `src/canvas/components/editor_toolbar.jsx`:
   - Fix 3 design lint violations on lines 259, 273, 288: replace `shadow-sm` with `shadow-pop` on Persona switcher pills.
   - Fix i18n key in `editor_toolbar.jsx`: use standard `editor.props.distribute.horizontal` rather than `editor.props.distribute.h`.
2. In `src/canvas/components/editor_contextual_taskbar.jsx`:
   - For multi-selection (`selectedCount > 1`):
     - Add **Equal Spacing** action buttons: Distribute Horizontally (`distributeHorizontal()`) and Distribute Vertically (`distributeVertical()`), with clean tooltip hints.
     - Add direct **One-Click Auto Layout** button: wraps selected nodes in Auto Layout or converts selection into an Auto Layout frame directly on the canvas.
   - Ensure all buttons adhere strictly to VOO dark design tokens (`bg-neutral-900/95`, `border-white/10`, `shadow-pop`, AI buttons in purple `#E5B2FF` and standard buttons in neutral monochrome).
3. In `src/canvas/use_editor_shortcuts.js`:
   - Remove unreachable dead code `case "Digit0"` at line 896 so shortcut handling is clean and unambiguous.
4. In `src/App.jsx`:
   - Fix Electron menu action handlers:
     - `"view:fit"`: invoke `window.__vooEditor?.zoomToFit?.()` (fixing the broken `.getViewport().zoomToFit()`).
     - `"view:actualSize"`: invoke `window.__vooEditor?.zoomToHundred?.()`.
     - Add missing handlers for:
       - `"edit:duplicate"` -> `window.__vooEditor?.duplicateSelection?.()`
       - `"edit:delete"` -> `window.__vooEditor?.deleteSelection?.()`
       - `"edit:selectAll"` -> `window.__vooEditor?.selectAll?.()`
       - `"view:zoomIn"` -> `window.__vooEditor?.zoomIn?.()`
       - `"view:zoomOut"` -> `window.__vooEditor?.zoomOut?.()`
5. In `tests/unit/island_bar_ergonomics_shortcuts.test.js`:
   - Write comprehensive unit tests verifying: Island Bar Equal Spacing buttons, One-Click Auto Layout action, Electron menu IPC shortcut handlers, and clean design token classes.
6. Run `npx vitest run tests/unit/island_bar_ergonomics_shortcuts.test.js` and ensure 100% pass.
7. Write your 5-component handoff report to `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m3_ergonomics/handoff.md` and notify parent via `send_message`.

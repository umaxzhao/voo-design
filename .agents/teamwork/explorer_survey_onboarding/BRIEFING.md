# BRIEFING — 2026-10-21T04:22:00Z

## Mission
Technical investigation of Onboarding Workspace Guide & Settings Integration (R1 from ORIGINAL_REQUEST.md).

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_onboarding
- Original parent: f126486b-1da4-4ed3-bbae-c02e11eee497
- Milestone: Onboarding Workspace Guide & Settings Integration

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Zero Design.md violations
- Adhere to VOO dark design tokens
- Analyze dual-platform (Electron IPC vs Web File System Access / Virtual)

## Current Parent
- Conversation ID: f126486b-1da4-4ed3-bbae-c02e11eee497
- Updated: 2026-10-21T04:22:00Z

## Investigation State
- **Explored paths**:
  - Reference codebase `/Volumes/TD/Projects/voo-run`:
    - `src/canvas/components/onboarding/OnboardingGuide.jsx`, `onboarding_state.js`, `onboarding_step_progress.jsx`, `step_start.jsx`
    - `electron/project_config.js`, `electron/project_store.js`, `electron/preload.cjs`
    - `src/canvas/components/settings_drawer.jsx`, `settings_general.jsx`, `settings_advanced.jsx`
  - Current codebase `/Users/tt/teamwork_projects/voo_design`:
    - `src/canvas/components/onboarding/` (`OnboardingGuide.jsx`, `onboarding_state.js`, `step_agent_select.jsx`, `step_local_detect.jsx`, `step_ready.jsx`)
    - `src/canvas/components/settings_drawer.jsx`, `settings_general.jsx`
    - `src/shared/settings.js`, `src/storage/db.js`, `src/canvas/store/recent_files.js`
    - `electron/main.cjs`, `electron/preload.cjs`
    - `src/App.jsx`, `src/app_title_bar.jsx`, `src/canvas/components/welcome_dashboard.jsx`
- **Key findings**:
  - `voo-run` uses `electron/project_config.js` to manage `projects_config.json` under `app.getPath("userData")` with fallback to `~/Documents/VOO/Projects`.
  - In `voo_design`, `OnboardingGuide.jsx` currently implements a 3-step wizard (`agent_select`, `local_detect`, `ready`). Workspace selection can be elegantly added as Step 1 (`workspace_setup`) or embedded cleanly as a 4-step wizard with dynamic step count already supported by `OnboardingStepProgress`.
  - Dual-platform split: Electron exposes `ipcRenderer.invoke("workspace:chooseDir")` (using native `dialog.showOpenDialog`), while Web uses `window.showDirectoryPicker()` with fallback to IndexedDB virtual store (`src/storage/db.js`).
  - Settings integration: `<WorkspaceSettingsSection />` inside `SettingsGeneral` (and optional dedicated tab in `SettingsDrawer`), displaying current directory, type badge, "Change Directory" action, rescan action, and fallback handling.
- **Unexplored areas**: None for R1 scope.

## Key Decisions Made
- Recommending a 4-step onboarding workflow: Step 1 (Workspace Selection) -> Step 2 (Agent Select) -> Step 3 (Environment Probe) -> Step 4 (Ready & Enter Canvas).
- Recommended state keys: `voo.workspace.path`, `voo.workspace.type`, `voo.workspace.name`, `voo.workspace.lastScannedAt`.
- Detailed contracts and edge case handlers documented in handoff.md.

## Artifact Index
- /Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_onboarding/handoff.md — Complete 5-component technical analysis report

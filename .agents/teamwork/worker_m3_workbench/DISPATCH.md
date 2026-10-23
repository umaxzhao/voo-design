## 2026-10-21T05:24:39Z
You are worker_m3_workbench, a teamwork_preview_worker.
Your working directory is:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m3_workbench

MANDATORY: Read ORIGINAL_REQUEST.md first:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md
Also read PROJECT.md:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/orchestrator_7/PROJECT.md
And survey handoff:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_workbench/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Mission: Implement Milestone 3: Workbench Integrated File Management (Features 13–18).
Exclusive write ownership:
- `src/canvas/components/welcome_dashboard.jsx` (modify)
- `src/canvas/store/project_io.js` (modify)
- `src/canvas/store/recent_files.js` (modify)
- `src/shared/i18n/` (modify if needed)
- `tests/unit/workspace_dashboard_integration.test.js` (new)

Tasks:
1. `WelcomeDashboard.jsx`:
   - Add Active Workspace Header/Strip in left sidebar or top area displaying current path with tooltip, platform badge (`[macOS 原生]`, `[浏览器挂载]`, `[虚拟工作区]`), "更换" (Change) button, "刷新" (Rescan) button with spinner, and "在访达中显示" (Reveal in Finder - Electron only). Adhere strictly to `Design.md`.
   - Connect project listing to `workspaceStorage.scanFiles()`:
     - Support tabs: "recents", "starred", "drafts", "trash".
     - Real-time reactivity: subscribe to `workspaceStorage.subscribe()` and `"voo:workspace-changed"`.
   - Wire actions to `workspaceStorage`:
     - Star/unstar: `workspaceStorage.toggleStar(file.id)`
     - Rename: `workspaceStorage.renameFile(file.id, newName)`. If currently open in canvas (`useDesignStore.getState().filePath === file.path`), update canvas `filePath` and `fileName` in `designStore`.
     - Move to Trash: `workspaceStorage.moveToTrash(file.id)`
     - Restore from Trash: `workspaceStorage.restoreFromTrash(file.id)`
     - Permanent Delete: `workspaceStorage.deletePermanently(file.id)`
     - Empty Trash: `workspaceStorage.emptyTrash()`
     - Change Directory: `workspaceStorage.chooseDirectory()`
     - Reveal in Finder: `workspaceStorage.revealInFinder(path)`
2. `src/canvas/store/project_io.js`:
   - In `saveVooProject()`: when `saveAs` is true or `!store.filePath`, resolve active workspace directory from `workspaceStorage.getConfig()`.
   - On Electron: pass `defaultPath: config.path ? path.join(config.path, finalSuggestedName) : finalSuggestedName` to `saveFileDialog`.
   - On Web FSA: pass `startIn: directoryHandle` if available.
   - Ensures new projects default to saving inside the active workspace directory.
3. `tests/unit/workspace_dashboard_integration.test.js`:
   - Create comprehensive unit test suite covering:
     - Active workspace path rendering and change directory action.
     - File listing from `workspaceStorage.scanFiles()`.
     - Star toggle metadata persistence.
     - Disk-synchronized rename and open canvas path synchronization.
     - Move to trash and restore from trash.
     - Permanent deletion and empty trash.
     - Default save path derivation in `saveVooProject`.
4. Run verification commands:
   - `npx vitest run tests/unit/workspace_dashboard_integration.test.js`
   - `npm test` (all test suites pass 100%)
   - `npm run lint:design` (0 violations)
   - `npm run build` (clean build)
5. Write handoff report to `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m3_workbench/handoff.md` and report completion to orchestrator.

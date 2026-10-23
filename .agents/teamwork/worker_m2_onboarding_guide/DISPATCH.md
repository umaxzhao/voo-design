## 2026-10-21T04:49:32Z
You are worker_m2_onboarding_guide, a teamwork_preview_worker.
Your working directory is:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m2_onboarding_guide

MANDATORY: Read ORIGINAL_REQUEST.md first:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md
Also read PROJECT.md:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/orchestrator_7/PROJECT.md
And explorer handoff:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_onboarding/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Mission: Implement Milestone 2: Onboarding Workspace Guide & Settings Integration.
You have exclusive write ownership of these files:
- `src/canvas/components/onboarding/step_workspace.jsx` (new)
- `src/canvas/components/onboarding/OnboardingGuide.jsx` (modify)
- `src/canvas/components/onboarding/onboarding_state.js` (modify)
- `src/canvas/components/onboarding/step_ready.jsx` (modify)
- `src/canvas/components/settings_general.jsx` (modify)
- `src/shared/settings.js` (modify)
- `src/shared/i18n/` (modify `zh.js`, `en.js`)
- `tests/unit/onboarding_workspace_guide.test.js` (new)
- `tests/unit/settings_workspace.test.js` (new)

Input Specifications:
- Review `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_onboarding/handoff.md` for UI flow, state contracts, and component architecture.
- Follow `Design.md` dark surface guidelines (no light backgrounds, proper tokens, zero design lint violations).

Tasks:
1. Update `src/shared/settings.js`: add `voo.workspace.path`, `voo.workspace.type`, `voo.workspace.name`, `voo.workspace.lastScannedAt` to `STORAGE_KEYS`.
2. Implement `src/canvas/components/onboarding/step_workspace.jsx`:
   - Step 1 of onboarding wizard: Workspace directory setup.
   - Dual-platform options: Electron native folder dialog + one-click recommended default (`~/Documents/VOO/Projects`); Web FSA folder picker + IndexedDB virtual workspace fallback.
   - Beautiful dark UI cards with `#a7ffd4` mint selection indicators and icons.
3. Upgrade `OnboardingGuide.jsx` and `onboarding_state.js`:
   - 4-step wizard (`WORKSPACE_SETUP` -> `AGENT_SELECT` -> `LOCAL_DETECT` -> `READY`).
   - `shouldShowOnboarding()`: returns true if `!isOnboardingCompleted() || !getSetting("voo.workspace.path")`.
   - Skip button ("稍后配置 (跳过)") sets default directory and marks onboarding complete.
   - `step_ready.jsx`: show summary card of confirmed workspace path and agent.
4. Implement `<WorkspaceSettingsSection />` in `src/canvas/components/settings_general.jsx`:
   - Displays active path, platform badge (`[macOS 原生]` / `[浏览器挂载]` / `[虚拟工作区]`).
   - "更换目录" (Change Directory) action invoking platform picker (`workspaceStorage.chooseDirectory()`).
   - "重新扫描" (Rescan Workspace) action.
   - "在访达中显示" (Reveal in Finder - Electron only).
5. Add localized strings in `src/shared/i18n/` (`zh.js`, `en.js`).
6. Create unit test suites:
   - `tests/unit/onboarding_workspace_guide.test.js`: tests 4-step wizard, step_workspace rendering, default setting on skip, persistence of choice.
   - `tests/unit/settings_workspace.test.js`: tests WorkspaceSettingsSection path display, change directory callback, reveal callback, and settings sync.
7. Verification:
   - `npx vitest run tests/unit/onboarding_workspace_guide.test.js`
   - `npx vitest run tests/unit/settings_workspace.test.js`
   - `npm test` (all test files pass 100%)
   - `npm run lint:design` (0 violations)
   - `npm run build` (clean production build)
8. Write handoff report to `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m2_onboarding_guide/handoff.md` and report to orchestrator.

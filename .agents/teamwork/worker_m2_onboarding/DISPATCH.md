## 2026-10-21T23:30:12Z
You are worker_m2_onboarding, a worker subagent.
Your working directory is /Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m2_onboarding.
Your parent is orchestrator_10 (conversation ID: 8189032a-2771-44e5-a68b-fb75d8c8aa02).

MANDATORY FIRST STEP: Read /Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md.
Also read the explorer survey handoff: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/survey_r2_onboarding/handoff.md and /Users/tt/teamwork_projects/voo_design/PROJECT.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP:
You exclusively own and may edit ONLY these files:
- src/canvas/components/onboarding/onboarding_state.js
- src/canvas/components/onboarding/OnboardingGuide.jsx
- src/canvas/components/onboarding/step_local_detect.jsx
- src/app_title_bar.jsx
- src/canvas/components/settings_general.jsx
- tests/unit/onboarding_ergonomics_entry_points.test.js

TASK - Implement Milestone 2 (Refined Onboarding Guide & Quick Setup Ergonomics):
1. In `src/canvas/components/onboarding/onboarding_state.js`:
   - Implement and export `openOnboardingGuide()` which dispatches window custom event `"voo:open-onboarding"`.
   - In `shouldShowOnboarding()`: sanitize workspace path with `.trim()` (e.g. `const p = getSetting(ONBOARDING_WORKSPACE_PATH_KEY); return !isOnboardingCompleted() || !p || typeof p !== "string" || !p.trim();`). Retain the `navigator.webdriver` check to protect test runs.
2. In `src/canvas/components/onboarding/OnboardingGuide.jsx`:
   - Eliminate 1-frame draft restoration flash: initialize `stepIndex` synchronously using `useState(() => { const draft = loadDraft(); return typeof draft?.stepIndex === "number" && draft.stepIndex >= 0 && draft.stepIndex < steps.length ? draft.stepIndex : 0; })`.
   - Add `border border-white/10 shadow-panel` to modal container per `Design.md`.
   - Reset content scroll (`contentRef.current.scrollTop = 0`) on `stepIndex` changes.
3. In `src/canvas/components/onboarding/step_local_detect.jsx`:
   - Honest CLI diagnostics & failure guidance:
     - Consume `checkCliStatus()` properly:
       - `status === "ready"`: green ready badge, show `res.binPath`.
       - `status === "unauthenticated"`: amber/yellow badge "已检测到 CLI，但尚未登录认证", show `res.loginCmd` with copy button.
       - `status === "not_installed"`: warning badge "未检测到 CLI", show `res.installCmd` with copy button.
     - In Web mode: check loopback bridge status (`ensureLocalCliBridge`) or display clear failure guidance and command `npm run bridge` to start the local bridge.
4. In `src/app_title_bar.jsx`:
   - Add an accessible entry point button to reopen the onboarding guide (e.g. icon button with tooltip "配置向导" calling `openOnboardingGuide()`).
5. In `src/canvas/components/settings_general.jsx`:
   - Add an action card / button in general settings "重新打开配置向导" that calls `openOnboardingGuide()`.
6. In `tests/unit/onboarding_ergonomics_entry_points.test.js`:
   - Write comprehensive unit tests verifying `openOnboardingGuide()`, title bar trigger, settings trigger, CLI diagnostic state handling, whitespace path rejection, and draft restoration.
7. Run `npx vitest run tests/unit/onboarding_ergonomics_entry_points.test.js` and ensure 100% pass.
8. Write your 5-component handoff report to `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m2_onboarding/handoff.md` and notify parent via `send_message`.

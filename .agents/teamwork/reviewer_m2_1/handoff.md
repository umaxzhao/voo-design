# Review and Adversarial Handoff Report — Milestone 2: Onboarding Workspace Guide

## Review Summary

**Verdict**: REQUEST_CHANGES

The core Milestone 2 components (`step_workspace.jsx`, `OnboardingGuide.jsx`, `onboarding_state.js`, `step_ready.jsx`, and `settings_general.jsx`) implement high-quality, genuine dual-platform UI with zero design token violations, robust safe-skip default setting, and passing tests across the board. Furthermore, **no integrity violations** (no hardcoded outputs, fake tests, or dummy facades) were detected.

However, an **empirical integration defect** exists in the application root entry point (`src/App.jsx`): the newly implemented and exported heuristic trigger `shouldShowOnboarding()` was **never wired up to `src/App.jsx`**. Instead, `src/App.jsx` still initializes `onboardingOpen` with `!isOnboardingCompleted()`. As a result, existing users who completed agent onboarding (version 2.1.0) but have never set a workspace directory will **not** be prompted to configure their workspace on launch, directly violating Feature 9 and Acceptance Criterion R1. In addition, an edge case exists where `hasFsa` is unused in `step_workspace.jsx`, causing non-Chromium browsers to mislabel virtual storage as browser mounts.

---

## Findings

### [Major] Finding 1: Root Application Entrypoint Disconnected from `shouldShowOnboarding()`
- **What**: `src/App.jsx` initializes `onboardingOpen` state using `!isOnboardingCompleted()` instead of the new heuristic function `shouldShowOnboarding()`.
- **Where**: `src/App.jsx`, lines 9 and 19–25.
  ```javascript
  // Current in src/App.jsx:
  import { isOnboardingCompleted } from "./canvas/components/onboarding/onboarding_state.js";
  ...
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    try {
      return !isOnboardingCompleted();
    } catch {
      return false;
    }
  });
  ```
- **Why**: Feature 9 in `PROJECT.md` and R1 in `ORIGINAL_REQUEST.md` specify: "Trigger onboarding when `!isOnboardingCompleted()` OR `!getSetting("voo.workspace.path")`". The worker implemented this logic in `onboarding_state.js` as `shouldShowOnboarding()` and unit tested it, but forgot to import and use it in `src/App.jsx`. For any user with a pre-existing `voo.onboarding.completedVersion` in localStorage, `!isOnboardingCompleted()` evaluates to `false`, so the onboarding modal never opens on first launch of the updated app.
- **Suggestion**:
  In `src/App.jsx`:
  1. Replace `import { isOnboardingCompleted }` with `import { shouldShowOnboarding }` from `./canvas/components/onboarding/onboarding_state.js`.
  2. Change line 21 to `return shouldShowOnboarding();`.

### [Medium] Finding 2: Missing Re-entrancy / Double-Submission Guard on Guide Action Buttons
- **What**: Rapid multi-clicking on "稍后配置 (跳过)" or Step 4 "进入画布工作台" triggers redundant executions of `applyDefaultWorkspaceOnboarding()` / `persistOnboardingConfig()`, fires multiple `voo:workspace-changed` events, and triggers repeated `onClose()` calls.
- **Where**: `src/canvas/components/onboarding/OnboardingGuide.jsx`, lines 137–165.
- **Why**: In `voo-run`, submission buttons use `disabled={finishing || blocked}` backed by a `finishingRef` guard. In the current implementation, neither `handleSkip` nor `handleFinish` guards against re-entrancy.
- **Suggestion**: Add a `finishing` state or `useRef(false)` in `OnboardingGuide.jsx` to prevent multi-invocations during transition and set `disabled={finishing}` on buttons.

### [Minor] Finding 3: Unused `hasFsa` Variable in `step_workspace.jsx` & Non-Chromium Fallback Tagging
- **What**: Line 11 in `src/canvas/components/onboarding/step_workspace.jsx` computes `const hasFsa = WebFsaWorkspaceDriver.isAvailable();`, but `hasFsa` is never referenced in the component JSX.
- **Where**: `src/canvas/components/onboarding/step_workspace.jsx`, lines 11 and 225–272.
- **Why**: In non-Chromium browsers (Firefox, Safari) where `showDirectoryPicker` is absent, the user is still shown the "本地文件夹挂载 (File System Access) [浏览器挂载]" card. Clicking "选择本地文件夹授权..." delegates to `workspaceStorage.chooseDirectory()`, which falls back to `WebIdbWorkspaceDriver` and returns `Virtual Workspace`, but line 75 erroneously forces `type: "web-fsa"`, misrepresenting virtual storage as an active browser folder mount.
- **Suggestion**: If `!hasFsa`, disable the FSA authorization button or add a badge/hint indicating that browser folder mounting requires Chrome/Edge, directing users to the virtual workspace option.

---

## Adversarial Challenge & Stress-Testing

### Challenge Summary
**Overall risk assessment**: MEDIUM

### Challenges

#### Challenge 1: Upgraded Existing Users Never Guided to Set Up Workspace
- **Assumption challenged**: The app prompts users without a configured workspace to set one up on first launch.
- **Attack scenario**: An existing user has `voo.onboarding.completedVersion = "2.1.0"` in `localStorage` from a previous session. They load the updated application.
- **Blast radius**: High. `App.jsx` evaluates `!isOnboardingCompleted()` to `false`. The user is dumped straight into the workbench without ever configuring or confirming their workspace path.
- **Mitigation**: Wire `shouldShowOnboarding()` into `src/App.jsx`.

#### Challenge 2: Double-Submission on Modal Completion
- **Assumption challenged**: Closing or skipping onboarding is an idempotent, single-event operation.
- **Attack scenario**: User double-clicks "稍后配置 (跳过)" or "进入画布工作台" in rapid succession.
- **Blast radius**: Low/Medium. Two identical `voo:workspace-changed` events dispatch, re-triggering file watchers, scanning pipelines, and storage listeners twice.
- **Mitigation**: Add re-entrancy guard with a ref flag in `OnboardingGuide.jsx`.

#### Challenge 3: Non-Chromium Browser FSA Authorization Confusion
- **Assumption challenged**: Users in Safari/Firefox are guided cleanly to virtual workspace.
- **Attack scenario**: User visits on Safari, clicks "本地文件夹挂载 (File System Access)".
- **Blast radius**: Low. Virtual directory is mounted, but tagged with `[浏览器挂载]` instead of `[虚拟工作区]`.
- **Mitigation**: Check `hasFsa` to disable or conditionally style the FSA card.

### Stress Test Results
- Upgraded user with no workspace path -> `shouldShowOnboarding()` is `true`, but `App.jsx` initial state evaluates to `false` -> **FAIL** (Reproduced in `tests/unit/adversarial_onboarding_guide_challenge.test.js`).
- Rapid click on Skip / Finish -> fires 2 redundant custom events and 2 onClose callbacks -> **FAIL** (Documented in challenge tests).
- 4-step progress rendering and step transitions -> cleanly renders 4 steps and updates title/counter -> **PASS**.
- Skip safety on Electron (`~/Documents/VOO/Projects`) & Web (`Virtual Workspace`) -> **PASS**.
- Design token adherence (`npm run lint:design`) -> **PASS** (814 files clean).

---

## Verified Claims

- **4-Step Wizard Sequence**: Verified `ONBOARDING_STEPS` contains `[WORKSPACE_SETUP, AGENT_SELECT, LOCAL_DETECT, READY]` in `onboarding_state.js` and dynamic progress rendering in `OnboardingGuide.jsx` and `OnboardingStepProgress.jsx`. -> **PASS**
- **Dual-Platform Options**: Verified `StepWorkspace` renders macOS native card + default directory on Electron and Web FSA + IndexedDB virtual workspace on browser. -> **PASS**
- **Skip Button Safety**: Verified `applyDefaultWorkspaceOnboarding()` sets default workspace directory, writes `lastScannedAt`, defaults agent to Claude Code if unset, emits `voo:workspace-changed`, and marks onboarding complete. -> **PASS**
- **SettingsDrawer Integration**: Verified `<WorkspaceSettingsSection />` in `settings_general.jsx` renders active path, platform badge, and binds to `chooseDirectory`, `scanFiles`, `revealInFinder`, and listens to `voo:workspace-changed`. -> **PASS**
- **Automated Tests**:
  - `npx vitest run tests/unit/onboarding_workspace_guide.test.js`: 11 passed (11). -> **PASS**
  - `npx vitest run tests/unit/settings_workspace.test.js`: 8 passed (8). -> **PASS**
  - `npm test`: 77 test files passed (77), 977 tests passed (977), 0 failures. -> **PASS**
- **Design System Linter**: `npm run lint:design` verified clean across 814 files with 0 violations. -> **PASS**
- **Production Build**: `npm run build` cleanly compiled in 9.13s with zero bundling errors. -> **PASS**
- **Live Deployment**: `curl -s -I https://la.voo.run/editor/` returned HTTP 200 OK. -> **PASS**
- **Integrity Check**: Scanned all modified code and tests for hardcoded outputs, facade mocks, or shortcuts. Zero integrity violations found. -> **PASS**

---

## Coverage Gaps
- `src/App.jsx` onboarding state initialization not covered by unit tests until adversarial challenge was constructed. Risk level: HIGH. Recommendation: Worker must apply the 2-line fix to `src/App.jsx`.

---

## 5-Component Handoff Report

### 1. Observation
- `src/canvas/components/onboarding/step_workspace.jsx` (352 lines): Implements Step 1 with dual-platform cards, mint `#a7ffd4` indicators, and active status bar.
- `src/canvas/components/onboarding/OnboardingGuide.jsx` (293 lines): Implements 4-step wizard sequence, handles skip via `applyDefaultWorkspaceOnboarding()`, and finish via `persistOnboardingConfig()`.
- `src/canvas/components/onboarding/onboarding_state.js` (59 lines): Exports `GUIDE_STEP.WORKSPACE_SETUP`, `ONBOARDING_STEPS` (4 steps), `CURRENT_ONBOARDING_VERSION = "2.2.0"`, and `shouldShowOnboarding()`.
- `src/canvas/components/onboarding/step_ready.jsx` (114 lines): Displays confirmed workspace summary and agent card.
- `src/canvas/components/settings_general.jsx` (337 lines): Hosts `<WorkspaceSettingsSection />` with active path, badge, change directory, rescan, and reveal.
- `src/App.jsx`, lines 9 & 21: Still contains `import { isOnboardingCompleted }` and `return !isOnboardingCompleted();`.
- Verification commands executed:
  - `npx vitest run tests/unit/onboarding_workspace_guide.test.js`: 11 / 11 passed.
  - `npx vitest run tests/unit/settings_workspace.test.js`: 8 / 8 passed.
  - `npm run lint:design`: 814 files clean.
  - `npm test`: 77 suites, 977 tests passed.
  - `npm run build`: cleanly built in 9.13s.
  - `curl -s -I https://la.voo.run/editor/`: HTTP 200 OK.

### 2. Logic Chain
1. Milestone 2 Feature 9 specifies: "Trigger onboarding when `!isOnboardingCompleted()` OR `!getSetting("voo.workspace.path")`".
2. Worker created and tested `shouldShowOnboarding()` in `onboarding_state.js`, which encapsulates this exact logic.
3. However, `src/App.jsx` was not updated to use `shouldShowOnboarding()`, leaving `onboardingOpen` bound to `!isOnboardingCompleted()`.
4. As demonstrated in `tests/unit/adversarial_onboarding_guide_challenge.test.js` lines 169–190, any existing user who previously ran the app will have `voo.onboarding.completedVersion` set, causing `!isOnboardingCompleted()` to evaluate to `false`.
5. Therefore, the modal will not open for existing users who need to configure their workspace path, failing the end-to-end requirement.
6. A quick 2-line update to `src/App.jsx` resolves this defect completely.

### 3. Caveats
- Electron native directory dialogs and `revealInFinder` require the Electron main process runtime; they are mocked in Vitest unit tests via `window.electronAPI.workspace`.

### 4. Conclusion
- The Milestone 2 components are well-crafted, adhere strictly to VOO design tokens, and have zero integrity violations.
- However, because `src/App.jsx` is not wired up to `shouldShowOnboarding()`, the verdict is **REQUEST_CHANGES** so the worker can apply the 2-line fix in `src/App.jsx` (and optionally address the button re-entrancy and `hasFsa` edge cases) before moving forward.

### 5. Verification Method
1. `npx vitest run tests/unit/onboarding_workspace_guide.test.js`
2. `npx vitest run tests/unit/settings_workspace.test.js`
3. `npx vitest run tests/unit/adversarial_onboarding_guide_challenge.test.js`
4. Inspect `src/App.jsx` lines 9 & 21 to verify that `shouldShowOnboarding()` is imported and called.
5. `npm run lint:design`
6. `npm run build`

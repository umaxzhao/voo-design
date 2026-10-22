# Empirical Challenge Report — Milestone 2: Onboarding Workspace Guide Flow

**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

Direct empirical observations and code analysis conducted on `/Users/tt/teamwork_projects/voo_design`:

### 1.1 Critical Integration Bug in `src/App.jsx` Gating
- In `src/App.jsx` lines 19–25:
  ```javascript
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    try {
      return !isOnboardingCompleted();
    } catch {
      return false;
    }
  });
  ```
  `App.jsx` imports `isOnboardingCompleted` (line 9) and gates `onboardingOpen` strictly on `!isOnboardingCompleted()`.
- In `src/canvas/components/onboarding/onboarding_state.js` lines 45–47:
  ```javascript
  export function shouldShowOnboarding() {
    return !isOnboardingCompleted() || !getSetting(ONBOARDING_WORKSPACE_PATH_KEY);
  }
  ```
  `shouldShowOnboarding()` was created by worker_m2, but **never imported or used anywhere in `src/App.jsx`**.
- **Impact**: Any user who previously completed version 2.1.0 onboarding (or where `voo.onboarding.completedVersion` exists) but has `voo.workspace.path == null` will **never see the workspace onboarding guide**. `App.jsx` evaluates `!isOnboardingCompleted()` as `false`, silently hiding the guide modal on launch.

### 1.2 Lack of `finishingRef` and Anti-Double-Click Guard in `OnboardingGuide.jsx`
- In `src/canvas/components/onboarding/OnboardingGuide.jsx` lines 137–166:
  ```javascript
  const handleFinish = useCallback(() => {
    try {
      persistOnboardingConfig({
        agent: selectedAgent,
        workspaceConfig,
        isElectron,
      });
    } catch {
      // ignore
    }
    onClose?.();
  }, [selectedAgent, workspaceConfig, isElectron, onClose]);

  const handleSkip = useCallback(() => {
    try {
      applyDefaultWorkspaceOnboarding(isElectron, selectedAgent);
    } catch {
      // ignore
    }
    onClose?.();
  }, [isElectron, selectedAgent, onClose]);

  const handleNext = useCallback(() => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      handleFinish();
    }
  }, [stepIndex, steps.length, handleFinish]);
  ```
- Contrast with reference implementation in `/Volumes/TD/Projects/voo-run/src/canvas/components/onboarding/OnboardingGuide.jsx` lines 63–66, 120–121, 380:
  ```javascript
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);
  const finish = useCallback(async (persist) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    ...
  ```
  and on the submit button: `disabled={blocked || finishing}`.
- In `voo_design`, clicking "稍后配置 (跳过)" or "进入画布工作台" rapidly executes the handler twice, emitting multiple `"voo:workspace-changed"` events and invoking `onClose` multiple times.
- Rapid clicking on "下一步" during step transitions allows `stepIndex` to be incremented past `steps.length - 1` (to `stepIndex = 4`), yielding `steps[4] === undefined` and showing an out-of-bounds step counter `5 / 4`.

### 1.3 Missing Webdriver / CI Automated Bypass (`PROJECT.md` Feature 16)
- In `/Users/tt/teamwork_projects/voo_design/PROJECT.md` line 62:
  `| 16 | Automation CI Bypass | Bypass onboarding when navigator.webdriver === true to protect automated test suites | M2 | Survey Onboarding |`
- In `src/canvas/components/onboarding/onboarding_state.js` and `src/App.jsx`:
  Neither `shouldShowOnboarding()` nor `App.jsx` inspects `navigator?.webdriver`.
- When automated test suites (e.g. Playwright / Selenium / Puppeteer) run against the editor with `navigator.webdriver === true`, the onboarding modal launches unconditionally on clean profiles, covering the canvas and blocking interaction.

### 1.4 Missing In-Progress Draft Persistence Across Reload (`voo-run` Parity)
- Per the user requirement ("直接复刻voo-run的引导界面样式，简化流程") and reference `/Volumes/TD/Projects/voo-run/src/canvas/components/onboarding/OnboardingGuide.jsx` lines 71–109:
  Draft state is persisted in `sessionStorage.setItem("voo.onboarding.draft", JSON.stringify({ path, stepIndex, ... }))` and restored on modal mount.
- In `voo_design/src/canvas/components/onboarding/OnboardingGuide.jsx`, `sessionStorage` draft persistence is completely absent. On browser reload while on Step 2 or 3, the wizard restarts at Step 1 (`stepIndex = 0`), discarding user selections.

### 1.5 Corrupt / Whitespace Workspace Path Handling
- In `onboarding_state.js` line 46:
  `!getSetting(ONBOARDING_WORKSPACE_PATH_KEY)` checks falsiness. If `voo.workspace.path` contains whitespace only (`"   "`), it evaluates to `false`, causing `shouldShowOnboarding()` to return `false` as if a valid workspace path were set.
- In `OnboardingGuide.jsx` line 59 (`persistOnboardingConfig`), if `workspaceConfig.path` is empty or null, `persistOnboardingConfig` skips writing the path but still calls `markOnboardingCompleted()`, permanently leaving the user with an unconfigured path and locked out of the onboarding guide.

---

## 2. Logic Chain

1. **Premise 1**: Milestone 2 user requirement R1 states: "在用户首次打开应用（未配置工作区路径）时，展示优雅的新手引导界面，引导用户挑选或确认默认项目目录路径；配置完成后持久化保存，后续再次启动不再弹出引导".
   - *Observation*: `App.jsx` evaluates `!isOnboardingCompleted()` instead of `shouldShowOnboarding()`. If a user previously ran v2.1.0, `isOnboardingCompleted()` is `true`, so `onboardingOpen` is `false`. The workspace setup guide never opens for upgraded users who lack a workspace path.
2. **Premise 2**: Project architecture contract in `PROJECT.md` defines Feature 16: "Automation CI Bypass: Bypass onboarding when `navigator.webdriver === true` to protect automated test suites".
   - *Observation*: Zero references to `navigator.webdriver` exist in `onboarding_state.js`, `OnboardingGuide.jsx`, or `App.jsx`. Automated browsers with `navigator.webdriver === true` are blocked by the modal.
3. **Premise 3**: Anti-double-click protection and draft recovery are explicit requirements from the `voo-run` reference design (`OnboardingGuide.jsx` lines 66, 120, 71–109).
   - *Observation*: Rapid clicks fire multiple event dispatches, double `onClose` calls, and can increment `stepIndex` beyond bounds to 4 (`5 / 4`). Refreshing resets progress to step 0.
4. **Empirical Verification**: Written and executed 12 unit tests in `tests/unit/adversarial_onboarding_guide_challenge.test.js` validating all failure modes. All 12 tests passed, demonstrating reproducibility.

---

## 3. Caveats

- All tests were executed in the Node.js / Vitest test environment with polyfilled browser globals (`window`, `Element`, `CustomEvent`, `sessionStorage`, `navigator`).
- Backend Electron IPC drivers (`workspace_manager.cjs`) and unified storage engine (`workspace_storage.js`) from Milestone 1 remain healthy and functional.
- The issue is localized to `src/App.jsx`, `src/canvas/components/onboarding/OnboardingGuide.jsx`, and `src/canvas/components/onboarding/onboarding_state.js`.

---

## 4. Conclusion & Required Changes

**Verdict**: **REQUEST_CHANGES**

To satisfy Acceptance Criteria and Milestone 2 contracts, the following fixes are required:

1. **Update `src/App.jsx`**:
   - Import `shouldShowOnboarding` from `./canvas/components/onboarding/onboarding_state.js`.
   - Update `onboardingOpen` initial state:
     ```javascript
     const [onboardingOpen, setOnboardingOpen] = useState(() => {
       try {
         if (typeof navigator !== "undefined" && navigator.webdriver) return false;
         return shouldShowOnboarding();
       } catch {
         return false;
       }
     });
     ```
2. **Update `src/canvas/components/onboarding/onboarding_state.js`**:
   - Include `navigator.webdriver` bypass in `shouldShowOnboarding()`:
     ```javascript
     export function shouldShowOnboarding() {
       if (typeof navigator !== "undefined" && navigator.webdriver) return false;
       const path = getSetting(ONBOARDING_WORKSPACE_PATH_KEY);
       const hasValidPath = typeof path === "string" && path.trim().length > 0;
       return !isOnboardingCompleted() || !hasValidPath;
     }
     ```
3. **Update `src/canvas/components/onboarding/OnboardingGuide.jsx`**:
   - Add `finishingRef` and `finishing` state:
     - Wrap finish / skip in a re-entrancy guard: `if (finishingRef.current) return; finishingRef.current = true;`.
     - Disable the Next/Finish button while `finishing` (`disabled={finishing}`).
   - Clamp `stepIndex` to prevent boundary overflow:
     ```javascript
     const handleNext = useCallback(() => {
       setStepIndex((i) => {
         if (i < steps.length - 1) return i + 1;
         handleFinish();
         return i;
       });
     }, [steps.length, handleFinish]);
     ```
   - Add `sessionStorage` draft persistence for `stepIndex`, `selectedAgent`, and `workspaceConfig` across page reload. Clear draft on `handleFinish` and `handleSkip`.

---

## 5. Verification Method

To verify these empirical findings:
1. Run the dedicated adversarial challenge test suite:
   ```bash
   npx vitest run tests/unit/adversarial_onboarding_guide_challenge.test.js
   ```
2. Verify all 12 tests pass and demonstrate the empirical behavior:
   - Duplicate event dispatches on rapid skip/finish
   - `stepIndex` out-of-bounds simulation (5 / 4)
   - `App.jsx` gating mismatch (`appJsxInitialValue === false` while `shouldShowOnboarding() === true`)
   - `navigator.webdriver` lack of bypass in `shouldShowOnboarding()`
   - Lack of `sessionStorage` draft preservation
3. Inspect `src/App.jsx` lines 19–25 to confirm `shouldShowOnboarding` is absent.

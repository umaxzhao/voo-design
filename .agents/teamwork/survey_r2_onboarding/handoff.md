# Survey & Investigation Report: Requirement R2 (Refined Onboarding Guide & Quick Setup Ergonomics)

**Explorer**: `survey_r2_onboarding`  
**Parent Orchestrator**: `orchestrator_10` (`8189032a-2771-44e5-a68b-fb75d8c8aa02`)  
**Target Milestone**: R2 — Refined Onboarding Guide & Quick Setup Ergonomics  
**Date**: 2026-10-21T23:22:30Z  

---

## 1. Observation

### 1.1 Onboarding Guide Modal & Step Progression
- **File**: `src/canvas/components/onboarding/OnboardingGuide.jsx`
  - **Lines 13–16, 52–57**: Defines `STEP_TITLES` for 4 steps: `workspace_setup` ("选择工作区"), `agent_select` ("选择智能体"), `local_detect` ("检测 CLI"), `ready` ("准备就绪").
  - **Lines 116–122**: Component signature `OnboardingGuide({ open, onClose, steps = ONBOARDING_STEPS })`. Default step count is 4.
  - **Lines 118–123**: State initializes `stepIndex` as `0` (`useState(0)`), `selectedAgent` as `"claude"`.
  - **Lines 154–176**: Draft recovery in `useEffect`:
    ```javascript
    useEffect(() => {
      if (open) {
        ...
        const draft = loadDraft();
        if (draft) {
          if (typeof draft.stepIndex === "number" && draft.stepIndex >= 0 && draft.stepIndex < steps.length) {
            setStepIndex(draft.stepIndex);
          }
    ```
    *Observation*: `stepIndex` is initialized to `0` synchronously, then updated asynchronously in `useEffect`. On draft restoration, step 0 mounts for one render frame before snapping to `draft.stepIndex`, causing a visual step jump / flicker.
  - **Lines 264–270**:
    ```jsx
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-guide-title"
      data-testid="onboarding-guide-modal"
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70"
    >
      <div className="relative flex h-[min(656px,90dvh)] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-[#161616] lg:max-w-[960px] lg:flex-row">
    ```
    *Observation*: The modal container has `bg-[#161616]`, but is missing `border border-white/10` and `shadow-panel` (which is present in the `voo-run` reference implementation at `/Volumes/TD/Projects/voo-run/src/canvas/components/onboarding/OnboardingGuide.jsx` line 265 and mandated by `design/tokens.cjs` §1 & `Design.md` §0.1).
  - **Lines 310–312**: Content container lacks scroll-position reset on `stepIndex` change. If step 1 is scrolled, step 2 inherits that scroll offset.
  - **Lines 236–250**: `handleNext` clamps `stepIndex`: `setStepIndex((prev) => Math.min(prev + 1, steps.length - 1))`. `handlePrev` clamps: `setStepIndex((prev) => Math.max(0, prev - 1))`. Re-entrancy is guarded by `finishingRef`.

### 1.2 Mint Sliding Indicator (`#a7ffd4`)
- **File**: `src/canvas/components/onboarding/onboarding_step_progress.jsx`
  - **Lines 9–39**:
    ```jsx
    <span
      data-testid="onboarding-step-indicator"
      data-step-count={total}
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      className="relative flex shrink-0 items-center gap-1"
    >
      {steps.map((stepKey, idx) => (
        <span
          key={stepKey}
          className={`h-1 w-4 rounded-full transition-colors duration-300 ${
            idx < stepIndex ? "bg-white/25" : "bg-white/[0.08]"
          }`}
        />
      ))}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-1 w-4 rounded-full bg-[#a7ffd4] transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{
          transform: `translateX(calc(${stepIndex} * (1rem + 0.25rem)))`,
        }}
      />
    </span>
    ```
    *Observation*: Slot width is `1rem` (16px), slot gap is `0.25rem` (4px). Total step pitch is `1.25rem` (20px). The active mint pill (`bg-[#a7ffd4]`) translates via `translateX(calc(${stepIndex} * (1rem + 0.25rem)))` with `duration-300 ease-out` and respects `motion-reduce:transition-none`. Visual and accessibility semantics are compliant.

### 1.3 Local CLI Probe Diagnostics & Failure Guidance
- **File**: `electron/local_backend_bridge.js`
  - **Lines 13–46**: `CLI_DEFINITIONS` defines `claude`, `codex`, `antigravity`, `opencode` with `installCmd` (`npm install -g ...`), `loginCmd` (`claude`, `codex login`, `agy login`), `docsUrl`, `defaultModel`.
  - **Lines 94–143**: `findCliBinary` probes standard system and user path locations (`.nvm`, `.asdf`, `.local/bin`, `.cargo/bin`, Homebrew `/opt/homebrew/bin`, `/usr/local/bin`).
  - **Lines 148–213**: `checkCliAuth` tests credentials:
    - `claude`: `~/.claude/.credentials.json`, `~/.claude.json`, or `ANTHROPIC_API_KEY`.
    - `codex`: `~/.codex/auth.json` (key or tokens), or `OPENAI_API_KEY`/`CODEX_API_KEY`.
    - `antigravity`: `~/.gemini/antigravity-cli/auth.json`, `oauth_creds.json`, or `GEMINI_API_KEY`.
  - **Lines 218–280**: `checkCliStatus(cliId)` returns:
    ```javascript
    {
      status: "ready" | "not_installed" | "unauthenticated",
      installed: boolean,
      authenticated: boolean,
      ready: boolean,
      binPath: string | null,
      installCmd: string,
      loginCmd: string,
      reasonKey: string | null,
      reason: string | null
    }
    ```
  - **Lines 428–430**: Exposed via IPC channel `"voo:cli-status"`.
- **File**: `src/canvas/components/agent-panel/local_cli_bridge.js`
  - **Lines 162–204**: `ensureLocalCliBridge()` connects via desktop IPC or loopback WebSocket `ws://127.0.0.1:4179`.
  - **Lines 143–146**: Exposes `bridge.checkStatus(cliId, options)`.
- **File**: `src/canvas/components/onboarding/step_local_detect.jsx`
  - **Lines 17–44**:
    ```javascript
    const installCmd = INSTALL_COMMANDS[selectedAgent] || DEFAULT_INSTALL_COMMAND;
    const isDesktop = typeof window !== "undefined" && Boolean(window.vooDesktop?.localCli);
    ...
    const handleTestConnection = useCallback(async () => {
      setTesting(true);
      setTestResult(null);
      try {
        if (isDesktop && window.vooDesktop?.localCli?.checkStatus) {
          const res = await window.vooDesktop.localCli.checkStatus(selectedAgent);
          setTestResult({ ok: res?.installed ?? true });
        } else {
          await new Promise((resolve) => setTimeout(resolve, 600));
          setTestResult({ ok: true });
        }
      } catch {
        setTestResult({ ok: false });
      } finally {
        setTesting(false);
      }
    }, [isDesktop, selectedAgent]);
    ```
    *Observation*:
    1. In Web mode (`!isDesktop`), it never calls `ensureLocalCliBridge()`. It executes a 600ms dummy timeout and fakes `{ ok: true }`!
    2. In Desktop mode, `setTestResult({ ok: res?.installed ?? true })`:
       - If the CLI binary is installed but not logged in (`authenticated: false`), `res.installed` is `true`, so `ok` is `true`! The user is told "已检测到，可以使用", but running the agent will fail immediately with unauthenticated errors!
       - Ignores `res.status === "unauthenticated"`, ignores `res.loginCmd`, ignores `res.reason`, and ignores `res.binPath`.
       - Only displays `installCmd`. If the CLI is installed but not authenticated, the user is never shown `loginCmd` (e.g., `claude` or `codex login` or `agy login`) or the copy button for it.

### 1.4 Entry Points in Workbench, Title Bar & Settings
- **File**: `src/canvas/components/onboarding/onboarding_state.js`
  - **Lines 35–58**: Exports `isOnboardingCompleted()`, `shouldShowOnboarding()`, `markOnboardingCompleted()`, `resetOnboarding()`.
  - *Observation*: `openOnboardingGuide()` is **MISSING** from `onboarding_state.js`, despite being documented in `PROJECT.md` line 101 and `analysis/voo/features.jsonl` line 156.
- **File**: `src/App.jsx`
  - **Lines 19–25**: Synchronous initial state:
    ```javascript
    const [onboardingOpen, setOnboardingOpen] = useState(() => {
      try {
        return shouldShowOnboarding();
      } catch {
        return false;
      }
    });
    ```
  - **Lines 34, 74**: Listens to custom event `"voo:open-onboarding"`:
    ```javascript
    const handleOpenOnboarding = () => setOnboardingOpen(true);
    window.addEventListener("voo:open-onboarding", handleOpenOnboarding);
    ```
- **File**: `src/app_title_bar.jsx`
  - **Lines 71–132**: Contains `VooBrandLogo`, `APP_DISPLAY_NAME`, `CanvasTabBar`, "保存", "打开", and Settings `Bolt` button.
  - *Observation*: There is **NO** onboarding button or menu item to reopen the onboarding guide anywhere in `AppTitleBar`.
- **File**: `src/canvas/components/settings_general.jsx` & `src/canvas/components/settings_drawer.jsx`
  - **Lines 251–335** (`SettingsGeneral`): Contains `ProfileSection`, `WorkspaceSettingsSection`, `LanguageSection`.
  - *Observation*: There is **NO** section or button to reopen or run the onboarding guide from settings.

### 1.5 First-Time Launch Gating vs Returning Users
- **File**: `src/canvas/components/onboarding/onboarding_state.js`
  - **Lines 45–48**:
    ```javascript
    export function shouldShowOnboarding() {
      if (typeof navigator !== "undefined" && navigator.webdriver) return false;
      return !isOnboardingCompleted() || !getSetting(ONBOARDING_WORKSPACE_PATH_KEY);
    }
    ```
  - **File**: `src/shared/settings.js`
    - **Lines 53–70**: `getSetting(key)` reads from synchronous `cache.get(key)` or `readMirror(key)` (`localStorage.getItem(key)`).
    - Synchronous evaluation means `shouldShowOnboarding()` executes before DOM render without any async network fetch.
  - *Observation*:
    1. For returning users with completed onboarding and valid workspace path: `shouldShowOnboarding()` returns `false` synchronously. `<OnboardingGuide open={false} />` returns `null` on frame 0 with **zero layout flicker**.
    2. Automation CI protection: `navigator.webdriver` check immediately returns `false` to prevent automated browser tests from being trapped by modal overlays.
    3. **Edge Case Bug**: If `voo.workspace.path` is set to whitespace string (e.g. `"   "`), `!getSetting(...)` evaluates to `false` because `"   "` is a truthy non-empty string in JS. `shouldShowOnboarding()` returns `false` even though no valid workspace path exists.

### 1.6 Current Test Coverage & Gaps
- Existing test suites:
  - `tests/unit/onboarding_guide.test.jsx` (7 tests, all pass)
  - `tests/unit/onboarding_workspace_guide.test.js` (13 tests, all pass)
  - `tests/unit/adversarial_onboarding_guide_challenge.test.js` (12 tests, all pass)
  - `tests/unit/onboarding_agent_model.test.js` (3 tests, all pass)
- Command execution: `npx vitest run tests/unit/onboarding* tests/unit/adversarial_onboarding*` executes 35 tests in 677ms with 100% pass rate.
- Gaps identified:
  - No unit tests for `openOnboardingGuide()`.
  - No unit tests for title bar or settings button triggering `voo:open-onboarding`.
  - No unit tests for `step_local_detect.jsx` verifying honest diagnostics for `unauthenticated` (`status === "unauthenticated"` with `loginCmd`) and `not_installed` (`status === "not_installed"` with `installCmd`).
  - No unit tests verifying Web bridge probe vs fallback messaging in `step_local_detect.jsx`.
  - No unit tests for keyboard accessibility (Escape to dismiss, focus trap).
  - No unit tests verifying whitespace path rejection in `shouldShowOnboarding()`.

---

## 2. Logic Chain

1. **R2 Requirement Alignment**:
   - Requirement R2 mandates:
     - Polished 3-step / 4-step voo-run style onboarding guide modal with smooth step transitions.
     - Active progress displayed with mint sliding indicator `#a7ffd4`.
     - Instant CLI probe diagnostics (`local_backend_bridge.js`, `checkCliStatus`, install commands, copy-to-clipboard, retry).
     - Clear failure guidance when CLI is missing or unauthenticated.
     - Accessible entry points in app title bar and workbench settings to reopen the onboarding guide anytime.
     - First-time launch cleanly auto-opening without layout flicker, and returning users bypassing instantly.
2. **From Observation 1.1 to Modal Deficiencies**:
   - `OnboardingGuide.jsx` misses `border border-white/10` and `shadow-panel` required by `Design.md`.
   - `OnboardingGuide.jsx` restores `sessionStorage` draft in `useEffect`, producing a visible 1-frame jump from step 0 to draft step index. Initializing state via `useState(() => loadDraft()?.stepIndex ?? 0)` eliminates this jump entirely.
   - `OnboardingGuide.jsx` does not reset content scroll (`contentRef.current.scrollTop = 0`) when switching steps, violating UX ergonomics when a step has vertical scrolling.
3. **From Observation 1.3 to CLI Probe Flaw**:
   - In `step_local_detect.jsx`, checking `res?.installed ?? true` falsely marks unauthenticated tools as ready.
   - Users who have `claude` installed globally but have not run `claude` or logged in are shown a green "已检测到，可以使用" message. When they subsequently try to dispatch an AI action on the canvas, the CLI process exits with an authentication error.
   - Web mode fakes a 600ms delay and claims success without dialing `ensureLocalCliBridge()` on `ws://127.0.0.1:4179`.
   - By calling `resolveCliTransport()` / `ensureLocalCliBridge()` and handling `res.status`:
     - If `res.status === "ready"`: show green ready badge and `res.binPath`.
     - If `res.status === "unauthenticated"`: show yellow/amber warning "已安装但未登录", display `res.loginCmd`, and provide a copy button for the login command.
     - If `res.status === "not_installed"`: show red/gray warning "未检测到 CLI", display `res.installCmd`, and provide a copy button for the install command.
     - In browser mode without bridge: display honest status "Web 模式需运行本地桥接服务" with command `npm run bridge` to copy.
4. **From Observation 1.4 to Missing Entry Points**:
   - The user cannot reopen the onboarding wizard once completed because no UI buttons exist in `AppTitleBar.jsx`, `SettingsGeneral.jsx`, or `SettingsDrawer.jsx`.
   - Adding `openOnboardingGuide()` to `onboarding_state.js`, exposing a title bar button (icon `Sparkles` or `Compass` with tooltip "配置向导"), and adding an "重新打开配置向导" action in `SettingsGeneral` fulfills Requirement R2.
5. **From Observation 1.5 to Gating Robustness**:
   - Sanitizing `voo.workspace.path` with `.trim()` inside `shouldShowOnboarding()` ensures whitespace-only strings do not trick the app into bypassing workspace configuration.

---

## 3. Caveats & Gaps

1. **4-Step vs 3-Step Wizard**:
   - The original request mentioned a "3-step setup (Agent Select -> Local Detect -> Ready)", but the subsequent request added "首次启动新手引导与工作区目录初始化 (Onboarding Workspace Guide)", resulting in a 4-step flow: `[workspace_setup, agent_select, local_detect, ready]`.
   - Both flows are supported in the codebase (`ONBOARDING_STEPS` for 4-step, `GUIDE_STEPS` for 3-step). `OnboardingGuide` accepts `steps` prop. The default should remain `ONBOARDING_STEPS` so workspace configuration is not bypassed on first launch.
2. **Browser Environment vs Electron Shell**:
   - In browser environments without Electron, local CLI execution requires running `npm run bridge` (loopback WebSocket on port 4179). In pure web mode without bridge, local CLIs cannot be directly spawned. The onboarding UI must communicate this distinction without blocking the user from proceeding to the canvas.
3. **Modal Focus Trap**:
   - In static unit tests (`renderToStaticMarkup`), DOM portal and focus trap events (`keydown`, `createPortal`) are not evaluated. Full interactive behavior must be tested with simulated React testing library or dedicated interaction tests.

---

## 4. Conclusion & Concrete Implementation Plan

### 4.1 Summary Assessment
The onboarding subsystem is fundamentally sound in its state persistence and step progression architecture, with a working mint sliding indicator (`#a7ffd4`) and dual-mode workspace configuration. However, **4 critical gaps** must be addressed to fulfill Requirement R2:
1. **Missing Entry Points**: Implement `openOnboardingGuide()` in `onboarding_state.js`, add an entry button in `AppTitleBar.jsx`, and add a dedicated card with "重新打开配置向导" button in `SettingsGeneral.jsx`.
2. **Honest CLI Diagnostics & Failure Guidance**: Refactor `step_local_detect.jsx` to consume `checkCliStatus()` properly, distinguishing between `ready`, `unauthenticated`, and `not_installed`. Show `loginCmd` when unauthenticated, `installCmd` when not installed, and dial `ensureLocalCliBridge()` in Web mode.
3. **Flicker-Free Draft & Polished Modal UX**:
   - Initialize `stepIndex` in `OnboardingGuide.jsx` directly from `loadDraft()?.stepIndex` to eliminate the 1-frame draft restoration flash.
   - Add `border border-white/10 shadow-panel` to the modal container per `Design.md`.
   - Add `contentRef.current.scrollTop = 0` on step transitions.
   - Sanitize `voo.workspace.path` in `shouldShowOnboarding()` to reject whitespace-only paths.
4. **Comprehensive Test Coverage**: Add unit tests covering entry points, CLI diagnostic states, and keyboard/event handling.

---

### 4.2 Step-by-Step Implementation Recommendations for Workers

#### Task 1: Export `openOnboardingGuide` & Tighten Gating in `onboarding_state.js`
- **Target**: `src/canvas/components/onboarding/onboarding_state.js`
- **Actions**:
  1. Add `openOnboardingGuide`:
     ```javascript
     export function openOnboardingGuide() {
       if (typeof window !== "undefined") {
         window.dispatchEvent(new CustomEvent("voo:open-onboarding"));
       }
     }
     ```
  2. Update `shouldShowOnboarding`:
     ```javascript
     export function shouldShowOnboarding() {
       if (typeof navigator !== "undefined" && navigator.webdriver) return false;
       const path = getSetting(ONBOARDING_WORKSPACE_PATH_KEY);
       const hasValidPath = typeof path === "string" && path.trim().length > 0;
       return !isOnboardingCompleted() || !hasValidPath;
     }
     ```

#### Task 2: Add Entry Points in `AppTitleBar.jsx` and `SettingsGeneral.jsx`
- **Target 1**: `src/app_title_bar.jsx`
  - Import `openOnboardingGuide` from `./canvas/components/onboarding/onboarding_state.js`.
  - In the right-hand header action section (lines 90–132), add an accessible icon button:
    ```jsx
    <button
      type="button"
      data-testid="titlebar-onboarding-btn"
      aria-label="新手配置向导"
      title="快速配置向导 (Onboarding Guide)"
      onClick={openOnboardingGuide}
      className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white"
    >
      <Compass size={14} aria-hidden="true" />
    </button>
    ```
- **Target 2**: `src/canvas/components/settings_general.jsx`
  - In `SettingsGeneral()`, add an "引导向导" section:
    ```jsx
    <SettingsSection
      title={t("settings.onboarding.title") || "初始配置与向导"}
      hint={t("settings.onboarding.hint") || "随时重新运行配置向导，重新设定工作区存储与智能体 CLI 连接。"}
    >
      <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] p-3.5 border border-white/5">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-neutral-200">新手引导配置向导</span>
          <span className="text-[11px] text-neutral-400">重新运行工作区选择、CLI 连通性检测与智能体配置</span>
        </div>
        <button
          type="button"
          data-testid="settings-reopen-onboarding-btn"
          onClick={openOnboardingGuide}
          className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-white/[0.14] transition-colors"
        >
          重新打开向导
        </button>
      </div>
    </SettingsSection>
    ```

#### Task 3: Refine `step_local_detect.jsx` Diagnostics & Guidance
- **Target**: `src/canvas/components/onboarding/step_local_detect.jsx`
- **Actions**:
  1. Import `ensureLocalCliBridge`, `getLocalCliBridge` from `../agent-panel/local_cli_bridge.js`.
  2. Implement robust detection:
     ```javascript
     const handleTestConnection = useCallback(async () => {
       setTesting(true);
       setTestResult(null);
       try {
         const bridge = getLocalCliBridge() || (await ensureLocalCliBridge({ dial: true }));
         if (bridge?.checkStatus) {
           const res = await bridge.checkStatus(selectedAgent);
           setTestResult(res);
         } else if (typeof window !== "undefined" && window.vooDesktop?.localCli?.checkStatus) {
           const res = await window.vooDesktop.localCli.checkStatus(selectedAgent);
           setTestResult(res);
         } else {
           setTestResult({
             status: "web_unsupported",
             installed: false,
             authenticated: false,
             ready: false,
             reason: "Web 浏览器需启动本地 bridge 服务 (npm run bridge)",
           });
         }
       } catch (err) {
         setTestResult({
           status: "error",
           installed: false,
           authenticated: false,
           ready: false,
           reason: err?.message || "检测出错",
         });
       } finally {
         setTesting(false);
       }
     }, [selectedAgent]);
     ```
  3. Dynamic diagnostic display:
     - When `status === "ready"`: Mint badge, "已就绪，可直接执行", displaying `res.binPath`.
     - When `status === "unauthenticated"`: Amber badge, "已安装但未登录", displaying `res.loginCmd` with a dedicated copy button and hint.
     - When `status === "not_installed"`: Red/neutral badge, "未检测到 CLI", displaying `res.installCmd` with a copy button.
     - When `status === "web_unsupported"`: Informative badge with `npm run bridge` copy command.

#### Task 4: Polish `OnboardingGuide.jsx` (Flicker-Free, Design Tokens, Scroll Reset)
- **Target**: `src/canvas/components/onboarding/OnboardingGuide.jsx`
- **Actions**:
  1. Synchronous draft init in state:
     ```javascript
     const [stepIndex, setStepIndex] = useState(() => {
       const draft = loadDraft();
       if (draft && typeof draft.stepIndex === "number" && draft.stepIndex >= 0 && draft.stepIndex < steps.length) {
         return draft.stepIndex;
       }
       return 0;
     });
     ```
  2. Reset scroll position on step transition:
     ```javascript
     const contentRef = useRef(null);
     useEffect(() => {
       if (contentRef.current) contentRef.current.scrollTop = 0;
     }, [stepIndex]);
     ```
  3. Apply `Design.md` modal styling:
     Add `border border-white/10 shadow-panel` to the modal container div.
  4. Keyboard Escape handler to dismiss/skip cleanly.

#### Task 5: Expand Unit Tests in `tests/unit/`
- **Target**: `tests/unit/onboarding_guide.test.jsx` & `tests/unit/onboarding_workspace_guide.test.js`
- **Actions**:
  1. Add tests for `openOnboardingGuide()` dispatching `voo:open-onboarding`.
  2. Add tests for `AppTitleBar` rendering `data-testid="titlebar-onboarding-btn"` and clicking it.
  3. Add tests for `SettingsGeneral` rendering `data-testid="settings-reopen-onboarding-btn"` and clicking it.
  4. Add tests for `StepLocalDetect` rendering unauthenticated guidance (`loginCmd`), not installed guidance (`installCmd`), and ready state.
  5. Add test for `shouldShowOnboarding()` rejecting whitespace-only path string.

---

## 5. Verification Method

To independently verify the implementation:

1. **Unit Test Verification**:
   ```bash
   npx vitest run tests/unit/onboarding* tests/unit/adversarial_onboarding*
   ```
   *Expected Outcome*: All test suites pass 100% (expected 40+ tests across all 4 files with zero failures).

2. **Full Regression Suite**:
   ```bash
   npm test
   ```
   *Expected Outcome*: All repository unit and integration tests pass cleanly without regression.

3. **Design Token Linter**:
   ```bash
   node scripts/check-design.mjs src/canvas/components/onboarding/* src/app_title_bar.jsx src/canvas/components/settings_general.jsx
   ```
   *Expected Outcome*: `design: clean` with 0 violations.

4. **Production Build Validation**:
   ```bash
   npm run build
   ```
   *Expected Outcome*: Vite bundles successfully without broken imports or syntax errors.

5. **Deployment Gate** (per user instructions):
   ```bash
   VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh
   ```
   *Expected Outcome*: Deployment to `103.114.160.86` succeeds and remote probe `https://la.voo.run/editor/` returns HTTP 200 OK.

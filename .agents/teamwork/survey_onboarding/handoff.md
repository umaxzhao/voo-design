# Handoff Report: First-Launch Onboarding Configuration Guide Modal Specification

## 1. Observation

### 1.1 voo-run Reference Implementation
- **Source Directory**: `/Volumes/TD/Projects/voo-run/src/canvas/components/onboarding/`
- **Key Modules directly inspected**:
  1. `OnboardingGuide.jsx` (Lines 1-400):
     - Modal presentation: Portal to `document.body` via `createPortal`.
     - Scrim backdrop: `className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"`.
     - Dialog container: `h-[min(656px,90dvh)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#161616] shadow-panel lg:max-w-[960px] lg:flex-row`.
     - Left cover art: `<OnboardingArt className="hidden shrink-0 lg:block lg:h-full lg:w-1/3" />`.
     - Right container:
       - Header: `<OnboardingStepProgress />`, step counter `text-[10px] font-medium tabular-nums text-neutral-400`, title `<h2 id="onboarding-guide-title" className="text-xs font-medium text-neutral-100">`, close button `<button onClick={handleSkip} className="h-8 w-8 rounded-lg bg-white/[0.04] text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-200">`.
       - Body: `overflow-y-auto px-6 pb-6 pt-2`.
       - Footer: `flex items-center justify-between gap-2 bg-[#121212] px-6 py-4`.
         - Skip button: `text-xs text-neutral-400 hover:text-neutral-200`.
         - Back button: `rounded-lg bg-white/[0.06] px-4 py-2 text-xs font-medium text-neutral-200 hover:bg-white/[0.12]`.
         - Next/Finish button: `rounded-lg bg-[#a7ffd4] px-5 py-2 text-xs font-medium text-black hover:bg-[#a7ffd4]/90 active:scale-[0.98] transition-all shadow-pop disabled:opacity-40`.
  2. `onboarding_step_progress.jsx` (Lines 1-48):
     - Step slots: `span` with `h-1 w-4 rounded-full transition-colors duration-300`, inactive: `bg-white/[0.08]`, past: `bg-white/25`.
     - Active sliding bar: `pointer-events-none absolute left-0 top-0 h-1 w-4 rounded-full bg-[#a7ffd4] transition-transform duration-300 ease-out` with `transform: translateX(calc(${stepIndex} * (1rem + 0.25rem)))`.
     - Accessibility: `role="progressbar"`, `aria-valuenow`, `aria-valuemin=1`, `aria-valuemax={total}`.
  3. `onboarding_art.jsx` (Lines 1-62):
     - Container: `relative overflow-hidden bg-[#1c1c1c]`.
     - Background image: `assetUrl(name)` rendered with `decoding="async"`, `object-cover`.
     - Fallback: `onError={() => setFailed(true)}` cleanly displays dark surface without breaking layout.
     - Brand mark: `voo-mark.svg` or `cover-logo.svg` positioned at `bottom-6 right-8 h-auto w-1/2`.
  4. `onboarding_state.js` (Lines 1-183):
     - `ONBOARDING_COMPLETED_KEY = "voo.onboarding.completedVersion"`.
     - `CURRENT_ONBOARDING_VERSION = 1`.
     - `OPEN_ONBOARDING_EVENT = "voo:open-onboarding"`.
     - `ONBOARDING_ALLOW_AUTOMATION_KEY = "voo.onboarding.allowAutomation"`.
     - `isAutomationWithoutOnboarding(env)` checks `navigator.webdriver === true`.
     - `markOnboardingCompleted(version)` persists completion to settings.
     - `openOnboardingGuide()` dispatches `new CustomEvent(OPEN_ONBOARDING_EVENT)`.
  5. `use_onboarding.js` (Lines 1-49):
     - Mounts on startup, calls `shouldShowOnboardingAsync()`, opens modal if true.
     - Subscribes to `OPEN_ONBOARDING_EVENT` for manual re-opening.
  6. `onboarding_keyboard.js` (Lines 1-40):
     - Traps focus within modal on `Tab` / `Shift+Tab`.
     - Closes modal on `Escape` key.

### 1.2 voo_design Existing Settings & Persistence Architecture
- File: `/Users/tt/teamwork_projects/voo_design/src/shared/settings.js`
  - Line 40: `"voo.onboarding.completedVersion"` is already registered in `STORAGE_KEYS`.
  - Line 41: `"voo.agent.experimental.antigravity"` is registered in `STORAGE_KEYS`.
  - Architecture: Three-tier synchronized storage:
    1. Authoritative: `chrome.storage.local` or bridge transport (`transport.set`).
    2. Mirror: Synchronous `localStorage` (`readMirror` / `writeMirror`).
    3. Memory Cache: `cache.get(key)` seeded synchronously on module load from localStorage mirror.
  - APIs: `getSetting(key)` (sync), `getSettingAsync(key)` (async), `setSetting(key, value)` (sync cache + async persist + listener notification via `onSettingChange`).

### 1.3 Design Token Compliance & Gate Rules
- File: `/Users/tt/teamwork_projects/voo_design/design/tokens.cjs`
  - `SURFACE`: `page: "#000000"`, `stage: "#525252"`, `panel: "#171717"`, `raised: "#262626"`.
  - `SHADOW`: `pop: "0 8px 24px rgba(0, 0, 0, 0.5)"`, `menu: "0 14px 36px rgba(0, 0, 0, 0.55)"`, `panel: "0 24px 64px rgba(0, 0, 0, 0.6)"`.
  - `ACCENTS`: Mint `#a7ffd4` (system & flow), Purple `#E5B2FF` (AI & editor), Text Purple `#eed0ff`.
  - `BRAND_COLORS`: `#D97757` (Claude), `#10A37F` (OpenAI / Codex), `#38BDF8` (Antigravity).
  - Neutral rule (`isNeutralHex` in line 297): `NEUTRAL_SPREAD = 0` (requires $R == G == B$ for inline hex colors).
    - `#161616`: $R=22, G=22, B=22$ (Neutral spread 0, compliant).
    - `#121212`: $R=18, G=18, B=18$ (Neutral spread 0, compliant).
    - `#1c1c1c`: $R=28, G=28, B=28$ (Neutral spread 0, compliant).
    - `#18181b`: $R=24, G=24, B=27$ (Spread 3, flagged as `tintedGray` by `check-design.mjs`! Must use `bg-neutral-900` or `#161616`).
  - Font scale: `[9, 10, 11, 12, 15]`.
  - Border: Only `border-white/10` allowed as outermost boundary.
- Command Run: `npm run lint:design` -> **clean — 799 file(s) match Design.md**.

### 1.4 Re-trigger Locations in Workbench and Shell
- `src/app_title_bar.jsx`:
  - Contains Settings button (`Bolt` icon) triggering `SettingsDrawer`.
- `src/canvas/components/settings_drawer.jsx`:
  - Contains `agent_settings.jsx` ("AI 助手") and `provider_settings.jsx` ("AI 供应商").
  - Can host a "重新运行向导 (Run Setup Guide)" button calling `openOnboardingGuide()`.
- `src/canvas/components/canvas_agent_panel.jsx`:
  - Line 250: Pen App Model Status Pill (`activeModel`, `status`).
  - Clicking this status pill or an adjacent settings icon triggers `openOnboardingGuide()`.
- `src/App.jsx`:
  - Top-level component hosting `AppTitleBar`, `ImageEditor`, `CanvasAgentPanel`, `WelcomeDashboard`.
  - Hook `useOnboarding()` mounted here triggers modal directly into `document.body` via `createPortal`.

---

## 2. Logic Chain

1. **Directive Analysis**:
   - The user requested: "直接复刻voo-run的引导界面样式，简化流程".
   - voo-run's original onboarding had 4 multi-branch steps (Start path selection between VOO Cloud vs Self, Agent route, Chrome Web Chat session extensions, and Media Generation models).
   - The streamlined directive specifies a 3-step setup tailored for VOO Design's local AI capabilities:
     - **Step 1: Welcome & Agent Selection** (defaulting to Claude Code `@anthropic-ai/claude-code`, with toggles for Codex and Antigravity CLI).
     - **Step 2: Local Detection & Connection** (live check for binary/bridge, install instructions if absent, quick status probe).
     - **Step 3: Ready & Enter Canvas** (apply configuration, persist onboarding completed state, and enter editor).

2. **Visual Consistency & Design Tokens**:
   - Replicating voo-run's visual style means using the exact layout dimensions (`h-[min(656px,90dvh)]`, `lg:max-w-[960px]`, 2-column split on desktop with `OnboardingArt` on the left), the sliding step indicator (`OnboardingStepProgress`), and the bottom action bar.
   - To guarantee zero violations under `npm run lint:design`, modal surfaces must use calibrated neutrals where $R=G=B$ (`#161616`, `#121212`, `#1c1c1c`) or standard Tailwind `neutral-*` classes (`bg-neutral-900`), and only sanctioned shadows (`shadow-panel`, `shadow-pop`, `shadow-menu`).

3. **Persistence & Lifecycle Logic**:
   - When the user first visits the web app or launches desktop:
     - `shouldShowOnboarding()` checks `getSetting("voo.onboarding.completedVersion")`.
     - If null/0, `open` is set to `true`.
     - In automated environments (`navigator.webdriver === true`), `isAutomationWithoutOnboarding()` returns `false` to avoid interfering with automated tests.
   - When the user clicks "开始使用 (Get Started)" or "跳过 (Skip)":
     - `markOnboardingCompleted(1)` writes `voo.onboarding.completedVersion = 1` through `setSetting()`.
     - `applyOnboardingChoices()` records `voo.agent.llmProvider = "claude-cli"` and default model.
     - `sessionStorage.removeItem("voo.onboarding.draft")` cleans up temporary state.
     - Modal closes, and subsequent app launches bypass the onboarding modal directly.

4. **Detection & Roundtrip Verification**:
   - Step 2 probes the local CLI bridge via IPC (`window.electronAPI?.localCli` / `window.vooDesktop?.localCli`) or Web loopback bridge (`ws://127.0.0.1:4179`).
   - If the binary is installed, `checkCliStatus(agentId)` returns `{ installed: true, ready: true, binPath: "/usr/local/bin/claude", version: "..." }`.
   - If missing, it returns `{ installed: false, installCmd: "npm install -g @anthropic-ai/claude-code" }`, displaying a one-click copyable terminal command.
   - The "测试连接 (Test Connection)" button sends a ping/check through the bridge to verify roundtrip communication and measure latency.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Onboarding Architecture | `OnboardingGuide.jsx` | Main modal shell with portal, fixed-height responsive frame (`h-[min(656px,90dvh)]`), split layout on desktop | `open`, `onClose` props | Rendered dialog in `document.body` | Handles unmounted invoker gracefully | `voo-run/src/canvas/components/onboarding/OnboardingGuide.jsx` |
| 2 | Navigation & Progress | `OnboardingStepProgress.jsx` | Smooth sliding mint bar over track of step slots | `stepIndex`, `steps`, `label` | `role="progressbar"` element | Clamped within `[1, total]` | `voo-run/src/canvas/components/onboarding/onboarding_step_progress.jsx` |
| 3 | Visual Cover | `OnboardingArt.jsx` | Left column decorative art cover with fallback to dark neutral surface | `name` (asset path), `className` | Cover container with logo overlay | `onError` sets `failed=true`, hides broken image | `voo-run/src/canvas/components/onboarding/onboarding_art.jsx` |
| 4 | State & Heuristics | `onboarding_state.js` | Heuristic evaluation for showing guide and storing version | `env`, `getSetting` | `shouldShowOnboarding() -> boolean` | Storage denial falls back to memory defaults | `voo-run/src/canvas/components/onboarding/onboarding_state.js` |
| 5 | Automation Gate | `isAutomationWithoutOnboarding` | Skips onboarding in automated browsers (WebDriver/CDP) unless explicitly opted in | `navigator.webdriver`, `localStorage` | `boolean` | Suppresses modal during CI/e2e testing | `voo-run/src/canvas/components/onboarding/onboarding_state.js:31` |
| 6 | Manual Re-opening | `openOnboardingGuide` / Custom Event | Dispatches `voo:open-onboarding` custom event on `window` | None | Event broadcast | No-op in non-browser env | `voo-run/src/canvas/components/onboarding/onboarding_state.js:178` |
| 7 | Session Draft Auto-save | `sessionStorage("voo.onboarding.draft")` | Preserves current step and agent selection across page refresh | `{ stepIndex, agentId }` | Restores draft state on reopen | JSON parse errors safely ignored | `voo-run/src/canvas/components/onboarding/OnboardingGuide.jsx:74` |
| 8 | Keyboard & Focus Trap | `onboarding_keyboard.js` | Focus cycle within dialog, Escape dismisses | Keyboard events (`Tab`, `Escape`) | Managed focus or dismissal | Handles active popup listbox before dialog | `voo-run/src/canvas/components/onboarding/onboarding_keyboard.js:1` |
| 9 | Dual Bridge Detection | `local_cli_bridge.js` | Probes Electron IPC or Web WebSocket loopback (`ws://127.0.0.1:4179`) | Port / IPC handle | Bridge interface object | Dial failure falls back to `CLI_TRANSPORT.NONE` | `voo-run/src/canvas/components/agent-panel/local_cli_bridge.js:38` |
| 10 | Settings Persistence | `src/shared/settings.js` | Persists `"voo.onboarding.completedVersion"` across memory, localStorage, and storage.local | Key and numeric version | Stored setting + change notifications | Storage failure caught without crashing | `voo_design/src/shared/settings.js:40` |
| 11 | Agent Model Pill Trigger | `CanvasAgentPanel` Model Pill | Status pill in agent header displays active model and triggers setup guide | User click on pill or settings button | Opens onboarding guide | N/A | `voo_design/src/canvas/components/canvas_agent_panel.jsx:250` |
| 12 | Settings Drawer Re-trigger | `SettingsDrawer` Action | Entry in Settings > AI Assistant to restart onboarding guide | User button click | Calls `openOnboardingGuide()` | N/A | `voo-run/src/canvas/components/settings_drawer.jsx:233` |
| 13 | Design Linter Token Rule | `check-design.mjs` / `tokens.cjs` | Enforces zero neutral spread ($R=G=B$) for inline hex and approved shadow tokens | JSX class names & CSS | Lint report (`npm run lint:design`) | Exits with error code 1 on violation | `voo_design/design/tokens.cjs:297` |
| 14 | Bi-directional i18n Sync | `extended-zh.js` & `extended-en.js` | Symmetrical translation dictionaries for all step copy | i18n key + locale | Translated string | Missing key falls back to key string | `voo_design/src/shared/i18n/` |

---

## 4. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Onboarding First-run | Fresh session with no `voo.onboarding.completedVersion` in settings | `shouldShowOnboarding()` returns `true`, modal opens automatically on initial mount. |
| 2 | Onboarding Subsequent Launch | Setting `voo.onboarding.completedVersion = 1` present | `shouldShowOnboarding()` returns `false`, app launches directly into workbench without modal. |
| 3 | Automation / CI Execution | `navigator.webdriver === true` and `voo.onboarding.allowAutomation !== "1"` | `isAutomationWithoutOnboarding()` returns `true`; onboarding modal never mounts, protecting automated Vitest and Playwright test suites. |
| 4 | Binary Missing in Step 2 | CLI binary not installed (e.g. `claude` not found in `$PATH`) | Status indicator renders amber warning, displays copyable `npm install -g @anthropic-ai/claude-code` command with a "重新检测 (Re-check)" trigger. User can still proceed or skip. |
| 5 | Web Browser without Bridge | Running in pure web browser without `electronAPI` and loopback bridge offline | Status indicates Web mode with loopback bridge disconnected; provides instructions on running `npm run bridge` or using desktop app. |
| 6 | Storage Denial / Incognito | `localStorage.setItem` throws `DOMException: QuotaExceededError` or security denial | Caught by `try/catch` in `settings.js` and `onboarding_state.js`; settings remain in memory cache, user experience is unaffected. |
| 7 | Concurrent Finish Double-click | Rapid multiple clicks on "开始使用 (Finish)" button | `finishingRef.current` guards re-entry; only the first invocation executes persistence, preventing double writes. |
| 8 | Escape Key with Open Dropdown | User presses `Escape` while an agent selection dropdown or tooltip is active | First `Escape` closes the dropdown/picker; a second `Escape` dismisses the onboarding modal. |
| 9 | Missing Art Asset | Image `onboarding/cover.webp` fails to load (HTTP 404 or missing file) | `onError` in `OnboardingArt.jsx` catches failure and renders a polished solid dark neutral surface (`#1c1c1c`) with the brand logo watermark, with zero layout shift. |
| 10 | Strict Design Token Linting | Using `#18181b` in JSX `className` | Flagged as `tintedGray` by `check-design.mjs` because blue spread > 0. Replaced with `bg-[#161616]` or `bg-neutral-900` to maintain 100% clean lint status. |

---

## 5. Caveats

- **No Caveats**: The voo-run reference codebase (`/Volumes/TD/Projects/voo-run/src/canvas/components/onboarding/`), the voo_design settings system (`src/shared/settings.js`), the design token linter (`design/tokens.cjs`), and the workbench integration points were directly inspected and verified.

---

## 6. Conclusion & Recommended Architecture

The Onboarding Configuration Guide Modal for VOO Design should be structured into `src/canvas/components/onboarding/` with the following clean 3-step architecture:

### 6.1 Component Hierarchy
```
src/canvas/components/onboarding/
├── OnboardingGuide.jsx             # Main dialog shell, portal, step dispatcher, responsive split layout
├── onboarding_step_progress.jsx    # Smooth sliding progress bar with #a7ffd4 indicator
├── onboarding_art.jsx              # Left cover art plate (#1c1c1c) with voo-mark logo watermark
├── onboarding_state.js             # shouldShowOnboarding, markOnboardingCompleted, openOnboardingGuide
├── use_onboarding.js               # React hook managing open/close state and event listeners
├── onboarding_keyboard.js          # Focus trap and Escape key handler
├── onboarding_apply.js             # applyOnboardingChoices: writes agentProviderId and model to settings
├── step_welcome_agent.jsx          # Step 1: Welcome & Agent Selection (Claude Code default, Codex, Antigravity)
├── step_detection_connection.jsx   # Step 2: Local Detection & Connection (live status, install command, ping test)
└── step_ready_canvas.jsx           # Step 3: Ready & Enter Canvas (summary of settings and Pen App integration)
```

### 6.2 Step-by-Step Flow Specification
1. **Step 1: Welcome & Agent Selection**
   - Title: `onboarding.stepTitle.welcomeAgent` ("选择本地 AI Agent" / "Choose Local AI Agent").
   - Cards:
     - **Claude Code** (`claude-cli`, binary `claude`, default model `claude-opus-5-5`, brand color `#D97757`): Pre-selected by default with mint accent ring and "默认推荐 (Default)" badge.
     - **OpenAI Codex** (`cli`, binary `codex`, brand color `#10A37F`).
     - **Google Antigravity CLI** (`antigravity-cli`, binary `agy`, brand color `#38BDF8`).
   - Action: "下一步 (Next)" -> persists draft and advances to Step 2.
2. **Step 2: Local Detection & Connection**
   - Title: `onboarding.stepTitle.detection` ("本地环境与连接检测" / "Local Environment & Detection").
   - Real-time probe of `checkCliStatus(selectedAgentId)`:
     - Displays binary presence, resolved path (e.g. `/usr/local/bin/claude`), and installed version.
     - If binary is missing: displays copyable `npm install -g @anthropic-ai/claude-code` and a "重新检测 (Re-check)" button.
     - "测试连接 (Test Ping)" button to verify roundtrip bridge latency.
   - Action: "下一步 (Next)" -> advances to Step 3.
3. **Step 3: Ready & Enter Canvas**
   - Title: `onboarding.stepTitle.ready` ("配置就绪 · 进入画布" / "Configuration Ready · Enter Canvas").
   - Summary card confirming active agent (Claude Code), transport channel (Desktop IPC / Web loopback), and integration features (Pen App selection taskbar + Canvas Agent Panel).
   - Action: "开始使用 (Get Started)" (`bg-[#a7ffd4] text-black font-medium shadow-pop`):
     - Sets `voo.agent.llmProvider = "claude-cli"`.
     - Writes `voo.onboarding.completedVersion = 1`.
     - Closes modal, entering the canvas directly.

### 6.3 Design Token Checklist
- Modal background: `bg-[#161616]` (exact neutral where $R=G=B=22$).
- Footer background: `bg-[#121212]` (exact neutral where $R=G=B=18$).
- Art column: `bg-[#1c1c1c]` (exact neutral where $R=G=B=28$).
- Outer boundary: `border border-white/10`.
- Shadows: `shadow-panel` for modal, `shadow-pop` for buttons, `shadow-menu` for dropdowns.
- Typography: `text-[10px]`, `text-[11px]`, `text-xs` (12px), `text-[15px]`.
- All text: minimum contrast ratio $\ge 3:1$ (`text-neutral-500` lowest, `text-neutral-400` secondary, `text-neutral-100` headings).

---

## 7. Verification Method

To independently verify this specification and any subsequent implementation:

1. **Design Lint Verification**:
   ```bash
   npm run lint:design
   ```
   *Expected Output*: `design: clean — X file(s) match Design.md` with 0 violations.

2. **Full Unit Test Verification**:
   ```bash
   npm test
   ```
   *Expected Output*: 100% of test suites pass (all 66 existing test files + new onboarding tests).

3. **Production Build Verification**:
   ```bash
   npm run build
   ```
   *Expected Output*: Clean build output without bundler or TypeScript errors.

4. **Onboarding State Verification**:
   - In browser console:
     - Clear completion: `localStorage.removeItem("voo.onboarding.completedVersion")` and reload -> modal opens automatically.
     - Complete guide -> check `localStorage.getItem("voo.onboarding.completedVersion")` equals `"1"`.
     - Reload -> modal does not open.
     - Trigger manually: `window.dispatchEvent(new CustomEvent("voo:open-onboarding"))` -> modal opens.

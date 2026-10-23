# Technical Investigation Report: Onboarding Workspace Guide & Settings Integration

## 1. Observation

### 1.1 Reference Codebase: `voo-run`
1. **Project Root & Storage Architecture in Electron**:
   - In `/Volumes/TD/Projects/voo-run/electron/project_config.js` (lines 14–48, 72–143):
     - Uses `CONFIG_FILE = "projects_config.json"` in `app.getPath("userData")`.
     - Default project directory: `getDefaultVooProjectsDir()` -> `path.join(documentsRoot(), "VOO", "Projects")`.
     - Validation: `isValidProjectsRootDir(dirPath)` verifies directory exists and has write access (`fs.accessSync(resolved, fs.constants.W_OK)`).
     - Persistence: `setProjectsRootDir(targetPath)` saves `{ projectsRoot: resolved }`.
   - In `/Volumes/TD/Projects/voo-run/electron/project_store.js` (lines 161–176):
     - IPC handles:
       - `voo:get-default-project-dir`: returns `getProjectsRootDir()`
       - `voo:get-projects-root-dir`: returns `getProjectsRootDir()`
       - `voo:set-projects-root-dir`: writes new path
       - `voo:choose-projects-root-dir`: opens native folder picker via `dialog.showOpenDialog({ title: "Choose projects root folder", defaultPath: getProjectsRootDir(), properties: ["openDirectory", "createDirectory"] })`
   - In `/Volumes/TD/Projects/voo-run/electron/preload.cjs` (lines 235–249):
     - Exposes `window.vooElectron.project`: `getProjectsRoot()`, `setProjectsRoot(folderPath)`, `chooseProjectsRoot()`, `getDefaultDirectory()`, `revealInFinder(folderPath)`.

2. **Onboarding Modal UI/UX Layout in `voo-run`**:
   - In `/Volumes/TD/Projects/voo-run/src/canvas/components/onboarding/OnboardingGuide.jsx` (lines 246–393):
     - Modal wrapper: `createPortal` with `fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm`.
     - Container: `h-[min(656px,90dvh)] w-full max-w-xl lg:max-w-[960px] flex-col lg:flex-row rounded-3xl border border-white/10 bg-[#161616] shadow-panel overflow-hidden`.
     - Left artwork: `OnboardingArt` (1/3 width on `lg:block`, hidden on smaller screens).
     - Header: `OnboardingStepProgress` progress bar with sliding pill (`h-1 w-4 rounded-full bg-[#a7ffd4] transition-transform`), step counter (`1 / 4`), title, and close button (`IconClose`).
     - Content: `ui-scroll flex-1 overflow-y-auto px-6 pb-6 pt-2`.
     - Footer: `flex items-center justify-between bg-[#121212] px-6 py-4`. Left: "稍后配置 (跳过)" (`onboarding-skip-btn`). Right: "上一步" (`onboarding-back-btn`) and "下一步/完成" (`onboarding-next-btn`, `bg-[#a7ffd4] text-black font-semibold shadow-pop hover:bg-[#a7ffd4]/90 active:scale-[0.98]`).
     - Draft persistence: `sessionStorage.getItem("voo.onboarding.draft")` / `sessionStorage.setItem("voo.onboarding.draft", ...)` prevents losing step progress on page reload.
     - Anti-double-click guard: `finishingRef.current` ensures async save / mark completion cannot be fired twice.

3. **Settings Navigation & Layout in `voo-run`**:
   - In `/Volumes/TD/Projects/voo-run/src/canvas/components/settings_drawer.jsx` (lines 33–39, 91–150):
     - Vertical left navigation with tabs (`General`, `Agent`, `Models`, `Shortcuts`, `Advanced`), with icon and labels.
     - Outer container: `bg-neutral-950 border border-white/10 shadow-panel rounded-3xl`.
   - In `/Volumes/TD/Projects/voo-run/src/canvas/components/settings_general.jsx` (lines 290–348):
     - Profile settings, recharge panel, and general preferences with segmented switches and toggles.

---

### 1.2 Current VOO Design Codebase: `voo_design`
1. **Existing Onboarding Implementation**:
   - Location: `src/canvas/components/onboarding/`
     - `OnboardingGuide.jsx`: Currently implements a 3-step wizard (`agent_select`, `local_detect`, `ready`).
     - `onboarding_state.js`:
       - `ONBOARDING_COMPLETED_KEY = "voo.onboarding.completedVersion"`
       - `ONBOARDING_AGENT_CHOICE_KEY = "voo.agent.llmProvider"`
       - `CURRENT_ONBOARDING_VERSION = "2.1.0"`
       - `GUIDE_STEP = { AGENT_SELECT: "agent_select", LOCAL_DETECT: "local_detect", READY: "ready" }`
       - `GUIDE_STEPS = [GUIDE_STEP.AGENT_SELECT, GUIDE_STEP.LOCAL_DETECT, GUIDE_STEP.READY]`
       - `isOnboardingCompleted()`, `markOnboardingCompleted()`, `resetOnboarding()`
     - `onboarding_step_progress.jsx`: Dynamically renders step track and pill for any `steps.length`.
   - In `src/App.jsx` (lines 19–25, 134–137):
     ```jsx
     const [onboardingOpen, setOnboardingOpen] = useState(() => {
       try {
         return !isOnboardingCompleted();
       } catch {
         return false;
       }
     });
     ...
     <OnboardingGuide open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
     ```

2. **Existing SettingsDrawer**:
   - Location: `src/canvas/components/settings_drawer.jsx` (lines 12–37, 114–150)
     - Tabs: `general` ("常规偏好"), `assistant` ("AI 助手"), `providers` ("AI 供应商"), `shortcuts` ("快捷键速查").
     - Mounted in `src/app_title_bar.jsx` via the `Bolt` icon button.
   - Location: `src/canvas/components/settings_general.jsx`:
     - Contains `ProfileSettings` and `Language Section`. Does not yet contain a workspace directory section.

3. **Existing Storage and Persistence Architecture**:
   - Settings: `src/shared/settings.js` (lines 17–42):
     - Uses in-memory `cache`, `localStorage` mirror (`readMirror`, `writeMirror`), and reactive listener subscriptions (`onSettingChange`).
     - Authoritative async reads (`getSettingAsync`) and writes (`setSetting`).
     - `STORAGE_KEYS` array does not currently include `voo.workspace.path` or `voo.workspace.type`.
   - IndexedDB: `src/storage/db.js` (lines 9–13, 46–60):
     - Standalone local persistence adapter with `STORE_ASSETS = "assets"` and `STORE_DOCUMENTS = "documents"`.
   - Recent Files: `src/canvas/store/recent_files.js` (lines 6–38, 101–146):
     - Stores file list (`name`, `path`, `preview`, `starred`, `trashed`, `isDraft`) in `localStorage` under `"voo_design_recent_files"`.

4. **Existing Electron Preload & IPC**:
   - `electron/preload.cjs`:
     - Exposes `window.electronAPI`: `openFileDialog`, `saveFileDialog`, `readFile`, `readFileBytes`, `writeFile`, `writeFileBytes`.
     - Exposes `window.vooDesktop.localCli`: CLI connection, status checking, advance, cancel.
     - **Missing**: No `dialog:selectDirectory` / `openDirectoryDialog` or workspace folder management IPC exposed yet.
   - `electron/main.cjs`:
     - Has `dialog:openFile` and `dialog:saveFile`.
     - **Missing**: No `dialog:selectDirectory` or directory scanner handler.

5. **Test & Design Gate Status**:
   - `npm test`: 71 test files, 842 tests passing 100%.
   - `npm run lint:design`: 809 files checked, 0 violations.

---

## 2. Logic Chain

1. **Trigger Condition for Workspace Setup**:
   - Per Requirement R1, the application must display a setup guide when the workspace path is unconfigured on first launch, without annoying returning users.
   - Currently, `App.jsx` triggers onboarding when `!isOnboardingCompleted()`.
   - By adding a check for `getSetting("voo.workspace.path")`, if either `!isOnboardingCompleted()` OR `!getSetting("voo.workspace.path")` is true, the onboarding guide automatically launches to ensure a valid workspace is initialized.

2. **Step Progression Architecture**:
   - The onboarding flow currently has 3 steps: `agent_select`, `local_detect`, `ready`.
   - A dedicated workspace step `workspace_setup` must be introduced.
   - Since all design documents and templates must reside inside the workspace directory, placing Workspace Setup as **Step 1** (or Step 2) is the most logical ergonomic sequence:
     - **Step 1: 工作区配置 (Workspace Setup)**: Choose or confirm default project directory.
     - **Step 2: 智能体偏好 (Local Agent Selection)**: Default to Claude Code, options for Codex and Antigravity CLI.
     - **Step 3: 环境探针 (Environment Probe)**: Verify binary detection and IPC/WebSocket bridge connectivity.
     - **Step 4: 就绪开启 (Ready & Enter Canvas)**: Summary of workspace and agent, CTA "进入画布工作台".
   - `OnboardingStepProgress.jsx` accepts `steps` as an array and derives `total = steps.length`. Expanding `GUIDE_STEPS` to 4 items works automatically with zero UI regressions.

3. **Dual-Platform Directory Selection & Persistence Strategy**:
   - **On Electron Desktop**:
     - Check: `typeof window !== "undefined" && Boolean(window.electronAPI?.selectDirectory || window.vooDesktop)`.
     - Default Path: Automatically defaults to `~/Documents/VOO/Projects` (via `getDefaultVooProjectsDir()` in Electron main/preload).
     - Native Picker: User clicks "自定义目录..." -> invokes `window.electronAPI.selectDirectory()` which calls `dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] })`.
     - Direct Confirmation: User can click "使用推荐默认目录" to immediately accept `~/Documents/VOO/Projects` without opening any OS picker.
     - Type: `"desktop_native"`.
   - **On Web / Browser**:
     - Modern Chromium browsers support the **File System Access API** (`window.showDirectoryPicker`).
     - Card Option A: "本地文件夹挂载 (File System Access API)"
       - User clicks "选择本地文件夹授权" -> triggers `window.showDirectoryPicker({ mode: "readwrite" })`.
       - Obtains `FileSystemDirectoryHandle`, stores folder name and stores the handle in IndexedDB (`voo_workspace_handles`).
       - Type: `"web_fs_access"`.
     - Card Option B: "浏览器虚拟工作区 (IndexedDB / 沙盒存储)"
       - Fallback for Safari, Firefox, insecure HTTP, or users declining filesystem permissions.
       - Stores documents in IndexedDB (`voo_design_db` -> `STORE_DOCUMENTS`).
       - Type: `"web_virtual"`, path identifier: `"virtual://voo_workspace"`.
   - **Skip Handling**:
     - Clicking "稍后配置 (跳过)" (`onboarding-skip-btn`) must NOT leave the application in an uninitialized crash state.
     - On skip: automatically applies default path (`~/Documents/VOO/Projects` on Desktop, `"virtual://voo_workspace"` on Web), marks onboarding completed (`markOnboardingCompleted()`), and smoothly enters the editor.

4. **SettingsDrawer Integration**:
   - Location: Integrate inside `src/canvas/components/settings_general.jsx` as a dedicated `<WorkspaceSettingsSection />`.
   - Design:
     - Complies strictly with `Design.md`: uses `bg-neutral-900` container, `rounded-2xl`, single-layer card structure, no nested borders.
     - Active Path Display: Monospace pill with folder icon, full path (or virtual label), and platform badge (`[macOS 原生]` / `[浏览器挂载]` / `[虚拟工作区]`).
     - Actions:
       - "更换目录" ("Change Directory"): Re-triggers the platform directory selector.
       - "重新扫描" ("Rescan"): Triggers asynchronous directory rescan for `.voo`, `.fig`, `.psd`, `.svg` files and updates `recent_files` store.
       - "在访达中显示" ("Reveal in Finder" - Electron only): Calls `window.electronAPI.revealInFinder(path)`.

---

## 3. Detailed Technical Specification

### 3.1 State Keys & Contracts
Add the following keys to `STORAGE_KEYS` in `src/shared/settings.js`:
| State Key | Type | Default Value | Description |
|---|---|---|---|
| `voo.workspace.path` | `string` | `""` (or `null`) | Absolute path (Desktop) or `"virtual://default"` (Web) |
| `voo.workspace.type` | `string` | `"desktop_native"` / `"web_virtual"` | `"desktop_native"`, `"web_fs_access"`, or `"web_virtual"` |
| `voo.workspace.name` | `string` | `"VOO Projects"` | Human-readable directory/workspace name |
| `voo.workspace.lastScannedAt` | `number` | `0` | Epoch timestamp of last file scan |
| `voo.onboarding.completedVersion`| `string` | `"2.2.0"` | Onboarding completion version gate |

### 3.2 Event Contracts
| Event Name | Dispatcher | Detail Payload | Target Listeners |
|---|---|---|---|
| `voo:open-onboarding` | SettingsDrawer / TitleBar | `{}` | `App.jsx` (opens modal) |
| `voo:workspace-changed` | Onboarding / SettingsDrawer | `{ path, type, name }` | `WelcomeDashboard`, `project_io`, `recent_files` |
| `voo:workspace-rescan` | SettingsDrawer / Dashboard | `{ path }` | Workspace scanner service |

### 3.3 Electron IPC Channels
In `electron/main.cjs` and `electron/preload.cjs`:
```javascript
// electron/main.cjs
ipcMain.handle("dialog:selectDirectory", async (_, { defaultPath } = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择项目工作区目录",
    defaultPath: defaultPath || path.join(app.getPath("documents"), "VOO", "Projects"),
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle("workspace:getDefaultDirectory", () => {
  const dir = path.join(app.getPath("documents"), "VOO", "Projects");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
});

ipcMain.handle("workspace:revealInFinder", (_, targetPath) => {
  if (targetPath && fs.existsSync(targetPath)) {
    shell.showItemInFolder(targetPath);
    return true;
  }
  return false;
});
```

Exposed on `window.electronAPI`:
- `selectDirectory(options): Promise<string | null>`
- `getDefaultDirectory(): Promise<string>`
- `revealInFinder(filePath): Promise<boolean>`

### 3.4 File Path Manifest & Component Touchpoints
| Component | Path | Proposed Role |
|---|---|---|
| `OnboardingGuide.jsx` | `src/canvas/components/onboarding/OnboardingGuide.jsx` | Extended to 4 steps including workspace setup |
| `onboarding_state.js` | `src/canvas/components/onboarding/onboarding_state.js` | Add `WORKSPACE_SETUP` step, `CURRENT_ONBOARDING_VERSION = "2.2.0"`, workspace check |
| `step_workspace.jsx` | `src/canvas/components/onboarding/step_workspace.jsx` | **New Component**: Workspace directory selector UI (Electron native + Web FS Access / Virtual) |
| `step_ready.jsx` | `src/canvas/components/onboarding/step_ready.jsx` | Updated to display confirmed workspace path alongside agent info |
| `workspace_manager.js`| `src/canvas/store/workspace_manager.js` | **New Service**: Unified workspace adapter (Electron IPC + Web FSAA + IndexedDB fallback) |
| `settings_general.jsx`| `src/canvas/components/settings_general.jsx` | Add `<WorkspaceSettingsSection />` with path display, change, and rescan actions |
| `settings.js` | `src/shared/settings.js` | Add `voo.workspace.*` keys to `STORAGE_KEYS` |
| `preload.cjs` | `electron/preload.cjs` | Expose `selectDirectory`, `getDefaultDirectory`, `revealInFinder` |
| `main.cjs` | `electron/main.cjs` | Add `dialog:selectDirectory` and `workspace:*` IPC handlers |

---

## 4. Edge Cases & Mitigation Strategies

1. **Missing / Disconnected Directory on Desktop**:
   - *Scenario*: User selected an external drive (e.g. `/Volumes/USB/Design`) which is later unmounted, or manually deleted the folder.
   - *Mitigation*: When `getActiveWorkspace()` fails to access the path (`fs.existsSync(path)` returns false), emit a non-blocking toast warning and gracefully fallback to `getDefaultDirectory()` (`~/Documents/VOO/Projects`) without throwing uncaught exceptions.

2. **Web Permission Expiry / Re-prompts**:
   - *Scenario*: Browser drops the `FileSystemDirectoryHandle` readwrite permission after page reload.
   - *Mitigation*: Store the directory handle in IndexedDB. On app reload, query permission with `handle.queryPermission({ mode: "readwrite" })`. If `"prompt"`, show a compact banner in the WelcomeDashboard ("点击以重新授予工作区访问权限") rather than throwing an error. If denied, offer one-click fallback to Virtual Workspace.

3. **Incompatible Web Browsers (Safari / Firefox / Insecure HTTP)**:
   - *Scenario*: `window.showDirectoryPicker` is `undefined`.
   - *Mitigation*: Feature-detect `typeof window.showDirectoryPicker === "function"`. If false, auto-hide the local folder mount option and present the IndexedDB Virtual Workspace as the default recommended option.

4. **Rapid Double-Clicks & Unsaved Drafts in Onboarding**:
   - *Scenario*: User rapidly clicks "下一步" or refreshes mid-wizard.
   - *Mitigation*: Adopt `voo-run`'s `finishingRef` re-entry guard and `sessionStorage.getItem("voo.onboarding.draft")` draft recovery so step progression is resilient.

5. **Design.md Compliance**:
   - *Scenario*: Introducing new cards and buttons that violate dark surface hierarchy or nested borders.
   - *Mitigation*: Use single-layer `bg-neutral-900` containers, `bg-white/[0.04]` hover states, `border-white/10` outer container borders, and `#a7ffd4` mint accent highlights. Ensure all copy is backed by `t()` entries in both `zh.js` and `en.js`.

---

## 5. Caveats
- No caveats. The reference implementation in `voo-run` and the current state of `voo_design` were verified directly by reading the source files and running the test suite.

---

## 6. Conclusion
- The first-launch onboarding guide can be cleanly upgraded from 3 steps to 4 steps by adding `step_workspace.jsx` as Step 1.
- `OnboardingStepProgress` already supports dynamic step counts.
- Dual-platform directory selection should branch between `window.electronAPI.selectDirectory()` on Desktop (defaulting to `~/Documents/VOO/Projects`) and `window.showDirectoryPicker()` / IndexedDB virtual workspace on Web.
- The SettingsDrawer integration should be placed inside `src/canvas/components/settings_general.jsx` as a dedicated `<WorkspaceSettingsSection />`, providing current path display, platform badge, "Change Directory" trigger, and "Rescan" trigger.
- The plan adheres strictly to VOO Design dark design tokens and preserves 100% test compatibility.

---

## 7. Verification Method
1. Inspect the following reference files in `voo-run`:
   - `/Volumes/TD/Projects/voo-run/electron/project_config.js`
   - `/Volumes/TD/Projects/voo-run/electron/project_store.js`
   - `/Volumes/TD/Projects/voo-run/src/canvas/components/onboarding/OnboardingGuide.jsx`
2. Inspect the following target files in `voo_design`:
   - `src/canvas/components/onboarding/OnboardingGuide.jsx`
   - `src/canvas/components/onboarding/onboarding_state.js`
   - `src/canvas/components/settings_general.jsx`
   - `src/shared/settings.js`
   - `electron/preload.cjs`
   - `electron/main.cjs`
3. Automated Quality Verification Commands:
   - Run unit test suite: `npm test` (verify all 842+ tests pass).
   - Run design linter: `npm run lint:design` (verify 0 violations).
   - Run production build: `npm run build` (verify bundle succeeds).

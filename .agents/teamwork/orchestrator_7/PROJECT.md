# Project: VOO Design Unified Workspace Directory Management System

## Architecture
VOO Design establishes a unified, cross-platform Workspace Directory Management System bridging Desktop Electron native filesystem capabilities and Web browser sandboxed / File System Access API capabilities.

```
+---------------------------------------------------------------------------------------------------+
|                                            VOO DESIGN                                             |
|                                                                                                   |
|  [Onboarding Workspace Guide]         [WelcomeDashboard Workbench]          [Settings Drawer]     |
|   - First-launch directory picker      - Active Workspace Header & Pill      - Current path badge |
|   - Native / Web FSA / Virtual         - Live project scanning (.voo/.fig)   - Change Directory   |
|   - Default: ~/Documents/VOO/Projects  - Star, Rename, Trash, Delete actions - Rescan Workspace  |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼
+---------------------------------------------------------------------------------------------------+
|                       Unified Workspace Storage Engine (`workspaceStorage`)                       |
|                             `src/services/workspace_storage.js`                                   |
|   - Polymorphic interface: init(), getConfig(), chooseDirectory(), setDirectory(), scanFiles()    |
|   - readFileBytes(), writeFileBytes(), renameFile(), moveToTrash(), deletePermanently()          |
+---------------------------------------------------------------------------------------------------+
                      │                                                   │
                      ▼                                                   ▼
+-------------------------------------------+       +-----------------------------------------------+
|         Electron Desktop Driver           |       |              Web Browser Drivers              |
|        (`ElectronWorkspaceDriver`)        |       |        (`WebFsaWorkspaceDriver` /             |
|                                           |       |         `WebIdbWorkspaceDriver`)              |
| - window.electronAPI.workspace            |       | - window.showDirectoryPicker (Chromium)       |
| - IPC: workspace:chooseDir, setDir, scan  |       | - IndexedDB store: workspace_files, meta      |
| - Node.js fs.promises, shell.trashItem    |       | - Safe .trash/ virtual folder emulation       |
| - fs.watch debounced directory monitoring |       | - Zero external dependencies fallback         |
+-------------------------------------------+       +-----------------------------------------------+
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Electron Native Directory Picker & Config | Expose `workspace:chooseDir` and `workspace:setDir` with `projects_config.json` persistence in `electron/` | M1 | Survey Storage |
| 2 | Electron Filesystem Operations IPC | Implement `workspace:scanFiles`, `renameFile`, `moveToTrash`, `deletePermanently`, `revealInFinder` | M1 | Survey Storage |
| 3 | Electron File Watcher IPC | Implement debounced (300ms) `fs.watch` emitting `workspace:changed` broadcast | M1 | Survey Storage |
| 4 | Unified Workspace Storage Engine | Implement polymorphic `WorkspaceStorageEngine` in `src/services/workspace_storage.js` | M1 | Survey Storage |
| 5 | Web File System Access Driver | Implement `WebFsaWorkspaceDriver` supporting Chromium `showDirectoryPicker` with IndexedDB handle cache | M1 | Survey Storage |
| 6 | Web IndexedDB Virtual Driver | Implement `WebIdbWorkspaceDriver` with `workspace_files` and `workspace_meta` stores for universal fallback | M1 | Survey Storage |
| 7 | Design File Scanning & Filtering | Fast shallow scan for `.voo`, `.fig`, `.psd`, `.svg` with metadata synthesis | M1 | Survey Storage |
| 8 | Onboarding Workspace Guide Step | Add Step 1 Workspace Setup to `OnboardingGuide.jsx` with Electron native and Web cards | M2 | Survey Onboarding |
| 9 | Onboarding First-Launch Detection | Trigger onboarding when `!isOnboardingCompleted()` OR `!getSetting("voo.workspace.path")` | M2 | Survey Onboarding |
| 10 | Onboarding Skip & Defaults Safety | One-click skip or default selection (`~/Documents/VOO/Projects` or `"virtual://default"`) | M2 | Survey Onboarding |
| 11 | Settings Drawer Workspace Section | Add `<WorkspaceSettingsSection />` in `settings_general.jsx` displaying path, badge, change, rescan | M2 | Survey Onboarding |
| 12 | Settings Keys & Synchronized Events | Register `voo.workspace.*` keys in `src/shared/settings.js` and dispatch `voo:workspace-changed` | M2 | Survey Onboarding |
| 13 | WelcomeDashboard Active Workspace Header | Display current workspace path, platform badge, Change button, and Reveal action | M3 | Survey Workbench |
| 14 | WelcomeDashboard Live Project Listing | Bind project grid/list to `workspaceStorage.scanFiles()` with search and category filters | M3 | Survey Workbench |
| 15 | Synchronized Star & Favorites | Star/unstar toggle with persisted metadata across all dashboard tabs | M3 | Survey Workbench |
| 16 | Disk-Synchronized File Renaming | Rename project in dashboard executes physical file rename and updates metadata | M3 | Survey Workbench |
| 17 | Trash & Permanent Deletion | Move to trash (soft-delete to `.trash/` / `shell.trashItem`) and permanent delete | M3 | Survey Workbench |
| 18 | Default Save & New Project Location | `saveVooProject` and New Project default to active workspace directory in `project_io.js` | M3 | Survey Workbench |
| 19 | Comprehensive Unit & Integration Tests | Pass 100% of unit tests covering storage drivers, onboarding, settings, and dashboard | M4 | Survey E2E |
| 20 | Design System Linter Compliance | Pass `npm run lint:design` with 0 violations | M4 | Survey E2E |
| 21 | Clean Production Bundling | Pass `npm run build` cleanly without Vite/TypeScript errors | M4 | Survey E2E |
| 22 | Automated Deployment to Server `la` | Deploy via `VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh` and verify HTTP 200 | M4 | Survey E2E |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Dual-Platform Workspace Storage Engine | Features 1–7: Electron IPC channels, `workspace_manager.cjs`, `preload.cjs`, unified `workspace_storage.js`, Electron/Web FSA/IDB drivers | none | DONE |
| M2 | Onboarding Workspace Guide & Settings Integration | Features 8–12: `step_workspace.jsx`, `OnboardingGuide.jsx`, `onboarding_state.js`, `settings_general.jsx`, `settings.js` | M1 | DONE |
| M3 | Workbench Integrated File Management | Features 13–18: `WelcomeDashboard.jsx`, star, rename, trash/delete, `project_io.js` default workspace save path | M1, M2 | IN_PROGRESS |
| M4 | Automated Verification & Production Deployment | Features 19–22: 100% test pass, `npm run lint:design`, `npm run build`, deployment to `la` | M1, M2, M3 | PLANNED |

## Interface Contracts

### Workspace Storage Engine Contract (`src/services/workspace_storage.js`)
```typescript
export interface WorkspaceConfig {
  type: "electron" | "web-fsa" | "web-idb";
  path: string;           // Absolute path on Desktop; folder name or "virtual://default" on Web
  isDefault: boolean;     // True if using unconfigured default path
  isConfigured: boolean;  // True if user has explicitly confirmed/chosen workspace
}

export interface WorkspaceFileInfo {
  id: string;             // Full path on Desktop; filename or ID on Web
  name: string;           // Display filename with extension (e.g. "Hero.voo")
  path: string | null;    // Real filesystem path on Desktop; null on Web
  extension: "voo" | "fig" | "psd" | "svg";
  size: number;           // Size in bytes
  updatedAt: number;      // Epoch ms of last modification
  createdAt: number;      // Epoch ms of creation
  starred: boolean;       // Favorite status
  trashed: boolean;       // Soft-deleted status
  trashedAt: number | null;
  category?: string;      // "landing" | "mobile" | "web" | "slides" | "dashboard" | "other"
  preview?: string | null;// Base64 data URL preview thumbnail
  isDraft?: boolean;
}

export interface IWorkspaceStorageEngine {
  init(): Promise<WorkspaceConfig>;
  getDriverType(): "electron" | "web-fsa" | "web-idb";
  getConfig(): Promise<WorkspaceConfig>;
  chooseDirectory(): Promise<{ ok: boolean; canceled?: boolean; config?: WorkspaceConfig; error?: string }>;
  setDirectory(dirPathOrHandle: string | any): Promise<{ ok: boolean; config?: WorkspaceConfig; error?: string }>;
  isConfigured(): Promise<boolean>;
  scanFiles(options?: { includeTrashed?: boolean; category?: string; search?: string }): Promise<WorkspaceFileInfo[]>;
  readFileBytes(fileIdOrPath: string): Promise<Uint8Array>;
  writeFileBytes(name: string, bytes: Uint8Array, options?: { category?: string; preview?: string }): Promise<WorkspaceFileInfo>;
  renameFile(fileIdOrPath: string, newName: string): Promise<{ ok: boolean; file?: WorkspaceFileInfo; error?: string }>;
  moveToTrash(fileIdOrPath: string): Promise<{ ok: boolean; error?: string }>;
  restoreFromTrash(fileIdOrPath: string): Promise<{ ok: boolean; error?: string }>;
  deletePermanently(fileIdOrPath: string): Promise<{ ok: boolean; error?: string }>;
  emptyTrash(): Promise<{ ok: boolean; deletedCount: number; error?: string }>;
  toggleStar(fileIdOrPath: string): Promise<{ ok: boolean; starred: boolean }>;
  revealInFinder(fileIdOrPath: string): Promise<boolean>;
  subscribe(callback: (event: { type: "change" | "delete" | "create"; fileId?: string }) => void): () => void;
}
```

### Electron Preload & IPC Contract (`electron/preload.cjs` & `electron/main.cjs`)
```javascript
window.electronAPI.workspace = {
  getConfig: () => Promise<WorkspaceConfig>,
  chooseDirectory: () => Promise<{ canceled: boolean, path: string | null }>,
  setDirectory: (targetPath) => Promise<{ ok: boolean, path: string, error?: string }>,
  getDefaultDirectory: () => Promise<string>,
  scanFiles: () => Promise<{ ok: boolean, files: WorkspaceFileInfo[] }>,
  readFileBytes: (filePath) => Promise<{ ok: boolean, bytes: Buffer }>,
  writeFileBytes: (name, bytes, options) => Promise<{ ok: boolean, file: WorkspaceFileInfo }>,
  renameFile: (filePath, newName) => Promise<{ ok: boolean, newPath: string, error?: string }>,
  moveToTrash: (filePath) => Promise<{ ok: boolean, error?: string }>,
  deletePermanently: (filePath) => Promise<{ ok: boolean, error?: string }>,
  revealInFinder: (filePath) => Promise<boolean>,
  onChanged: (handler) => () => void,
};
```

## Code Layout
- `electron/workspace_manager.cjs`: Electron backend logic for workspace directory config, scanning, watcher, and trash.
- `electron/main.cjs`: Registration of `workspace:*` IPC handlers.
- `electron/preload.cjs`: Safe bridge exposure of `window.electronAPI.workspace` and `window.vooDesktop.workspace`.
- `src/services/workspace_storage.js`: Unified polymorphic storage engine factory and public API.
- `src/services/drivers/electron_driver.js`: Desktop Electron storage driver.
- `src/services/drivers/web_fsa_driver.js`: Chromium File System Access API driver.
- `src/services/drivers/web_idb_driver.js`: IndexedDB virtual workspace driver.
- `src/canvas/components/onboarding/step_workspace.jsx`: Onboarding Step 1 workspace selection card.
- `src/canvas/components/onboarding/OnboardingGuide.jsx`: Upgraded 4-step wizard.
- `src/canvas/components/onboarding/onboarding_state.js`: Workspace check and step definitions.
- `src/canvas/components/settings_general.jsx`: Workspace path, change, rescan, and reveal controls.
- `src/shared/settings.js`: `voo.workspace.*` key registration and event triggers.
- `src/canvas/components/welcome_dashboard.jsx`: Active workspace header, real project scanning, and file operations.
- `src/canvas/store/project_io.js`: Save / Save As defaulting to active workspace folder.
- `tests/unit/`: Automated Vitest test suites.
- `scripts/deploy-editor.sh`: Production deployment script.

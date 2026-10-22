# Handoff Report: Dual-Platform Workspace Storage Engine (R2)

## 1. Observation

### 1.1 Reference Codebase (`/Volumes/TD/Projects/voo-run`) Investigation
Direct inspection of `/Volumes/TD/Projects/voo-run` revealed the patterns used for directory management, persistence, and Electron/Web isolation:

1. **Workspace Root Directory Configuration & Persistence (`electron/project_config.js`)**:
   - Lines 38–48: Default directory resolved to `path.join(documentsRoot(), "VOO", "Projects")`, where `documentsRoot()` defaults to `app.getPath("documents")` with environment override `VOO_DOCUMENTS_ROOT`.
   - Lines 14–35: Configuration persisted in `projects_config.json` inside `app.getPath("userData")`.
   - Lines 53–65: Directory validation `isValidProjectsRootDir` tests existence, directory type, and write access via `fs.accessSync(resolved, fs.constants.W_OK)`.
   - Lines 72–143: Functions `getProjectsRootDir()`, `setProjectsRootDir(targetPath)`, and `clearProjectsRootDir()`.

2. **IPC Channel Handlers in Main Process (`electron/project_store.js`)**:
   - Lines 162–176:
     ```javascript
     ipcMain.handle("voo:get-default-project-dir", () => getProjectsRootDir());
     ipcMain.handle("voo:get-projects-root-dir", () => getProjectsRootDir());
     ipcMain.handle("voo:set-projects-root-dir", async (_event, folderPath) => setProjectsRootDir(folderPath));
     ipcMain.handle("voo:choose-projects-root-dir", async () => {
       const result = await dialog.showOpenDialog({
         title: "Choose projects root folder",
         defaultPath: getProjectsRootDir(),
         properties: ["openDirectory", "createDirectory"],
       });
       return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
     });
     ```
   - Lines 238–255: Trash deletion logic:
     ```javascript
     ipcMain.handle("voo:delete-project-dir", async (_event, dir) => {
       if (typeof dir !== "string" || !fs.existsSync(dir)) return false;
       try {
         if (shell.trashItem) {
           await shell.trashItem(dir);
         } else {
           fs.rmSync(dir, { recursive: true, force: true });
         }
         return true;
       } catch {
         try {
           fs.rmSync(dir, { recursive: true, force: true });
           return true;
         } catch {
           return false;
         }
       }
     });
     ```
   - Lines 368–374: Native reveal in file explorer:
     ```javascript
     ipcMain.handle("voo:reveal-in-finder", async (_event, folderPath) => {
       if (typeof folderPath === "string" && fs.existsSync(folderPath)) {
         shell.showItemInFolder(folderPath);
         return true;
       }
       return false;
     });
     ```

3. **Collision Avoidance & Cross-Platform Atomic Operations (`electron/project_layout.js` & `electron/ipc_workflow.js`)**:
   - `project_layout.js` (lines 40–74): Sanitizes path names via `projectFolderName(name)`, handles forbidden characters `[/\\:*?"<>|]`, and computes collision-free sibling names `uniqueFolderPath(root, base)` producing `base-2`, `base-3`, etc.
   - `ipc_workflow.js` (lines 16–61): `renameProjectFolderOnDisk` handles case-only renames on case-insensitive filesystems (macOS APFS / Windows NTFS) using a temporary staging intermediate `__voo_rename_${Date.now()}_${base}`.
   - `project_store.js` (lines 412–460): `atomicRenameSync` handles Windows file locking (`EPERM`/`EBUSY`) with backup rename fallback.

4. **File Watching & Listing**:
   - `voo-run` did not mount a heavy background `chokidar` daemon across unbounded deep trees; instead it used shallow scanning (`readdirSync` on the project root) combined with event-driven refresh (`refreshDiskProjects()`) on lifecycle operations (create, rename, delete) and window focus (`shell_workspace.js` line 41).

---

### 1.2 Current VOO Design Codebase (`/Users/tt/teamwork_projects/voo_design`) Investigation

1. **Electron Main Process (`electron/main.cjs`)**:
   - Lines 19–24: Context isolation is enabled: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`.
   - Lines 231–280: IPC handlers:
     - `dialog:openFile`: uses `dialog.showOpenDialog(mainWindow, { properties: ["openFile"], filters: [...] })`.
     - `dialog:saveFile`: uses `dialog.showSaveDialog(mainWindow, { defaultPath, filters })`.
     - `fs:readFile`, `fs:readBinary`, `fs:writeFile`, `fs:writeBinary`: low-level file I/O.
     - `model:loadBytes`: loaded from bundled model paths.
   - Lines 328–332: Local CLI bridge IPC registered from `local_backend_bridge.js`.
   - **Crucial Observation**: Currently, `main.cjs` has **no concept of a workspace root directory**, no folder picker IPC, no directory scanning IPC, no `shell.trashItem` IPC, and no file watcher.

2. **Electron Preload Script (`electron/preload.cjs`)**:
   - Exposes `window.vooDesktop` with `platform` and `localCli`.
   - Exposes `window.electronAPI` with: `isElectron`, `platform`, `openFileDialog`, `saveFileDialog`, `readFile`, `readFileBytes`, `writeFile`, `writeFileBytes`, `loadModelBytes`, `onMenuAction`.
   - **Crucial Safety Test**: `tests/unit/adversarial_isolation_electron_safety.test.js` (lines 256–270) tests that `electronAPI` is exposed with `isElectron: true`, `openFileDialog`, `saveFileDialog`, `readFile`, `writeFile`, `onMenuAction`. Any modification must preserve these exact methods and signatures without regressions.

3. **Frontend File I/O (`src/canvas/store/project_io.js`)**:
   - Lines 350–430: Save operations:
     - Priority 1: Electron `window.electronAPI.saveFileDialog` + `writeFileBytes`.
     - Priority 2: Web `window.showSaveFilePicker` + `handle.createWritable()`.
     - Priority 3: Fallback Blob download via `<a download>`.
   - Lines 550–650: Open operations:
     - Supports `.voo` (JSON or binary), `.fig` (via `importFigFile`), `.psd` (via `psdBytesToVooFile`), `.svg` (via `svgBytesToVooFile`).
     - Files are opened on an ad-hoc basis with no parent workspace folder context.

4. **Frontend Recent Files & State (`src/canvas/store/recent_files.js` & `src/canvas/components/welcome_dashboard.jsx`)**:
   - `recent_files.js` stores everything in `localStorage` under key `voo_design_recent_files`.
   - It performs **purely simulated in-memory/localStorage mutations**:
     - `renameRecentFile()` renames the label in `localStorage`, but never touches the physical file on disk.
     - `moveToTrash()` sets `trashed: true` in `localStorage`, leaving the physical file untouched.
     - `deletePermanently()` filters the record from `localStorage`, leaving the file on disk.
   - `welcome_dashboard.jsx` reads from `recent_files.js`. It does not show the current active workspace directory path, nor does it scan the disk for files.

5. **Storage Layer (`src/storage/db.js`)**:
   - Uses browser `indexedDB` (database `voo_design_db`, stores `assets` and `documents`), with an in-memory fallback for headless test runners.

---

## 2. Logic Chain

1. **Why an Abstraction Layer is Essential**:
   VOO Design runs in two distinct shell runtimes:
   - **Desktop**: Electron (macOS/Windows/Linux) where direct Node.js filesystem access (`node:fs`, `node:path`, `electron.shell`, `electron.dialog`) is available via IPC.
   - **Browser**: Web deployment (`https://la.voo.run/editor/`) where Chromium supports the File System Access API (`window.showDirectoryPicker()`), while Safari, Firefox, and insecure contexts lack it.
   To avoid spreading `if (isElectron)` checks across UI components (`WelcomeDashboard`, `AppTitleBar`, `SettingsDrawer`, `project_io.js`), a single polymorphic engine `WorkspaceStorageEngine` backed by specific drivers (`ElectronWorkspaceDriver`, `WebFsaWorkspaceDriver`, `WebIdbWorkspaceDriver`) provides an identical interface to the entire frontend.

2. **Driver Selection Logic**:
   ```
   if (window.electronAPI?.workspace || window.vooDesktop?.workspace)
     => ElectronWorkspaceDriver (Native OS files, shell.trashItem, fs.watch)
   else if (typeof window !== "undefined" && typeof window.showDirectoryPicker === "function")
     => WebFsaWorkspaceDriver (FileSystemDirectoryHandle persisted in IndexedDB)
   else
     => WebIdbWorkspaceDriver (Virtual Workspace backed by IndexedDB stores)
   ```

3. **Workspace File Types & Ingestion**:
   Requirements explicitly specify scanning `.voo`, `.fig`, `.psd`, and `.svg`.
   - `.voo`: Native format (JSON or compressed binary). Direct bidirectional save/open.
   - `.fig`: Figma binary archive. Decoded via `figma_import_client.js` / Web Worker streaming. Saved via `voo-to-fig.js`.
   - `.psd`: Adobe Photoshop document. Parsed via `psd_to_voo.js`.
   - `.svg`: Vector document. Converted via `svg_document_io.js`.
   Scanning must be **shallow** (root directory only, ignoring subdirectories such as `.trash`, `.git`, `node_modules`, `assets`) to guarantee $O(N)$ execution with $N \le 500$ files, completing in $< 15\text{ms}$ even on mechanical disks or slow sandboxes.

4. **Trash Handling & Safety**:
   - In Electron: Calling `shell.trashItem(filePath)` guarantees OS-level undoability (users can restore files from macOS Trash or Windows Recycle Bin). If `shell.trashItem` throws or fails (e.g. mounted network drives), fall back to moving into a hidden `.trash` directory within the workspace before permanent deletion.
   - In Web FSA: Web browsers do not provide OS trash access. The driver creates a `.trash/` subfolder in the directory handle and moves items there (or flags them in virtual metadata) so the user can "Restore" from the Welcome Dashboard trash view.
   - In Web IDB: Soft-trash moves records to the `workspace_trash` object store.

5. **Watcher Protocol & Real-time Synchronization**:
   - In Electron: Node.js `fs.watch(workspaceDir)` triggers on file additions, deletions, and external edits. A 300ms debounce buffer prevents event storms during multi-asset writes. IPC channel `workspace:changed` notifies the frontend to refresh the file list without blocking the renderer.
   - In Web: FSA API `FileSystemObserver` is currently experimental (behind browser flags). The Web driver uses window `focus` event polling + internal operation event dispatching to achieve seamless synchronization.

---

## 3. Caveats

1. **Browser Security & Permissions for FSA**:
   - `FileSystemDirectoryHandle` stored in IndexedDB loses active read/write permission upon page reload in Chromium. The driver must call `await handle.queryPermission({ mode: "readwrite" })`. If `'prompt'`, the application must display a non-intrusive banner/prompt ("Click to grant permission to Workspace") on user gesture, rather than crashing or hanging.
2. **Backward Compatibility with Existing Unit Tests**:
   - `tests/unit/recent_files_and_welcome.test.js` directly imports and tests `getRecentFiles`, `addRecentFile`, `moveToTrash`, `renameRecentFile` using in-memory `localStorage`.
   - `recent_files.js` must remain functional as a cache/facade or delegate to the storage engine seamlessly so that all 842 existing tests pass without modification.
3. **Electron Security Invariants**:
   - `tests/unit/adversarial_isolation_electron_safety.test.js` asserts that `electronAPI` methods (`openFileDialog`, `saveFileDialog`, `readFile`, `writeFile`, `onMenuAction`) and IPC handlers (`dialog:openFile`, `dialog:saveFile`, `fs:readFile`, `fs:writeFile`) are registered and untouched.
   - All workspace IPC channels must use the `workspace:*` namespace (e.g., `workspace:getConfig`, `workspace:chooseDir`, `workspace:scanFiles`) and be cleanly isolated.

---

## 4. Conclusion & Technical Specifications

### 4.1 Storage Engine Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                           UI & State Layer                                         |
|  (WelcomeDashboard | SettingsDrawer | OnboardingGuide | project_io.js | useDesignStore) |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|               Unified Workspace Storage Engine (`WorkspaceStorageEngine`)          |
|            src/services/workspace_storage.js  (Polymorphic Interface)             |
+-----------------------------------------------------------------------------------+
           |                                   |                              |
           v                                   v                              v
+-----------------------+           +-----------------------+      +-----------------------+
| ElectronWorkspaceDriver|          |   WebFsaWorkspaceDriver|     |  WebIdbWorkspaceDriver|
| (window.electronAPI/  |           | (File System Access   |      | (IndexedDB virtual    |
|  window.vooDesktop)   |           |  showDirectoryPicker) |      |  files & metadata)    |
+-----------------------+           +-----------------------+      +-----------------------+
           |                                   |                              |
           v                                   v                              v
[Electron Main IPC]                  [Chromium Directory]           [IndexedDB DB]
- Node fs / fs.promises              - FileSystemDirectoryHandle    - store: workspace_files
- shell.trashItem (OS Trash)         - Subfolder: .trash/           - store: workspace_meta
- fs.watch (Debounced events)        - handle in IndexedDB          - store: workspace_trash
- projects_config.json               - permission re-prompt         - Full in-memory fallback
```

---

### 4.2 Unified API Interface Contract (`IWorkspaceStorageEngine`)

The unified interface is exposed via `workspaceStorage` instance or factory in `src/services/workspace_storage.js`:

```typescript
export interface WorkspaceConfig {
  type: "electron" | "web-fsa" | "web-idb";
  path: string;           // Absolute path (Electron) or folder display name (Web FSA / IDB)
  isDefault: boolean;     // True if using default unconfigured path (~/Documents/VOO/Projects)
  isConfigured: boolean;  // True if user has explicitly confirmed/chosen workspace
}

export interface WorkspaceFileInfo {
  id: string;             // Unique identifier (full path on Electron, name/uuid on Web)
  name: string;           // Filename with extension (e.g. "LandingPage.voo")
  path: string | null;    // Real filesystem path on Electron; null on Web
  extension: "voo" | "fig" | "psd" | "svg";
  size: number;           // Size in bytes
  updatedAt: number;      // Epoch ms of last modification
  createdAt: number;      // Epoch ms of creation
  starred: boolean;       // Favorite flag
  trashed: boolean;       // Soft-deleted flag
  trashedAt: number | null;
  category?: string;      // "landing" | "mobile" | "web" | "slides" | "dashboard" | "other"
  preview?: string | null;// Base64 data URL preview thumbnail
  isDraft?: boolean;
}

export interface WorkspaceStorageEngine {
  // Initialization & Driver Detection
  init(): Promise<WorkspaceConfig>;
  getDriverType(): "electron" | "web-fsa" | "web-idb";
  getConfig(): Promise<WorkspaceConfig>;

  // Directory Selection & Configuration
  chooseDirectory(): Promise<{ ok: boolean; canceled?: boolean; config?: WorkspaceConfig; error?: string }>;
  setDirectory(dirPathOrHandle: string | any): Promise<{ ok: boolean; config?: WorkspaceConfig; error?: string }>;
  isConfigured(): Promise<boolean>;

  // Scanning & Listing
  scanFiles(options?: { includeTrashed?: boolean; category?: string; search?: string }): Promise<WorkspaceFileInfo[]>;

  // File I/O
  readFileBytes(fileIdOrPath: string): Promise<Uint8Array>;
  writeFileBytes(name: string, bytes: Uint8Array, options?: { category?: string; preview?: string }): Promise<WorkspaceFileInfo>;

  // File Management
  renameFile(fileIdOrPath: string, newName: string): Promise<{ ok: boolean; file?: WorkspaceFileInfo; error?: string }>;
  moveToTrash(fileIdOrPath: string): Promise<{ ok: boolean; error?: string }>;
  restoreFromTrash(fileIdOrPath: string): Promise<{ ok: boolean; error?: string }>;
  deletePermanently(fileIdOrPath: string): Promise<{ ok: boolean; error?: string }>;
  emptyTrash(): Promise<{ ok: boolean; deletedCount: number; error?: string }>;

  // Metadata Operations
  toggleStar(fileIdOrPath: string): Promise<{ ok: boolean; starred: boolean }>;
  updateMetadata(fileIdOrPath: string, patch: Partial<WorkspaceFileInfo>): Promise<void>;

  // System Shell Integration
  revealInFinder(fileIdOrPath: string): Promise<boolean>;

  // Watcher / Event Subscription
  subscribe(callback: (event: { type: "change" | "delete" | "create"; fileId?: string }) => void): () => void;
}
```

---

### 4.3 Electron Main Process & Preload IPC Contract

#### IPC Channels to Register in `electron/main.cjs`:
| Channel | Direction | Payload | Return Value | Description |
|---|---|---|---|---|
| `workspace:getConfig` | Renderer -> Main | `void` | `{ ok, path, isDefault, isConfigured }` | Returns active workspace configuration |
| `workspace:chooseDir` | Renderer -> Main | `void` | `{ canceled, path }` | Shows native folder picker dialog |
| `workspace:setDir` | Renderer -> Main | `{ targetPath: string }` | `{ ok, path, error? }` | Validates, persists to `projects_config.json`, starts watcher |
| `workspace:scanFiles` | Renderer -> Main | `void` | `{ ok, files: WorkspaceFileInfo[] }` | Scans workspace root for `.voo`, `.fig`, `.psd`, `.svg` |
| `workspace:readFileBytes` | Renderer -> Main | `{ filePath: string }` | `{ ok, bytes: Buffer/Uint8Array }` | Reads raw bytes |
| `workspace:writeFileBytes`| Renderer -> Main | `{ name: string, bytes: Buffer, overwrite?: boolean }` | `{ ok, file: WorkspaceFileInfo }` | Atomic write into workspace folder |
| `workspace:renameFile` | Renderer -> Main | `{ filePath: string, newName: string }` | `{ ok, newPath, newName, error? }` | Atomic collision-free rename on disk |
| `workspace:moveToTrash` | Renderer -> Main | `{ filePath: string }` | `{ ok, error? }` | Uses `shell.trashItem(filePath)` |
| `workspace:deletePermanently` | Renderer -> Main | `{ filePath: string }` | `{ ok, error? }` | Uses `fs.promises.unlink(filePath)` |
| `workspace:revealInFinder`| Renderer -> Main | `{ filePath: string }` | `boolean` | Calls `shell.showItemInFolder(filePath)` |
| `workspace:changed` | Main -> Renderer | `{ event: string, filename: string }` | `void` (Broadcast) | Sent when `fs.watch` detects changes |

#### Preload Bridge Extension in `electron/preload.cjs`:
Add to `electronAPI` and `vooDesktop`:
```javascript
workspace: {
  getConfig: () => ipcRenderer.invoke("workspace:getConfig"),
  chooseDirectory: () => ipcRenderer.invoke("workspace:chooseDir"),
  setDirectory: (targetPath) => ipcRenderer.invoke("workspace:setDir", { targetPath }),
  scanFiles: () => ipcRenderer.invoke("workspace:scanFiles"),
  readFileBytes: (filePath) => ipcRenderer.invoke("workspace:readFileBytes", { filePath }),
  writeFileBytes: (name, bytes, options) => ipcRenderer.invoke("workspace:writeFileBytes", { name, bytes, ...options }),
  renameFile: (filePath, newName) => ipcRenderer.invoke("workspace:renameFile", { filePath, newName }),
  moveToTrash: (filePath) => ipcRenderer.invoke("workspace:moveToTrash", { filePath }),
  deletePermanently: (filePath) => ipcRenderer.invoke("workspace:deletePermanently", { filePath }),
  revealInFinder: (filePath) => ipcRenderer.invoke("workspace:revealInFinder", { filePath }),
  onChanged: (handler) => subscribe("workspace:changed", handler),
}
```

---

### 4.4 Web FSA Driver & IndexedDB Fallback Driver Specifications

#### 1. Web FSA Driver (`WebFsaWorkspaceDriver`)
- **Storage of Handle**: Store `FileSystemDirectoryHandle` in `indexedDB` object store `workspace_handles` under key `"default_workspace"`.
- **Permission Lifecycle**:
  ```javascript
  async function verifyPermission(fileHandle, readWrite = true) {
    const options = { mode: readWrite ? 'readwrite' : 'read' };
    if ((await fileHandle.queryPermission(options)) === 'granted') return true;
    if ((await fileHandle.requestPermission(options)) === 'granted') return true;
    return false;
  }
  ```
- **File Scanning Algorithm**:
  ```javascript
  const files = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === "file") {
      const match = name.toLowerCase().match(/\.(voo|fig|psd|svg)$/);
      if (match) {
        const file = await handle.getFile();
        files.push({
          id: name,
          name,
          path: null,
          extension: match[1],
          size: file.size,
          updatedAt: file.lastModified,
          createdAt: file.lastModified,
          trashed: false,
          handle,
        });
      }
    }
  }
  ```
- **Trash Strategy**: Create `.trash/` sub-directory handle inside `dirHandle`. Moving to trash moves file into `.trash/`. Restoring moves back.

#### 2. Web IndexedDB Driver (`WebIdbWorkspaceDriver`)
- **Object Stores**:
  - `workspace_files`: Key path `id`. Stores `{ id, name, extension, bytes, size, createdAt, updatedAt, starred, category, preview }`.
  - `workspace_trash`: Key path `id`. Stores `{ ...file, trashedAt }`.
  - `workspace_meta`: Key path `key`. Stores `{ key: "config", path: "Virtual Workspace", isConfigured: true }`.
- **Zero-Dependency Guarantee**: Fully operational in Node.js Vitest unit tests (using the in-memory fallback already implemented in `src/storage/db.js`).

---

### 4.5 Implementation Plan & Affected Files

| Phase | Files to Touch / Create | Detailed Scope |
|---|---|---|
| **Phase 1: Electron Main & Preload** | `electron/workspace_manager.cjs` (new)<br>`electron/main.cjs`<br>`electron/preload.cjs` | 1. Implement `workspace_manager.cjs` (manages `projects_config.json`, `fs.watch`, `shell.trashItem`, atomic writes).<br>2. Wire IPC handlers into `main.cjs` under `workspace:*`.<br>3. Expose `workspace` API in `preload.cjs` under both `electronAPI` and `vooDesktop`. |
| **Phase 2: Unified Frontend Engine** | `src/services/workspace_storage.js` (new)<br>`src/services/drivers/electron_driver.js` (new)<br>`src/services/drivers/web_fsa_driver.js` (new)<br>`src/services/drivers/web_idb_driver.js` (new)<br>`src/storage/db.js` | 1. Implement polymorphic engine with automatic driver detection.<br>2. Add `workspace_files` and `workspace_meta` stores to IndexedDB schema in `src/storage/db.js`.<br>3. Provide metadata overlay for stars, previews, and categories. |
| **Phase 3: Integration with Store & UI** | `src/canvas/store/project_io.js`<br>`src/canvas/store/recent_files.js`<br>`src/store/design_store.js`<br>`src/canvas/components/welcome_dashboard.jsx`<br>`src/canvas/components/settings_general.jsx` | 1. Adapt `project_io.js` so default save writes to the configured workspace.<br>2. Upgrade `WelcomeDashboard` to display active workspace path, "Change Directory" button, and bind rename/trash to real filesystem I/O.<br>3. Add Workspace Directory selector into `SettingsGeneral` or a dedicated workspace section.<br>4. Integrate Onboarding Workspace Guide for first-time launch. |
| **Phase 4: Automated Testing & Verification** | `tests/unit/workspace_storage.test.js` (new)<br>`tests/unit/workspace_electron_ipc.test.js` (new)<br>`tests/unit/recent_files_and_welcome.test.js` | 1. Unit tests covering all 3 drivers.<br>2. Electron IPC mock tests verifying security isolation.<br>3. End-to-end regression testing (`npm test`). |

---

### 4.6 Edge Case Checklist

- [ ] **Windows Path Separators & File Locking**: Windows uses backslashes (`\`) and locks files during reads. Use `path.resolve` and temporary backup staging for atomic renames (`.tmp_` files).
- [ ] **Case-Only Renaming**: On macOS APFS and Windows NTFS, renaming `Poster.voo` to `poster.voo` in-place fails or no-ops with standard `rename`. Must use intermediate staging name (as verified in voo-run `ipc_workflow.js`).
- [ ] **Name Collisions**: If saving or renaming to an existing filename, auto-resolve to `${base}-2.voo`, `${base}-3.voo` or prompt confirmation.
- [ ] **Corrupted or 0-byte Files**: When scanning, if a `.voo` or `.fig` file has 0 bytes or is being written by another process, handle gracefully with a `"corrupt"` or `"syncing"` status badge rather than crashing the file list.
- [ ] **Permission Revocation in Web**: In Web FSA, if permission is lost or revoked, gracefully prompt the user to re-select or re-authorize the folder without losing canvas state.
- [ ] **Trash Unavailable**: In headless Linux or mounted network shares where `shell.trashItem` throws, seamlessly fall back to local hidden `.trash` directory or safe permanent delete.
- [ ] **Large Directory Throttling**: Limit scanned items to root directory, max 500 files, sorted by `mtimeMs` descending. Debounce `fs.watch` by 300ms.

---

## 5. Verification Method

To independently verify the investigation and future implementation:

1. **Verify Existing Tests Pass Cleanly**:
   ```bash
   npm test
   ```
   *Expected Result*: All 71 test suites and 842 tests pass with 0 errors.

2. **Verify Security & Isolation Compliance**:
   ```bash
   npx vitest run tests/unit/adversarial_isolation_electron_safety.test.js
   ```
   *Expected Result*: All Electron safety assertions pass, confirming `electronAPI` methods remain exposed and protected.

3. **Verify Design System Compliance**:
   ```bash
   npm run lint:design
   ```
   *Expected Result*: 0 design token violations.

4. **Verify Storage Engine Unit Tests (upon implementation)**:
   ```bash
   npx vitest run tests/unit/workspace_storage.test.js
   ```
   *Expected Result*: Complete coverage of Electron, Web FSA, and Web IDB drivers, including scanning, renaming, soft-trashing, and permanent deletion.

5. **Production Build & Server Deployment Gate**:
   ```bash
   npm run build
   VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh
   curl -sI https://la.voo.run/editor/ | head -n 1
   ```
   *Expected Result*: Clean Vite bundle, successful rsync to `la` (`103.114.160.86`), and HTTP 200 OK live probe.

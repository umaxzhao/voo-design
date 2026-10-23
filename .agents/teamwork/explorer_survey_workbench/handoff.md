# Technical Investigation Report: Workbench Integrated File Management (R3)

**Author:** `explorer_survey_workbench` (teamwork_preview_explorer)  
**Date:** 2026-10-21  
**Mission:** Comprehensive survey of Workbench Integrated File Management for VOO Design, bridging Storage Engine workspace files to `WelcomeDashboard`, synchronizing action handlers (star, rename, trash, delete, search/filter), and ensuring New Project / Save / Save As flows default to the active workspace directory.

---

## 1. Observation

### 1.1 Reference Codebase (`/Volumes/TD/Projects/voo-run`)

Direct inspection of `/Volumes/TD/Projects/voo-run` reveals how workspace directories, project files, and actions are structured:

1. **Workspace Configuration & Default Fallbacks**:
   - `electron/project_config.js`:
     - Line 38–48: `getDefaultVooProjectsDir()` points to `path.join(documentsRoot(), "VOO", "Projects")`.
     - Line 72–86: `getProjectsRootDir()` checks `projects_config.json` in user data directory. If a valid, writable path is configured, it returns it; otherwise falls back to `getDefaultVooProjectsDir()`.
     - Line 53–65: `isValidProjectsRootDir(dirPath)` strictly checks `fs.existsSync(resolved)`, `stat.isDirectory()`, and `fs.accessSync(resolved, fs.constants.W_OK)`.
     - Line 111–146: `setProjectsRootDir(targetPath)` writes the validated directory to config.
   - `electron/project_store.js`:
     - Line 161–176: Registers IPC handlers:
       - `voo:get-default-project-dir` -> returns default path.
       - `voo:get-projects-root-dir` -> returns active root path.
       - `voo:set-projects-root-dir` -> sets custom root path.
       - `voo:choose-projects-root-dir` -> native dialog:
         ```javascript
         dialog.showOpenDialog({
           title: "Choose projects root folder",
           defaultPath: getProjectsRootDir(),
           properties: ["openDirectory", "createDirectory"],
         });
         ```

2. **Workspace Scanning & Lifecycle Actions**:
   - `electron/project_store.js`:
     - Line 185–205 (`voo:create-project`): Creates collision-free project directory inside `getProjectsRootDir()`.
     - Line 223–232 (`voo:rename-project-dir`):
       ```javascript
       const parent = path.dirname(dir);
       const target = uniqueFolderPath(parent, base);
       if (target === dir) return { path: dir };
       fs.renameSync(dir, target);
       return { path: target };
       ```
     - Line 238–255 (`voo:delete-project-dir`): Uses Electron `shell.trashItem(dir)` for safe OS trash/recycle bin integration, falling back to `fs.rmSync(dir, { recursive: true, force: true })`.
     - Line 263–277 (`voo:list-project-dirs`): Scans `getProjectsRootDir()`, filters directories, and returns:
       ```javascript
       return {
         path: folder,
         name: entry.name,
         updatedAt: fs.statSync(folder).mtimeMs,
       };
       ```
   - `src/canvas/store/library.js`:
     - Line 40–93: `PROJECT_ROOTS_KEY = "voo.projectRoots"` stores document bindings in localStorage.
     - Line 125–164 (`renameProjectBindings`): Replaces path prefixes across all stored document entries using `replacePathPrefix` so references are never broken when a project folder is renamed on disk.

### 1.2 Current VOO Design Codebase (`/Users/tt/teamwork_projects/voo_design`)

1. **`WelcomeDashboard.jsx` Structure & Limitations**:
   - Location: `src/canvas/components/welcome_dashboard.jsx` (1,267 lines).
   - Line 20–32: Currently imports file management functions directly from `../store/recent_files.js`:
     `getRecentFiles`, `getDrafts`, `getStarredFiles`, `getTrashFiles`, `toggleStarFile`, `renameRecentFile`, `duplicateRecentFile`, `moveToTrash`, `restoreFromTrash`, `deletePermanently`, `emptyTrash`.
   - Line 103–137: `reloadFiles` reads strictly from synchronous `recent_files.js`.
   - Line 193–242: Action handlers (`handleToggleStar`, `handleStartRename`, `handleConfirmRename`, `handleDuplicate`, `handleMoveToTrash`, `handleRestore`, `handleDeletePermanently`).
   - Line 329–463: Left sidebar has search, tabs ("recents", "drafts", "starred", "trash", "design-systems", "shortcuts"), and footer `VOO Design 1.0`.
   - Line 468–503: Header has actions (Open File, New File, Empty Trash if in trash tab).
   - **Gaps directly observed**:
     - **No Active Workspace Indicator**: The dashboard has no display of the currently active workspace directory path, no button to change/switch workspace, and no "Reveal in Finder/File Manager" action.
     - **Complete Storage Decoupling**: File list is stored solely in `window.localStorage` under key `voo_design_recent_files`. If design files exist in the user's workspace directory on disk, `WelcomeDashboard` does NOT see or list them.
     - **Mock/Memory Operations**:
       - In `renameRecentFile`: only mutates the `name` string in `localStorage`. The physical file on disk remains unchanged.
       - In `moveToTrash`: only sets `trashed: true` in `localStorage`. The physical file remains on disk.
       - In `deletePermanently`: only removes the object from `localStorage`. The physical file remains on disk.
       - In `toggleStarFile`: only flips `starred` boolean in `localStorage`.

2. **New Project, Save, and Save As Flows**:
   - `src/store/design_store.js`:
     - Line 277–304 (`newVooProject`):
       ```javascript
       set({
         editingNodeId: pageId,
         nodes: [page],
         filePath: null,
         fileHandle: null,
         fileName: `${label}.voo`,
         isDirty: false,
         welcomeOpen: false,
       });
       ```
     - Initial `filePath` is `null`.
   - `src/canvas/store/project_io.js`:
     - Line 351–373 (Electron save branch):
       ```javascript
       if (window.electronAPI?.saveFileDialog && window.electronAPI?.writeFileBytes) {
         let targetPath = store.filePath;
         if (saveAs || !targetPath) {
           targetPath = await window.electronAPI.saveFileDialog({
             defaultPath: finalSuggestedName,
             filters: [SAVE_FORMATS[format].electronFilter],
           });
           if (!targetPath) return { canceled: true };
         }
       ```
       - `defaultPath` is passed simply as `finalSuggestedName` (e.g. `Design 1.voo`).
       - Because there is no directory prefix, the native dialog opens in whatever folder the OS or user last visited, completely ignoring the active workspace directory!
     - Line 375–412 (Web `showSaveFilePicker` branch):
       - `showSaveFilePicker({ suggestedName: finalSuggestedName })` does not specify `startIn: directoryHandle`, causing files to be saved haphazardly.

3. **Title Bar & Settings Drawer Integration**:
   - `src/app_title_bar.jsx`: Top title bar renders `APP_DISPLAY_NAME` ("VOO Design"), `CanvasTabBar`, `保存 (⌘S)`, `打开 (⌘O)`, and `Settings (⌘,)`.
   - `src/canvas/components/settings_drawer.jsx` & `settings_general.jsx`: General tab currently holds Profile and Language. It is the natural home for configuring and switching the workspace directory.
   - `src/shared/settings.js`: `STORAGE_KEYS` holds shared settings mirrored across localStorage and memory cache.

---

## 2. Logic Chain

1. **Premise 1 (Physical vs Virtual State)**: VOO Design aims to be an industrial-grade design studio (aligning with voo-run and Figma standards). Storing files merely as disconnected localStorage records violates Requirement R3 ("工作台直观呈现当前激活的工作区路径、变更按钮以及工作区内的所有项目文件列表；实现工作台与物理文件系统的双向联动").
2. **Premise 2 (Unified Storage Contract)**: Sibling agent `explorer_survey_storage` (R2) is architecting the Dual-Platform Workspace Storage Engine (`WorkspaceStorageService` / `window.electronAPI.workspace`). The workbench (`WelcomeDashboard`) must consume this engine as the single source of truth for workspace files.
3. **Premise 3 (Hybrid Metadata Architecture)**: File system entries provide physical attributes (`name`, `path`, `ext`, `size`, `mtime`). However, design editors also require user-curated metadata that does not exist in standard filesystem inodes:
   - `isStarred` (favorite status)
   - `trashed` / `trashedAt` (soft-delete state within the workspace)
   - `thumbnail` (cached raster preview data URL generated during save)
   - `category` (landing, mobile, web, slides, dashboard)
   Therefore, the workspace file manager must employ a **Merged Inode-Metadata Model**: scan physical files from disk, merge with persisted metadata (stored in `.voo/workspace-meta.json` or IndexedDB/localStorage), and present a unified, rich project item list.
4. **Premise 4 (Bidirectional Synchronization)**:
   - When a user performs an action in the UI (e.g., Rename), the workbench must invoke the Storage Engine to rename the file on disk (`fs.rename`), update the metadata key, and notify any active canvas sessions if that file is currently open.
   - When files are created, modified, or deleted outside VOO (e.g., via Finder or git pull), the Storage Engine's file watcher must emit events to trigger an automatic, debounced refresh in `WelcomeDashboard`.
5. **Premise 5 (Default Storage Location)**:
   - In `saveVooProject`, if `filePath` is empty or `saveAs` is true, the `defaultPath` passed to `saveFileDialog` must be constructed as `path.join(activeWorkspaceDir, finalSuggestedName)`.
   - In Web mode, `showSaveFilePicker` should use `startIn: workspaceDirectoryHandle`.
   - This ensures all newly created projects naturally stay organized inside the workspace without scattered, orphaned files.

---

## 3. Data Model for Workspace Project Items

```typescript
export interface WorkspaceProjectItem {
  /** Unique identifier: absolute path in Electron, or relative path/handle key in Web */
  id: string;

  /** File display name with extension (e.g. "Hero Banner.voo") */
  name: string;

  /** Absolute filesystem path (null in purely virtual web sessions) */
  path: string | null;

  /** Normalized extension: ".voo" | ".fig" | ".psd" | ".svg" | ".json" */
  ext: ".voo" | ".fig" | ".psd" | ".svg" | ".json" | string;

  /** File size in bytes (from fs.stat or file blob) */
  size: number | null;

  /** Last modified timestamp in milliseconds */
  mtime: number;

  /** Creation timestamp in milliseconds */
  createdAt: number;

  /** Whether the user has starred/favorited this project */
  isStarred: boolean;

  /** Soft-delete status (in workspace .trash or marked as trashed) */
  isTrashed: boolean;

  /** Timestamp when moved to trash, or null */
  trashedAt: number | null;

  /** True if this is an unsaved in-memory draft */
  isDraft: boolean;

  /** Base64 preview data URL (JPEG/PNG) generated on save */
  thumbnail: string | null;

  /** Document type classifier */
  type: "voo" | "fig" | "psd" | "svg" | "json";

  /** Category classification for template/filter pills */
  category?: "landing" | "mobile" | "web" | "slides" | "dashboard" | "other" | "all";

  /** Web File System Access API handle (Web mode only) */
  fileHandle?: FileSystemFileHandle | null;
}
```

### Metadata Storage Strategy
- **Electron (Desktop)**: Persisted in `<workspaceRoot>/.voo/workspace-meta.json` (created automatically and hidden). A mirror copy is cached in `localStorage` (`voo.workspace.meta`) for instantaneous zero-latency UI rendering before async disk I/O completes.
- **Web (Browser)**: Persisted in IndexedDB store `workspace_metadata` and mirrored in `localStorage`.

---

## 4. Component Hierarchy & Modifications for `WelcomeDashboard`

### 4.1 Component Tree Hierarchy

```
WelcomeDashboard (src/canvas/components/welcome_dashboard.jsx)
├── Left Sidebar (<aside>)
│   ├── Workspace Brand & Status Header
│   ├── Active Workspace Pill / Selector
│   │   ├── Folder Icon + Truncated Workspace Path
│   │   └── Switch Workspace Button ("更换目录" / "Change")
│   ├── Search Field (<input data-search-field>)
│   ├── Navigation Tabs
│   │   ├── Recents (Clock icon + Count badge)
│   │   ├── Drafts (File icon + Count badge)
│   │   ├── Starred (Star icon + Count badge)
│   │   └── Trash (Trash2 icon + Count badge)
│   ├── Section: Templates & Systems (Design Systems, Shortcuts)
│   └── Footer Status (VOO Design 1.0 + Live Watcher Status Dot)
│
└── Main Workspace Area (<main>)
    ├── Top Header Bar (<header>)
    │   ├── Active Workspace Path Bar (Figma-style Breadcrumb / Workspace Name)
    │   │   ├── Workspace Name & Absolute Path
    │   │   ├── "Reveal in Finder" Action Button (Desktop only)
    │   │   └── Rescan / Refresh Button (with spinner)
    │   └── Actions Group
    │       ├── Empty Trash (active in Trash tab)
    │       ├── Open Local / External File (FolderOpen)
    │       └── New Design File (Plus button -> creates inside workspace)
    │
    ├── Content View (Based on activeTab)
    │   ├── Category Filter Pills ("All", "Landing", "Mobile", "Web", "Slides", "Dashboard", "Other")
    │   ├── AI Prompt Box (Quick project generator)
    │   ├── Quick Action Cards (Import Figma, Browser Import, Screenshot)
    │   └── Project Items Container
    │       ├── List Toolbar (Item Count, Sort Dropdown, Grid/List Toggle)
    │       ├── Grid View: Project Cards
    │       │   ├── Thumbnail Area + Star & More Context Buttons
    │       │   ├── Type Badge (.voo, .fig, .psd, .svg)
    │       │   └── Name, Relative Time, Size
    │       └── List View: Figma-style Tabular Rows
    │           ├── Star, Type Icon, Name, Draft Pill
    │           ├── Last Modified Time
    │           ├── Extension / File Size
    │           └── More Actions Dropdown
    │
    ├── Modals & Overlays
    │   ├── Rename Modal Dialog (Syncs with disk file + metadata)
    │   ├── Delete / Empty Trash Confirmation Dialog
    │   └── Workspace Directory Picker Dialog / Guide Trigger
```

### 4.2 Key Visual Additions (Adhering to `Design.md`)

1. **Active Workspace Header Strip**:
   - Placed either in the left sidebar under the brand header, or at the top of the main area.
   - Styling:
     ```jsx
     <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] transition-colors border border-white/5">
       <div className="flex items-center gap-2 min-w-0">
         <FolderOpen size={14} className="text-mint shrink-0" />
         <div className="flex flex-col min-w-0">
           <span className="text-[10px] text-neutral-400 font-medium truncate">
             {t("welcome.workspace.activeLabel")}
           </span>
           <span className="text-xs font-mono text-neutral-200 truncate" title={workspacePath}>
             {formatWorkspacePath(workspacePath)}
           </span>
         </div>
       </div>
       <div className="flex items-center gap-1 shrink-0">
         <button
           type="button"
           onClick={handleChangeWorkspace}
           className="px-2 py-1 text-[11px] font-medium text-neutral-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
           title={t("welcome.workspace.changeTooltip")}
         >
           {t("welcome.workspace.change")}
         </button>
         {isDesktop && (
           <button
             type="button"
             onClick={handleRevealInFinder}
             className="p-1 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
             title={t("welcome.workspace.revealTooltip")}
           >
             <ExternalLink size={13} />
           </button>
         )}
       </div>
     </div>
     ```
   - Meets `Design.md`: No excessive border nesting, subtle lightness elevation (`bg-white/[0.04]`), mint accent icon, high-contrast typography.

---

## 5. Operations & Action Handlers

| Operation | Trigger | Desktop (Electron) Execution | Web (Browser) Execution | State / Metadata Update |
|---|---|---|---|---|
| **Star / Unstar** | Click Star icon on card/row or dropdown menu | None (pure metadata) | None (pure metadata) | Updates `isStarred` in workspace metadata JSON / IndexedDB & localStorage; re-sorts starred tab |
| **Rename** | Dropdown -> "Rename" -> Dialog confirm | `window.electronAPI.workspace.renameFile(oldPath, newPath)` via `fs.renameSync` | `fileHandle.move(newName)` or copy-delete | Renames physical file, updates metadata key, updates active canvas `filePath`/`fileName` if currently open |
| **Move to Trash** (Soft-delete) | Dropdown -> "Move to Trash" | Moves file to `<workspace>/.trash/` or calls `shell.trashItem` (reversible) | Marks item as `isTrashed: true` in metadata / moves to virtual `.trash` | Item leaves Recents/Drafts/Starred and appears in Trash tab with `trashedAt` timestamp |
| **Restore from Trash** | Trash tab -> "Restore" | Moves file from `<workspace>/.trash/` back to root directory | Sets `isTrashed: false` | Restores to original view and refreshes list |
| **Permanent Delete** | Trash tab -> Dropdown -> "Delete Permanently" | `shell.trashItem(filePath)` or `fs.unlinkSync(filePath)` with confirmation | Removes from virtual directory / IndexedDB | Permanent removal from disk and metadata index |
| **Empty Trash** | Trash tab -> "Empty Trash" button | Iterates all files in `.trash/` and permanently removes them | Clears virtual trash records | Empties trash folder on disk and metadata index |
| **Duplicate** | Dropdown -> "Duplicate" | Copies `<name>.voo` to `<name> (Copy).voo` on disk using collision-free naming | Duplicates object in storage | Adds new project item to workspace and triggers watcher |
| **Filter by Type/Pills** | Category pills & search box | Filters merged list in-memory | Filters merged list in-memory | Reactive filtered state without disk refetch |

---

## 6. Integration with Save, Save As, and New Project Flows

### 6.1 Defaulting `saveVooProject` to Active Workspace
In `src/canvas/store/project_io.js`:

```javascript
// Electron Branch in saveVooProject:
if (window.electronAPI?.saveFileDialog && window.electronAPI?.writeFileBytes) {
  let targetPath = store.filePath;
  if (saveAs || !targetPath) {
    const workspaceRoot = await getActiveWorkspacePath();
    const suggestedPath = workspaceRoot
      ? path.join(workspaceRoot, finalSuggestedName)
      : finalSuggestedName;

    targetPath = await window.electronAPI.saveFileDialog({
      defaultPath: suggestedPath,
      filters: [SAVE_FORMATS[format].electronFilter],
    });
    if (!targetPath) return { canceled: true };
  }
  await window.electronAPI.writeFileBytes(targetPath, fileBytes);
  // ... update store and workspace metadata
}
```

### 6.2 New Project Flow
In `src/store/design_store.js`:
- `newVooProject({ label })`: Initializes new document in memory with `fileName: `${label}.voo`` and `filePath: null`.
- On first `Cmd+S`, `saveVooProject` immediately defaults `suggestedPath` to the active workspace directory, ensuring single-click save into the user's workspace without folder hopping.

---

## 7. Implementation Plan & Affected Files

### Phase 1: Storage & Workspace Store Foundation
- **Files**:
  - `src/shared/settings.js`: Register `voo.workspace.rootDir` and `voo.workspace.activeName` in `STORAGE_KEYS`.
  - `src/canvas/store/workspace_store.js` (NEW):
    - Zustand store managing `activeWorkspacePath`, `workspaceFiles`, `isScanning`, `watcherActive`.
    - Coordinates with `workspaceStorage` (from R2).
  - `src/canvas/store/recent_files.js`:
    - Refactor to integrate with `workspace_store.js` while maintaining backward compatibility for legacy tests.

### Phase 2: `WelcomeDashboard` UI Upgrade
- **Files**:
  - `src/canvas/components/welcome_dashboard.jsx`:
    - Add Active Workspace Pill / Header with path, Change button, Reveal button, and Rescan indicator.
    - Connect `reloadFiles` to `useWorkspaceStore` subscription.
    - Connect Rename, Trash, Star, Delete actions to physical file system operations.
  - `src/shared/i18n/welcome-zh.js` & `welcome-en.js`:
    - Synchronize new keys:
      - `welcome.workspace.activeLabel`: "当前工作区" / "Active Workspace"
      - `welcome.workspace.change`: "更换" / "Change"
      - `welcome.workspace.reveal`: "在访达中显示" / "Reveal in Finder"
      - `welcome.workspace.rescan`: "刷新扫描" / "Rescan"
      - `welcome.workspace.switchSuccess`: "工作区切换成功" / "Workspace switched successfully"
      - `welcome.actions.trashDiskConfirm`: "确定移入废纸篓吗？" / "Move to trash?"

### Phase 3: Save & Save As Alignment
- **Files**:
  - `src/canvas/store/project_io.js`:
    - Import active workspace resolver.
    - Prefix `defaultPath` with active workspace directory in `saveFileDialog` and `showSaveFilePicker`.
  - `src/canvas/components/settings_general.jsx`:
    - Add "工作区目录 / Workspace Directory" section with current path display and change button.

### Phase 4: Automated Verification
- **Files**:
  - `tests/unit/workspace_dashboard_integration.test.js` (NEW):
    - Tests for active workspace path display, file scanning, star/unstar persistence, disk rename synchronization, soft-delete to trash, and Save dialog default path derivation.

---

## 8. Edge Case Checklist

1. **Unreachable or Deleted Workspace Directory**:
   - If the user disconnects an external volume or deletes their custom workspace directory, `getProjectsRootDir()` must fall back gracefully to `getDefaultVooProjectsDir()` (`~/Documents/VOO/Projects`), create it if necessary, and display an informational notice without crashing.
2. **File Name Collisions on Rename or Duplicate**:
   - If user attempts to rename `App.voo` to `Landing.voo` when `Landing.voo` already exists in the folder, the operation must abort with a localized error message (`t("welcome.error.fileExists")`) rather than silently overwriting the target.
3. **Renaming the Open Project**:
   - If the user renames a file while that project is actively open in the editor (or in another tab), `designStore.setFilePath` and `fileName` must update synchronously so subsequent autosave writes to the new file path.
4. **Debounced File Watching**:
   - When large batches of files are copied or unpacked in the workspace folder, the watcher must debounce reload events (200ms) to prevent UI freeze and redundant disk queries.
5. **Special Characters in Names**:
   - Validate and sanitize input during rename (disallow `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`).
6. **Cross-Platform Separator Normalization**:
   - Handle Windows backslashes (`\`) vs POSIX slashes (`/`) cleanly using path abstraction utilities.
7. **Clean Design Lint Compliance**:
   - Ensure all new JSX conforms to `Design.md` (no light elements, proper surface layering, zero `lint:design` violations).

---

## 9. Caveats

1. **Storage Engine Contract Dependency**: This workbench investigation relies on the dual-platform storage engine being implemented by sibling agent `explorer_survey_storage`. The interface proposed above (`window.electronAPI.workspace` and `WorkspaceStorageService`) must be finalized in coordination with their findings.
2. **Web File System Access API Permissions**: In browser environments, the File System Access API requires user gesture activation and may request re-permission across browser restarts. The virtual IndexedDB fallback must remain completely functional.

---

## 10. Conclusion

The current `WelcomeDashboard` has an established Figma-like layout with search, category filtering, and list/grid views, but operates purely on isolated `localStorage` records. By introducing the **Active Workspace Indicator**, binding `WelcomeDashboard` to the physical **Workspace Storage Engine**, and prefixing default save dialog paths with the active workspace directory, VOO Design will achieve complete bidirectional filesystem synchronization, robust project management (star, rename, soft-delete, trash), and an organized, professional workflow.

---

## 11. Verification Method

To independently verify the analysis and subsequent implementation:
1. **Design Lint**:
   ```bash
   npm run lint:design
   ```
   Must report 0 violations across all files.
2. **Unit & Integration Tests**:
   ```bash
   npm test
   ```
   All test suites must pass (842+ tests).
3. **Production Build**:
   ```bash
   npm run build
   ```
   Must bundle cleanly without missing module or TypeScript errors.
4. **Functional Checks**:
   - Launch app -> WelcomeDashboard displays active workspace path.
   - Click "Change" -> updates workspace directory and rescans.
   - Click Star -> status persists across reloads.
   - Click Rename -> changes physical filename on disk and updates list.
   - Click Move to Trash -> moves file into `.trash/` or system trash.
   - Press `Cmd+S` on new canvas -> Save dialog opens directly inside active workspace folder.

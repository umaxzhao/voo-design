/**
 * Workspace Directory Management Engine for VOO Design Desktop (Electron)
 *
 * Responsibilities:
 * 1. Persists user workspace configuration in `projects_config.json` under `app.getPath("userData")`.
 * 2. Provides default fallback to `~/Documents/VOO/Projects`.
 * 3. Validates folder existence and write permissions (`isValidProjectsRootDir`).
 * 4. Shallow scans workspace directory for design files (.voo, .fig, .psd, .svg).
 * 5. Handles atomic writes, path traversal prevention, case-only renames (APFS / NTFS), and collision checks.
 * 6. Executes safe deletions (shell.trashItem -> .trash/ folder -> safe unlink).
 * 7. Debounced (300ms) file watcher broadcasting `workspace:changed` to the renderer.
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function getElectron() {
  try {
    return require("electron");
  } catch {
    return null;
  }
}

function getApp() {
  return getElectron()?.app;
}

function getDialog() {
  return getElectron()?.dialog;
}

function getShell() {
  return getElectron()?.shell;
}

const CONFIG_FILE = "projects_config.json";
const ALLOWED_EXTENSIONS = new Set(["voo", "fig", "psd", "svg"]);
const MAX_SCAN_ENTRIES = 500;

// Watcher state
let activeWatcher = null;
let watcherDebounceTimer = null;
let currentWatchedDir = null;

function userDataDir() {
  const app = getApp();
  return (
    process.env.VOO_USER_DATA_DIR ||
    (app?.getPath ? app.getPath("userData") : null) ||
    os.tmpdir()
  );
}

function documentsRoot() {
  const app = getApp();
  return (
    process.env.VOO_DOCUMENTS_ROOT ||
    (app?.getPath ? app.getPath("documents") : null) ||
    path.join(os.homedir(), "Documents")
  );
}

function configFilePath() {
  const dir = userDataDir();
  return dir ? path.join(dir, CONFIG_FILE) : null;
}

/**
 * Default VOO workspace directory for projects (~/Documents/VOO/Projects).
 */
function getDefaultDirectory() {
  const defaultDir = path.join(documentsRoot(), "VOO", "Projects");
  if (!fs.existsSync(defaultDir)) {
    try {
      fs.mkdirSync(defaultDir, { recursive: true });
    } catch {
      // Ignored if cannot create immediately; caller validates
    }
  }
  return defaultDir;
}

/**
 * Validates that a path exists, is a directory, and has write access.
 */
function isValidWorkspaceDir(dirPath) {
  if (typeof dirPath !== "string" || !dirPath.trim()) return false;
  const resolved = path.resolve(dirPath.trim());
  try {
    if (!fs.existsSync(resolved)) return false;
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return false;
    fs.accessSync(resolved, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const isValidProjectsRootDir = isValidWorkspaceDir;

/**
 * Reads the active workspace configuration.
 */
function getWorkspaceConfig() {
  const file = configFilePath();
  let configuredRoot = null;
  let isConfigured = false;

  if (file && fs.existsSync(file)) {
    try {
      const raw = fs.readFileSync(file, "utf8");
      const data = JSON.parse(raw);
      const candidate = data?.workspaceRoot || data?.projectsRoot;
      if (candidate && isValidWorkspaceDir(candidate)) {
        configuredRoot = path.resolve(candidate);
        isConfigured = true;
      }
    } catch {
      // Corrupt or unreadable JSON, fall back to default
    }
  }

  const activePath = configuredRoot || getDefaultDirectory();

  return {
    type: "electron",
    path: activePath,
    isDefault: !isConfigured,
    isConfigured,
  };
}

/**
 * Persists a new workspace root directory.
 */
function setWorkspaceRootDir(targetPath) {
  if (typeof targetPath !== "string" || !targetPath.trim()) {
    return { ok: false, error: "invalid_path" };
  }
  const resolved = path.resolve(targetPath.trim());
  if (!isValidWorkspaceDir(resolved)) {
    return { ok: false, error: "invalid_directory" };
  }

  const file = configFilePath();
  if (!file) {
    return { ok: false, error: "no_user_data" };
  }

  try {
    const parentDir = path.dirname(file);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    const current = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8") || "{}")
      : {};
    current.workspaceRoot = resolved;
    current.projectsRoot = resolved;
    current.updatedAt = Date.now();
    fs.writeFileSync(file, JSON.stringify(current, null, 2), "utf8");

    return {
      ok: true,
      path: resolved,
      config: {
        type: "electron",
        path: resolved,
        isDefault: false,
        isConfigured: true,
      },
    };
  } catch (err) {
    return { ok: false, error: err.message || "write_failed" };
  }
}

const setWorkspaceRoot = setWorkspaceRootDir;

/**
 * Shallow scan of the workspace root for .voo, .fig, .psd, .svg files.
 */
function scanWorkspaceFiles(rootDir) {
  const dir = rootDir || getWorkspaceConfig().path;
  if (!dir || !fs.existsSync(dir)) {
    return { ok: false, error: "directory_not_found", files: [] };
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      // Skip hidden, temporary, or staging files
      if (
        name.startsWith(".") ||
        name.startsWith("__voo_") ||
        name.includes(".tmp_") ||
        name.includes(".bak_")
      ) {
        continue;
      }

      const match = name.match(/\.([a-zA-Z0-9]+)$/);
      if (!match) continue;
      const ext = match[1].toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;

      const fullPath = path.join(dir, name);
      try {
        const stat = fs.statSync(fullPath);
        files.push({
          id: fullPath,
          name,
          path: fullPath,
          extension: ext,
          size: stat.size,
          updatedAt: Math.round(stat.mtimeMs),
          createdAt: Math.round(stat.birthtimeMs || stat.ctimeMs || stat.mtimeMs),
          starred: false,
          trashed: false,
          trashedAt: null,
        });
      } catch {
        // Skip entry if stat fails (e.g. file deleted concurrently)
      }

      if (files.length >= MAX_SCAN_ENTRIES) break;
    }

    files.sort((a, b) => b.updatedAt - a.updatedAt);
    return { ok: true, files };
  } catch (err) {
    return { ok: false, error: err.message, files: [] };
  }
}

/**
 * Sanitizes filename preventing illegal OS characters.
 */
function sanitizeFileName(name) {
  if (typeof name !== "string") return "";
  return path.basename(name.trim()).replace(/[/\\:*?"<>|]/g, "_");
}

/**
 * Resolves collision-free file name: `base-2.ext`, `base-3.ext`, ...
 */
function resolveCollisionName(dir, baseName, extension) {
  let counter = 2;
  let candidate = `${baseName}-${counter}.${extension}`;
  while (fs.existsSync(path.join(dir, candidate))) {
    counter++;
    candidate = `${baseName}-${counter}.${extension}`;
  }
  return candidate;
}

/**
 * Renames a project file on disk with case-only intermediate staging and collision handling.
 */
function renameWorkspaceFile(filePath, newName, options = {}) {
  if (!filePath || typeof filePath !== "string" || !fs.existsSync(filePath)) {
    return { ok: false, error: "file_not_found" };
  }
  if (!newName || typeof newName !== "string") {
    return { ok: false, error: "invalid_name" };
  }
  if (newName.includes("..") || newName.includes("/") || newName.includes("\\")) {
    return { ok: false, error: "path_traversal_invalid_name" };
  }

  let cleanName = sanitizeFileName(newName);
  if (!cleanName) {
    return { ok: false, error: "invalid_name" };
  }

  const dir = path.dirname(filePath);
  const oldExtMatch = filePath.match(/\.([a-zA-Z0-9]+)$/);
  const oldExt = oldExtMatch ? oldExtMatch[1] : "";

  // Append original extension if omitted in newName
  if (!cleanName.includes(".") && oldExt) {
    cleanName = `${cleanName}.${oldExt}`;
  }

  const targetPath = path.join(dir, cleanName);

  if (targetPath === filePath) {
    return { ok: true, newPath: filePath, newName: cleanName, unchanged: true };
  }

  if (fs.existsSync(targetPath)) {
    // Case-only rename on case-preserving/case-insensitive filesystems (APFS/NTFS)
    if (targetPath.toLowerCase() === filePath.toLowerCase()) {
      try {
        const stagingPath = path.join(
          dir,
          `__voo_rename_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${cleanName}`
        );
        fs.renameSync(filePath, stagingPath);
        fs.renameSync(stagingPath, targetPath);
        return { ok: true, newPath: targetPath, newName: cleanName };
      } catch (err) {
        return { ok: false, error: err.message || "case_rename_failed" };
      }
    } else {
      // Collision with a distinct file
      if (options.resolveCollision) {
        const extMatch = cleanName.match(/^(.*)\.([a-zA-Z0-9]+)$/);
        const base = extMatch ? extMatch[1] : cleanName;
        const ext = extMatch ? extMatch[2] : oldExt;
        const collisionFree = resolveCollisionName(dir, base, ext);
        const collisionPath = path.join(dir, collisionFree);
        try {
          fs.renameSync(filePath, collisionPath);
          return {
            ok: true,
            newPath: collisionPath,
            newName: collisionFree,
            collisionResolved: true,
          };
        } catch (err) {
          return { ok: false, error: err.message || "collision_rename_failed" };
        }
      }
      return { ok: false, error: "A file with this name already exists" };
    }
  }

  try {
    fs.renameSync(filePath, targetPath);
    return { ok: true, newPath: targetPath, newName: cleanName };
  } catch (err) {
    return { ok: false, error: err.message || "rename_failed" };
  }
}

/**
 * Moves file to OS trash or hidden .trash/ folder fallback.
 */
async function moveWorkspaceFileToTrash(filePath, workspaceRoot) {
  if (!filePath || typeof filePath !== "string" || !fs.existsSync(filePath)) {
    return { ok: false, error: "file_not_found" };
  }

  // 1. Native OS trash
  const shell = getShell();
  if (shell?.trashItem) {
    try {
      await shell.trashItem(filePath);
      return { ok: true, method: "shell.trashItem" };
    } catch {
      // Continue to fallback
    }
  }

  // 2. Hidden .trash/ directory fallback
  try {
    const root = workspaceRoot || path.dirname(filePath);
    const trashDir = path.join(root, ".trash");
    if (!fs.existsSync(trashDir)) {
      fs.mkdirSync(trashDir, { recursive: true });
    }
    const baseName = path.basename(filePath);
    const target = path.join(trashDir, baseName);
    if (fs.existsSync(target)) {
      try {
        fs.unlinkSync(target);
      } catch {}
    }
    fs.renameSync(filePath, target);
    return { ok: true, method: "hidden_trash_folder" };
  } catch {
    // Continue to fallback
  }

  // 3. Safe unlink fallback
  try {
    if (fs.promises?.rm) {
      await fs.promises.rm(filePath, { force: true, recursive: true });
    } else {
      fs.unlinkSync(filePath);
    }
    return { ok: true, method: "permanent_unlink_fallback" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

const moveFileToTrash = moveWorkspaceFileToTrash;

/**
 * Restores file from .trash/ folder back to workspace root.
 */
async function restoreWorkspaceFileFromTrash(filePathOrName, workspaceRoot) {
  const root = workspaceRoot || getWorkspaceConfig().path;
  const trashDir = path.join(root, ".trash");
  const fileName = path.basename(filePathOrName);
  const trashPath = path.join(trashDir, fileName);
  const destPath = path.join(root, fileName);

  if (!fs.existsSync(trashPath)) {
    return { ok: false, error: "file_not_found_in_trash" };
  }
  try {
    fs.renameSync(trashPath, destPath);
    return { ok: true, path: destPath, name: fileName };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Permanently deletes a file from disk.
 */
async function deleteWorkspaceFilePermanently(filePath) {
  if (!filePath || typeof filePath !== "string" || !fs.existsSync(filePath)) {
    return { ok: false, error: "file_not_found" };
  }
  try {
    if (fs.promises?.rm) {
      await fs.promises.rm(filePath, { force: true, recursive: true });
    } else {
      fs.unlinkSync(filePath);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

const deleteFilePermanently = deleteWorkspaceFilePermanently;

/**
 * Empties all files from workspace .trash/ directory.
 */
async function emptyWorkspaceTrash(workspaceRoot) {
  const root = workspaceRoot || getWorkspaceConfig().path;
  const trashDir = path.join(root, ".trash");
  if (!fs.existsSync(trashDir)) {
    return { ok: true, deletedCount: 0 };
  }
  try {
    const entries = fs.readdirSync(trashDir);
    let count = 0;
    for (const file of entries) {
      const full = path.join(trashDir, file);
      try {
        if (fs.promises?.rm) {
          await fs.promises.rm(full, { recursive: true, force: true });
        } else {
          fs.unlinkSync(full);
        }
        count++;
      } catch {}
    }
    return { ok: true, deletedCount: count };
  } catch (err) {
    return { ok: false, error: err.message, deletedCount: 0 };
  }
}

/**
 * Atomically writes file bytes into workspace directory.
 */
async function writeWorkspaceFileBytes(rootDir, name, bytes, options = {}) {
  const dir = rootDir || getWorkspaceConfig().path;
  if (!isValidWorkspaceDir(dir)) {
    return { ok: false, error: "invalid_workspace_dir" };
  }
  if (!name || typeof name !== "string") {
    return { ok: false, error: "invalid_name" };
  }
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    return { ok: false, error: "path_traversal_invalid_name" };
  }

  let cleanName = sanitizeFileName(name);
  if (!cleanName) return { ok: false, error: "invalid_name" };

  let targetPath = path.join(dir, cleanName);

  if (fs.existsSync(targetPath) && !options.overwrite) {
    const extMatch = cleanName.match(/^(.*)\.([a-zA-Z0-9]+)$/);
    const base = extMatch ? extMatch[1] : cleanName;
    const ext = extMatch ? extMatch[2] : "voo";
    cleanName = resolveCollisionName(dir, base, ext);
    targetPath = path.join(dir, cleanName);
  }

  const stagingPath = path.join(
    dir,
    `.${cleanName}.tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  );

  try {
    let buffer;
    if (Buffer.isBuffer(bytes)) {
      buffer = bytes;
    } else if (bytes instanceof Uint8Array) {
      buffer = Buffer.from(bytes);
    } else if (bytes instanceof ArrayBuffer) {
      buffer = Buffer.from(new Uint8Array(bytes));
    } else if (typeof bytes === "string") {
      buffer = Buffer.from(bytes, "utf8");
    } else {
      buffer = Buffer.from(bytes);
    }

    await fs.promises.writeFile(stagingPath, buffer);
    fs.renameSync(stagingPath, targetPath);

    const stat = fs.statSync(targetPath);
    const extMatch = cleanName.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : "voo";

    return {
      ok: true,
      file: {
        id: targetPath,
        name: cleanName,
        path: targetPath,
        extension: ext,
        size: stat.size,
        updatedAt: Math.round(stat.mtimeMs),
        createdAt: Math.round(stat.birthtimeMs || stat.ctimeMs || stat.mtimeMs),
        starred: false,
        trashed: false,
        trashedAt: null,
      },
    };
  } catch (err) {
    if (fs.existsSync(stagingPath)) {
      try {
        fs.unlinkSync(stagingPath);
      } catch {}
    }
    return { ok: false, error: err.message };
  }
}

/**
 * Reveals item in Finder / File Explorer.
 */
function revealItemInFinder(filePath) {
  if (!filePath || typeof filePath !== "string" || !fs.existsSync(filePath)) {
    return false;
  }
  try {
    const shell = getShell();
    if (shell?.showItemInFolder) {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Starts debounced (300ms) directory watcher on active workspace.
 */
function startWorkspaceWatcher(dirPath, onChange) {
  stopWorkspaceWatcher();
  if (!dirPath || !fs.existsSync(dirPath)) return;

  currentWatchedDir = dirPath;
  try {
    activeWatcher = fs.watch(dirPath, { persistent: false }, (eventType, filename) => {
      if (!filename) return;
      // Filter out internal hidden and temporary files
      if (
        filename.startsWith(".") ||
        filename.startsWith("__voo_") ||
        filename.includes(".tmp_") ||
        filename.includes(".bak_") ||
        filename === CONFIG_FILE
      ) {
        return;
      }

      if (watcherDebounceTimer) clearTimeout(watcherDebounceTimer);
      watcherDebounceTimer = setTimeout(() => {
        try {
          if (typeof onChange === "function") {
            onChange(eventType, filename);
          }
        } catch {
          // Ignore errors if receiver window is closed
        }
      }, 300);
    });

    activeWatcher.on("error", (err) => {
      console.warn("[workspace_manager] Watcher error:", err.message);
    });
  } catch (err) {
    console.warn("[workspace_manager] Could not start watcher on:", dirPath, err.message);
  }
}

/**
 * Stops directory watcher.
 */
function stopWorkspaceWatcher() {
  if (watcherDebounceTimer) {
    clearTimeout(watcherDebounceTimer);
    watcherDebounceTimer = null;
  }
  if (activeWatcher) {
    try {
      activeWatcher.close();
    } catch {}
    activeWatcher = null;
  }
  currentWatchedDir = null;
}

/**
 * Registers all workspace:* IPC handlers on ipcMain.
 */
/**
 * Lists the project folders directly under the workspace root. Hidden and
 * internal folders (".trash", "__voo_*") are not projects and are skipped.
 */
function listWorkspaceFolders(rootDir) {
  const dir = rootDir || getWorkspaceConfig().path;
  if (!dir || !fs.existsSync(dir)) {
    return { ok: false, error: "directory_not_found", folders: [] };
  }
  try {
    const folders = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !entry.name.startsWith(".") && !entry.name.startsWith("__voo_"))
      .map((entry) => ({ id: entry.name, name: entry.name, path: path.join(dir, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, folders };
  } catch (err) {
    return { ok: false, error: err.message, folders: [] };
  }
}

/**
 * Creates a project folder under the workspace root. Fails rather than
 * merging into an existing folder, so a name clash is visible to the user.
 */
function createWorkspaceFolder(rootDir, name) {
  const dir = rootDir || getWorkspaceConfig().path;
  const safeName = sanitizeFileName(name);
  if (!dir || !fs.existsSync(dir)) {
    return { ok: false, error: "directory_not_found" };
  }
  if (!safeName || safeName.startsWith(".")) {
    return { ok: false, error: "invalid_name" };
  }
  const target = path.join(dir, safeName);
  if (fs.existsSync(target)) {
    return { ok: false, error: "already_exists" };
  }
  try {
    fs.mkdirSync(target);
    return { ok: true, folder: { id: safeName, name: safeName, path: target } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function registerWorkspaceIpc(ipcMain, getMainWindow) {
  if (!ipcMain) return;

  ipcMain.handle("workspace:getConfig", () => {
    return getWorkspaceConfig();
  });

  ipcMain.handle("workspace:getDefaultDirectory", () => {
    return getDefaultDirectory();
  });

  ipcMain.handle("workspace:chooseDir", async () => {
    const win = typeof getMainWindow === "function" ? getMainWindow() : null;
    const current = getWorkspaceConfig().path;
    const dialog = getDialog();
    if (!dialog?.showOpenDialog) {
      return { canceled: true, path: null };
    }
    const result = await dialog.showOpenDialog(win, {
      title: "Choose VOO Workspace Folder",
      defaultPath: current,
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths.length) {
      return { canceled: true, path: null };
    }
    return { canceled: false, path: result.filePaths[0] };
  });

  ipcMain.handle("workspace:setDir", async (_event, payload) => {
    const targetPath = typeof payload === "string" ? payload : payload?.targetPath;
    const res = setWorkspaceRootDir(targetPath);
    if (res.ok) {
      const win = typeof getMainWindow === "function" ? getMainWindow() : null;
      startWorkspaceWatcher(res.path, (event, filename) => {
        if (win && !win.isDestroyed?.()) {
          win.webContents.send("workspace:changed", { event, filename });
        }
      });
    }
    return res;
  });

  ipcMain.handle("workspace:scanFiles", async () => {
    const config = getWorkspaceConfig();
    return scanWorkspaceFiles(config.path);
  });

  ipcMain.handle("workspace:listFolders", () => {
    return listWorkspaceFolders(getWorkspaceConfig().path);
  });

  ipcMain.handle("workspace:createFolder", (_event, payload) => {
    const name = typeof payload === "string" ? payload : payload?.name;
    return createWorkspaceFolder(getWorkspaceConfig().path, name);
  });

  ipcMain.handle("workspace:readFileBytes", async (_event, payload) => {
    const filePath = typeof payload === "string" ? payload : payload?.filePath;
    if (!filePath || !fs.existsSync(filePath)) {
      return { ok: false, error: "file_not_found" };
    }
    try {
      const bytes = await fs.promises.readFile(filePath);
      return { ok: true, bytes };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("workspace:writeFileBytes", async (_event, payload) => {
    const { name, bytes, ...options } = payload || {};
    const config = getWorkspaceConfig();
    return writeWorkspaceFileBytes(config.path, name, bytes, options);
  });

  ipcMain.handle("workspace:renameFile", async (_event, payload) => {
    const { filePath, newName, ...options } = payload || {};
    return renameWorkspaceFile(filePath, newName, options);
  });

  ipcMain.handle("workspace:moveToTrash", async (_event, payload) => {
    const filePath = typeof payload === "string" ? payload : payload?.filePath;
    const config = getWorkspaceConfig();
    return moveWorkspaceFileToTrash(filePath, config.path);
  });

  ipcMain.handle("workspace:restoreFromTrash", async (_event, payload) => {
    const filePath = typeof payload === "string" ? payload : payload?.filePath;
    const config = getWorkspaceConfig();
    return restoreWorkspaceFileFromTrash(filePath, config.path);
  });

  ipcMain.handle("workspace:deletePermanently", async (_event, payload) => {
    const filePath = typeof payload === "string" ? payload : payload?.filePath;
    return deleteWorkspaceFilePermanently(filePath);
  });

  ipcMain.handle("workspace:emptyTrash", async () => {
    const config = getWorkspaceConfig();
    return emptyWorkspaceTrash(config.path);
  });

  ipcMain.handle("workspace:revealInFinder", async (_event, payload) => {
    const filePath = typeof payload === "string" ? payload : payload?.filePath;
    return revealItemInFinder(filePath);
  });

  // Start initial watcher on active workspace if folder exists
  const initialConfig = getWorkspaceConfig();
  if (initialConfig?.path && fs.existsSync(initialConfig.path)) {
    const win = typeof getMainWindow === "function" ? getMainWindow() : null;
    startWorkspaceWatcher(initialConfig.path, (event, filename) => {
      if (win && !win.isDestroyed?.()) {
        win.webContents.send("workspace:changed", { event, filename });
      }
    });
  }
}

module.exports = {
  registerWorkspaceIpc,
  getWorkspaceConfig,
  setWorkspaceRootDir,
  setWorkspaceRoot,
  getDefaultDirectory,
  isValidWorkspaceDir,
  isValidProjectsRootDir,
  scanWorkspaceFiles,
  listWorkspaceFolders,
  createWorkspaceFolder,
  renameWorkspaceFile,
  moveWorkspaceFileToTrash,
  moveFileToTrash,
  restoreWorkspaceFileFromTrash,
  deleteWorkspaceFilePermanently,
  deleteFilePermanently,
  emptyWorkspaceTrash,
  writeWorkspaceFileBytes,
  revealItemInFinder,
  startWorkspaceWatcher,
  stopWorkspaceWatcher,
};

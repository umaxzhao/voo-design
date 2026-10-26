/**
 * Unified Workspace Storage Engine for VOO Design.
 * Polymorphic facade providing identical directory, scanning, and file management
 * capabilities across Desktop Electron, Chromium Web FSA, and Virtual IndexedDB.
 */

import { ElectronWorkspaceDriver } from "./drivers/electron_driver.js";
import { WebFsaWorkspaceDriver } from "./drivers/web_fsa_driver.js";
import { WebIdbWorkspaceDriver } from "./drivers/web_idb_driver.js";
import { getSetting, setSetting } from "../shared/settings.js";

export { ElectronWorkspaceDriver } from "./drivers/electron_driver.js";
export { WebFsaWorkspaceDriver } from "./drivers/web_fsa_driver.js";
export { WebIdbWorkspaceDriver } from "./drivers/web_idb_driver.js";

export function guessCategory(fileName = "") {
  const name = String(fileName).toLowerCase();
  if (/landing|home|hero|banner/i.test(name)) return "landing";
  if (/mobile|ios|android|phone|app/i.test(name)) return "mobile";
  if (/slide|deck|presentation|pitch/i.test(name)) return "slides";
  if (/dash|admin|crm|board|metric/i.test(name)) return "dashboard";
  return "web";
}

/**
 * Splits a relative workspace id (`Campaign/Hero.voo` or `Hero.voo`) into
 * its project folder and file name. Absolute Electron paths are left alone
 * (folder null, name = basename) — those drivers resolve by full path.
 */
export function parseWorkspaceRelativeId(fileId) {
  const raw = String(fileId || "");
  if (!raw) return { folder: null, name: "" };
  if (raw.includes("\\") || /^[A-Za-z]:\//.test(raw) || raw.startsWith("/")) {
    const slash = Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\"));
    return { folder: null, name: slash >= 0 ? raw.slice(slash + 1) : raw };
  }
  const slash = raw.indexOf("/");
  if (slash <= 0) return { folder: null, name: raw };
  return { folder: raw.slice(0, slash), name: raw.slice(slash + 1) };
}

/** Relative id for a file living in an optional project folder. */
export function workspaceRelativeId(name, folder = null) {
  return folder ? `${folder}/${name}` : name;
}

export class WorkspaceStorageEngine {
  constructor(forcedDriverType = null) {
    this.driver = this.resolveDriver(forcedDriverType);
    this.listeners = new Set();
    this.driverUnsub = null;
    this.initPromise = null;
    this._attachDriverEvents();
  }

  resolveDriver(driverType = null) {
    if (driverType === "electron" || (!driverType && ElectronWorkspaceDriver.isAvailable())) {
      return new ElectronWorkspaceDriver();
    }
    // Supporting the picker does not grant directory access. An unconfigured
    // browser starts in its usable sandbox; native mounts require an explicit choice.
    if (driverType === "web-fsa" || (!driverType &&
      getSetting("voo.workspace.type") === "web-fsa" && WebFsaWorkspaceDriver.isAvailable())) {
      return new WebFsaWorkspaceDriver();
    }
    return new WebIdbWorkspaceDriver();
  }

  getDriverType() {
    return this.driver.getDriverType();
  }

  getDriver() {
    return this.driver;
  }

  switchDriver(driverType) {
    if (this.driverUnsub) {
      this.driverUnsub();
      this.driverUnsub = null;
    }
    this.driver = this.resolveDriver(driverType);
    this.initPromise = null;
    this._attachDriverEvents();
    return this.driver;
  }

  _attachDriverEvents() {
    if (typeof this.driver.subscribe === "function") {
      this.driverUnsub = this.driver.subscribe((event) => {
        for (const cb of this.listeners) {
          try {
            cb(event);
          } catch (err) {
            console.error("[WorkspaceStorage] Error in event listener:", err);
          }
        }
      });
    }
  }

  async init() {
    this.initPromise ??= this.driver.init();
    return this.initPromise;
  }

  async _run(method, ...args) {
    const driver = this.driver;
    await this.init();
    return driver[method](...args);
  }

  _useConfiguredDriver(driver, config) {
    this.driverUnsub?.();
    this.driver = driver;
    this.initPromise = null;
    this._attachDriverEvents();
    setSetting("voo.workspace.type", config.type);
    setSetting("voo.workspace.path", config.path);
    setSetting("voo.workspace.name", config.path);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("voo:workspace-changed", { detail: config }));
    }
  }

  async getConfig() {
    return this._run("getConfig");
  }

  async chooseDirectory() {
    const driver = !ElectronWorkspaceDriver.isAvailable() && WebFsaWorkspaceDriver.isAvailable()
      ? new WebFsaWorkspaceDriver() : this.driver;
    // Open the picker before awaiting initialization so browser user activation survives.
    const result = await driver.chooseDirectory();
    if (result.ok && result.config) this._useConfiguredDriver(driver, result.config);
    return result;
  }

  async setDirectory(dirPathOrHandle) {
    const driver = ElectronWorkspaceDriver.isAvailable() ? this.driver
      : dirPathOrHandle?.kind === "directory" ? new WebFsaWorkspaceDriver()
        : new WebIdbWorkspaceDriver();
    const result = await driver.setDirectory(dirPathOrHandle);
    if (result.ok && result.config) this._useConfiguredDriver(driver, result.config);
    return result;
  }

  async isConfigured() {
    return this._run("isConfigured");
  }

  async scanFiles(options = {}) {
    return this._run("scanFiles", options);
  }

  async listFolders() {
    return this._run("listFolders");
  }

  async createFolder(name) {
    return this._run("createFolder", name);
  }

  /**
   * Moves a file into a project folder, or back to the workspace root when
   * `folderName` is null. Membership is the physical subdirectory (or the
   * sandbox `folder` field on the IndexedDB driver).
   */
  async moveToFolder(fileIdOrPath, folderName) {
    if (typeof this.driver.moveToFolder !== "function") {
      return { ok: false, error: "unsupported" };
    }
    return this._run("moveToFolder", fileIdOrPath, folderName);
  }

  async readFileBytes(fileIdOrPath) {
    return this._run("readFileBytes", fileIdOrPath);
  }

  async writeFileBytes(name, bytes, options = {}) {
    return this._run("writeFileBytes", name, bytes, options);
  }

  async renameFile(fileIdOrPath, newName) {
    return this._run("renameFile", fileIdOrPath, newName);
  }

  async moveToTrash(fileIdOrPath) {
    return this._run("moveToTrash", fileIdOrPath);
  }

  async restoreFromTrash(fileIdOrPath) {
    return this._run("restoreFromTrash", fileIdOrPath);
  }

  async deletePermanently(fileIdOrPath) {
    return this._run("deletePermanently", fileIdOrPath);
  }

  async emptyTrash() {
    return this._run("emptyTrash");
  }

  async toggleStar(fileIdOrPath) {
    return this._run("toggleStar", fileIdOrPath);
  }

  async revealInFinder(fileIdOrPath) {
    return this._run("revealInFinder", fileIdOrPath);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}

let defaultInstance = null;

export function getWorkspaceStorage(forcedDriverType = null) {
  if (forcedDriverType) {
    return new WorkspaceStorageEngine(forcedDriverType);
  }
  if (!defaultInstance) {
    defaultInstance = new WorkspaceStorageEngine();
  }
  return defaultInstance;
}

export function resetWorkspaceStorage() {
  defaultInstance = null;
}

export const workspaceStorage = getWorkspaceStorage();

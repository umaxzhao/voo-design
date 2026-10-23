/**
 * Unified Workspace Storage Engine for VOO Design.
 * Polymorphic facade providing identical directory, scanning, and file management
 * capabilities across Desktop Electron, Chromium Web FSA, and Virtual IndexedDB.
 */

import { ElectronWorkspaceDriver } from "./drivers/electron_driver.js";
import { WebFsaWorkspaceDriver } from "./drivers/web_fsa_driver.js";
import { WebIdbWorkspaceDriver } from "./drivers/web_idb_driver.js";

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
    this._attachDriverEvents();
  }

  resolveDriver(driverType = null) {
    if (driverType === "electron" || (!driverType && ElectronWorkspaceDriver.isAvailable())) {
      return new ElectronWorkspaceDriver();
    }
    if (driverType === "web-fsa" || (!driverType && WebFsaWorkspaceDriver.isAvailable())) {
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
    return this.driver.init();
  }

  async getConfig() {
    return this.driver.getConfig();
  }

  async chooseDirectory() {
    return this.driver.chooseDirectory();
  }

  async setDirectory(dirPathOrHandle) {
    return this.driver.setDirectory(dirPathOrHandle);
  }

  async isConfigured() {
    return this.driver.isConfigured();
  }

  async scanFiles(options = {}) {
    return this.driver.scanFiles(options);
  }

  async listFolders() {
    return this.driver.listFolders();
  }

  async createFolder(name) {
    return this.driver.createFolder(name);
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
    return this.driver.moveToFolder(fileIdOrPath, folderName);
  }

  async readFileBytes(fileIdOrPath) {
    return this.driver.readFileBytes(fileIdOrPath);
  }

  async writeFileBytes(name, bytes, options = {}) {
    return this.driver.writeFileBytes(name, bytes, options);
  }

  async renameFile(fileIdOrPath, newName) {
    return this.driver.renameFile(fileIdOrPath, newName);
  }

  async moveToTrash(fileIdOrPath) {
    return this.driver.moveToTrash(fileIdOrPath);
  }

  async restoreFromTrash(fileIdOrPath) {
    return this.driver.restoreFromTrash(fileIdOrPath);
  }

  async deletePermanently(fileIdOrPath) {
    return this.driver.deletePermanently(fileIdOrPath);
  }

  async emptyTrash() {
    return this.driver.emptyTrash();
  }

  async toggleStar(fileIdOrPath) {
    return this.driver.toggleStar(fileIdOrPath);
  }

  async revealInFinder(fileIdOrPath) {
    return this.driver.revealInFinder(fileIdOrPath);
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

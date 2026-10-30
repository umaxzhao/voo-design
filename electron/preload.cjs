const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, handler) {
  const listener = (_event, ...payload) => handler(...payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const workspaceApi = {
  getConfig: () => ipcRenderer.invoke("workspace:getConfig"),
  chooseDirectory: () => ipcRenderer.invoke("workspace:chooseDir"),
  setDirectory: (targetPath) => ipcRenderer.invoke("workspace:setDir", targetPath),
  getDefaultDirectory: () => ipcRenderer.invoke("workspace:getDefaultDirectory"),
  scanFiles: () => ipcRenderer.invoke("workspace:scanFiles"),
  listFolders: () => ipcRenderer.invoke("workspace:listFolders"),
  createFolder: (name) => ipcRenderer.invoke("workspace:createFolder", { name }),
  deleteFolder: (name) => ipcRenderer.invoke("workspace:deleteFolder", { name }),
  moveToFolder: (filePath, folderName) =>
    ipcRenderer.invoke("workspace:moveToFolder", { filePath, folderName }),
  readFileBytes: (filePath) => ipcRenderer.invoke("workspace:readFileBytes", filePath),
  writeFileBytes: (name, bytes, options) =>
    ipcRenderer.invoke("workspace:writeFileBytes", { name, bytes, ...options }),
  renameFile: (filePath, newName, options) =>
    ipcRenderer.invoke("workspace:renameFile", { filePath, newName, ...options }),
  moveToTrash: (filePath) => ipcRenderer.invoke("workspace:moveToTrash", filePath),
  restoreFromTrash: (filePath) => ipcRenderer.invoke("workspace:restoreFromTrash", filePath),
  deletePermanently: (filePath) => ipcRenderer.invoke("workspace:deletePermanently", filePath),
  emptyTrash: () => ipcRenderer.invoke("workspace:emptyTrash"),
  revealInFinder: (filePath) => ipcRenderer.invoke("workspace:revealInFinder", filePath),
  onChanged: (handler) => subscribe("workspace:changed", handler),
};

contextBridge.exposeInMainWorld("vooDesktop", {
  version: () => ipcRenderer.invoke("app:version"),
  updates: {
    status: () => ipcRenderer.invoke("updates:status"),
    onStatus: (handler) => subscribe("updates:status", handler),
    quitAndInstall: () => ipcRenderer.invoke("updates:install"),
  },
  platform: process.platform,
  webImageGenerate: (args) => ipcRenderer.invoke("webImage:generate", args),
  webImageCancel: (jobId) => ipcRenderer.invoke("webImage:cancel", jobId),
  onWebImageProgress: (handler) => subscribe("webImage:progress", handler),
  localCli: {
    connect: () => ipcRenderer.invoke("voo:codex-connect"),
    advance: (options) => ipcRenderer.invoke("voo:codex-advance", options),
    cancel: (options) => ipcRenderer.invoke("voo:codex-cancel", options),
    checkAll: (options) => ipcRenderer.invoke("voo:cli-check-all", options),
    checkStatus: (cliId, options) => ipcRenderer.invoke("voo:cli-status", cliId, options),
    dshStatus: (options) => ipcRenderer.invoke("voo:dsh-connector-status", options),
    dshInstall: (options) => ipcRenderer.invoke("voo:dsh-connector-install", options),
    runText: (cliId, options) => ipcRenderer.invoke("voo:cli-run-text", cliId, options),
    onText: (handler) => subscribe("voo:codex-text", handler),
  },
  workspace: workspaceApi,
});

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
  openFileDialog: (options) => ipcRenderer.invoke("dialog:openFile", options),
  saveFileDialog: (options) => ipcRenderer.invoke("dialog:saveFile", options),
  readFile: (filePath) => ipcRenderer.invoke("fs:readFile", filePath),
  readFileBytes: (filePath) => ipcRenderer.invoke("fs:readBinary", filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke("fs:writeFile", filePath, content),
  writeFileBytes: (filePath, bytes) => ipcRenderer.invoke("fs:writeBinary", filePath, bytes),
  loadModelBytes: (modelName) => ipcRenderer.invoke("model:loadBytes", modelName),
  onMenuAction: (callback) => {
    const handler = (_, action) => callback(action);
    ipcRenderer.on("menu:action", handler);
    return () => ipcRenderer.removeListener("menu:action", handler);
  },
  workspace: workspaceApi,
});

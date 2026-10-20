const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
  openFileDialog: (options) => ipcRenderer.invoke("dialog:openFile", options),
  saveFileDialog: (options) => ipcRenderer.invoke("dialog:saveFile", options),
  readFile: (filePath) => ipcRenderer.invoke("fs:readFile", filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke("fs:writeFile", filePath, content),
  loadModelBytes: (modelName) => ipcRenderer.invoke("model:loadBytes", modelName),
  onMenuAction: (callback) => {
    const handler = (_, action) => callback(action);
    ipcRenderer.on("menu:action", handler);
    return () => ipcRenderer.removeListener("menu:action", handler);
  },
});

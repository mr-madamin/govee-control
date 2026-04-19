const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("govee", {
  getApiKeyStatus: () => ipcRenderer.invoke("govee:get-api-key-status"),
  saveApiKey: (key) => ipcRenderer.invoke("govee:save-api-key", { key }),
  getDevices: () => ipcRenderer.invoke("govee:get-devices"),
  getDeviceState: (device, sku) => ipcRenderer.invoke("govee:get-device-state", { device, sku }),
  setColor: (device, model, r, g, b) =>
    ipcRenderer.invoke("govee:set-color", { device, model, r, g, b }),
  getPresets: () => ipcRenderer.invoke("govee:get-presets"),
  savePreset: (name, r, g, b) =>
    ipcRenderer.invoke("govee:save-preset", { name, r, g, b }),
  deletePreset: (name) => ipcRenderer.invoke("govee:delete-preset", { name }),
  applyPresetToAll: (name) =>
    ipcRenderer.invoke("govee:apply-preset-to-all", { name }),
});

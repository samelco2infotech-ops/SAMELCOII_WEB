const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SAMELCII_DESKTOP', {
  getInfo: () => ipcRenderer.invoke('desktop:get-info')
});

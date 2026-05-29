const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (data) => ipcRenderer.invoke('dialog:saveFile', data),
  saveAs: (data) => ipcRenderer.invoke('dialog:saveAs', data),

  onMenuNew: (callback) => ipcRenderer.on('menu:new', callback),
  onMenuSave: (callback) => ipcRenderer.on('menu:save', callback),
  onMenuSaveAs: (callback) => ipcRenderer.on('menu:saveAs', callback),
  onMenuSelectAll: (callback) => ipcRenderer.on('menu:selectAll', callback),

  onViewEdit: (callback) => ipcRenderer.on('view:edit', callback),
  onViewPreview: (callback) => ipcRenderer.on('view:preview', callback),
  onViewSplit: (callback) => ipcRenderer.on('view:split', callback),

  onFileOpened: (callback) => ipcRenderer.on('file:opened', (_, data) => callback(data)),
});

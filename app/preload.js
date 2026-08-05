const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  windowControl: (action) => ipcRenderer.send('window-controls', action),
  installExtension: (browser) => ipcRenderer.send('install-extension', browser),
  startDownload: (data) => ipcRenderer.send('start-download', data),
  setConnections: (value) => ipcRenderer.send('set-connections', value),
  setDlwindow: (value) => ipcRenderer.send('set-dlwindow', value),
  pauseDownload: (id) => ipcRenderer.send('pause-download', id),
  resumeDownload: (id) => ipcRenderer.send('resume-download', id),
  cancelDownload: (id) => ipcRenderer.send('cancel-download', id),
  openFile: (id) => ipcRenderer.send('open-file', id),
  getAllDownloads: () => ipcRenderer.invoke('get-all-downloads'),
  onDownloadTask: (callback) => ipcRenderer.on('new-download', callback),
  onDownloadFilename: (callback) => ipcRenderer.on('download-filename', callback),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', callback),
  onDownloadPaused: (callback) => ipcRenderer.on('download-paused', callback),
  onDownloadCancelled: (callback) => ipcRenderer.on('download-cancelled', callback),
  onDownloadError: (callback) => ipcRenderer.on('download-error', callback),
  onDownloadCompleted: (callback) => ipcRenderer.on('download-completed', callback)
});

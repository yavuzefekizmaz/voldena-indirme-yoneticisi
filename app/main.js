const { app, BrowserWindow, ipcMain, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const downloader = require('./downloader');

let mainWindow;
let tray;
let currentConnections = 64;
let useSeparateWindow = false;
const downloadWindows = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 800,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    frame: false, // Custom frame for modern look
    transparent: true, // For glassmorphism
    backgroundColor: '#00000000'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function registerExtensionsToBrowsers() {
    const extDir = path.join(__dirname, '..', 'extension');
    const firefoxXpiPath = path.join(extDir, 'voldena-dm.xpi');
    
    // Firefox Sideloading (Bilgisayardaki .xpi dosyası ile direkt çalışır)
    const firefoxExtId = 'voldena-dm@voldena.com';
    const firefoxCmd = `reg add "HKCU\\Software\\Mozilla\\Firefox\\Extensions" /v "${firefoxExtId}" /t REG_SZ /d "${firefoxXpiPath}" /f`;
    
    // Edge Sideloading (Mağazaya yüklendiğinde GECICI yazan yere ID girilecek)
    const dummyEdgeId = 'GECICI_EDGE_ID_BURAYA_YAZILACAK';
    const edgeUrl = 'https://edge.microsoft.com/extensionwebstorebase/v1/crx';
    const edgeCmd = `reg add "HKCU\\Software\\Microsoft\\Edge\\Extensions\\${dummyEdgeId}" /v update_url /t REG_SZ /d "${edgeUrl}" /f`;
    
    // Opera/Chrome Sideloading (Opera mağazasından onaylı ID)
    const operaId = 'emdobkipfnfnfeafbnocdeilplpglbaa';
    const chromeUrl = 'https://clients2.google.com/service/update2/crx';
    const chromeCmd = `reg add "HKCU\\Software\\Google\\Chrome\\Extensions\\${operaId}" /v update_url /t REG_SZ /d "${chromeUrl}" /f`;

    // Sadece Firefox aktif, diğerleri mağazaya yüklenince aktifleştirilebilir:
    exec(firefoxCmd, (err) => { if (!err) console.log("Firefox eklentisi registry'ye kaydedildi."); });
    // exec(edgeCmd, ...);  // Edge ID'si gelince aktifleştirilecek
    exec(chromeCmd, (err) => { if (!err) console.log("Opera/Chrome eklentisi registry'ye kaydedildi."); });
}

app.whenReady().then(() => {
  createWindow();
  registerExtensionsToBrowsers();

  // Create Tray Icon
  const iconPath = path.join(__dirname, '..', 'extension', 'icon.png');
  if (fs.existsSync(iconPath)) {
      tray = new Tray(iconPath);
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Voldena-DM Aç', click: () => mainWindow.show() },
        { type: 'separator' },
        { label: 'Çıkış', click: () => {
          app.isQuitting = true;
          app.quit();
        }}
      ]);
      tray.setToolTip('Voldena-DM');
      tray.setContextMenu(contextMenu);
      tray.on('double-click', () => mainWindow.show());
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC communication for custom title bar
ipcMain.on('window-controls', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  switch (action) {
    case 'minimize':
      win.minimize();
      break;
    case 'maximize':
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
      break;
    case 'close':
      win.close();
      break;
  }
});

// Downloader IPC
ipcMain.handle('get-all-downloads', () => {
    return Array.from(downloader.downloads.values()).map(dl => ({
        id: dl.id, url: dl.url, filename: dl.filename,
        downloaded: dl.downloaded, total: dl.total, status: dl.status,
        connections: dl.connections, speed: 0, percentage: dl.total ? (dl.downloaded/dl.total)*100 : 0
    }));
});

ipcMain.on('start-download', (event, data) => {
    const conns = data.connections || currentConnections;
    downloader.startDownload(data.url, data.filename, mainWindow, null, conns);
    
    // Ayrı pencere modu aktifse mini pencere aç
    if (useSeparateWindow) {
        createDownloadWindow(data.url);
    }
});

ipcMain.on('set-connections', (event, value) => {
    currentConnections = parseInt(value) || 64;
    console.log('Kanal sayısı güncellendi:', currentConnections);
});

ipcMain.on('set-dlwindow', (event, value) => {
    useSeparateWindow = (value === 'yes');
    console.log('Ayrı pencere modu:', useSeparateWindow);
});

ipcMain.on('set-autostart', (event, value) => {
    const openAtLogin = (value === 'yes');
    app.setLoginItemSettings({
        openAtLogin: openAtLogin,
        path: app.getPath('exe')
    });
    console.log('AutoStart setting:', openAtLogin);
});

function createDownloadWindow(url) {
    const dlWin = new BrowserWindow({
        width: 420,
        height: 140,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: false,
        transparent: false,
        backgroundColor: '#0b1120',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    dlWin.loadFile(path.join(__dirname, 'download_window.html'));
    downloadWindows.set(url, dlWin);
    dlWin.on('closed', () => downloadWindows.delete(url));
}

ipcMain.on('pause-download', (event, id) => {
    downloader.pause(id);
});

ipcMain.on('resume-download', (event, id) => {
    downloader.resume(id, mainWindow);
});

ipcMain.on('cancel-download', (event, arg) => {
    const id = (typeof arg === 'object' && arg !== null) ? arg.id : arg;
    const deleteFile = (typeof arg === 'object' && arg !== null) ? arg.deleteFile !== false : true;
    
    const dl = downloader.downloads.get(id);
    if (dl) {
        const miniWin = downloadWindows.get(dl.url);
        if (miniWin && !miniWin.isDestroyed()) {
            miniWin.close();
        }
    }
    downloader.cancel(id, deleteFile);
});

ipcMain.handle('select-folder', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.on('open-folder', (event, id) => {
    const dl = downloader.downloads.get(id);
    if (dl && dl.destPath && fs.existsSync(dl.destPath)) {
        shell.showItemInFolder(dl.destPath);
    } else {
        shell.openPath(downloader.downloadDir);
    }
});

ipcMain.on('open-file', (event, id) => {
    const dl = downloader.downloads.get(id);
    if (dl && dl.destPath && fs.existsSync(dl.destPath)) {
        shell.openPath(dl.destPath);
    } else {
        const filename = dl ? (dl.filename || 'Dosya') : 'Dosya';
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('file-missing', { filename });
        }
    }
});

// Extension Installation Helper
ipcMain.on('install-extension', (event, browser) => {
    const extDir = path.join(__dirname, '..', 'extension');
    const firefoxXpiPath = path.join(extDir, 'voldena-dm.xpi');
    const operaId = 'emdobkipfnfnfeafbnocdeilplpglbaa';
    const chromeUrl = 'https://clients2.google.com/service/update2/crx';

    if (browser === 'opera') {
        // Opera için registry kaydı yap
        const operaCmd = `reg add "HKCU\\Software\\Google\\Chrome\\Extensions\\${operaId}" /v update_url /t REG_SZ /d "${chromeUrl}" /f`;
        exec(operaCmd, (err) => {
            if (!err) console.log("Opera registry kaydı tetiklendi.");
        });
    } else if (browser === 'firefox') {
        const firefoxExtId = 'voldena-dm@voldena.com';
        const firefoxCmd = `reg add "HKCU\\Software\\Mozilla\\Firefox\\Extensions" /v "${firefoxExtId}" /t REG_SZ /d "${firefoxXpiPath}" /f`;
        exec(firefoxCmd, (err) => {
            if (!err) console.log("Firefox registry kaydı tetiklendi.");
        });
    }
    
    // Klasörü aç
    shell.openPath(extDir);
});

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // Local HTTP Server to receive commands from Native Host
  const http = require('http');

  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/download') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          // Eklentiden gelen indirmelerde de kullanıcının seçtiği kanal sayısını kullan
          downloader.startDownload(data.url, data.filename, mainWindow, null, currentConnections);
          res.writeHead(200);
          res.end('OK');
        } catch (e) {
          res.writeHead(400);
          res.end('Bad Request');
        }
      });
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log('Port in use, app is probably already running.');
    }
  });

  server.listen(41234, '127.0.0.1', () => {
    console.log('Voldena-DM local server listening on port 41234');
  });

  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    
    // Check if there's a download argument
    const downloadArg = commandLine.find(arg => arg.startsWith('--download='));
    if (downloadArg) {
      try {
          const data = JSON.parse(downloadArg.split('=')[1]);
          downloader.startDownload(data.url, data.filename, mainWindow, null, data.connections);
      } catch(e) {}
    }
  });
}

// Handle initial command line argument if started by native host
setTimeout(() => {
    const downloadArg = process.argv.find(arg => arg.startsWith('--download='));
    if (downloadArg) {
        try {
            const data = JSON.parse(downloadArg.split('=')[1]);
            downloader.startDownload(data.url, data.filename, mainWindow);
        } catch (e) {}
    }
}, 1000);

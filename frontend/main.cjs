const path = require('path');
const { app, BrowserWindow } = require('electron');

function createWindow () {
  const splash = new BrowserWindow({
    width: 440,
    height: 310,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    skipTaskbar: true,
    backgroundColor: '#0B0F17',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.once('ready-to-show', () => splash.show());

  function createWindow () {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'src-tauri/icons/icon.ico'), // Add this line
    webPreferences: {
      nodeIntegration: true
    }
  });

  let splashTimer;
  const revealPortal = () => {
    if (win.isDestroyed()) return;
    win.show();
    if (!splash.isDestroyed()) splash.close();
    clearTimeout(splashTimer);
  };

  win.once('ready-to-show', revealPortal);
  win.webContents.on('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
    if (isMainFrame) revealPortal();
  });
  win.loadURL('https://ipcstalenzo.com');
  splashTimer = setTimeout(revealPortal, 15_000);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
}
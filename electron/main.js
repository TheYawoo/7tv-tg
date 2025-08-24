const { app, BrowserWindow, session } = require('electron');
const path = require('path');

const START_URL = process.env.ELECTRON_START_URL || 'https://web.telegram.org/k';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Telegram Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true
    }
  });

  // Relax CSP for 7TV CDN images only
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    const cspKey = Object.keys(headers).find(k => k.toLowerCase() === 'content-security-policy');
    if (cspKey) {
      const csp = headers[cspKey].join('; ');
      const allowImg = " img-src * data: blob: https://cdn.7tv.app https://files.7tv.io;";
      const patched = csp.replace(/img-src[^;]*/i, m => m + ' https://cdn.7tv.app https://files.7tv.io') || (csp + allowImg);
      headers[cspKey] = [patched];
    }
    callback({ responseHeaders: headers });
  });

  // Keep Telegram’s UA compatibility while running in Electron
  const baseUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    + ' (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  win.webContents.setUserAgent(baseUA);

  win.loadURL(START_URL);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const { contextBridge } = require('electron');
const fs = require('fs');
const path = require('path');

function injectFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const s = document.createElement('script');
  s.type = 'module';
  s.textContent = code;
  (document.head || document.documentElement).appendChild(s);
}

function injectStyle(filePath) {
  const css = fs.readFileSync(filePath, 'utf8');
  const style = document.createElement('style');
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    injectStyle(path.join(__dirname, '..', 'renderer', 'styles.css'));
    injectFile(path.join(__dirname, '..', 'renderer', 'inject.js'));
  } catch (e) {
    console.error('[7TV] injection failed', e);
  }
});

// Minimal bridge for optional logging
contextBridge.exposeInMainWorld('e7', {
  log: (...args) => console.log('[7TV]', ...args)
});

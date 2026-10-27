
// Handle CLI argument files
function processCliArgs() {
  const args = process.argv.slice(1);
  for (const arg of args) {
    if (arg && !arg.startsWith('--') && !arg.startsWith('-')) {
      const ext = path.extname(arg).toLowerCase();
      if (['.jsonl', '.ndjson', '.json', '.txt'].includes(ext) && fs.existsSync(arg)) {
        handleFileOpen(path.resolve(arg));
      }
    }
  }
}

import { app, BrowserWindow, ipcMain, dialog, Menu, shell, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { StateManager } from './stateManager';
import { GazelleDocument } from './gazelleDocument';

let mainWindow: BrowserWindow | null = null;
const stateManager = new StateManager();
const documents = new Map<string, GazelleDocument>();
const pendingFiles: string[] = [];

// Early macOS file association registration
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && mainWindow.webContents) {
    handleFileOpen(filePath);
  } else {
    pendingFiles.push(filePath);
  }
});

function getOrCreateDocument(filePath: string): GazelleDocument {
  const norm = path.resolve(filePath);
  let doc = documents.get(norm);
  if (!doc) {
    doc = new GazelleDocument(norm, (msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gazelle:message', { filePath: norm, message: msg });
      }
    });
    documents.set(norm, doc);
  }
  return doc;
}

function handleFileOpen(filePath: string) {
  console.log("[MAIN] handleFileOpen:", filePath);
  if (!fs.existsSync(filePath)) return;
  stateManager.addOpenFile(filePath);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state:updated', stateManager.getState());
    loadActiveDocument(filePath);
  }
}

async function loadActiveDocument(filePath: string) {
  console.log("[MAIN] loadActiveDocument:", filePath);
  const doc = getOrCreateDocument(filePath);
  await doc.loadFile();
}

function createWindow() {
  const initialState = stateManager.getState();

  const isMac = process.platform === 'darwin';
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 450,
    icon: path.join(__dirname, '../../build/icon.ico'),
    ...(isMac ? {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 14 }
    } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.webContents.on('did-finish-load', async () => {
    // Deliver pending files from cold launch
    if (pendingFiles.length > 0) {
      pendingFiles.forEach(f => stateManager.addOpenFile(f));
      pendingFiles.length = 0;
    }

    const state = stateManager.getState();
    mainWindow?.webContents.send('state:updated', state);

    if (state.activeFilePath && fs.existsSync(state.activeFilePath)) {
      await loadActiveDocument(state.activeFilePath);
    }
  });

  buildAppMenu();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildAppMenu() {
  const template: any[] = [
    {
      label: 'JSONL Gazelle',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Toggle Theme (Dark / Light)',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            const current = stateManager.getState().theme;
            const next = current === 'dark' ? 'light' : 'dark';
            stateManager.saveState({ theme: next });
            mainWindow?.webContents.send('state:updated', stateManager.getState());
          }
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (!mainWindow) return;
            const res = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile', 'multiSelections'],
              filters: [
                { name: 'JSON Lines / JSON', extensions: ['jsonl', 'ndjson', 'json', 'txt'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            if (!res.canceled && res.filePaths.length > 0) {
              res.filePaths.forEach(fp => handleFileOpen(fp));
            }
          }
        },
        {
          label: 'Export to CSV...',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            const state = stateManager.getState();
            if (state.activeFilePath) {
              exportDocumentToCsv(state.activeFilePath);
            }
          }
        },
        {
          label: 'Diff with Git HEAD',
          accelerator: 'CmdOrCtrl+D',
          click: () => {
            const state = stateManager.getState();
            if (state.activeFilePath) {
              runGitDiffWithHead(state.activeFilePath);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Close File',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const state = stateManager.getState();
            if (state.activeFilePath) {
              stateManager.removeOpenFile(state.activeFilePath);
              mainWindow?.webContents.send('state:updated', stateManager.getState());
              const updated = stateManager.getState();
              if (updated.activeFilePath) {
                loadActiveDocument(updated.activeFilePath);
              }
            }
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            mainWindow?.webContents.send('sidebar:toggle');
          }
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// --- IPC Handlers ---
ipcMain.handle('app:open-files', (_event, filePaths: string[]) => {
  if (Array.isArray(filePaths)) {
    filePaths.forEach(fp => handleFileOpen(fp));
  }
});

ipcMain.handle('app:open-file-dialog', async () => {
  if (!mainWindow) return;
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'JSON Lines / JSON', extensions: ['jsonl', 'ndjson', 'json', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (!res.canceled && res.filePaths.length > 0) {
    res.filePaths.forEach(fp => handleFileOpen(fp));
  }
});

ipcMain.handle('app:get-state', () => {
  return stateManager.getState();
});

ipcMain.handle('app:select-file', async (_event, filePath: string) => {
  stateManager.saveState({ activeFilePath: filePath });
  mainWindow?.webContents.send('state:updated', stateManager.getState());
  await loadActiveDocument(filePath);
});

ipcMain.handle('app:close-file', (_event, filePath: string) => {
  stateManager.removeOpenFile(filePath);
  mainWindow?.webContents.send('state:updated', stateManager.getState());
  const state = stateManager.getState();
  if (state.activeFilePath) {
    loadActiveDocument(state.activeFilePath);
  }
});

ipcMain.handle('app:toggle-pin', (_event, filePath: string) => {
  stateManager.togglePin(filePath);
  mainWindow?.webContents.send('state:updated', stateManager.getState());
});

ipcMain.handle('app:reorder-files', (_event, files: any[]) => {
  stateManager.saveState({ openFiles: files });
  mainWindow?.webContents.send('state:updated', stateManager.getState());
});

ipcMain.handle('app:show-in-finder', (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('gazelle:postMessage', async (_event, { filePath, message }: { filePath: string; message: any }) => {
  const doc = getOrCreateDocument(filePath);
  await doc.handleMessage(message);
});

ipcMain.handle('app:toggle-theme', () => {
  const current = stateManager.getState().theme;
  const next = current === 'dark' ? 'light' : 'dark';
  stateManager.saveState({ theme: next });
  mainWindow?.webContents.send('state:updated', stateManager.getState());
});

async function exportDocumentToCsv(filePath: string) {
  if (!mainWindow) return;
  const doc = documents.get(filePath);
  if (!doc) return;

  const saveRes = await dialog.showSaveDialog(mainWindow, {
    title: 'Export to CSV',
    defaultPath: filePath.replace(/\.[^.]+$/, '') + '.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });

  if (saveRes.canceled || !saveRes.filePath) return;

  const columns = doc.state.columns.filter(c => c.visible).map(c => c.path);
  const rows = doc.state.filteredRows;

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = columns.map(c => escapeCsv(c)).join(',');
  const rowLines = rows.map(r => {
    return columns.map(col => {
      const val = col.split('.').reduce((o, k) => (o ? o[k] : undefined), r);
      return escapeCsv(val);
    }).join(',');
  });

  const fullCsv = [headerLine, ...rowLines].join('\n');
  fs.writeFileSync(saveRes.filePath, fullCsv, 'utf-8');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    message: `Exported ${rows.length} rows to ${path.basename(saveRes.filePath)}`
  });
}

function runGitDiffWithHead(filePath: string) {
  if (!mainWindow) return;
  const dir = path.dirname(filePath);
  const fileName = path.basename(filePath);

  exec(`git show HEAD:"./${fileName}"`, { cwd: dir }, (err, stdout) => {
    if (err) {
      dialog.showErrorBox('Git Diff Error', `Could not diff with Git HEAD: ${err.message}`);
      return;
    }
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Git Diff with HEAD',
      message: `File: ${fileName}`,
      detail: stdout.length > 500 ? stdout.slice(0, 500) + '\n\n... (content truncated)' : stdout
    });
  });
}

// App lifecycle
app.whenReady().then(() => {
  processCliArgs();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

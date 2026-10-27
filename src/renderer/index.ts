
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn') as HTMLButtonElement;
const dropOverlayEl = document.getElementById('drop-overlay') as HTMLElement;
let isSidebarHidden = false;
let isHomeScreenActive = false;

function toggleSidebar() {
  isSidebarHidden = !isSidebarHidden;
  sidebarEl.style.display = isSidebarHidden ? 'none' : 'flex';
  resizerEl.style.display = isSidebarHidden ? 'none' : 'block';
}

function showHomeScreen() {
  isHomeScreenActive = true;
  emptyStateEl.style.display = 'flex';
  webviewIframe.style.display = 'none';
  // Deselect active class in sidebar items
  document.querySelectorAll('.file-item.active').forEach(el => el.classList.remove('active'));
}

function setupGlobalShortcuts() {
  sidebarToggleBtn?.addEventListener('click', toggleSidebar);
  window.electronAPI.onToggleSidebar(() => toggleSidebar());

  window.addEventListener('keydown', (e) => {
    // Esc key: Return to Home Screen
    if (e.key === 'Escape') {
      showHomeScreen();
    }
  });

  // Global Drag and Drop (sidebar, home screen, main area)
  let dragCounter = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dropOverlayEl) dropOverlayEl.style.display = 'flex';
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      if (dropOverlayEl) dropOverlayEl.style.display = 'none';
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    if (dropOverlayEl) dropOverlayEl.style.display = 'none';

    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      const paths: string[] = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        let p = '';
        if (window.electronAPI.getPathForFile) {
          p = window.electronAPI.getPathForFile(file);
        }
        if (!p) {
          p = (file as any).path || '';
        }
        if (p) {
          paths.push(p);
        }
      }
      if (paths.length > 0) {
        isHomeScreenActive = false;
        window.electronAPI.openFiles(paths);
      }
    }
  });
}

import { vsCodeThemes } from '../theme/themes';
import { generateWebviewHtml } from './webviewGenerator';

declare global {
  interface Window {
    electronAPI: any;
  }
}

let currentState: any = {
  openFiles: [],
  activeFilePath: null,
  recentFiles: [],
  theme: 'dark',
  sidebarWidth: 240
};

const sidebarEl = document.getElementById('sidebar') as HTMLElement;
const sidebarFilesEl = document.getElementById('sidebar-files') as HTMLElement;
const sidebarPinnedEl = document.getElementById('sidebar-pinned') as HTMLElement;
const pinnedSectionEl = document.getElementById('pinned-section') as HTMLElement;
const resizerEl = document.getElementById('resizer') as HTMLElement;
const webviewIframe = document.getElementById('gazelle-frame') as HTMLIFrameElement;
const emptyStateEl = document.getElementById('empty-state') as HTMLElement;
const openFileBtn = document.getElementById('open-file-btn') as HTMLButtonElement;
const contextMenuEl = document.getElementById('context-menu') as HTMLElement;

let contextMenuTargetFile: string | null = null;

// Initialize
async function init() {
  setupResizer();
  setupGlobalShortcuts();
  setupContextMenu();
  setupMessageBridge();

  openFileBtn?.addEventListener('click', () => {
    window.electronAPI.openFileDialog();
  });

  window.electronAPI.onStateUpdated((state: any) => {
    console.log("[RENDERER] onStateUpdated:", state.activeFilePath, state.openFiles.length);
    currentState = state;
    applyTheme(state.theme);
    renderSidebar();
    syncActiveView();
  });

  window.electronAPI.onGazelleMessage((data: { filePath: string; message: any }) => {
    console.log("[RENDERER] onGazelleMessage:", data.filePath, data.message.type);
    if (data.filePath === currentState.activeFilePath && webviewIframe.contentWindow) {
      webviewIframe.contentWindow.postMessage(data.message, '*');
    }
  });

  const state = await window.electronAPI.getState();
  if (state) {
    currentState = state;
    applyTheme(state.theme);
    renderSidebar();
    syncActiveView();
  }
}

function applyTheme(theme: 'dark' | 'light') {
  document.body.className = `theme-${theme}`;
  const vars = vsCodeThemes[theme];
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => {
    root.style.setProperty(k, v as string);
  });
}

function renderSidebar() {
  const { openFiles, activeFilePath } = currentState;

  const pinned = openFiles.filter((f: any) => f.pinned);
  const unpinned = openFiles.filter((f: any) => !f.pinned);

  if (pinned.length > 0) {
    pinnedSectionEl.style.display = 'block';
    sidebarPinnedEl.innerHTML = '';
    pinned.forEach((file: any) => {
      sidebarPinnedEl.appendChild(createFileItemEl(file, activeFilePath));
    });
  } else {
    pinnedSectionEl.style.display = 'none';
  }

  sidebarFilesEl.innerHTML = '';
  unpinned.forEach((file: any) => {
    sidebarFilesEl.appendChild(createFileItemEl(file, activeFilePath));
  });

  if (openFiles.length === 0 || isHomeScreenActive) {
    emptyStateEl.style.display = 'flex';
    webviewIframe.style.display = 'none';
  } else {
    emptyStateEl.style.display = 'none';
    webviewIframe.style.display = 'block';
  }
}

function createFileItemEl(file: any, activeFilePath: string | null): HTMLElement {
  const item = document.createElement('div');
  item.className = `file-item ${file.path === activeFilePath ? 'active' : ''}`;
  item.setAttribute('data-path', file.path);
  item.draggable = true;

  const fileName = file.path.split('/').pop() || file.path;
  const parentDir = file.path.split('/').slice(-2, -1)[0] || '';

  item.innerHTML = `
    <div class="file-icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
      </svg>
    </div>
    <div class="file-info">
      <span class="file-name">${escapeHtml(fileName)}</span>
      <span class="file-path">${escapeHtml(parentDir)}</span>
    </div>
    <div class="file-actions">
      <button class="pin-btn ${file.pinned ? 'pinned' : ''}" title="${file.pinned ? 'Unpin' : 'Pin'}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="${file.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="17" x2="12" y2="22"></line>
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
        </svg>
      </button>
      <button class="close-btn" title="Close">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `;

  // Click to select
  item.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.close-btn') || target.closest('.pin-btn')) return;
    isHomeScreenActive = false;
    window.electronAPI.selectFile(file.path);
  });

  // Pin click
  item.querySelector('.pin-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.electronAPI.togglePin(file.path);
  });

  // Close click
  item.querySelector('.close-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.electronAPI.closeFile(file.path);
  });

  // Right-click context menu
  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    contextMenuTargetFile = file.path;
    showContextMenu(e.clientX, e.clientY);
  });

  // Drag and drop reordering
  setupItemDragAndDrop(item, file.path);

  return item;
}

let loadedFilePath: string | null = null;
let currentFrameTheme: string | null = null;

function syncActiveView() {
  if (isHomeScreenActive) return;
  const { activeFilePath, theme } = currentState;
  if (!activeFilePath) return;

  if (loadedFilePath !== activeFilePath || currentFrameTheme !== theme) {
    loadedFilePath = activeFilePath;
    currentFrameTheme = theme;

    // Load webview html into iframe
    const gazelleSvg = `file://${window.location.pathname.replace('renderer/index.html', 'gazelle.svg')}`;
    const gazelleGif = `file://${window.location.pathname.replace('renderer/index.html', 'gazelle-animation.gif')}`;
    const html = generateWebviewHtml(theme, gazelleSvg, gazelleGif);

    webviewIframe.srcdoc = html;
    webviewIframe.onload = () => {
      if (currentState.activeFilePath) {
        window.electronAPI.postGazelleMessage(currentState.activeFilePath, { type: 'requestFullUpdate' });
      }
    };

  }
}

function setupMessageBridge() {
  window.addEventListener('message', (event) => {
    if (event.data && event.data.source === 'gazelle-webview') {
      const payload = event.data.payload;
      if (currentState.activeFilePath) {
        window.electronAPI.postGazelleMessage(currentState.activeFilePath, payload);
      }
    }
  });
}

function setupResizer() {
  let isResizing = false;

  resizerEl.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = Math.max(160, Math.min(e.clientX, 500));
    sidebarEl.style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = 'default';
    }
  });
}

function setupContextMenu() {
  document.addEventListener('click', () => {
    contextMenuEl.style.display = 'none';
  });

  document.getElementById('ctx-close')?.addEventListener('click', () => {
    if (contextMenuTargetFile) window.electronAPI.closeFile(contextMenuTargetFile);
  });

  document.getElementById('ctx-close-others')?.addEventListener('click', () => {
    if (!contextMenuTargetFile) return;
    const toClose = currentState.openFiles
      .filter((f: any) => f.path !== contextMenuTargetFile && !f.pinned)
      .map((f: any) => f.path);
    toClose.forEach((p: string) => window.electronAPI.closeFile(p));
  });

  document.getElementById('ctx-close-all')?.addEventListener('click', () => {
    const toClose = currentState.openFiles
      .filter((f: any) => !f.pinned)
      .map((f: any) => f.path);
    toClose.forEach((p: string) => window.electronAPI.closeFile(p));
  });

  document.getElementById('ctx-close-below')?.addEventListener('click', () => {
    if (!contextMenuTargetFile) return;
    const idx = currentState.openFiles.findIndex((f: any) => f.path === contextMenuTargetFile);
    if (idx !== -1) {
      const toClose = currentState.openFiles.slice(idx + 1).filter((f: any) => !f.pinned).map((f: any) => f.path);
      toClose.forEach((p: string) => window.electronAPI.closeFile(p));
    }
  });

  document.getElementById('ctx-pin')?.addEventListener('click', () => {
    if (contextMenuTargetFile) window.electronAPI.togglePin(contextMenuTargetFile);
  });

  document.getElementById('ctx-reveal')?.addEventListener('click', () => {
    if (contextMenuTargetFile) window.electronAPI.showInFinder(contextMenuTargetFile);
  });

  document.getElementById('ctx-copy-path')?.addEventListener('click', () => {
    if (contextMenuTargetFile) navigator.clipboard.writeText(contextMenuTargetFile);
  });
}

function showContextMenu(x: number, y: number) {
  contextMenuEl.style.left = `${x}px`;
  contextMenuEl.style.top = `${y}px`;
  contextMenuEl.style.display = 'block';
}

function setupItemDragAndDrop(item: HTMLElement, pathStr: string) {
  item.addEventListener('dragstart', (e) => {
    e.dataTransfer?.setData('text/plain', pathStr);
    item.classList.add('dragging');
  });

  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
  });

  item.addEventListener('dragover', (e) => {
    e.preventDefault();
    item.classList.add('drag-over');
  });

  item.addEventListener('dragleave', () => {
    item.classList.remove('drag-over');
  });

  item.addEventListener('drop', (e) => {
    e.preventDefault();
    item.classList.remove('drag-over');
    const sourcePath = e.dataTransfer?.getData('text/plain');
    if (!sourcePath || sourcePath === pathStr) return;

    const files = [...currentState.openFiles];
    const srcIdx = files.findIndex(f => f.path === sourcePath);
    const destIdx = files.findIndex(f => f.path === pathStr);
    if (srcIdx !== -1 && destIdx !== -1) {
      const [moved] = files.splice(srcIdx, 1);
      files.splice(destIdx, 0, moved);
      window.electronAPI.reorderFiles(files);
    }
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', init);

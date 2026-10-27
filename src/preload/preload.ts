import { contextBridge, ipcRenderer, webUtils } from 'electron';

export interface ElectronAPI {
  getState: () => Promise<any>;
  openFileDialog: () => Promise<void>;
  openFiles: (filePaths: string[]) => Promise<void>;
  getPathForFile: (file: File) => string;
  onToggleSidebar: (callback: () => void) => () => void;
  selectFile: (filePath: string) => Promise<void>;
  closeFile: (filePath: string) => Promise<void>;
  togglePin: (filePath: string) => Promise<void>;
  reorderFiles: (files: any[]) => Promise<void>;
  showInFinder: (filePath: string) => Promise<void>;
  postGazelleMessage: (filePath: string, message: any) => Promise<void>;
  toggleTheme: () => Promise<void>;
  onStateUpdated: (callback: (state: any) => void) => () => void;
  onGazelleMessage: (callback: (data: { filePath: string; message: any }) => void) => () => void;
}

const api: ElectronAPI = {
  getState: () => ipcRenderer.invoke('app:get-state'),
  openFileDialog: () => ipcRenderer.invoke('app:open-file-dialog'),
  openFiles: (filePaths: string[]) => ipcRenderer.invoke('app:open-files', filePaths),
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return (file as any).path || '';
    }
  },
  onToggleSidebar: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('sidebar:toggle', handler);
    return () => ipcRenderer.removeListener('sidebar:toggle', handler);
  },
  selectFile: (filePath: string) => ipcRenderer.invoke('app:select-file', filePath),
  closeFile: (filePath: string) => ipcRenderer.invoke('app:close-file', filePath),
  togglePin: (filePath: string) => ipcRenderer.invoke('app:toggle-pin', filePath),
  reorderFiles: (files: any[]) => ipcRenderer.invoke('app:reorder-files', files),
  showInFinder: (filePath: string) => ipcRenderer.invoke('app:show-in-finder', filePath),
  postGazelleMessage: (filePath: string, message: any) =>
    ipcRenderer.invoke('gazelle:postMessage', { filePath, message }),
  toggleTheme: () => ipcRenderer.invoke('app:toggle-theme'),
  onStateUpdated: (callback) => {
    const handler = (_event: any, state: any) => callback(state);
    ipcRenderer.on('state:updated', handler);
    return () => ipcRenderer.removeListener('state:updated', handler);
  },
  onGazelleMessage: (callback) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('gazelle:message', handler);
    return () => ipcRenderer.removeListener('gazelle:message', handler);
  }
};

contextBridge.exposeInMainWorld('electronAPI', api);

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface FileItem {
  path: string;
  pinned: boolean;
}

export interface AppState {
  openFiles: FileItem[];
  activeFilePath: string | null;
  recentFiles: string[];
  theme: 'dark' | 'light';
  sidebarWidth: number;
}

export class StateManager {
  private stateFilePath: string;
  private state: AppState;

  constructor() {
    this.stateFilePath = '';
    this.state = {
      openFiles: [],
      activeFilePath: null,
      recentFiles: [],
      theme: 'dark',
      sidebarWidth: 240
    };
    if (app.isReady()) {
      this.initPath();
    } else {
      app.whenReady().then(() => this.initPath());
    }
  }

  private initPath() {
    const userData = app.getPath('userData');
    this.stateFilePath = path.join(userData, 'session-state.json');
    this.state = this.loadState();
  }

  private loadState(): AppState {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          openFiles: Array.isArray(parsed.openFiles) ? parsed.openFiles : [],
          activeFilePath: parsed.activeFilePath || null,
          recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : [],
          theme: parsed.theme === 'light' ? 'light' : 'dark',
          sidebarWidth: typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : 240
        };
      }
    } catch (e) {
      console.warn('Failed to load session-state.json:', e);
    }

    return {
      openFiles: [],
      activeFilePath: null,
      recentFiles: [],
      theme: 'dark',
      sidebarWidth: 240
    };
  }

  public getState(): AppState {
    return this.state;
  }

  public saveState(updates?: Partial<AppState>) {
    if (updates) {
      this.state = { ...this.state, ...updates };
    }
    try {
      if (!this.stateFilePath && app.isReady()) {
        this.initPath();
      }
      if (this.stateFilePath) {
        fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8');
      }
    } catch (e) {
      console.error('Failed to save session-state.json:', e);
    }
  }

  public addOpenFile(filePath: string): boolean {
    const norm = path.resolve(filePath);
    // Add to recent files
    this.state.recentFiles = [norm, ...this.state.recentFiles.filter(p => p !== norm)].slice(0, 20);

    const exists = this.state.openFiles.some(f => f.path === norm);
    if (!exists) {
      this.state.openFiles.push({ path: norm, pinned: false });
    }
    this.state.activeFilePath = norm;
    this.saveState();
    return !exists;
  }

  public removeOpenFile(filePath: string) {
    const norm = path.resolve(filePath);
    this.state.openFiles = this.state.openFiles.filter(f => f.path !== norm);
    if (this.state.activeFilePath === norm) {
      this.state.activeFilePath = this.state.openFiles.length > 0 ? this.state.openFiles[this.state.openFiles.length - 1].path : null;
    }
    this.saveState();
  }

  public togglePin(filePath: string) {
    const norm = path.resolve(filePath);
    const item = this.state.openFiles.find(f => f.path === norm);
    if (item) {
      item.pinned = !item.pinned;
      this.saveState();
    }
  }
}

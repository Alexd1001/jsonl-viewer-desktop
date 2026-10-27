import { JsonRow, ParsedLine, ColumnInfo } from '../jsonl/types';
import { SortDirection, ColumnType, sortRowsWithIndices, detectColumnType, COLUMN_TYPE_LABELS } from '../jsonl/sorting';
import * as fs from 'fs';
import * as path from 'path';

export interface GazelleDocumentState {
  filePath: string;
  rows: JsonRow[];
  filteredRows: JsonRow[];
  filteredRowIndices: number[];
  columns: ColumnInfo[];
  searchTerm: string;
  displaySort: { columnPath: string; direction: SortDirection } | null;
  columnTypeCache: Map<string, ColumnType>;
  isIndexing: boolean;
  parsedLines: ParsedLine[];
  rawContent: string;
  errorCount: number;
  totalLines: number;
  loadedLines: number;
  fileSizeBytes: number;
  pathCounts: { [key: string]: number };
  memoryOptimized: boolean;
  reloadedFromDisk: boolean;
  loadGeneration: number;
  loadingChunks: boolean;
  webviewRowsSynced: boolean;
  lastSentRowCount: number;
  lastSentParsedLineCount: number;
}

export class GazelleDocument {
  public state: GazelleDocumentState;
  private readonly CHUNK_SIZE = 100;
  private readonly INITIAL_CHUNKS = 3;
  private readonly MAX_MEMORY_ROWS = 50000;
  private onUpdateCallback?: (msg: any) => void;

  constructor(public filePath: string, onUpdate?: (msg: any) => void) {
    this.onUpdateCallback = onUpdate;
    this.state = {
      filePath,
      rows: [],
      filteredRows: [],
      filteredRowIndices: [],
      columns: [],
      searchTerm: '',
      displaySort: null,
      columnTypeCache: new Map(),
      isIndexing: true,
      parsedLines: [],
      rawContent: '',
      errorCount: 0,
      totalLines: 0,
      loadedLines: 0,
      fileSizeBytes: 0,
      pathCounts: {},
      memoryOptimized: false,
      reloadedFromDisk: false,
      loadGeneration: 0,
      loadingChunks: false,
      webviewRowsSynced: false,
      lastSentRowCount: 0,
      lastSentParsedLineCount: 0
    };
  }

  public setOnUpdate(cb: (msg: any) => void) {
    this.onUpdateCallback = cb;
  }

  private postToWebview(msg: any) {
    if (this.onUpdateCallback) {
      this.onUpdateCallback(msg);
    }
  }

  public async loadFile(): Promise<void> {
    const generation = ++this.state.loadGeneration;
    this.state.isIndexing = true;
    this.state.rows = [];
    this.state.filteredRows = [];
    this.state.filteredRowIndices = [];
    this.state.columns = [];
    this.state.pathCounts = {};
    this.state.parsedLines = [];
    this.state.errorCount = 0;
    this.state.lastSentRowCount = 0;
    this.state.lastSentParsedLineCount = 0;
    this.state.webviewRowsSynced = false;

    try {
      const stats = await fs.promises.stat(this.filePath);
      this.state.fileSizeBytes = stats.size;
      const content = await fs.promises.readFile(this.filePath, 'utf-8');
      this.state.rawContent = content;

      // Handle JSON vs JSONL
      if (this.filePath.toLowerCase().endsWith('.json') && !this.filePath.toLowerCase().endsWith('.jsonl')) {
        this.loadStandardJson(content);
        return;
      }

      const lines = content.split(/\r?\n/);
      // Remove trailing empty line if standard file ending
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }

      this.state.totalLines = lines.length;
      if (this.state.totalLines > this.MAX_MEMORY_ROWS) {
        this.state.memoryOptimized = true;
      }

      const initialChunkSize = this.CHUNK_SIZE * this.INITIAL_CHUNKS;
      const initialLines = lines.slice(0, Math.min(initialChunkSize, this.state.totalLines));
      this.processChunk(initialLines, 0);
      this.state.loadedLines = initialLines.length;

      this.updateColumns();
      this.filterRows();
      this.state.isIndexing = false;
      this.state.loadingChunks = this.state.loadedLines < this.state.totalLines;

      this.sendUpdate();

      if (this.state.loadedLines < this.state.totalLines) {
        this.loadRemainingChunks(lines, generation);
      }
    } catch (err: any) {
      this.state.isIndexing = false;
      this.state.errorCount = 1;
      this.state.parsedLines = [{
        data: null,
        lineNumber: 1,
        rawLine: '',
        error: `Error loading file: ${err?.message || 'Unknown error'}`
      }];
      this.sendUpdate();
    }
  }

  private loadStandardJson(content: string) {
    try {
      const parsed = JSON.parse(content);
      const items: any[] = Array.isArray(parsed) ? parsed : [parsed];
      this.state.totalLines = items.length;
      items.forEach((item, idx) => {
        const rawLine = JSON.stringify(item);
        this.state.rows.push(item);
        this.state.parsedLines.push({
          data: item,
          lineNumber: idx + 1,
          rawLine
        });
        this.countPaths(item, '', this.state.pathCounts);
      });
      this.state.loadedLines = items.length;
      this.updateColumns();
      this.filterRows();
      this.state.isIndexing = false;
      this.sendUpdate();
    } catch (e: any) {
      this.state.isIndexing = false;
      this.state.errorCount = 1;
      this.state.parsedLines = [{
        data: null,
        lineNumber: 1,
        rawLine: content.slice(0, 500),
        error: `JSON Parse error: ${e.message}`
      }];
      this.sendUpdate();
    }
  }

  private async loadRemainingChunks(lines: string[], generation: number) {
    this.state.loadingChunks = true;

    for (let startIndex = this.state.loadedLines; startIndex < this.state.totalLines; startIndex += this.CHUNK_SIZE) {
      const endIndex = Math.min(startIndex + this.CHUNK_SIZE, this.state.totalLines);
      const chunkLines = lines.slice(startIndex, endIndex);

      this.processChunk(chunkLines, startIndex);
      this.state.loadedLines = endIndex;
      this.addNewColumnsOnly();

      if ((startIndex / this.CHUNK_SIZE) % 10 === 0) {
        if (this.state.searchTerm || this.state.displaySort) {
          this.filterRows();
          this.sendUpdate();
        } else {
          this.state.filteredRows = this.state.rows;
          this.extendIdentityRowIndices();
          if (this.state.webviewRowsSynced) {
            this.sendAppendedRows();
          } else {
            this.sendUpdate();
          }
        }
      }

      if (startIndex % (this.CHUNK_SIZE * 10) === 0) {
        await new Promise(r => setTimeout(r, 10));
        if (generation !== this.state.loadGeneration) {
          return;
        }
      }
    }

    this.state.loadingChunks = false;
    if (this.state.displaySort || this.state.searchTerm) {
      this.filterRows();
    } else {
      this.state.filteredRows = this.state.rows;
      this.extendIdentityRowIndices();
    }
    this.sendUpdate({ appendCompatible: true });
  }

  private processChunk(lines: string[], startIndex: number) {
    lines.forEach((line, index) => {
      const globalIndex = startIndex + index;
      const trimmedLine = line.trim();

      if (trimmedLine) {
        try {
          const obj = JSON.parse(trimmedLine);
          this.state.rows.push(obj);
          this.state.parsedLines.push({
            data: obj,
            lineNumber: globalIndex + 1,
            rawLine: line
          });
          try {
            this.countPaths(obj, '', this.state.pathCounts);
          } catch {}
        } catch (error: any) {
          this.state.errorCount++;
          this.state.parsedLines.push({
            data: null,
            lineNumber: globalIndex + 1,
            rawLine: line,
            error: error?.message || 'Parse error'
          });
        }
      } else {
        this.state.parsedLines.push({
          data: null,
          lineNumber: globalIndex + 1,
          rawLine: line
        });
      }
    });
  }

  private countPaths(obj: any, prefix: string, counts: { [key: string]: number }) {
    if (obj === null || obj === undefined) return;
    if (typeof obj !== 'object') {
      const p = prefix || '(value)';
      counts[p] = (counts[p] || 0) + 1;
      return;
    }
    if (Array.isArray(obj)) {
      const p = prefix || '(array)';
      counts[p] = (counts[p] || 0) + 1;
      return;
    }

    Object.keys(obj).forEach(key => {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      counts[currentPath] = (counts[currentPath] || 0) + 1;
      const value = obj[key];
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        this.countPaths(value, currentPath, counts);
      }
    });
  }

  private updateColumns() {
    const totalRows = this.state.rows.length;
    const threshold = Math.max(1, Math.floor(totalRows * 0.05));

    if (this.state.columns.length > 0) {
      this.addNewColumnsOnly();
      return;
    }

    const cols: ColumnInfo[] = [];
    Object.entries(this.state.pathCounts).forEach(([pathName, count]) => {
      if (count >= threshold) {
        cols.push({
          path: pathName,
          displayName: pathName.includes('.') ? pathName.split('.').pop()! : pathName,
          visible: true
        });
      }
    });

    cols.sort((a, b) => {
      const aParts = a.path.split('.').length;
      const bParts = b.path.split('.').length;
      if (aParts !== bParts) return aParts - bParts;
      return a.path.localeCompare(b.path);
    });

    this.state.columns = cols;
  }

  private addNewColumnsOnly() {
    const currentCols = new Set(this.state.columns.map(c => c.path));
    Object.keys(this.state.pathCounts).forEach(pathName => {
      if (!currentCols.has(pathName) && !pathName.includes('.')) {
        this.state.columns.push({
          path: pathName,
          displayName: pathName,
          visible: true
        });
      }
    });
  }

  private filterRows() {
    let result = this.state.rows;
    let indices = this.state.rows.map((_, i) => i);

    if (this.state.searchTerm) {
      const term = this.state.searchTerm.toLowerCase();
      const matchedRows: JsonRow[] = [];
      const matchedIndices: number[] = [];
      for (let i = 0; i < result.length; i++) {
        const row = result[i];
        if (JSON.stringify(row).toLowerCase().includes(term)) {
          matchedRows.push(row);
          matchedIndices.push(indices[i]);
        }
      }
      result = matchedRows;
      indices = matchedIndices;
    }

    if (this.state.displaySort) {
      const sorted = sortRowsWithIndices(
        result,
        indices,
        this.state.displaySort.columnPath,
        this.state.displaySort.direction
      );
      result = sorted.rows;
      indices = sorted.indices;
    }

    this.state.filteredRows = result;
    this.state.filteredRowIndices = indices;
  }

  private extendIdentityRowIndices() {
    const indices = this.state.filteredRowIndices;
    for (let i = indices.length; i < this.state.rows.length; i++) {
      indices.push(i);
    }
  }

  public sendUpdate(options?: { appendCompatible?: boolean }) {
    const rowIndices = this.state.filteredRowIndices.length === this.state.filteredRows.length
      ? this.state.filteredRowIndices
      : this.state.filteredRows.map((_, i) => i);

    const prettyContent = this.convertJsonlToPretty(this.state.rows);
    const unfiltered = this.state.filteredRows === this.state.rows;

    this.postToWebview({
      type: 'update',
      data: {
        rows: this.state.filteredRows,
        rowIndices,
        allRows: unfiltered ? undefined : this.state.rows,
        appendCompatible: options?.appendCompatible === true && unfiltered && this.state.webviewRowsSynced,
        columns: this.state.columns,
        displaySort: this.state.displaySort,
        columnTypes: this.getVisibleColumnTypes(),
        isIndexing: this.state.isIndexing,
        searchTerm: this.state.searchTerm,
        parsedLines: this.state.parsedLines,
        rawContent: this.state.rawContent,
        prettyContent,
        errorCount: this.state.errorCount,
        loadingProgress: {
          loadedLines: this.state.loadedLines,
          totalLines: this.state.totalLines,
          loadingChunks: this.state.loadingChunks,
          progressPercent: this.state.totalLines > 0 ? Math.round((this.state.loadedLines / this.state.totalLines) * 100) : 100,
          memoryOptimized: this.state.memoryOptimized,
          displayedRows: this.state.rows.length,
          fileSizeBytes: this.state.fileSizeBytes || 0
        },
        uiPreferences: {
          lastView: 'table',
          wrapText: false
        },
        reloadedFromDisk: this.state.reloadedFromDisk
      }
    });

    this.state.reloadedFromDisk = false;
    this.state.webviewRowsSynced = unfiltered;
    this.state.lastSentRowCount = this.state.filteredRows.length;
    this.state.lastSentParsedLineCount = this.state.parsedLines.length;
  }

  private sendAppendedRows() {
    this.postToWebview({
      type: 'appendRows',
      data: {
        baseRowCount: this.state.lastSentRowCount,
        rows: this.state.rows.slice(this.state.lastSentRowCount),
        parsedLines: this.state.parsedLines.slice(this.state.lastSentParsedLineCount),
        columns: this.state.columns,
        errorCount: this.state.errorCount,
        loadingProgress: {
          loadedLines: this.state.loadedLines,
          totalLines: this.state.totalLines,
          loadingChunks: this.state.loadingChunks,
          progressPercent: this.state.totalLines > 0 ? Math.round((this.state.loadedLines / this.state.totalLines) * 100) : 100,
          memoryOptimized: this.state.memoryOptimized,
          displayedRows: this.state.rows.length,
          fileSizeBytes: this.state.fileSizeBytes || 0
        }
      }
    });
    this.state.lastSentRowCount = this.state.rows.length;
    this.state.lastSentParsedLineCount = this.state.parsedLines.length;
  }

  private convertJsonlToPretty(rows: JsonRow[]): string {
    return rows.map(r => JSON.stringify(r, null, 2)).join('\n');
  }

  private getVisibleColumnTypes(): { [path: string]: ColumnType } {
    const res: { [path: string]: ColumnType } = {};
    this.state.columns.forEach(col => {
      if (col.visible) {
        res[col.path] = detectColumnType(this.state.rows, col.path);
      }
    });
    return res;
  }

  // --- Dispatch client messages ---
  public async handleMessage(message: any) {
    switch (message.type) {
      case 'requestFullUpdate':
        this.sendUpdate();
        break;
      case 'refresh':
        this.state.reloadedFromDisk = true;
        await this.loadFile();
        break;
      case 'search':
        this.state.searchTerm = message.term || '';
        this.filterRows();
        this.sendUpdate();
        break;
      case 'setDisplaySort':
        if (message.columnPath && message.direction) {
          this.state.displaySort = { columnPath: message.columnPath, direction: message.direction };
        } else {
          this.state.displaySort = null;
        }
        this.filterRows();
        this.sendUpdate();
        break;
      case 'toggleColumnVisibility':
        this.state.columns = this.state.columns.map(col => {
          if (col.path === message.columnPath) {
            return { ...col, visible: !col.visible };
          }
          return col;
        });
        this.sendUpdate();
        break;
      case 'showColumns':
        if (Array.isArray(message.columnPaths)) {
          const toShow = new Set(message.columnPaths);
          this.state.columns = this.state.columns.map(col => ({
            ...col,
            visible: toShow.has(col.path) ? true : col.visible
          }));
          this.sendUpdate();
        }
        break;
      case 'expandColumn':
        this.expandColumn(message.columnPath);
        this.sendUpdate();
        break;
      case 'collapseColumn':
        this.collapseColumn(message.columnPath);
        this.sendUpdate();
        break;
      case 'removeColumn':
        this.removeColumn(message.columnPath);
        this.sendUpdate();
        break;
      case 'addColumn':
        this.state.columns.push({
          path: message.columnName,
          displayName: message.columnName,
          visible: true
        });
        this.sendUpdate();
        break;
      case 'reorderColumns':
        if (Array.isArray(message.columnPaths)) {
          const map = new Map(this.state.columns.map(c => [c.path, c]));
          const newCols: ColumnInfo[] = [];
          message.columnPaths.forEach((p: string) => {
            const found = map.get(p);
            if (found) newCols.push(found);
          });
          this.state.columns.forEach(c => {
            if (!newCols.includes(c)) newCols.push(c);
          });
          this.state.columns = newCols;
          this.sendUpdate();
        }
        break;
      case 'updateCell':
        this.updateCell(message.rowIndex, message.columnPath, message.value);
        break;
      case 'updateCells':
        if (Array.isArray(message.edits)) {
          message.edits.forEach((e: any) => {
            this.updateCell(e.rowIndex, e.columnPath, e.value, false);
          });
          this.filterRows();
          this.sendUpdate();
        }
        break;
      case 'deleteRow':
        if (typeof message.rowIndex === 'number' && message.rowIndex >= 0 && message.rowIndex < this.state.rows.length) {
          this.state.rows.splice(message.rowIndex, 1);
          this.filterRows();
          this.sendUpdate();
        }
        break;
      case 'insertRow':
        const newRow = message.row || {};
        const pos = typeof message.index === 'number' ? message.index : this.state.rows.length;
        this.state.rows.splice(pos, 0, newRow);
        this.filterRows();
        this.sendUpdate();
        break;
      case 'duplicateRow':
        if (typeof message.rowIndex === 'number' && message.rowIndex >= 0 && message.rowIndex < this.state.rows.length) {
          const dup = JSON.parse(JSON.stringify(this.state.rows[message.rowIndex]));
          this.state.rows.splice(message.rowIndex + 1, 0, dup);
          this.filterRows();
          this.sendUpdate();
        }
        break;
      case 'reorderRows':
        if (typeof message.fromIndex === 'number' && typeof message.toIndex === 'number') {
          const [moved] = this.state.rows.splice(message.fromIndex, 1);
          this.state.rows.splice(message.toIndex, 0, moved);
          this.filterRows();
          this.sendUpdate();
        }
        break;
      case 'sortRows':
        if (message.columnPath && message.direction) {
          const sorted = sortRowsWithIndices(
            this.state.rows,
            this.state.rows.map((_, i) => i),
            message.columnPath,
            message.direction
          );
          this.state.rows = sorted.rows;
          this.filterRows();
          this.sendUpdate();
        }
        break;
      case 'getSettings':
        this.postToWebview({
          type: 'settingsLoaded',
          settings: {
            provider: 'openai',
            keys: {},
            models: {},
            availableModels: {}
          }
        });
        break;
      case 'checkAPIKey':
        this.postToWebview({
          type: 'settingsLoaded',
          settings: {
            provider: message.provider || 'openai',
            keys: {},
            models: {},
            availableModels: {}
          }
        });
        break;
    }
  }

  private updateCell(rowIndex: number, columnPath: string, value: string, refresh = true) {
    if (rowIndex < 0 || rowIndex >= this.state.rows.length) return;
    let parsed: any = value;
    if (value && value.trim() !== '') {
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = value;
      }
    } else {
      parsed = null;
    }

    const row = this.state.rows[rowIndex];
    if (columnPath === '(value)' && (row === null || typeof row !== 'object' || Array.isArray(row))) {
      this.state.rows[rowIndex] = parsed;
    } else {
      this.setNestedValue(row, columnPath, parsed);
    }

    if (refresh) {
      this.filterRows();
      this.sendUpdate();
    }
  }

  private setNestedValue(obj: any, pathStr: string, value: any) {
    if (!obj || typeof obj !== 'object') return;
    const parts = pathStr.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!cur[part] || typeof cur[part] !== 'object') {
        cur[part] = {};
      }
      cur = cur[part];
    }
    cur[parts[parts.length - 1]] = value;
  }

  private expandColumn(colPath: string) {
    const colIndex = this.state.columns.findIndex(c => c.path === colPath);
    if (colIndex === -1) return;
    this.state.columns[colIndex].isExpanded = true;

    const subPaths = new Set<string>();
    this.state.rows.forEach(r => {
      const val = this.getNestedValue(r, colPath);
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        Object.keys(val).forEach(k => subPaths.add(`${colPath}.${k}`));
      }
    });

    const newCols: ColumnInfo[] = Array.from(subPaths).map(p => ({
      path: p,
      displayName: p.split('.').pop()!,
      visible: true,
      parentPath: colPath
    }));

    this.state.columns.splice(colIndex + 1, 0, ...newCols);
  }

  private collapseColumn(colPath: string) {
    const colIndex = this.state.columns.findIndex(c => c.path === colPath);
    if (colIndex === -1) return;
    this.state.columns[colIndex].isExpanded = false;
    this.state.columns = this.state.columns.filter(c => !c.path.startsWith(`${colPath}.`));
  }

  private removeColumn(colPath: string) {
    this.state.columns = this.state.columns.filter(c => c.path !== colPath && !c.path.startsWith(`${colPath}.`));
  }

  private getNestedValue(obj: any, pathStr: string): any {
    if (!obj) return undefined;
    return pathStr.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
  }
}

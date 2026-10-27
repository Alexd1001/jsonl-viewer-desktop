import { ColumnInfo } from './types';

/**
 * Columns the user can bring back with "Unhide Column".
 *
 * A column can be invisible for two very different reasons: the user hid it, or
 * expand/collapse bookkeeping hid it (an expanded parent is replaced by its child
 * columns; a collapsed parent's manually added children are kept around but hidden).
 * Only the first kind belongs in the unhide menu — unhiding the others would show
 * a parent alongside its own expanded children.
 *
 * Keep in sync with the copy in `src/webview/scripts.ts` (see the
 * `shared:unhideable-columns` block, which the webview tests extract).
 */
export function getUnhideableColumns(columns: ColumnInfo[]): ColumnInfo[] {
    if (!Array.isArray(columns)) {
        return [];
    }

    const byPath = new Map<string, ColumnInfo>();
    columns.forEach(col => byPath.set(col.path, col));

    return columns.filter(col => {
        if (col.visible || col.isExpanded) {
            return false;
        }
        if (col.parentPath) {
            const parent = byPath.get(col.parentPath);
            if (!parent || !parent.isExpanded) {
                return false;
            }
        }
        return true;
    });
}

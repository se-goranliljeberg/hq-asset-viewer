/**
 * Workbook save-session state.
 * Tracks which workbook is open, whether direct save is possible, and
 * last-saved metadata. Persisted to localStorage between reloads.
 */

import type { Mapping } from "./excel-parser";

export interface WorkbookSessionMeta {
  workbookId: string;
  filename: string;
  sheetName: string;
  fileType: "xlsx" | "xls" | "csv" | "unknown";
  /** The column mapping that was used when this workbook was imported. */
  mapping: Mapping;
  loadedAt: string;
  /** True when a single xlsx/xls workbook is active and rows have workbookRefs. */
  canDirectSave: boolean;
  /** True after the user has performed an Add or Enrich import from a second source. */
  isMultiSource: boolean;
  /** True after the user has manually added rows since last fresh load. */
  hasManualRows: boolean;
  /** True after an Add-import merged extra rows from a different source file. */
  hasMergedRows: boolean;
  /** ISO timestamp of the last successful save. */
  lastSavedAt?: string;
  /** `file.lastModified` (ms since epoch) at last read/write — used for conflict detection. */
  lastKnownFileModified?: number;
  /** Filename used on the last Save As (may differ from the original filename). */
  lastSavedAsFilename?: string;
}

const SESSION_KEY = "hq_workbook_session_meta";
const DIRTY_KEY = "hq_workbook_dirty";

// ─── Persistence ────────────────────────────────────────────────────────────

export function loadWorkbookSessionMeta(): WorkbookSessionMeta | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkbookSessionMeta;
  } catch {
    return null;
  }
}

export function saveWorkbookSessionMeta(meta: WorkbookSessionMeta): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(meta));
  } catch { /* quota */ }
}

export function clearWorkbookSessionMeta(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function loadWorkbookDirtyFlag(): boolean {
  try {
    return localStorage.getItem(DIRTY_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveWorkbookDirtyFlag(dirty: boolean): void {
  try {
    if (dirty) localStorage.setItem(DIRTY_KEY, "1");
    else localStorage.removeItem(DIRTY_KEY);
  } catch { /* quota */ }
}

export function clearWorkbookDirtyFlag(): void {
  localStorage.removeItem(DIRTY_KEY);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function canDirectSaveWorkbook(meta: WorkbookSessionMeta | null): boolean {
  if (!meta) return false;
  return meta.canDirectSave && !meta.isMultiSource && (meta.fileType === "xlsx" || meta.fileType === "xls");
}

export function markWorkbookSessionDirty(meta: WorkbookSessionMeta): WorkbookSessionMeta {
  return meta; // dirty flag is tracked separately; this is a no-op placeholder
}

export function markWorkbookSessionSaved(
  meta: WorkbookSessionMeta,
  savedAtIso: string,
  filename?: string,
): WorkbookSessionMeta {
  return {
    ...meta,
    lastSavedAt: savedAtIso,
    ...(filename ? { lastSavedAsFilename: filename } : {}),
  };
}

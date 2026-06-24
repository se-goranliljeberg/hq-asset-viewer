/**
 * In-memory snapshot-based undo / redo.
 *
 * A ViewerSnapshot captures the full working state of the viewer at a point
 * in time. The undo stack holds snapshots taken *before* each mutation so that
 * popping the stack restores the state prior to the action.
 */

import type { AssetData } from "./asset-types";
import type { AssetEdits } from "./asset-edits";
import type { ImportMeta } from "./import-meta";
import type { WorkbookSessionMeta } from "./workbook-session";

export interface ViewerSnapshot {
  capturedAt: string;
  label: string;
  data: AssetData | null;
  edits: Record<string, AssetEdits>;
  userEdits: Record<string, string>;
  importMeta: ImportMeta;
  workbookSessionMeta: WorkbookSessionMeta | null;
  dirty: boolean;
}

export interface UndoRedoState {
  undoStack: ViewerSnapshot[];
  redoStack: ViewerSnapshot[];
}

const DEFAULT_LIMIT = 50;

export function buildViewerSnapshot(input: Omit<ViewerSnapshot, "capturedAt">): ViewerSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    label: input.label,
    // Deep-clone to freeze the snapshot at this point in time.
    data: input.data ? JSON.parse(JSON.stringify(input.data)) : null,
    edits: JSON.parse(JSON.stringify(input.edits)),
    userEdits: { ...input.userEdits },
    importMeta: JSON.parse(JSON.stringify(input.importMeta)),
    workbookSessionMeta: input.workbookSessionMeta
      ? { ...input.workbookSessionMeta }
      : null,
    dirty: input.dirty,
  };
}

/**
 * Push a pre-mutation snapshot onto the undo stack and clear the redo stack.
 * Trims the stack to `limit` entries (oldest are dropped).
 */
export function pushUndoSnapshot(
  state: UndoRedoState,
  snapshot: ViewerSnapshot,
  limit = DEFAULT_LIMIT,
): UndoRedoState {
  const undoStack = [...state.undoStack, snapshot];
  if (undoStack.length > limit) undoStack.splice(0, undoStack.length - limit);
  return { undoStack, redoStack: [] };
}

/**
 * Pop the most recent undo snapshot. Returns null when the stack is empty.
 * `current` is pushed onto the redo stack so Redo can come back.
 */
export function applyUndo(
  state: UndoRedoState,
  current: ViewerSnapshot,
): { state: UndoRedoState; snapshot: ViewerSnapshot | null } {
  if (state.undoStack.length === 0) return { state, snapshot: null };
  const undoStack = [...state.undoStack];
  const snapshot = undoStack.pop()!;
  const redoStack = [...state.redoStack, current];
  return { state: { undoStack, redoStack }, snapshot };
}

/**
 * Pop the most recent redo snapshot. `current` is pushed onto the undo stack.
 */
export function applyRedo(
  state: UndoRedoState,
  current: ViewerSnapshot,
): { state: UndoRedoState; snapshot: ViewerSnapshot | null } {
  if (state.redoStack.length === 0) return { state, snapshot: null };
  const redoStack = [...state.redoStack];
  const snapshot = redoStack.pop()!;
  const undoStack = [...state.undoStack, current];
  return { state: { undoStack, redoStack }, snapshot };
}

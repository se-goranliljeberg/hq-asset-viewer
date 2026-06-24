/**
 * Command-based mutation layer for undo / redo.
 *
 * Each command is a plain-data record that describes a single mutation.
 * Simple commands (editField, editCell, editUserDate, batchEdit) store only
 * the diff (old + new values), so backward application is exact and cheap.
 * Complex commands (batchStatus, addRow, replaceDevice, importMerge, clearData)
 * embed a full ViewerSnapshot taken *before* the mutation so backward
 * application is a simple snapshot restore — no manual inversion logic needed.
 *
 * The exported `applyCommandForward` / `applyCommandBackward` functions return
 * a `StatePatches` object containing only the slices of state that changed.
 * AssetViewer applies those patches to its React state.
 */

import type { AssetData, AssetRow } from "./asset-types";
import type { AssetEdits, AssetStatus } from "./asset-edits";
import type { ViewerSnapshot } from "./undo-redo";

// ─── State Patches ────────────────────────────────────────────────────────────

/** Partial state update returned by apply functions. `undefined` means "no change". */
export interface StatePatches {
  data?: AssetData | null;
  edits?: Record<string, AssetEdits>;
  userEdits?: Record<string, string>;
}

// ─── Command types ────────────────────────────────────────────────────────────

/** Edit a single overlay field (status, warrantyUntil, comment, userActive, skanskaComputer). */
export interface EditFieldCommand {
  type: "editField";
  rowId: number;
  editKey: string;
  field: keyof AssetEdits;
  /** Full before-edit state of the edits entry so we can restore it exactly. */
  beforeEdits: AssetEdits;
  /** Full after-edit state of the edits entry. */
  afterEdits: AssetEdits;
}

/** Edit a raw cell value (computername, modell, user, or any raw column). */
export interface EditCellCommand {
  type: "editCell";
  rowId: number;
  column: string;
  /** Full before-edit row (JSON-serialisable subset we need to restore). */
  beforeRow: Pick<AssetRow, "id" | "computername" | "modell" | "user" | "raw">;
  afterRow: Pick<AssetRow, "id" | "computername" | "modell" | "user" | "raw">;
  /** Edit entry before/after (comment is updated alongside the cell). */
  beforeEdits: AssetEdits | null;
  afterEdits: AssetEdits | null;
}

/** Change a user end-date in userEdits. */
export interface EditUserDateCommand {
  type: "editUserDate";
  username: string;
  /** Value before edit (empty string = not set). */
  oldValue: string;
  /** Value after edit (empty string = deleted). */
  newValue: string;
}

/** Batch-edit userActive / skanskaComputer / comment on a set of rows. */
export interface BatchEditCommand {
  type: "batchEdit";
  kind: "userActive" | "skanskaComputer" | "comment";
  /** Per-row diffs so we can revert exactly. */
  perRowDiffs: Array<{
    editKey: string;
    beforeEdits: AssetEdits;
    afterEdits: AssetEdits;
  }>;
}

/**
 * Batch status change (may involve row splits → full snapshot for backward).
 * When `splitCount > 0` or the operation adds rows, we store a pre-snapshot.
 */
export interface BatchStatusCommand {
  type: "batchStatus";
  statusVal: AssetStatus;
  splitCount: number;
  /** Full snapshot taken before the mutation — used for backward when splits occurred. */
  preSnapshot: ViewerSnapshot;
  /**
   * Lightweight per-row diffs used for undo/redo when there are no splits.
   * Both beforeEdits and afterEdits are stored so redo can re-apply exactly.
   */
  perRowEdits?: Array<{
    editKey: string;
    beforeEdits: AssetEdits;
    afterEdits: AssetEdits;
  }>;
}

/** Add a single manual row. */
export interface AddRowCommand {
  type: "addRow";
  row: AssetRow;
  editKey: string;
  edits: AssetEdits;
}

/** Replace a device — complex operation, always uses full snapshot for backward. */
export interface ReplaceDeviceCommand {
  type: "replaceDevice";
  preSnapshot: ViewerSnapshot;
}

/**
 * Import operation (replace / add / enrich) — always uses full snapshot for backward
 * because arbitrary rows may be added or mutated.
 */
export interface ImportMergeCommand {
  type: "importMerge";
  mode: "replace" | "add" | "enrich";
  preSnapshot: ViewerSnapshot;
}

/** Full clear — always uses full snapshot for backward. */
export interface ClearDataCommand {
  type: "clearData";
  preSnapshot: ViewerSnapshot;
}

export type ViewerCommand =
  | EditFieldCommand
  | EditCellCommand
  | EditUserDateCommand
  | BatchEditCommand
  | BatchStatusCommand
  | AddRowCommand
  | ReplaceDeviceCommand
  | ImportMergeCommand
  | ClearDataCommand;

// ─── Command history state ────────────────────────────────────────────────────

export interface CommandUndoRedoState {
  undoStack: ViewerCommand[];
  redoStack: ViewerCommand[];
}

const CMD_LIMIT = 100;

export function pushCommand(
  state: CommandUndoRedoState,
  cmd: ViewerCommand,
): CommandUndoRedoState {
  const undoStack = [...state.undoStack, cmd];
  if (undoStack.length > CMD_LIMIT) undoStack.splice(0, undoStack.length - CMD_LIMIT);
  return { undoStack, redoStack: [] };
}

// ─── Apply helpers ────────────────────────────────────────────────────────────

/**
 * Apply a command in the forward direction.
 * For commands that store a pre-snapshot, the forward patch is derived from
 * the command's stored "after" data (or is already applied to live state —
 * in that case this is a no-op that exists for redo).
 */
export function applyCommandForward(
  liveDatas: { data: AssetData | null; edits: Record<string, AssetEdits>; userEdits: Record<string, string> },
  cmd: ViewerCommand,
): StatePatches {
  switch (cmd.type) {
    case "editField": {
      return {
        edits: {
          ...liveDatas.edits,
          [cmd.editKey]: cmd.afterEdits,
        },
      };
    }

    case "editCell": {
      if (!liveDatas.data) return {};
      const rows = liveDatas.data.rows.map((r) =>
        r.id === cmd.rowId
          ? { ...r, computername: cmd.afterRow.computername, modell: cmd.afterRow.modell, user: cmd.afterRow.user, raw: cmd.afterRow.raw }
          : r,
      );
      const patchEdits = cmd.afterEdits
        ? { ...liveDatas.edits, [getEditKeyLocal(cmd.rowId)]: cmd.afterEdits }
        : undefined;
      return {
        data: { ...liveDatas.data, rows },
        ...(patchEdits ? { edits: patchEdits } : {}),
      };
    }

    case "editUserDate": {
      const next = { ...liveDatas.userEdits };
      if (cmd.newValue) next[cmd.username] = cmd.newValue;
      else delete next[cmd.username];
      return { userEdits: next };
    }

    case "batchEdit": {
      const nextEdits = { ...liveDatas.edits };
      for (const diff of cmd.perRowDiffs) {
        nextEdits[diff.editKey] = diff.afterEdits;
      }
      return { edits: nextEdits };
    }

    case "batchStatus": {
      // No-split case: re-apply using stored afterEdits (supports redo).
      if (cmd.splitCount === 0 && cmd.perRowEdits) {
        const nextEdits = { ...liveDatas.edits };
        for (const diff of cmd.perRowEdits) {
          nextEdits[diff.editKey] = diff.afterEdits;
        }
        return { edits: nextEdits };
      }
      // Split case or fallback: forward re-apply is a no-op (redo not supported).
      return {};
    }

    case "addRow": {
      if (!liveDatas.data) return {};
      const rows = [...liveDatas.data.rows, cmd.row];
      const nextEdits = { ...liveDatas.edits, [cmd.editKey]: cmd.edits };
      return { data: { ...liveDatas.data, rows }, edits: nextEdits };
    }

    case "replaceDevice":
    case "importMerge":
    case "clearData":
      // For these complex commands, forward re-apply is a no-op on first apply
      // (the handler itself applies the change). On redo, we cannot re-play
      // the full operation, so redo for these commands falls back to notifying
      // the user that a redo is unavailable.
      return {};
  }
}

/**
 * Apply a command in the backward (undo) direction.
 * Returns `StatePatches` with just what changed.
 */
export function applyCommandBackward(
  liveDatas: { data: AssetData | null; edits: Record<string, AssetEdits>; userEdits: Record<string, string> },
  cmd: ViewerCommand,
): StatePatches & { snapshot?: ViewerSnapshot } {
  switch (cmd.type) {
    case "editField": {
      return {
        edits: {
          ...liveDatas.edits,
          [cmd.editKey]: cmd.beforeEdits,
        },
      };
    }

    case "editCell": {
      if (!liveDatas.data) return {};
      const rows = liveDatas.data.rows.map((r) =>
        r.id === cmd.rowId
          ? { ...r, computername: cmd.beforeRow.computername, modell: cmd.beforeRow.modell, user: cmd.beforeRow.user, raw: cmd.beforeRow.raw }
          : r,
      );
      const editKey = getEditKeyLocal(cmd.rowId);
      const patchEdits = cmd.beforeEdits
        ? { ...liveDatas.edits, [editKey]: cmd.beforeEdits }
        : undefined;
      return {
        data: { ...liveDatas.data, rows },
        ...(patchEdits ? { edits: patchEdits } : {}),
      };
    }

    case "editUserDate": {
      const next = { ...liveDatas.userEdits };
      if (cmd.oldValue) next[cmd.username] = cmd.oldValue;
      else delete next[cmd.username];
      return { userEdits: next };
    }

    case "batchEdit": {
      const nextEdits = { ...liveDatas.edits };
      for (const diff of cmd.perRowDiffs) {
        nextEdits[diff.editKey] = diff.beforeEdits;
      }
      return { edits: nextEdits };
    }

    case "batchStatus": {
      if (cmd.splitCount === 0 && cmd.perRowEdits) {
        const nextEdits = { ...liveDatas.edits };
        for (const diff of cmd.perRowEdits) {
          nextEdits[diff.editKey] = diff.beforeEdits;
        }
        return { edits: nextEdits };
      }
      // Has splits → restore full snapshot.
      return { snapshot: cmd.preSnapshot };
    }

    case "addRow": {
      if (!liveDatas.data) return {};
      const rows = liveDatas.data.rows.filter((r) => r.id !== cmd.row.id);
      const nextEdits = { ...liveDatas.edits };
      delete nextEdits[cmd.editKey];
      return { data: { ...liveDatas.data, rows }, edits: nextEdits };
    }

    case "replaceDevice":
    case "importMerge":
    case "clearData":
      return { snapshot: cmd.preSnapshot };
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Mirror of getEditKey from asset-edits without importing to avoid circular deps. */
function getEditKeyLocal(rowId: number): string {
  return String(rowId);
}

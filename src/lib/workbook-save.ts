/**
 * Direct workbook save — patches an in-memory workbook with current app state
 * and writes it back to a file handle or prompts Save As.
 *
 * Strategy:
 *  1. Parse the original workbook bytes (kept in memory since import).
 *  2. Find existing canonical-field columns by matching the header row.
 *  3. Ensure extra edit columns exist (Status, Warranty until, etc.).
 *  4. For each imported row (has workbookRef), patch the worksheet row.
 *  5. For manual rows, append at the end of the sheet.
 *  6. Serialize back to ArrayBuffer and write to file.
 */

import * as XLSX from "xlsx";
import type { AssetRow, AssetData } from "./asset-types";
import type { AssetEdits } from "./asset-edits";
import { getEditKey } from "./asset-edits";
import type { WorkbookSessionMeta } from "./workbook-session";
import { canDirectSaveWorkbook } from "./workbook-session";
import { pickSaveFileHandle, writeArrayBufferToFileHandle, downloadBlob } from "./file-access";

// Extra columns that are written in addition to the mapped canonical fields.
const SAVE_EXTRA_COLS = [
  "Status",
  "Warranty until",
  "User Active?",
  "Skanska computer?",
  "End date",
  "Comments",
] as const;

export interface WorkbookPatchContext {
  rows: AssetRow[];
  columns: string[];
  edits: Record<string, AssetEdits>;
  userEdits: Record<string, string>;
}

export interface WorkbookSaveResult {
  filename: string;
  savedAt: string;
  /** `file.lastModified` after writing (ms since epoch) — store in session for conflict detection. */
  fileModifiedAt?: number;
  updatedRowCount: number;
  appendedRowCount: number;
  createdColumns: string[];
}

export interface WorkbookSaveConflict {
  conflict: true;
  externalModifiedAt: string; // ISO string of when the file was externally modified
}

export interface WorkbookSaveEligibility {
  allowed: boolean;
  reason?: string;
}

// ─── Eligibility ─────────────────────────────────────────────────────────────

export function getWorkbookSaveEligibility(
  data: AssetData | null,
  session: WorkbookSessionMeta | null,
): WorkbookSaveEligibility {
  if (!data) return { allowed: false, reason: "No data loaded." };
  if (!session) return { allowed: false, reason: "No workbook session active." };
  if (session.fileType === "csv") {
    return { allowed: false, reason: "CSV source — use Export CSV to save changes." };
  }
  if (session.isMultiSource) {
    return {
      allowed: false,
      reason: "Data merged from multiple sources — use Export CSV to save changes.",
    };
  }
  if (session.fileType !== "xlsx" && session.fileType !== "xls") {
    return { allowed: false, reason: "Only .xlsx / .xls files can be saved back." };
  }
  return { allowed: true };
}

// ─── Worksheet patching ───────────────────────────────────────────────────────

function patchWorksheet(
  ws: XLSX.WorkSheet,
  ctx: WorkbookPatchContext,
): { updatedRowCount: number; appendedRowCount: number; createdColumns: string[] } {
  const rawRef = ws["!ref"];
  const range = rawRef ? XLSX.utils.decode_range(rawRef) : XLSX.utils.decode_range("A1");

  // Build header → column-index map from row 0.
  const headerToCol: Record<string, number> = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    const cell = ws[addr];
    if (cell && cell.v != null) headerToCol[String(cell.v)] = c;
  }

  // Ensure extra edit columns are present; create them if missing.
  const createdColumns: string[] = [];
  let nextCol = range.e.c + 1;
  for (const col of SAVE_EXTRA_COLS) {
    if (!(col in headerToCol)) {
      const addr = XLSX.utils.encode_cell({ r: range.s.r, c: nextCol });
      ws[addr] = { v: col, t: "s" };
      headerToCol[col] = nextCol;
      createdColumns.push(col);
      nextCol++;
    }
  }
  if (createdColumns.length > 0) {
    range.e.c = nextCol - 1;
    ws["!ref"] = XLSX.utils.encode_range(range);
  }

  const writeCell = (wsRow: number, header: string, value: string) => {
    const colIdx = headerToCol[header];
    if (colIdx === undefined) return;
    ws[XLSX.utils.encode_cell({ r: wsRow, c: colIdx })] = { v: value, t: "s" };
  };

  let updatedRowCount = 0;
  let appendedRowCount = 0;
  let nextAppendRow = range.e.r + 1;

  for (const row of ctx.rows) {
    const edit = ctx.edits[getEditKey(row.id)];
    const userKey = (row.user || row.raw["Username"] || "").trim().toLowerCase();
    const endDate = ctx.userEdits[userKey] ?? row.raw["End date"] ?? "";

    let wsRow: number;

    if (row.workbookRef && row.sourceOriginKind === "imported") {
      // rowNumber is 1-based; convert to 0-based worksheet row index.
      wsRow = row.workbookRef.rowNumber - 1;
      updatedRowCount++;

      // Patch canonical field values back using the source-header map.
      for (const [canonical, header] of Object.entries(row.workbookRef.sourceHeaders)) {
        const val = row.raw[canonical] ?? "";
        writeCell(wsRow, header, val);
      }
    } else if (row.sourceOriginKind === "manual") {
      wsRow = nextAppendRow++;
      appendedRowCount++;

      // Write all canonical columns for manual rows.
      for (const field of ctx.columns) {
        writeCell(wsRow, field, row.raw[field] ?? "");
      }
      // Expand the sheet range.
      range.e.r = wsRow;
      ws["!ref"] = XLSX.utils.encode_range(range);
    } else {
      // Row came from a second import source — skip (save-eligibility already
      // blocks multi-source sessions, but be safe).
      continue;
    }

    // Write edit overlay fields.
    writeCell(wsRow, "Status", edit?.status ?? "");
    writeCell(wsRow, "Warranty until", edit?.warrantyUntil ?? "");
    writeCell(wsRow, "User Active?", edit?.userActive ?? "");
    writeCell(wsRow, "Skanska computer?", edit?.skanskaComputer ?? "");
    writeCell(wsRow, "End date", endDate);
    writeCell(wsRow, "Comments", edit?.comment ?? "");
  }

  return { updatedRowCount, appendedRowCount, createdColumns };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Patch the original workbook buffer with current app state and save it.
 *
 * If `existingHandle` is provided and still has write permission it is used
 * directly (no picker). Otherwise `showSaveFilePicker` is invoked. On
 * browsers without that API the patched workbook is downloaded.
 *
 * Returns `WorkbookSaveConflict` when the file on disk was modified externally
 * since the last known write — the caller should prompt the user.
 *
 * Throws on genuine errors; resolves `handle = undefined` when the user
 * cancels the picker.
 */
export async function savePatchedWorkbook(
  originalBuffer: ArrayBuffer,
  ctx: WorkbookPatchContext,
  session: WorkbookSessionMeta,
  existingHandle?: FileSystemFileHandle,
): Promise<{ result: WorkbookSaveResult; handle: FileSystemFileHandle | undefined } | WorkbookSaveConflict> {
  // Conflict detection: compare current file.lastModified with what we last saw.
  if (existingHandle && canDirectSaveWorkbook(session) && session.lastKnownFileModified != null) {
    try {
      const file = await existingHandle.getFile();
      if (file.lastModified > session.lastKnownFileModified) {
        return {
          conflict: true,
          externalModifiedAt: new Date(file.lastModified).toISOString(),
        };
      }
    } catch {
      // If we can't read the file handle, skip conflict detection and proceed.
    }
  }

  // 1. Read original workbook.
  const wb = XLSX.read(originalBuffer, { type: "array" });
  const ws = wb.Sheets[session.sheetName];
  if (!ws) throw new Error(`Sheet "${session.sheetName}" not found in workbook.`);

  // 2. Patch in-place.
  const { updatedRowCount, appendedRowCount, createdColumns } = patchWorksheet(ws, ctx);

  // 3. Serialize.
  const outBuf: ArrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });

  // 4. Determine filename.
  const suggestedName = session.lastSavedAsFilename ?? session.filename;
  const ext = suggestedName.split(".").pop() ?? "xlsx";

  // 5. Write to file.
  let handle: FileSystemFileHandle | undefined;

  const useHandle = existingHandle && canDirectSaveWorkbook(session) ? existingHandle : undefined;
  const pickedHandle = await pickSaveFileHandle({
    suggestedName,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: ext,
    existingHandle: useHandle,
  });

  if (pickedHandle) {
    await writeArrayBufferToFileHandle(pickedHandle, outBuf);
    handle = pickedHandle;
  } else if (useHandle) {
    // Had an existing handle but picker was skipped — write directly.
    await writeArrayBufferToFileHandle(useHandle, outBuf);
    handle = useHandle;
  } else {
    // Fallback download.
    downloadBlob(new Blob([outBuf]), suggestedName);
  }

  const savedAt = new Date().toISOString();
  // Read back file.lastModified after writing so we can detect future external edits.
  let fileModifiedAt: number | undefined;
  if (handle) {
    try {
      const f = await handle.getFile();
      fileModifiedAt = f.lastModified;
    } catch { /* non-fatal */ }
  }

  return {
    result: {
      filename: suggestedName,
      savedAt,
      fileModifiedAt,
      updatedRowCount,
      appendedRowCount,
      createdColumns,
    },
    handle,
  };
}

import * as XLSX from "xlsx";
import type { AssetRow, AssetData } from "./asset-types";
import type { AssetEdits, AssetStatus } from "./asset-edits";
import { STATUS_OPTIONS } from "./asset-edits";

const EXPORT_EXTRA_COLS = new Set(["Status", "Warranty until", "Exceptions", "Source file"]);

export function getSheetNames(buffer: ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: "array" });
  return wb.SheetNames;
}

export interface ParseResult {
  data: AssetData;
  seedEdits: Record<string, AssetEdits>;
}

export function parseSheet(buffer: ArrayBuffer, sheetName: string, filename: string): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  if (jsonRows.length === 0) {
    return { data: { rows: [], columns: [], filename, loadedAt: new Date().toISOString() }, seedEdits: {} };
  }

  const originalColumns = Object.keys(jsonRows[0]);
  const dataColumns = originalColumns.filter(c => !EXPORT_EXTRA_COLS.has(c));

  const colMap: Record<string, string> = {};
  for (const col of dataColumns) {
    colMap[col.toLowerCase().trim()] = col;
  }

  const cnKey = colMap["computername"] ?? null;
  const modelKey = colMap["modell"] ?? null;
  const userKey = colMap["user"] ?? null;

  // Check if re-imported file has Status / Warranty columns
  const hasStatus = originalColumns.includes("Status");
  const hasWarranty = originalColumns.includes("Warranty until");

  // First pass: collect all computernames for duplicate detection
  const cnCounts = new Map<string, number>();
  for (const row of jsonRows) {
    const cn = String(row[cnKey ?? ""] ?? "").trim().toLowerCase();
    if (cn) cnCounts.set(cn, (cnCounts.get(cn) ?? 0) + 1);
  }

  const seedEdits: Record<string, AssetEdits> = {};

  const rows: AssetRow[] = jsonRows.map((row, idx) => {
    const computername = cnKey ? String(row[cnKey] ?? "").trim() : "";
    const modell = modelKey ? String(row[modelKey] ?? "").trim() : "";
    const user = userKey ? String(row[userKey] ?? "").trim() : "";

    const exceptions: string[] = [];
    if (!user) exceptions.push("Missing user");
    if (!modell) exceptions.push("Missing model");
    if (computername && (cnCounts.get(computername.toLowerCase()) ?? 0) > 1) {
      exceptions.push("Duplicate computername");
    }

    const raw: Record<string, string> = {};
    for (const col of dataColumns) {
      raw[col] = String(row[col] ?? "").trim();
    }

    // Seed edits from re-imported metadata columns
    const statusVal = hasStatus ? String(row["Status"] ?? "").trim() : "";
    const warrantyVal = hasWarranty ? String(row["Warranty until"] ?? "").trim() : "";
    if (statusVal || warrantyVal) {
      const validStatus = (STATUS_OPTIONS as readonly string[]).includes(statusVal) ? statusVal as AssetStatus : "";
      seedEdits[String(idx)] = { status: validStatus, warrantyUntil: warrantyVal };
    }

    return { id: idx, computername, modell, user, raw, exceptions, sourceFile: filename };
  });

  return {
    data: {
      rows,
      columns: dataColumns,
      filename,
      loadedAt: new Date().toISOString(),
    },
    seedEdits,
  };
}

export function mergeData(existing: AssetData, incoming: AssetData): AssetData {
  const maxId = existing.rows.reduce((m, r) => Math.max(m, r.id), -1);
  const reindexed = incoming.rows.map((r, i) => ({ ...r, id: maxId + 1 + i }));
  const allRows = [...existing.rows, ...reindexed];

  // Union of columns
  const colSet = new Set(existing.columns);
  for (const c of incoming.columns) colSet.add(c);
  const columns = [...colSet];

  // Re-run duplicate computername detection across merged set
  const cnCounts = new Map<string, number>();
  for (const row of allRows) {
    const cn = row.computername.toLowerCase();
    if (cn) cnCounts.set(cn, (cnCounts.get(cn) ?? 0) + 1);
  }
  for (const row of allRows) {
    const isDup = row.computername && (cnCounts.get(row.computername.toLowerCase()) ?? 0) > 1;
    const hadDup = row.exceptions.includes("Duplicate computername");
    if (isDup && !hadDup) {
      row.exceptions = [...row.exceptions, "Duplicate computername"];
    } else if (!isDup && hadDup) {
      row.exceptions = row.exceptions.filter((e) => e !== "Duplicate computername");
    }
  }

  return {
    rows: allRows,
    columns,
    filename: [existing.filename, incoming.filename].join(", "),
    loadedAt: new Date().toISOString(),
  };
}

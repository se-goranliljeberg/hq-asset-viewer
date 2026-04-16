import * as XLSX from "xlsx";
import type { AssetRow, AssetData } from "./asset-types";

export function getSheetNames(buffer: ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: "array" });
  return wb.SheetNames;
}

export function parseSheet(buffer: ArrayBuffer, sheetName: string, filename: string): AssetData {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  if (jsonRows.length === 0) {
    return { rows: [], columns: [], filename, loadedAt: new Date().toISOString() };
  }

  const originalColumns = Object.keys(jsonRows[0]);
  const colMap: Record<string, string> = {};
  for (const col of originalColumns) {
    colMap[col.toLowerCase().trim()] = col;
  }

  const cnKey = colMap["computername"] ?? null;
  const modelKey = colMap["modell"] ?? null;
  const userKey = colMap["user"] ?? null;

  // First pass: collect all computernames for duplicate detection
  const cnCounts = new Map<string, number>();
  for (const row of jsonRows) {
    const cn = String(row[cnKey ?? ""] ?? "").trim().toLowerCase();
    if (cn) cnCounts.set(cn, (cnCounts.get(cn) ?? 0) + 1);
  }

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
    for (const col of originalColumns) {
      raw[col] = String(row[col] ?? "").trim();
    }

    return { id: idx, computername, modell, user, raw, exceptions };
  });

  return {
    rows,
    columns: originalColumns,
    filename,
    loadedAt: new Date().toISOString(),
  };
}

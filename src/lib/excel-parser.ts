import * as XLSX from "xlsx";
import type { AssetRow, AssetData } from "./asset-types";
import type { AssetEdits, AssetStatus } from "./asset-edits";
import { STATUS_OPTIONS } from "./asset-edits";

const EXPORT_EXTRA_COLS = new Set(["Status", "Warranty until", "Exceptions", "Source file"]);

// Canonical column names used for users-file enrichment
export const USER_INFO_COLUMNS = ["Email", "Department", "Creation date"] as const;

const USER_KEY_ALIASES = ["user", "username", "samaccountname"];
const EMAIL_ALIASES = ["email", "mail", "e-mail", "userprincipalname", "upn"];
const DEPT_ALIASES = ["department", "dept", "avdelning"];
const CREATED_ALIASES = ["creation date", "created", "createdate", "whencreated", "creationdate", "created on"];

export function getSheetNames(buffer: ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: "array" });
  return wb.SheetNames;
}

export interface ParseResult {
  data: AssetData;
  seedEdits: Record<string, AssetEdits>;
  isUsersFile: boolean;
}

function findKey(map: Record<string, string>, aliases: string[]): string | null {
  for (const a of aliases) {
    if (map[a]) return map[a];
  }
  return null;
}

/**
 * Normalize any incoming date-ish value into "YYYY-MM-DD" or "" if not parseable.
 * Handles: JS Date, Excel serial number, ISO strings, common locale strings (e.g. "4/15/2026", "15/4/2026").
 */
export function normalizeDate(input: unknown): string {
  if (input === null || input === undefined || input === "") return "";
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? "" : input.toISOString().slice(0, 10);
  }
  if (typeof input === "number" && isFinite(input)) {
    // Excel serial date: days since 1899-12-30
    const ms = Math.round((input - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  const s = String(input).trim();
  if (!s) return "";
  // Already ISO?
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (isoMatch) {
    const d = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00Z`);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  // Try locale parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

export function parseSheet(buffer: ArrayBuffer, sheetName: string, filename: string): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  if (jsonRows.length === 0) {
    return {
      data: { rows: [], columns: [], filename, loadedAt: new Date().toISOString() },
      seedEdits: {},
      isUsersFile: false,
    };
  }

  const originalColumns = Object.keys(jsonRows[0]);
  const dataColumns = originalColumns.filter((c) => !EXPORT_EXTRA_COLS.has(c));

  const colMap: Record<string, string> = {};
  for (const col of dataColumns) {
    colMap[col.toLowerCase().trim()] = col;
  }

  const cnKey = colMap["computername"] ?? null;
  const modelKey = colMap["modell"] ?? null;
  const userKey = findKey(colMap, USER_KEY_ALIASES);
  const emailKey = findKey(colMap, EMAIL_ALIASES);
  const deptKey = findKey(colMap, DEPT_ALIASES);
  const createdKey = findKey(colMap, CREATED_ALIASES);

  // Detect users-only file: no Computername column OR all rows have empty Computername,
  // AND has at least one user-info column
  const hasUserInfo = !!(emailKey || deptKey || createdKey);
  let allCnEmpty = true;
  if (cnKey) {
    for (const row of jsonRows) {
      if (String(row[cnKey] ?? "").trim() !== "") {
        allCnEmpty = false;
        break;
      }
    }
  }
  const isUsersFile = hasUserInfo && (!cnKey || allCnEmpty);

  const hasStatus = originalColumns.includes("Status");
  const hasWarranty = originalColumns.includes("Warranty until");

  // Duplicate detection by computername
  const cnCounts = new Map<string, number>();
  for (const row of jsonRows) {
    const cn = String(row[cnKey ?? ""] ?? "").trim().toLowerCase();
    if (cn) cnCounts.set(cn, (cnCounts.get(cn) ?? 0) + 1);
  }

  const seedEdits: Record<string, AssetEdits> = {};

  // Build the canonical column list. Always include the three user-info columns
  // when this is a users file, so they show in the table even if header names differ.
  const finalCols = [...dataColumns];
  for (const c of USER_INFO_COLUMNS) {
    if (!finalCols.includes(c)) finalCols.push(c);
  }

  const rows: AssetRow[] = jsonRows.map((row, idx) => {
    const computername = cnKey ? String(row[cnKey] ?? "").trim() : "";
    const modell = modelKey ? String(row[modelKey] ?? "").trim() : "";
    const user = userKey ? String(row[userKey] ?? "").trim() : "";
    const email = emailKey ? String(row[emailKey] ?? "").trim() : "";
    const department = deptKey ? String(row[deptKey] ?? "").trim() : "";
    const created = normalizeDate(createdKey ? row[createdKey] : "");

    const exceptions: string[] = [];
    if (isUsersFile) {
      if (!user) exceptions.push("Missing user");
    } else {
      if (!user) exceptions.push("Missing user");
      if (!modell) exceptions.push("Missing model");
      if (computername && (cnCounts.get(computername.toLowerCase()) ?? 0) > 1) {
        exceptions.push("Duplicate computername");
      }
    }
    if (isUsersFile && !computername) {
      exceptions.push("User without computer");
    }

    const raw: Record<string, string> = {};
    for (const col of dataColumns) {
      raw[col] = String(row[col] ?? "").trim();
    }
    if (email) raw["Email"] = email;
    if (department) raw["Department"] = department;
    if (created) raw["Creation date"] = created;
    for (const c of USER_INFO_COLUMNS) {
      if (!(c in raw)) raw[c] = "";
    }

    const statusVal = hasStatus ? String(row["Status"] ?? "").trim() : "";
    const warrantyRaw = hasWarranty ? row["Warranty until"] : "";
    const warrantyVal = normalizeDate(warrantyRaw);
    if (statusVal || warrantyVal) {
      const validStatus = (STATUS_OPTIONS as readonly string[]).includes(statusVal)
        ? (statusVal as AssetStatus)
        : "";
      seedEdits[String(idx)] = { status: validStatus, warrantyUntil: warrantyVal };
    }

    return { id: idx, computername, modell, user, raw, exceptions, sourceFile: filename };
  });

  return {
    data: { rows, columns: finalCols, filename, loadedAt: new Date().toISOString() },
    seedEdits,
    isUsersFile,
  };
}

export function mergeData(existing: AssetData, incoming: AssetData): AssetData {
  const maxId = existing.rows.reduce((m, r) => Math.max(m, r.id), -1);
  const reindexed = incoming.rows.map((r, i) => ({ ...r, id: maxId + 1 + i }));
  const allRows = [...existing.rows, ...reindexed];

  const colSet = new Set(existing.columns);
  for (const c of incoming.columns) colSet.add(c);
  const columns = [...colSet];

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

/**
 * Enrich existing rows with user info (Email, Department, Creation date) by matching
 * on User (case-insensitive) or Email. Unmatched users are appended as user-only rows
 * with the "User without computer" exception.
 */
export function enrichWithUsers(existing: AssetData, incoming: AssetData): AssetData {
  // Build lookup maps from existing rows
  const byUser = new Map<string, AssetRow>();
  const byEmail = new Map<string, AssetRow>();
  for (const r of existing.rows) {
    if (r.user) byUser.set(r.user.toLowerCase(), r);
    const email = (r.raw["Email"] ?? "").toLowerCase();
    if (email) byEmail.set(email, r);
  }

  const updatedRows: AssetRow[] = existing.rows.map((r) => ({ ...r, raw: { ...r.raw } }));
  const updatedById = new Map<number, AssetRow>(updatedRows.map((r) => [r.id, r]));

  let enrichedCount = 0;
  const unmatched: AssetRow[] = [];

  for (const incoming_row of incoming.rows) {
    const u = incoming_row.user.toLowerCase();
    const e = (incoming_row.raw["Email"] ?? "").toLowerCase();
    const match =
      (u && byUser.get(u)) ||
      (e && byEmail.get(e)) ||
      null;

    if (match) {
      const target = updatedById.get(match.id);
      if (!target) continue;
      for (const col of USER_INFO_COLUMNS) {
        const val = incoming_row.raw[col] ?? "";
        if (val && !target.raw[col]) {
          target.raw[col] = val;
        }
      }
      if (!target.user && incoming_row.user) target.user = incoming_row.user;
      enrichedCount++;
    } else {
      unmatched.push(incoming_row);
    }
  }

  const maxId = updatedRows.reduce((m, r) => Math.max(m, r.id), -1);
  const reindexedUnmatched = unmatched.map((r, i) => ({
    ...r,
    id: maxId + 1 + i,
    raw: { ...r.raw },
  }));

  const colSet = new Set(existing.columns);
  for (const c of incoming.columns) colSet.add(c);
  for (const c of USER_INFO_COLUMNS) colSet.add(c);

  return {
    rows: [...updatedRows, ...reindexedUnmatched],
    columns: [...colSet],
    filename: `${existing.filename} + ${incoming.filename} (enriched ${enrichedCount}, +${reindexedUnmatched.length} new)`,
    loadedAt: new Date().toISOString(),
  };
}

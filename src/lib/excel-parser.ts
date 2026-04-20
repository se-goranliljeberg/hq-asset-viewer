import * as XLSX from "xlsx";
import type { AssetRow, AssetData } from "./asset-types";
import type { AssetEdits, AssetStatus, YesNo } from "./asset-edits";
import { STATUS_OPTIONS } from "./asset-edits";

// Columns we add on export that are derived/computed, not source data.
// Status & "Warranty until" are intentionally NOT here — they're canonical
// fields users may legitimately import from spreadsheets.
const EXPORT_EXTRA_COLS = new Set(["Exceptions", "Comments", "Source file"]);

// ---------- Canonical schema ----------

export const CANONICAL_FIELDS = [
  "Username",
  "Name",
  "Computername",
  "Modell",
  "Last account activity",
  "Last logon date",
  "Status",
  "Warranty until",
  "AD Create.Date",
  "Company",
  "Email",
  "Department",
  "Manager",
  "User Active?",
  "Skanska computer?",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];
export type MappingValue = CanonicalField | "ignore";
export type Mapping = Record<string, MappingValue>;

// User-info canonical columns used for users-file detection / enrichment.
export const USER_INFO_COLUMNS: readonly CanonicalField[] = ["Email", "Department", "AD Create.Date"];

const ALIASES: Record<CanonicalField, string[]> = {
  Username: ["user", "username", "samaccountname", "sam-accountname", "username (pre-windows 2000)", "logon name", "login"],
  Name: ["name", "displayname", "display name", "full name", "fullname"],
  Computername: ["computername", "computer name", "hostname", "host"],
  Modell: ["modell", "model", "devicemodel", "device model"],
  // Narrowed: "last logon" aliases now belong to "Last logon date" so the obvious
  // header maps to the new column. "Last account activity" still catches AD-style headers.
  "Last account activity": ["last account activity", "account activity", "last activity"],
  "Last logon date": ["last logon date", "lastlogondate", "last logon", "lastlogon", "last sign-in", "lastsignin", "last signin"],
  Status: ["status"],
  "Warranty until": ["warranty until", "warranty", "warrantydate", "warranty date"],
  "AD Create.Date": ["ad create.date", "creation date", "createdate", "whencreated", "creationdate", "created on", "created", "create date"],
  Company: ["company", "organization", "org"],
  Email: ["email", "mail", "e-mail", "userprincipalname", "upn", "email address"],
  Department: ["department", "dept", "avdelning"],
  Manager: ["manager", "reports to", "chef", "linemanager", "line manager", "supervisor"],
  "User Active?": ["user active", "useractive", "active", "enabled", "accountdisabled", "account disabled", "disabled", "is active", "isactive"],
  "Skanska computer?": ["skanska computer", "skanskacomputer", "skanska device", "company device", "corporate device", "company computer", "corporate computer"],
};

// Substring patterns for fuzzy matches (when alias miss).
const FUZZY_SUBSTRINGS: Record<CanonicalField, string[]> = {
  Username: ["username", "sam-account", "samaccount", "pre-windows 2000", "pre-2000", "logon name"],
  Name: ["display name", "displayname", "full name"],
  Computername: ["computer name", "hostname"],
  Modell: ["model"],
  "Last account activity": ["last activity", "account activity"],
  "Last logon date": ["last logon", "lastlogon", "sign-in", "signin"],
  Status: [],
  "Warranty until": ["warranty"],
  "AD Create.Date": ["create date", "createdate", "whencreated", "creation"],
  Company: ["company", "organization"],
  Email: ["email", "mail", "upn"],
  Department: ["department", "dept"],
  Manager: ["manager", "supervisor"],
  "User Active?": ["active", "enabled", "disabled"],
  "Skanska computer?": ["skanska", "company device", "corporate device"],
};

export interface MappingDetection {
  field: MappingValue;
  confidence: "alias" | "fuzzy" | "none";
}

/**
 * Suggest canonical-field assignments for a list of source headers.
 * Each header gets the highest-confidence match (alias > fuzzy). Ties are broken
 * by canonical field order. Conflicts (two headers → one canonical) are NOT
 * resolved here — the dialog UI surfaces that.
 */
export function suggestMapping(headers: string[]): Record<string, MappingDetection> {
  const result: Record<string, MappingDetection> = {};
  const used = new Set<CanonicalField>();

  // First pass: alias matches
  for (const h of headers) {
    const norm = h.toLowerCase().trim();
    let matched: CanonicalField | null = null;
    for (const field of CANONICAL_FIELDS) {
      if (used.has(field)) continue;
      if (ALIASES[field].includes(norm)) {
        matched = field;
        break;
      }
    }
    if (matched) {
      result[h] = { field: matched, confidence: "alias" };
      used.add(matched);
    }
  }
  // Second pass: fuzzy substring matches for unmatched headers
  for (const h of headers) {
    if (result[h]) continue;
    const norm = h.toLowerCase().trim();
    let matched: CanonicalField | null = null;
    for (const field of CANONICAL_FIELDS) {
      if (used.has(field)) continue;
      if (FUZZY_SUBSTRINGS[field].some((s) => norm.includes(s))) {
        matched = field;
        break;
      }
    }
    if (matched) {
      result[h] = { field: matched, confidence: "fuzzy" };
      used.add(matched);
    } else {
      result[h] = { field: "ignore", confidence: "none" };
    }
  }
  return result;
}

// ---------- Status normalization ----------

/**
 * Map any inbound status string to one of the canonical STATUS_OPTIONS.
 * Tolerant to case, whitespace, and common aliases used in Excel files.
 * Returns "" when the value can't be confidently classified.
 */
export function normalizeStatus(input: unknown): AssetStatus {
  if (input === null || input === undefined) return "";
  const raw = String(input).trim();
  if (!raw) return "";
  const norm = raw.toLowerCase().replace(/[._\-/]+/g, " ").replace(/\s+/g, " ").trim();
  for (const opt of STATUS_OPTIONS) {
    if (opt.toLowerCase() === norm) return opt;
  }
  if (/(sent|return(ed)?|ship(ped)?|back).*broker|broker.*return|brokered|return to broker/.test(norm)) {
    return "Sent back to broker";
  }
  if (/(deployed|assigned|issued|in use|with user|user has|handed out)/.test(norm)) {
    return "Deployed at user";
  }
  if (/(in stock|stock|warehouse|available|spare|on shelf|inventory|new)/.test(norm)) {
    return "In stock";
  }
  return "";
}

// ---------- Yes/No normalization ----------

/**
 * Map any truthy/falsy import string into "yes" | "no" | "".
 * Recognises: yes/no, true/false, 1/0, enabled/disabled, active/inactive.
 * For "User Active?" specifically, "accountdisabled = TRUE" means inactive,
 * which is handled by the caller via the `invert` flag.
 */
export function normalizeYesNo(input: unknown, invert = false): YesNo {
  if (input === null || input === undefined) return "";
  const raw = String(input).trim().toLowerCase();
  if (!raw) return "";
  let v: YesNo = "";
  if (["yes", "y", "true", "1", "enabled", "active", "ok"].includes(raw)) v = "yes";
  else if (["no", "n", "false", "0", "disabled", "inactive", "not active"].includes(raw)) v = "no";
  else return "";
  if (invert) v = v === "yes" ? "no" : "yes";
  return v;
}



export function getSheetNames(buffer: ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: "array" });
  return wb.SheetNames;
}

/**
 * Normalize any incoming date-ish value into "YYYY-MM-DD" or "" if not parseable.
 */
export function normalizeDate(input: unknown): string {
  if (input === null || input === undefined || input === "") return "";
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? "" : input.toISOString().slice(0, 10);
  }
  if (typeof input === "number") {
    if (!isFinite(input) || input <= 0) return "";
    const ms = Math.round((input - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (isNaN(d.getTime()) || d.getUTCFullYear() < 1970) return "";
    return d.toISOString().slice(0, 10);
  }
  const s = String(input).trim();
  if (!s || s === "0") return "";
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (isoMatch) {
    const d = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00Z`);
    if (isNaN(d.getTime()) || d.getUTCFullYear() < 1970) return "";
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime()) && d.getUTCFullYear() >= 1970) return d.toISOString().slice(0, 10);
  return "";
}

// ---------- Inspection (no row construction) ----------

export interface InspectResult {
  headers: string[];
  samples: Record<string, string>;
  suggested: Record<string, MappingDetection>;
  totalRows: number;
}

export function inspectSheet(buffer: ArrayBuffer, sheetName: string): InspectResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (jsonRows.length === 0) {
    return { headers: [], samples: {}, suggested: {}, totalRows: 0 };
  }
  const headers = Object.keys(jsonRows[0]).filter((c) => !EXPORT_EXTRA_COLS.has(c));
  const samples: Record<string, string> = {};
  for (const h of headers) {
    let sample = "";
    for (const row of jsonRows) {
      const v = row[h];
      if (v !== null && v !== undefined && String(v).trim() !== "") {
        sample = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
        break;
      }
    }
    samples[h] = sample;
  }
  return {
    headers,
    samples,
    suggested: suggestMapping(headers),
    totalRows: jsonRows.length,
  };
}

/** Stable hash of a header set — used to remember per-file mappings. */
export function headerSetHash(headers: string[]): string {
  const sorted = [...headers].map((h) => h.toLowerCase().trim()).sort().join("|");
  let h = 0;
  for (let i = 0; i < sorted.length; i++) {
    h = (h * 31 + sorted.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(36)}`;
}

// ---------- Parsing with explicit mapping ----------

export interface ParseResult {
  data: AssetData;
  seedEdits: Record<string, AssetEdits>;
  isUsersFile: boolean;
  /** Per-row, per-field ISO timestamps recording when this value was imported. */
  importedAt: Record<number, Record<string, string>>;
}

export function parseSheetWithMapping(
  buffer: ArrayBuffer,
  sheetName: string,
  filename: string,
  mapping: Mapping,
): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  if (jsonRows.length === 0) {
    return {
      data: { rows: [], columns: [], filename, loadedAt: new Date().toISOString() },
      seedEdits: {},
      isUsersFile: false,
      importedAt: {},
    };
  }

  // Build inverse mapping: canonical field -> source header (last-wins on dup).
  const fieldToHeader: Partial<Record<CanonicalField, string>> = {};
  for (const [header, target] of Object.entries(mapping)) {
    if (target !== "ignore") fieldToHeader[target] = header;
  }

  const cnHeader = fieldToHeader["Computername"];
  const modelHeader = fieldToHeader["Modell"];
  const userHeader = fieldToHeader["Username"];
  const emailHeader = fieldToHeader["Email"];
  const statusHeader = fieldToHeader["Status"];
  const warrantyHeader = fieldToHeader["Warranty until"];
  const createdHeader = fieldToHeader["AD Create.Date"];
  const activeHeader = fieldToHeader["User Active?"];
  const skanskaHeader = fieldToHeader["Skanska computer?"];
  // If header is "AccountDisabled", treat truthy values as inactive (invert).
  const activeHeaderInverts = !!activeHeader && /disabled/i.test(activeHeader);

  const dateFields: ReadonlySet<CanonicalField> = new Set<CanonicalField>([
    "AD Create.Date",
    "Last account activity",
    "Last logon date",
  ]);

  // Detect users-only file: no Computername mapped, OR all rows empty in it.
  let allCnEmpty = true;
  if (cnHeader) {
    for (const row of jsonRows) {
      if (String(row[cnHeader] ?? "").trim() !== "") {
        allCnEmpty = false;
        break;
      }
    }
  }
  const hasUserInfo = USER_INFO_COLUMNS.some((c) => !!fieldToHeader[c]);
  const isUsersFile = hasUserInfo && (!cnHeader || allCnEmpty);

  // Duplicate detection by computername
  const cnCounts = new Map<string, number>();
  if (cnHeader) {
    for (const row of jsonRows) {
      const cn = String(row[cnHeader] ?? "").trim().toLowerCase();
      if (cn) cnCounts.set(cn, (cnCounts.get(cn) ?? 0) + 1);
    }
  }

  const seedEdits: Record<string, AssetEdits> = {};
  const importedAt: Record<number, Record<string, string>> = {};
  const importIso = new Date().toISOString();
  // Final columns: only canonical ones that are mapped. We always include the
  // mapped fields in canonical order (for stability across files).
  const finalCols: CanonicalField[] = CANONICAL_FIELDS.filter((f) => !!fieldToHeader[f]);

  const rows: AssetRow[] = jsonRows.map((row, idx) => {
    const computername = cnHeader ? String(row[cnHeader] ?? "").trim() : "";
    const modell = modelHeader ? String(row[modelHeader] ?? "").trim() : "";
    let user = userHeader ? String(row[userHeader] ?? "").trim() : "";
    const email = emailHeader ? String(row[emailHeader] ?? "").trim() : "";

    // Fallback: derive user from email local-part
    if (!user && email && email.includes("@")) {
      user = email.split("@")[0].trim();
    }

    const exceptions: string[] = [];
    if (isUsersFile) {
      if (!user && !email) exceptions.push("Missing user");
      if (!computername) exceptions.push("User without computer");
    } else {
      if (!user && !email) exceptions.push("Missing user");
      if (!modell && !computername) exceptions.push("Missing computer");
      else if (!modell) exceptions.push("Missing computer");
      if (computername && (cnCounts.get(computername.toLowerCase()) ?? 0) > 1) {
        exceptions.push("Duplicate computername");
      }
    }

    // Build raw using ONLY canonical columns
    const raw: Record<string, string> = {};
    const rowStamps: Record<string, string> = {};
    for (const field of finalCols) {
      const src = fieldToHeader[field]!;
      const cellValue = row[src];
      let str: string;
      if (dateFields.has(field) || field === "Warranty until") {
        str = normalizeDate(cellValue);
      } else if (cellValue instanceof Date) {
        str = cellValue.toISOString().slice(0, 10);
      } else {
        str = String(cellValue ?? "").trim();
      }
      raw[field] = str;
      if (str) rowStamps[field] = importIso;
    }
    // Ensure derived user fallback shows in Username column too
    if (!raw["Username"] && user) raw["Username"] = user;

    if (Object.keys(rowStamps).length > 0) importedAt[idx] = rowStamps;

    // Seed edits from imported Status / Warranty until / Active / Skanska columns
    const statusVal = statusHeader ? String(row[statusHeader] ?? "").trim() : "";
    const warrantyVal = warrantyHeader ? normalizeDate(row[warrantyHeader]) : "";
    const validStatus = normalizeStatus(statusVal);
    const activeVal: YesNo = activeHeader
      ? normalizeYesNo(row[activeHeader], activeHeaderInverts)
      : "";
    let skanskaVal: YesNo = skanskaHeader ? normalizeYesNo(row[skanskaHeader]) : "";
    // Per spec: if computername is empty, leave Skanska empty (don't default).
    if (!skanskaVal && computername) skanskaVal = "yes";
    if (!computername) skanskaVal = "";

    if (validStatus || warrantyVal || activeVal || skanskaVal) {
      seedEdits[String(idx)] = {
        status: validStatus,
        warrantyUntil: warrantyVal,
        ...(activeVal ? { userActive: activeVal } : {}),
        ...(skanskaVal ? { skanskaComputer: skanskaVal } : {}),
      };
    }

    // Inactive-user exception
    if (activeVal === "no") exceptions.push("Inactive user");

    return { id: idx, computername, modell, user, raw, exceptions, sourceFile: filename };
  });

  return {
    data: { rows, columns: finalCols as string[], filename, loadedAt: new Date().toISOString() },
    seedEdits,
    isUsersFile,
    importedAt,
  };
}

// ---------- Legacy auto-parse helper (kept for callers without explicit mapping) ----------

export function parseSheet(buffer: ArrayBuffer, sheetName: string, filename: string): ParseResult {
  const inspected = inspectSheet(buffer, sheetName);
  const mapping: Mapping = {};
  for (const [h, det] of Object.entries(inspected.suggested)) {
    mapping[h] = det.field;
  }
  return parseSheetWithMapping(buffer, sheetName, filename, mapping);
}

// ---------- Merge / enrich ----------

export function mergeData(existing: AssetData, incoming: AssetData): AssetData {
  const maxId = existing.rows.reduce((m, r) => Math.max(m, r.id), -1);
  const reindexed = incoming.rows.map((r, i) => ({ ...r, id: maxId + 1 + i }));
  const allRows = [...existing.rows, ...reindexed];

  const colSet = new Set(existing.columns);
  for (const c of incoming.columns) colSet.add(c);
  // Keep canonical order
  const columns = CANONICAL_FIELDS.filter((c) => colSet.has(c));

  const cnCounts = new Map<string, number>();
  for (const row of allRows) {
    const cn = row.computername.toLowerCase();
    if (cn) cnCounts.set(cn, (cnCounts.get(cn) ?? 0) + 1);
  }
  for (const row of allRows) {
    const isDup = row.computername && (cnCounts.get(row.computername.toLowerCase()) ?? 0) > 1;
    const hadDup = row.exceptions.includes("Duplicate computername");
    if (isDup && !hadDup) row.exceptions = [...row.exceptions, "Duplicate computername"];
    else if (!isDup && hadDup) row.exceptions = row.exceptions.filter((e) => e !== "Duplicate computername");
  }

  return {
    rows: allRows,
    columns,
    filename: [existing.filename, incoming.filename].join(", "),
    loadedAt: new Date().toISOString(),
  };
}

export function enrichWithUsers(existing: AssetData, incoming: AssetData): AssetData {
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
    const match = (u && byUser.get(u)) || (e && byEmail.get(e)) || null;
    if (match) {
      const target = updatedById.get(match.id);
      if (!target) continue;
      for (const col of USER_INFO_COLUMNS) {
        const val = incoming_row.raw[col] ?? "";
        if (val && !target.raw[col]) target.raw[col] = val;
      }
      // Also enrich Name / Company / Manager / Last logon date if available
      for (const col of ["Name", "Company", "Manager", "Last logon date"] as CanonicalField[]) {
        const val = incoming_row.raw[col] ?? "";
        if (val && !target.raw[col]) target.raw[col] = val;
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
  const columns = CANONICAL_FIELDS.filter((c) => colSet.has(c));

  return {
    rows: [...updatedRows, ...reindexedUnmatched],
    columns,
    filename: `${existing.filename} + ${incoming.filename} (enriched ${enrichedCount}, +${reindexedUnmatched.length} new)`,
    loadedAt: new Date().toISOString(),
  };
}

// ---------- One-time data migration to canonical schema ----------

/**
 * Reshape a previously stored AssetData to the canonical schema.
 * Returns { data, changed } — `changed` is true if anything was dropped/renamed.
 */
export function migrateToCanonical(data: AssetData): { data: AssetData; changed: boolean } {
  const canonicalSet = new Set<string>(CANONICAL_FIELDS as readonly string[]);
  const lowerToCanonical = new Map<string, CanonicalField>();
  for (const f of CANONICAL_FIELDS) {
    for (const a of ALIASES[f]) lowerToCanonical.set(a, f);
    lowerToCanonical.set(f.toLowerCase(), f);
  }

  // Determine which old columns map to which canonical (and which to drop).
  const colRemap = new Map<string, CanonicalField>();
  const droppedCols = new Set<string>();
  for (const c of data.columns) {
    if (canonicalSet.has(c)) {
      colRemap.set(c, c as CanonicalField);
      continue;
    }
    const target = lowerToCanonical.get(c.toLowerCase().trim());
    if (target) colRemap.set(c, target);
    else droppedCols.add(c);
  }

  const presentFields = new Set<CanonicalField>([...colRemap.values()]);
  const newCols = CANONICAL_FIELDS.filter((c) => presentFields.has(c));
  const changed = droppedCols.size > 0 || data.columns.some((c, i) => c !== newCols[i]);

  if (!changed) return { data, changed: false };

  const newRows: AssetRow[] = data.rows.map((r) => {
    const newRaw: Record<string, string> = {};
    for (const [oldCol, target] of colRemap.entries()) {
      const v = r.raw[oldCol] ?? "";
      if (v && !newRaw[target]) newRaw[target] = v;
    }
    for (const f of newCols) {
      if (!(f in newRaw)) newRaw[f] = "";
    }
    return { ...r, raw: newRaw };
  });

  return {
    data: { ...data, columns: newCols as string[], rows: newRows },
    changed: true,
  };
}

// ---------- Username-as-master conflict detection ----------

export interface FieldDiff {
  field: string;
  oldVal: string;
  newVal: string;
}

export interface UsernameConflict {
  existingRow: AssetRow;
  incomingRow: AssetRow;
  /** Original index in `incoming.rows` — used by callers to look up seedEdits. */
  incomingIdx: number;
  diffs: FieldDiff[];
}

export interface ConflictDetectionResult {
  conflicts: UsernameConflict[];
  /** Incoming rows (with their original index) that had no username match. */
  nonConflicting: Array<{ row: AssetRow; incomingIdx: number }>;
}

/**
 * Match incoming rows against existing rows by Username (case-insensitive, trimmed).
 * Rows without a username on either side don't participate — they fall through
 * to the existing merge/enrich path.
 *
 * The diffs list contains only fields where existing !== incoming AND incoming !== "".
 */
export function detectUsernameConflicts(
  existing: AssetData,
  incoming: AssetData,
  seedEdits: Record<string, AssetEdits> = {},
  existingEdits: Record<string, AssetEdits> = {},
): ConflictDetectionResult {
  const byUser = new Map<string, AssetRow>();
  for (const r of existing.rows) {
    const u = r.user.trim().toLowerCase();
    if (u) byUser.set(u, r);
  }

  const conflicts: UsernameConflict[] = [];
  const nonConflicting: Array<{ row: AssetRow; incomingIdx: number }> = [];

  incoming.rows.forEach((row, idx) => {
    const u = row.user.trim().toLowerCase();
    const match = u ? byUser.get(u) : undefined;
    if (!match) {
      nonConflicting.push({ row, incomingIdx: idx });
      return;
    }
    const incomingSeed = seedEdits[String(idx)];
    const existingSeed = existingEdits[String(match.id)];
    const diffs: FieldDiff[] = [];

    // Canonical raw fields (Username already matched, skip it).
    for (const f of CANONICAL_FIELDS) {
      if (f === "Username") continue;
      // Status / Warranty / Active / Skanska come from seedEdits, not raw.
      if (f === "Status") {
        const newVal = incomingSeed?.status ?? "";
        const oldVal = existingSeed?.status ?? "";
        if (newVal && newVal !== oldVal) diffs.push({ field: f, oldVal, newVal });
        continue;
      }
      if (f === "Warranty until") {
        const newVal = incomingSeed?.warrantyUntil ?? "";
        const oldVal = existingSeed?.warrantyUntil ?? "";
        if (newVal && newVal !== oldVal) diffs.push({ field: f, oldVal, newVal });
        continue;
      }
      if (f === "User Active?") {
        const newVal = incomingSeed?.userActive ?? "";
        const oldVal = existingSeed?.userActive ?? "";
        if (newVal && newVal !== oldVal) diffs.push({ field: f, oldVal, newVal });
        continue;
      }
      if (f === "Skanska computer?") {
        const newVal = incomingSeed?.skanskaComputer ?? "";
        const oldVal = existingSeed?.skanskaComputer ?? "";
        if (newVal && newVal !== oldVal) diffs.push({ field: f, oldVal, newVal });
        continue;
      }
      const newVal = (row.raw[f] ?? "").trim();
      const oldVal = (match.raw[f] ?? "").trim();
      if (newVal && newVal !== oldVal) diffs.push({ field: f, oldVal, newVal });
    }

    if (diffs.length > 0) {
      conflicts.push({ existingRow: match, incomingRow: row, incomingIdx: idx, diffs });
    }
    // If usernames match but no diffs, treat as fully-handled: do NOT add as new row.
    // (We silently skip duplicates with no new info.)
  });

  return { conflicts, nonConflicting };
}


/**
 * Audit-log helpers for the per-row Comments column.
 *
 * Format (current): `Date: YYYY-MM-DD [INI] Change: <field> from "<old>" to "<new>"`
 * Format (legacy):  `Date: YYYY-MM-DD Change: <field> from "<old>" to "<new>"`
 *
 * Multiple entries are joined with ` | `.
 * Existing free-text comments that don't match the format are preserved verbatim
 * as a "note" entry when parsed for the timeline view.
 */

const USER_KEY = "hq_audit_user_initials";
const SEP = " | ";

export function getStoredInitials(): string {
  try {
    return localStorage.getItem(USER_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setStoredInitials(value: string): void {
  const v = value.trim().toUpperCase().slice(0, 4);
  if (!v) return;
  try {
    localStorage.setItem(USER_KEY, v);
  } catch {
    // ignore quota
  }
}

export function clearStoredInitials(): void {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

/** Append an audit entry to a row's comment field. */
export function appendComment(
  existing: string | undefined,
  change: string,
  initials?: string,
): string {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const stamp = `${today} ${hh}:${mm}`;
  const ini = (initials ?? getStoredInitials()).trim().toUpperCase();
  const entry = ini
    ? `Date: ${stamp} [${ini}] Change: ${change}`
    : `Date: ${stamp} Change: ${change}`;
  const prev = (existing ?? "").trim();
  return prev ? `${prev}${SEP}${entry}` : entry;
}

export function describeChange(column: string, from: string, to: string): string {
  const f = from === "" ? "(empty)" : from;
  const t = to === "" ? "(empty)" : to;
  return `${column} from "${f}" to "${t}"`;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

export interface AuditEntry {
  raw: string;
  date?: string;
  initials?: string;
  /** Free-form change description ("Status from "X" to "Y"" or "Row added manually …"). */
  change: string;
  /** Parsed structured field/from/to when the change matches the standard pattern. */
  field?: string;
  from?: string;
  to?: string;
  isBatch?: boolean;
  /** True when the entry didn't match the audit grammar (legacy free-text). */
  isNote?: boolean;
}

const ENTRY_RE =
  /^Date:\s*(\d{4}-\d{2}-\d{2})(?:\s*\[([A-Z0-9]+)\])?\s*Change:\s*(.+)$/i;
const CHANGE_RE = /^(.+?)\s+from\s+"((?:[^"\\]|\\.)*)"\s+to\s+"((?:[^"\\]|\\.)*)"(\s*\(batch\))?\s*$/i;

export function parseEntries(comment: string | undefined): AuditEntry[] {
  const text = (comment ?? "").trim();
  if (!text) return [];
  return text.split(SEP).map((raw): AuditEntry => {
    const trimmed = raw.trim();
    const m = ENTRY_RE.exec(trimmed);
    if (!m) {
      return { raw: trimmed, change: trimmed, isNote: true };
    }
    const [, date, initials, change] = m;
    const c = CHANGE_RE.exec(change.trim());
    if (c) {
      return {
        raw: trimmed,
        date,
        initials,
        change: change.trim(),
        field: c[1].trim(),
        from: c[2],
        to: c[3],
        isBatch: !!c[4],
      };
    }
    return { raw: trimmed, date, initials, change: change.trim() };
  });
}

/**
 * Remove the most recent entry from a comment string.
 * Returns the trimmed remainder (or empty string) and the popped entry, if any.
 */
export function popLastEntry(
  comment: string | undefined,
): { remainder: string; popped: AuditEntry | null } {
  const text = (comment ?? "").trim();
  if (!text) return { remainder: "", popped: null };
  const parts = text.split(SEP);
  const lastRaw = parts.pop() ?? "";
  const remainder = parts.join(SEP);
  const parsedAll = parseEntries(lastRaw);
  return { remainder, popped: parsedAll[0] ?? null };
}

const STORAGE_KEY = "hq_asset_edits";

export const STATUS_OPTIONS = ["In stock", "Deployed at user", "Sent back to broker"] as const;
export type AssetStatus = (typeof STATUS_OPTIONS)[number] | "";

export type YesNo = "yes" | "no" | "";

export interface AssetEdits {
  status: AssetStatus;
  warrantyUntil: string; // YYYY-MM-DD or ""
  comment?: string; // free-text user note
  /** "yes" (active) is the implicit default when this field is unset. */
  userActive?: YesNo;
  /** "" when the row has no computername; otherwise defaults to "yes". */
  skanskaComputer?: YesNo;
}

type EditsMap = Record<string, AssetEdits>; // keyed by row computername+id

export function loadEdits(): EditsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as EditsMap;
  } catch {
    return {};
  }
}

export function saveEdits(edits: EditsMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
  } catch {
    // quota exceeded — silently fail
  }
}

export function clearEdits(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getEditKey(rowId: number): string {
  return String(rowId);
}

/** Resolve the effective userActive value, applying the "yes" default. */
export function effectiveUserActive(edits?: AssetEdits): YesNo {
  const v = edits?.userActive;
  if (v === "no") return "no";
  return "yes";
}

/**
 * Resolve effective skanskaComputer value.
 * Empty when computername is empty (and not explicitly set), else defaults to "yes".
 */
export function effectiveSkanska(edits: AssetEdits | undefined, computername: string): YesNo {
  const v = edits?.skanskaComputer;
  if (v === "yes" || v === "no") return v;
  if (!computername.trim()) return "";
  return "yes";
}

/**
 * Compute the effective exception list for a row given the current edits.
 *
 * The static `row.exceptions` are seeded at parse time from the file. Some of
 * them depend on values the user can edit later (User Active?, Skanska
 * computer?). This helper layers those edits on top so the table, KPIs,
 * filters and audit dashboard all agree on what counts as an exception
 * *right now*.
 *
 * Rules:
 *  - Skanska computer? = No  → user is not expected to have a Skanska
 *    computer, so "Missing computer" / "User without computer" do NOT apply.
 *  - User Active? = No
 *      • with a computername → add "Assigned to inactive user" (a leaver
 *        still holding a device is a flag) and keep "Inactive user".
 *      • without a computername → drop "Missing computer" / "User without
 *        computer" (we don't expect leavers to have a device), keep
 *        "Inactive user".
 *  - User Active? = Yes → drop any stale "Inactive user" / "Assigned to
 *    inactive user" tags from the static list.
 */
const MISSING_COMPUTER_EXCEPTIONS = new Set([
  "Missing computer",
  "Missing Computername",
  "User without computer",
]);

export function effectiveExceptions(
  row: { computername: string; exceptions: string[] },
  edits: AssetEdits | undefined,
): string[] {
  const active = effectiveUserActive(edits);
  const skanska = effectiveSkanska(edits, row.computername);
  const hasComputer = row.computername.trim() !== "";

  let result = row.exceptions.slice();

  // Computername was added after import → drop stale "missing computer" tags
  // that were seeded at parse time when the field was still empty.
  if (hasComputer) {
    result = result.filter((e) => !MISSING_COMPUTER_EXCEPTIONS.has(e));
  }

  // Skanska = No → suppress "missing computer" family.
  if (skanska === "no") {
    result = result.filter((e) => !MISSING_COMPUTER_EXCEPTIONS.has(e));
  }

  if (active === "no") {
    // Inactive user with no computer: missing-computer doesn't apply.
    if (!hasComputer) {
      result = result.filter((e) => !MISSING_COMPUTER_EXCEPTIONS.has(e));
    }
    // Always tag inactive users.
    if (!result.includes("Inactive user")) result.push("Inactive user");
    // Inactive user that still holds a device → flag it.
    if (hasComputer && !result.includes("Assigned to inactive user")) {
      result.push("Assigned to inactive user");
    }
  } else {
    // Active user → strip any leftover inactive tags from the static list.
    result = result.filter(
      (e) => e !== "Inactive user" && e !== "Assigned to inactive user",
    );
  }

  return result;
}

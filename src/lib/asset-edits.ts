import type { AssetRow, LifecycleEvent, LifecycleState } from "./asset-types";
import { getStoredInitials } from "./comment-log";

const STORAGE_KEY = "hq_asset_edits";
const USER_STORAGE_KEY = "hq_user_edits";

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
export type UserEdits = Record<string, string>; // keyed by lowercased username; value is YYYY-MM-DD

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

export function loadUserEdits(): UserEdits {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as UserEdits;
  } catch {
    return {};
  }
}

export function saveUserEdits(edits: UserEdits): void {
  try {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(edits));
  } catch {
    // quota exceeded — silently fail
  }
}

export function clearUserEdits(): void {
  localStorage.removeItem(USER_STORAGE_KEY);
}

export function clearAllEdits(): void {
  clearEdits();
  clearUserEdits();
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
 * Compute the effective exception list for a row given the current edits and
 * a precomputed set of usernames known to own multiple computers.
 *
 * The static `row.exceptions` are seeded at parse time from the file. Some of
 * them depend on values the user can edit later (User Active?, Skanska
 * computer?). This helper layers those edits on top so the table, KPIs,
 * filters and audit dashboard all agree on what counts as an exception
 * *right now*.
 *
 * Multi-computer detection is dataset-wide — pass `multiComputerUsers` (a
 * Set of lowercased usernames) so the exception is added consistently to
 * every row owned by such a user. When omitted, the multi-computer rule is
 * skipped (the row never gets the flag).
 */
const MISSING_COMPUTER_EXCEPTIONS = new Set([
  "Missing computer",
  "Missing Computername",
  "User without computer",
]);

export const MULTI_COMPUTER_EXCEPTION = "User has multiple computers";

export function effectiveExceptions(
  row: { computername: string; user?: string; exceptions: string[] },
  edits: AssetEdits | undefined,
  multiComputerUsers?: Set<string>,
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

  // Multi-computer: dataset-wide flag, applied to every row owned by a user
  // who currently holds more than one Computername.
  if (multiComputerUsers && hasComputer) {
    const u = (row.user ?? "").trim().toLowerCase();
    if (u && multiComputerUsers.has(u)) {
      if (!result.includes(MULTI_COMPUTER_EXCEPTION)) result.push(MULTI_COMPUTER_EXCEPTION);
    } else {
      result = result.filter((e) => e !== MULTI_COMPUTER_EXCEPTION);
    }
  }

  return result;
}

/**
 * Compute the set of usernames (lowercased) currently associated with more
 * than one distinct Computername. Empty usernames and empty computernames are
 * skipped. The returned set is safe to share across renders within a memo.
 */
export function computeMultiComputerUsers(rows: AssetRow[]): Set<string> {
  const byUser = new Map<string, Set<string>>();
  for (const r of rows) {
    const u = (r.user ?? "").trim().toLowerCase();
    const c = r.computername.trim().toLowerCase();
    if (!u || !c) continue;
    let set = byUser.get(u);
    if (!set) {
      set = new Set();
      byUser.set(u, set);
    }
    set.add(c);
  }
  const out = new Set<string>();
  for (const [u, set] of byUser.entries()) {
    if (set.size > 1) out.add(u);
  }
  return out;
}

// ─── Lifecycle helpers ─────────────────────────────────────────────────────

/**
 * Append an event to a row's lifecycle history (returns a new row — does not
 * mutate). Initials default to the stored audit user. `previousUsers` is
 * updated when the event records a `prevUser` that's not already known.
 */
export function recordLifecycleEvent(
  row: AssetRow,
  event: Omit<LifecycleEvent, "at" | "by"> & Partial<Pick<LifecycleEvent, "at" | "by">>,
): AssetRow {
  const at = event.at ?? new Date().toISOString();
  const by = (event.by ?? getStoredInitials() ?? "").trim();
  const finalEvent: LifecycleEvent = { ...event, at, by };

  const history = [...(row.history ?? []), finalEvent];
  const previousUsers = [...(row.previousUsers ?? [])];
  const candidate = (event.prevUser ?? "").trim();
  if (candidate) {
    const lower = candidate.toLowerCase();
    if (!previousUsers.some((u) => u.toLowerCase() === lower)) {
      previousUsers.push(candidate);
    }
  }
  return { ...row, history, previousUsers };
}

/** Convenience wrapper that produces a one-line audit comment for an event. */
export function describeLifecycleEvent(event: LifecycleEvent): string {
  const parts: string[] = [];
  const fromLabel = event.from ? `"${event.from}"` : "(none)";
  parts.push(`Lifecycle ${fromLabel} → "${event.to}"`);
  if (event.user) parts.push(`assigned to "${event.user}"`);
  if (event.prevUser) parts.push(`previously "${event.prevUser}"`);
  if (event.note) parts.push(event.note);
  return parts.join(" · ");
}

export type { LifecycleEvent, LifecycleState };

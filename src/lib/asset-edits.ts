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

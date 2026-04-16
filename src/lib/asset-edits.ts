const STORAGE_KEY = "hq_asset_edits";

export const STATUS_OPTIONS = ["In stock", "Deployed at user", "Sent back to broker"] as const;
export type AssetStatus = (typeof STATUS_OPTIONS)[number] | "";

export interface AssetEdits {
  status: AssetStatus;
  warrantyUntil: string; // YYYY-MM-DD or ""
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

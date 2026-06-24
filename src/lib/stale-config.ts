// Persisted threshold (in days) for flagging "Last logon date" as stale.
const STORAGE_KEY = "hq_stale_threshold_days";
export const DEFAULT_STALE_THRESHOLD_DAYS = 90;

export function loadStaleThreshold(): number {
  if (typeof window === "undefined") return DEFAULT_STALE_THRESHOLD_DAYS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STALE_THRESHOLD_DAYS;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0 && n <= 100000) return Math.floor(n);
  } catch { /* noop */ }
  return DEFAULT_STALE_THRESHOLD_DAYS;
}

export function saveStaleThreshold(days: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(days) || days <= 0) return;
  try { localStorage.setItem(STORAGE_KEY, String(Math.floor(days))); } catch { /* noop */ }
}

// ─── Restore-point limits ─────────────────────────────────────────────────────

export const DEFAULT_MAX_RESTORE_POINTS = 20;
export const DEFAULT_MAX_SAVE_WORKBOOK_PER_DAY = 3;

function loadInt(key: string, defaultVal: number, min: number, max: number): number {
  if (typeof window === "undefined") return defaultVal;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultVal;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= min && n <= max) return n;
  } catch { /* noop */ }
  return defaultVal;
}

function saveInt(key: string, val: number): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, String(val)); } catch { /* noop */ }
}

export const loadMaxRestorePoints = () =>
  loadInt("hq_max_restore_points", DEFAULT_MAX_RESTORE_POINTS, 1, 200);
export const saveMaxRestorePoints = (n: number) => saveInt("hq_max_restore_points", n);

export const loadMaxSaveWorkbookPerDay = () =>
  loadInt("hq_max_save_workbook_per_day", DEFAULT_MAX_SAVE_WORKBOOK_PER_DAY, 1, 50);
export const saveMaxSaveWorkbookPerDay = (n: number) => saveInt("hq_max_save_workbook_per_day", n);

/**
 * Returns the integer number of days between today (UTC midnight) and the given
 * YYYY-MM-DD date string. Returns null if the input is empty/invalid.
 */
export function daysSince(yyyymmdd: string): number | null {
  if (!yyyymmdd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  if (!m) return null;
  const then = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = Date.now();
  if (!Number.isFinite(then)) return null;
  return Math.floor((now - then) / 86_400_000);
}

export function isStale(yyyymmdd: string, thresholdDays: number): boolean {
  const d = daysSince(yyyymmdd);
  return d !== null && d > thresholdDays;
}

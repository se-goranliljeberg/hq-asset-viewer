// Per-cell import timestamp store. Tracks ISO timestamp of when each
// (rowId, fieldName) value was last imported from a source file.

export type ImportMeta = Record<number, Partial<Record<string, string>>>;

const STORAGE_KEY = "hq_import_meta";

export function loadImportMeta(): ImportMeta {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as ImportMeta;
  } catch { /* noop */ }
  return {};
}

export function saveImportMeta(meta: ImportMeta): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(meta)); } catch { /* noop */ }
}

export function setImportedAt(meta: ImportMeta, rowId: number, field: string, iso: string): void {
  if (!meta[rowId]) meta[rowId] = {};
  meta[rowId][field] = iso;
}

export function getImportedAt(meta: ImportMeta, rowId: number, field: string): string | undefined {
  return meta[rowId]?.[field];
}

export function mergeImportMeta(base: ImportMeta, incoming: ImportMeta): ImportMeta {
  const out: ImportMeta = { ...base };
  for (const [k, fields] of Object.entries(incoming)) {
    const id = Number(k);
    out[id] = { ...(out[id] ?? {}), ...fields };
  }
  return out;
}

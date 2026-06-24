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

// ─── Field provenance ─────────────────────────────────────────────────────────

/**
 * Provenance record for a single (rowId, fieldName) pair.
 * Records when it was last imported, edited, and who edited it.
 */
export interface FieldProvenance {
  /** ISO timestamp when this field value was last imported from a source file. */
  importedAt?: string;
  /** ISO timestamp when this field value was last manually edited. */
  lastEditedAt?: string;
  /** Initials of the user who last edited this field value. */
  lastEditedBy?: string;
  /** ISO timestamp when this field value was last written to disk via workbook save. */
  lastSavedAt?: string;
}

export type FieldProvenanceMeta = Record<number, Partial<Record<string, FieldProvenance>>>;

const PROVENANCE_KEY = "hq_field_provenance";

export function loadFieldProvenance(): FieldProvenanceMeta {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PROVENANCE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as FieldProvenanceMeta;
  } catch { /* noop */ }
  return {};
}

export function saveFieldProvenance(meta: FieldProvenanceMeta): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(PROVENANCE_KEY, JSON.stringify(meta)); } catch { /* noop */ }
}

export function setFieldProvenance(
  meta: FieldProvenanceMeta,
  rowId: number,
  field: string,
  patch: Partial<FieldProvenance>,
): void {
  if (!meta[rowId]) meta[rowId] = {};
  meta[rowId][field] = { ...(meta[rowId][field] ?? {}), ...patch };
}

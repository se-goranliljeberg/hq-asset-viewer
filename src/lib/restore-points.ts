/**
 * Durable restore points — dual-mode storage.
 *
 * When the user has selected a folder via the File System Access API, restore
 * points are written as JSON files inside a `restore-points/` sub-directory of
 * that folder so they survive clearing browser storage and travel with the app.
 * Otherwise the existing IndexedDB store is used as a fallback.
 *
 * File layout (folder mode):
 *   <chosen-folder>/restore-points/index.json   ← RestorePointSummary[]
 *   <chosen-folder>/restore-points/<id>.json     ← RestorePointRecord (full)
 *
 * Pruning rules:
 *  - Keep the last 20 restore points overall.
 *  - Keep at most 3 "save-workbook" entries per calendar day.
 *  - Never auto-prune "import-replace" entries.
 */

import type { ViewerSnapshot } from "./undo-redo";
import {
  getStoredFolderHandle,
  storeFolderHandle,
  clearStoredFolderHandle,
  queryFolderPermission,
  requestFolderPermission,
} from "./restore-point-folder";

// ─── Kind ─────────────────────────────────────────────────────────────────────

export type RestorePointKind =
  | "import-replace"
  | "import-add"
  | "import-enrich"
  | "save-workbook"
  | "replace-device"
  | "batch-status"
  | "clear-data"
  | "manual";

export interface RestorePointRecord {
  id: string;
  createdAt: string;
  label: string;
  kind: RestorePointKind;
  snapshot: ViewerSnapshot;
}

export interface RestorePointSummary {
  id: string;
  createdAt: string;
  label: string;
  kind: RestorePointKind;
}

// ─── Active folder (runtime state) ────────────────────────────────────────────

/** The currently active FileSystemDirectoryHandle. null = use IndexedDB. */
let activeFolder: FileSystemDirectoryHandle | null = null;

export function getActiveRestorePointFolder(): FileSystemDirectoryHandle | null {
  return activeFolder;
}

/**
 * Called once on app startup. Loads the stored handle and silently activates
 * it if permission is already granted (no browser prompt).
 */
export async function initRestorePointFolder(): Promise<void> {
  try {
    const handle = await getStoredFolderHandle();
    if (!handle) return;
    const ok = await queryFolderPermission(handle);
    if (ok) activeFolder = handle;
    // If not granted: keep stored handle so UI can offer to re-request,
    // but do not set activeFolder (will fall back to IndexedDB).
  } catch {
    // Non-fatal.
  }
}

/**
 * Activate a newly selected or re-permissioned folder handle.
 * Persists the handle and sets it as active.
 */
export async function activateRestorePointFolder(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  await storeFolderHandle(handle);
  activeFolder = handle;
}

/** Remove the folder association and revert to IndexedDB storage. */
export async function deactivateRestorePointFolder(): Promise<void> {
  await clearStoredFolderHandle();
  activeFolder = null;
}

/**
 * Returns the stored handle even when permission has lapsed (so the UI can
 * show the folder name and offer to re-grant).
 */
export async function getStoredRestorePointFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  return getStoredFolderHandle();
}

/**
 * Re-request permission for the stored handle (shows browser prompt).
 * Returns true and activates the folder if permission is granted.
 */
export async function reRequestRestorePointFolderPermission(): Promise<boolean> {
  const handle = await getStoredFolderHandle();
  if (!handle) return false;
  const ok = await requestFolderPermission(handle);
  if (ok) activeFolder = handle;
  return ok;
}

// ─── File-system helpers ───────────────────────────────────────────────────────

const RP_SUBDIR = "restore-points";
const INDEX_FILE = "index.json";

async function getSubdir(): Promise<FileSystemDirectoryHandle> {
  if (!activeFolder) throw new Error("No restore point folder active.");
  return activeFolder.getDirectoryHandle(RP_SUBDIR, { create: true });
}

async function fsReadIndex(subdir: FileSystemDirectoryHandle): Promise<RestorePointSummary[]> {
  try {
    const fh = await subdir.getFileHandle(INDEX_FILE);
    const file = await fh.getFile();
    return JSON.parse(await file.text()) as RestorePointSummary[];
  } catch {
    return [];
  }
}

async function fsWriteIndex(
  subdir: FileSystemDirectoryHandle,
  summaries: RestorePointSummary[],
): Promise<void> {
  const fh = await subdir.getFileHandle(INDEX_FILE, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(summaries, null, 2));
  await writable.close();
}

async function fsWriteRecord(
  subdir: FileSystemDirectoryHandle,
  record: RestorePointRecord,
): Promise<void> {
  const fh = await subdir.getFileHandle(`${record.id}.json`, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(record));
  await writable.close();
}

async function fsDeleteRecord(subdir: FileSystemDirectoryHandle, id: string): Promise<void> {
  try {
    await subdir.removeEntry(`${id}.json`);
  } catch {
    // File may already be gone.
  }
}

// ─── IDB constants ─────────────────────────────────────────────────────────────

const DB_NAME = "hq_asset_viewer_backups";
const STORE_NAME = "restore_points";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRestorePoint(record: RestorePointRecord): Promise<void> {
  if (activeFolder) {
    const subdir = await getSubdir();
    await fsWriteRecord(subdir, record);
    const index = await fsReadIndex(subdir);
    const summary: RestorePointSummary = {
      id: record.id,
      createdAt: record.createdAt,
      label: record.label,
      kind: record.kind,
    };
    // Newest-first in index; deduplicate by id just in case.
    const next = [summary, ...index.filter((s) => s.id !== record.id)];
    await fsWriteIndex(subdir, next);
    return;
  }
  // ── IDB fallback ──────────────────────────────────────────────────────────
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listRestorePoints(): Promise<RestorePointSummary[]> {
  if (activeFolder) {
    const subdir = await getSubdir();
    const index = await fsReadIndex(subdir);
    // Ensure newest-first order.
    return [...index].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  // ── IDB fallback ──────────────────────────────────────────────────────────
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).index("createdAt").getAll();
    req.onsuccess = () => {
      const all = (req.result as RestorePointRecord[]).map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        label: r.label,
        kind: r.kind ?? ("manual" as RestorePointKind),
      }));
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function loadRestorePoint(id: string): Promise<RestorePointRecord | null> {
  if (activeFolder) {
    try {
      const subdir = await getSubdir();
      const fh = await subdir.getFileHandle(`${id}.json`);
      const file = await fh.getFile();
      return JSON.parse(await file.text()) as RestorePointRecord;
    } catch {
      return null;
    }
  }
  // ── IDB fallback ──────────────────────────────────────────────────────────
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as RestorePointRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRestorePoint(id: string): Promise<void> {
  if (activeFolder) {
    const subdir = await getSubdir();
    await fsDeleteRecord(subdir, id);
    const index = await fsReadIndex(subdir);
    await fsWriteIndex(subdir, index.filter((s) => s.id !== id));
    return;
  }
  // ── IDB fallback ──────────────────────────────────────────────────────────
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Prune restore points using kind-aware rules:
 *  - Always keep at most `maxCount` (default 20) total entries.
 *  - Never auto-prune "import-replace" entries.
 *  - Keep at most `maxSaveWorkbookPerDay` (default 3) "save-workbook" entries
 *    per calendar day (ISO date prefix of createdAt).
 */
export async function pruneRestorePoints(
  maxCount = 20,
  maxSaveWorkbookPerDay = 3,
): Promise<void> {
  const all = await listRestorePoints(); // newest-first

  // Step 1: cap save-workbook per calendar day.
  const saveWorkbookByDay = new Map<string, number>(); // ISO-date → count kept
  const toDelete = new Set<string>();

  for (const rp of all) {
    if (rp.kind !== "save-workbook") continue;
    const day = rp.createdAt.slice(0, 10); // "YYYY-MM-DD"
    const count = saveWorkbookByDay.get(day) ?? 0;
    if (count >= maxSaveWorkbookPerDay) {
      toDelete.add(rp.id);
    } else {
      saveWorkbookByDay.set(day, count + 1);
    }
  }

  // Step 2: enforce overall cap (never prune import-replace).
  let kept = 0;
  for (const rp of all) {
    if (toDelete.has(rp.id)) continue;
    if (rp.kind === "import-replace") { kept++; continue; } // protected
    kept++;
    if (kept > maxCount) toDelete.add(rp.id);
  }

  for (const id of toDelete) await deleteRestorePoint(id);
}

export function buildRestorePointLabel(
  action: string,
  detail?: string,
  kind?: RestorePointKind,
): string {
  const d = new Date();
  const ts = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const prefix = kind ? kindPrefix(kind) : "";
  const base = detail ? `${action} — ${detail}` : action;
  return prefix ? `${prefix} ${base} (${ts})` : `${base} (${ts})`;
}

function kindPrefix(kind: RestorePointKind): string {
  switch (kind) {
    case "import-replace": return "↩";
    case "import-add": return "➕";
    case "import-enrich": return "🔀";
    case "save-workbook": return "💾";
    case "replace-device": return "🔄";
    case "batch-status": return "📋";
    case "clear-data": return "🗑";
    case "manual": return "📌";
  }
}

export function makeRestorePointId(): string {
  return `rp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

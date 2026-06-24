/**
 * Persists a FileSystemDirectoryHandle for the restore points folder in
 * IndexedDB so the user only needs to grant access once per browser session.
 */

const HANDLE_DB = "hq_asset_viewer_meta";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "restore_points_folder";

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(HANDLE_STORE)) {
        req.result.createObjectStore(HANDLE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getStoredFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, "readonly");
      const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function storeFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearStoredFolderHandle(): Promise<void> {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Returns true if readwrite permission is already granted (no prompt). */
export async function queryFolderPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

/** Requests readwrite permission — may show a browser prompt. */
export async function requestFolderPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

/** Opens the directory picker, stores the handle, and returns it. Returns null if user cancels. */
export async function selectRestorePointsFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    await storeFolderHandle(handle);
    return handle;
  } catch {
    // User cancelled or API unavailable.
    return null;
  }
}

// ─── First-time setup flag ─────────────────────────────────────────────────────

const SETUP_KEY = "rp_folder_setup_done";

/**
 * Returns true if the user has already been prompted for a folder
 * (whether they picked one or declined). Used to avoid re-prompting.
 */
export function hasFolderSetupBeenHandled(): boolean {
  try {
    return localStorage.getItem(SETUP_KEY) === "1";
  } catch {
    return false;
  }
}

/** Mark that the one-time folder prompt has been shown (or is no longer needed). */
export function markFolderSetupHandled(): void {
  try {
    localStorage.setItem(SETUP_KEY, "1");
  } catch {
    // Non-fatal.
  }
}

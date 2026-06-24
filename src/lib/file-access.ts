/**
 * Browser File System Access API helpers.
 * Provides a thin, reusable layer over showSaveFilePicker / createWritable
 * so both the CSV exporter and the workbook saver can share the same logic.
 */

type FSWindow = Window & {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    startIn?: FileSystemHandle;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
};

export interface SaveFileOptions {
  suggestedName: string;
  mimeType: string;
  extension: string;
  /** Re-use an existing handle to skip the picker dialog. */
  existingHandle?: FileSystemFileHandle;
}

/**
 * Returns a FileSystemFileHandle. If `existingHandle` is supplied the picker
 * is skipped. Falls back to null when the API is unavailable or the user
 * cancels (AbortError / NotAllowedError).
 */
export async function pickSaveFileHandle(
  options: SaveFileOptions,
): Promise<FileSystemFileHandle | null> {
  if (options.existingHandle) {
    // Verify we still have write permission before returning the cached handle.
    try {
      const perm = await options.existingHandle.queryPermission({ mode: "readwrite" });
      if (perm === "granted") return options.existingHandle;
    } catch { /* fall through to picker */ }
  }

  const w = typeof window !== "undefined" ? (window as FSWindow) : undefined;
  if (!w || typeof w.showSaveFilePicker !== "function") return null;

  try {
    return await w.showSaveFilePicker({
      suggestedName: options.suggestedName,
      types: [{
        description: options.mimeType,
        accept: { [options.mimeType]: [`.${options.extension}`] },
      }],
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "AbortError" || name === "NotAllowedError" || name === "SecurityError") {
      return null;
    }
    throw err;
  }
}

export async function writeBlobToFileHandle(
  handle: FileSystemFileHandle,
  blob: Blob,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function writeArrayBufferToFileHandle(
  handle: FileSystemFileHandle,
  buffer: ArrayBuffer,
): Promise<void> {
  await writeBlobToFileHandle(handle, new Blob([buffer]));
}

/**
 * Fallback for browsers that don't support the File System Access API.
 * Triggers a download via an invisible anchor element.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

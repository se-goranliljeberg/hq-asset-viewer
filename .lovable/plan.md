## CSV Export: History, Save As Dialog, Remembered Location

Three connected improvements to the CSV export, all isolated to `src/lib/csv-export.ts` (with a tiny adjustment in `AssetViewer.tsx` to handle the now-async function).

---

### 1. New "Change History" column

Each `AssetRow.history?: LifecycleEvent[]` will be serialised into a single human-readable cell, placed **after `Comments`** and **before `Source file`** so existing column order is preserved up to that point.

Per-event format:

```text
[YYYY-MM-DD HH:mm by INITIALS] FROM → TO (user: USER; prevUser: PREVUSER; note: NOTE)
```

Rules:

- Multiple events joined with `|`.
- `from` omitted entirely when empty/absent → renders as `→ TO`.
- Optional fields (`user`, `prevUser`, `note`) only included when present; the parenthesised suffix is omitted entirely if all three are missing.
- Timestamp formatted from the ISO `at` string into local-readable `YYYY-MM-DD HH:mm` (using `Date` + simple `padStart`, no new deps).
- Empty/missing `history` → empty string.
- The whole serialised string is run through the existing CSV `escape()` so embedded commas, quotes, newlines, and pipes are all safe.

Final column order:

```text
…columns…, Status, Warranty until, Exceptions, Comments, Change History, Source file
```

### 2. Native Save As dialog via File System Access API

Replace the current invisible `<a>.click()` auto-download with `window.showSaveFilePicker`:

- `suggestedName`: `asset-export-YYYY-MM-DD.csv` (same as today).
- `types`: `[{ description: 'CSV file', accept: { 'text/csv': ['.csv'] } }]`.
- Write the CSV via `await handle.createWritable()` → `writable.write(blob)` → `writable.close()`.
- Cancellation handling: catch `AbortError` (and `NotAllowedError`) silently — no toast, no console noise.
- Other errors: log to console only (the export is user-initiated and non-critical).

### 3. Remember the last saved location

- Module-level `let lastFileHandle: FileSystemFileHandle | undefined` in `csv-export.ts`.
- After a successful save, store the handle returned by `showSaveFilePicker`.
- On the next call, pass `startIn: lastFileHandle` so the dialog reopens in the same folder. Per the spec, a `FileSystemFileHandle` is a valid `startIn` value.
- If no prior handle exists, `startIn` is omitted entirely (browser default).
- The handle lives only in memory for the page session; this is intentional (handles can't be safely persisted to `localStorage` and re-acquiring permission across reloads needs a separate flow we're not adding here).

### 4. Fallback for unsupported browsers

If `typeof window.showSaveFilePicker !== 'function'` (Firefox, Safari, older Chromium), fall back to the existing `Blob` + `URL.createObjectURL` + `<a>.click()` path unchanged. This preserves current behaviour everywhere it works today.

### 5. Async signature + caller updates

`exportCSV` becomes `async` and returns `Promise<void>`. The two call sites in `src/components/AssetViewer.tsx` (around lines ~2117 and ~2120) are fire-and-forget click handlers; they'll be updated to `void exportCSV(...)` so the floating promise is explicit and ESLint-clean. No `await` needed because errors are handled internally.

---

### Technical details

**TypeScript shim for File System Access API**

The DOM lib types for `showSaveFilePicker` are only present in very recent `lib.dom.d.ts` versions and may not be in the project's TS target. To stay safe and keep `strict: true` happy without adding deps, we'll:

- Cast via a narrow local type at the call site:
  ```ts
  type SaveFilePickerWindow = Window & {
    showSaveFilePicker?: (opts: {
      suggestedName?: string;
      startIn?: FileSystemHandle;
      types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandle>;
  };
  ```
- Use `(window as SaveFilePickerWindow).showSaveFilePicker?.(…)`.
- Type `lastFileHandle` as `FileSystemFileHandle | undefined` (this global type is widely available; if it isn't, alias it as `unknown` and cast at the boundary — decided at implementation time based on whether `tsc` complains).

**Files touched**

- `src/lib/csv-export.ts` — full rewrite of `exportCSV`, plus the module-level handle and a small `formatHistory(history)` helper.
- `src/components/AssetViewer.tsx` — change two call sites from `exportCSV(...)` to `void exportCSV(...)`.

**Not changed**

- No new dependencies.
- No UTF-8 BOM added (current file doesn't use one).
- Column order before `Comments` is unchanged, so existing CSV consumers that read by position up to and including `Comments` keep working; only consumers that hard-code `Source file`'s index need to shift by one.

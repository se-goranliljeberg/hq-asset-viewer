import type { AssetRow, LifecycleEvent } from "./asset-types";
import type { AssetEdits } from "./asset-edits";
import { getEditKey, effectiveExceptions } from "./asset-edits";

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    startIn?: FileSystemHandle;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
};

let lastFileHandle: FileSystemFileHandle | undefined;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatHistory(history: LifecycleEvent[] | undefined): string {
  if (!history || history.length === 0) return "";
  return history
    .map((e) => {
      const ts = formatTimestamp(e.at);
      const arrow = e.from ? `${e.from} → ${e.to}` : `→ ${e.to}`;
      const parts: string[] = [];
      if (e.user) parts.push(`user: ${e.user}`);
      if (e.prevUser) parts.push(`prevUser: ${e.prevUser}`);
      if (e.note) parts.push(`note: ${e.note}`);
      const suffix = parts.length > 0 ? ` (${parts.join("; ")})` : "";
      return `[${ts} by ${e.by}] ${arrow}${suffix}`;
    })
    .join(" | ");
}

export async function exportCSV(
  rows: AssetRow[],
  columns: string[],
  edits: Record<string, AssetEdits> = {},
): Promise<void> {
  const escape = (v: string) => {
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const allCols = [
    ...columns,
    "Status",
    "Warranty until",
    "Exceptions",
    "Comments",
    "Change History",
    "Source file",
  ];
  const header = allCols.map(escape).join(",");
  const lines = rows.map((r) => {
    const cells = columns.map((c) => escape(r.raw[c] ?? ""));
    const e = edits[getEditKey(r.id)];
    cells.push(escape(e?.status ?? ""));
    cells.push(escape(e?.warrantyUntil ?? ""));
    cells.push(escape(effectiveExceptions(r, e).join("; ")));
    cells.push(escape(e?.comment ?? ""));
    cells.push(escape(formatHistory(r.history)));
    cells.push(escape(r.sourceFile ?? ""));
    return cells.join(",");
  });

  const csv = [header, ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const suggestedName = `asset-export-${new Date().toISOString().slice(0, 10)}.csv`;

  const w = typeof window !== "undefined" ? (window as SaveFilePickerWindow) : undefined;
  if (w && typeof w.showSaveFilePicker === "function") {
    try {
      const opts: Parameters<NonNullable<SaveFilePickerWindow["showSaveFilePicker"]>>[0] = {
        suggestedName,
        types: [{ description: "CSV file", accept: { "text/csv": [".csv"] } }],
      };
      if (lastFileHandle) {
        opts.startIn = lastFileHandle;
      }
      const handle = await w.showSaveFilePicker(opts);
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      lastFileHandle = handle;
      return;
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === "AbortError" || name === "NotAllowedError") {
        return;
      }
      // SecurityError happens in cross-origin iframes (e.g. the Lovable preview).
      // Fall through to the anchor-download fallback below instead of failing.
      if (name !== "SecurityError") {
        console.error("CSV export failed:", err);
      }
    }
  }

  // Fallback: anchor download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

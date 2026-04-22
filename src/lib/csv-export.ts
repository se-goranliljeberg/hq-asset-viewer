import type { AssetRow } from "./asset-types";
import type { AssetEdits } from "./asset-edits";
import { getEditKey, effectiveExceptions } from "./asset-edits";

let lastFileHandle: FileSystemFileHandle | undefined;

function formatHistoryTimestamp(at: string): string {
  const matched = at.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (matched) return `${matched[1]} ${matched[2]}`;
  return at;
}

function formatChangeHistory(row: AssetRow): string {
  if (!row.history?.length) return "";

  return row.history
    .map((event) => {
      const transition = event.from ? `${event.from} → ${event.to}` : event.to;
      const details: string[] = [];
      if (event.user) details.push(`user: ${event.user}`);
      if (event.prevUser) details.push(`prev user: ${event.prevUser}`);
      if (event.note) details.push(`note: ${event.note}`);
      const suffix = details.length ? ` (${details.join("; ")})` : "";
      return `[${formatHistoryTimestamp(event.at)} by ${event.by}] ${transition}${suffix}`;
    })
    .join(" | ");
}

function triggerDownload(blob: Blob, suggestedName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportCSV(
  rows: AssetRow[],
  columns: string[],
  edits: Record<string, AssetEdits> = {},
) {
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
    cells.push(escape(formatChangeHistory(r)));
    cells.push(escape(r.sourceFile ?? ""));
    return cells.join(",");
  });

  const csv = [header, ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const suggestedName = `asset-export-${new Date().toISOString().slice(0, 10)}.csv`;
  const picker = (
    window as Window & {
      showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;

  if (picker) {
    try {
      const handle = await picker({
        suggestedName,
        types: [{ description: "CSV file", accept: { "text/csv": [".csv"] } }],
        ...(lastFileHandle ? { startIn: lastFileHandle } : {}),
      });
      lastFileHandle = handle;
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("CSV export failed via File System Access API, falling back to download.", error);
    }
  }

  triggerDownload(blob, suggestedName);
}

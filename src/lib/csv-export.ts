import type { AssetRow } from "./asset-types";
import type { AssetEdits } from "./asset-edits";
import { getEditKey } from "./asset-edits";

export function exportCSV(
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

  const allCols = [...columns, "Status", "Warranty until", "Exceptions"];
  const header = allCols.map(escape).join(",");
  const lines = rows.map((r) => {
    const cells = columns.map((c) => escape(r.raw[c] ?? ""));
    const e = edits[getEditKey(r.id)];
    cells.push(escape(e?.status ?? ""));
    cells.push(escape(e?.warrantyUntil ?? ""));
    cells.push(escape(r.exceptions.join("; ")));
    return cells.join(",");
  });

  const csv = [header, ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `asset-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

import type { AssetRow } from "./asset-types";

export function exportCSV(rows: AssetRow[], columns: string[]) {
  const escape = (v: string) => {
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const header = [...columns, "Exceptions"].map(escape).join(",");
  const lines = rows.map((r) => {
    const cells = columns.map((c) => escape(r.raw[c] ?? ""));
    cells.push(escape(r.exceptions.join("; ")));
    return cells.join(",");
  });

  const csv = [header, ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  saveAs(blob, `asset-export-${new Date().toISOString().slice(0, 10)}.csv`);
}

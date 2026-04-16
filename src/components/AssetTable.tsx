import { useRef, useState, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AssetRow, SortState } from "@/lib/asset-types";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface Props {
  rows: AssetRow[];
  columns: string[];
  sort: SortState;
  onSort: (col: string) => void;
}

const MIN_COL_W = 80;
const DEFAULT_COL_W = 160;

export function AssetTable({ rows, columns, sort, onSort }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const displayCols = useMemo(() => [...columns, "Exceptions"], [columns]);

  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const c of displayCols) m[c] = DEFAULT_COL_W;
    return m;
  });

  const totalWidth = useMemo(
    () => displayCols.reduce((s, c) => s + (colWidths[c] ?? DEFAULT_COL_W), 0),
    [displayCols, colWidths],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  const onResizeStart = useCallback(
    (col: string, startX: number) => {
      const startW = colWidths[col] ?? DEFAULT_COL_W;
      const onMove = (e: MouseEvent) => {
        const diff = e.clientX - startX;
        setColWidths((p) => ({ ...p, [col]: Math.max(MIN_COL_W, startW + diff) }));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [colWidths],
  );

  const sortIcon = (col: string) => {
    if (sort.column !== col || !sort.dir) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-auto rounded-lg border border-border bg-card"
    >
      <div style={{ minWidth: totalWidth }}>
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex bg-muted/80 backdrop-blur-sm border-b border-border">
          {displayCols.map((col) => (
            <div
              key={col}
              className="relative flex items-center gap-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none"
              style={{ width: colWidths[col] ?? DEFAULT_COL_W, minWidth: MIN_COL_W }}
            >
              <button
                className="flex items-center gap-1 hover:text-foreground transition-colors"
                onClick={() => onSort(col)}
              >
                <span className="truncate">{col}</span>
                {sortIcon(col)}
              </button>
              {/* Resize handle */}
              <div
                className="absolute right-0 top-1 bottom-1 w-1 cursor-col-resize hover:bg-primary/40 rounded"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onResizeStart(col, e.clientX);
                }}
              />
            </div>
          ))}
        </div>

        {/* Virtual rows */}
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vRow) => {
            const row = rows[vRow.index];
            const isOdd = vRow.index % 2 === 1;
            const hasEx = row.exceptions.length > 0;

            return (
              <div
                key={row.id}
                className={`absolute left-0 flex items-center text-sm ${
                  hasEx
                    ? "bg-destructive/5"
                    : isOdd
                      ? "bg-muted/30"
                      : "bg-transparent"
                }`}
                style={{
                  top: vRow.start,
                  height: vRow.size,
                  width: "100%",
                }}
              >
                {displayCols.map((col) => {
                  const val =
                    col === "Exceptions" ? row.exceptions.join(", ") : (row.raw[col] ?? "");
                  return (
                    <div
                      key={col}
                      className="truncate px-3 py-1.5"
                      style={{ width: colWidths[col] ?? DEFAULT_COL_W, minWidth: MIN_COL_W }}
                      title={val}
                    >
                      {col === "Exceptions" && val ? (
                        <span className="text-destructive text-xs font-medium">{val}</span>
                      ) : (
                        val
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

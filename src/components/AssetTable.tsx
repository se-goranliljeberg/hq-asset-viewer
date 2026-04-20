import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AssetRow, SortState } from "@/lib/asset-types";
import type { AssetEdits, YesNo } from "@/lib/asset-edits";
import { STATUS_OPTIONS, getEditKey, effectiveSkanska, effectiveUserActive } from "@/lib/asset-edits";
import {
  loadColumnOrder, saveColumnOrder, loadColumnWidths, saveColumnWidths,
} from "@/lib/asset-store";
import { ArrowUp, ArrowDown, ArrowUpDown, GripVertical, AlertTriangle } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { CommentCell } from "./CommentCell";
import { parseEntries } from "@/lib/comment-log";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ImportMeta } from "@/lib/import-meta";
import { getImportedAt } from "@/lib/import-meta";
import { daysSince } from "@/lib/stale-config";

interface Props {
  rows: AssetRow[];
  columns: string[];
  sort: SortState;
  onSort: (col: string) => void;
  edits: Record<string, AssetEdits>;
  onEdit: (rowId: number, field: keyof AssetEdits, value: string) => void;
  onCellEdit: (rowId: number, column: string, value: string) => void;
  onUndoLast: (rowId: number) => void;
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  importedAt?: ImportMeta;
  staleThreshold: number;
}

const MIN_COL_W = 80;
const DEFAULT_COL_W = 160;
const CHECKBOX_COL_W = 40;
const EDITABLE_COLS = ["Status", "Warranty until"] as const;
const NON_EDITABLE_COLS = new Set(["Exceptions", "Source file"]);
const COMMENTS_COL = "Comments";

// Canonical left-to-right display order.
const CANONICAL_ORDER = [
  "Username", "Name", "Computername", "Modell", "Last account activity", "Last logon date",
  "Status", "Warranty until", "AD Create.Date", "Company", "Email", "Department", "Manager",
  "User Active?", "Skanska computer?",
] as const;

// Virtual app-managed columns — always shown even when the source file
// has no matching header. Their values come from the edits store, not row.raw.
const VIRTUAL_CANONICAL = new Set<string>(["Status", "Warranty until", "User Active?", "Skanska computer?"]);
const TAIL_COLS = ["Exceptions", COMMENTS_COL, "Source file"];

// Build the default display column order: canonical fields in fixed order
// (virtual ones always included; the rest only when present in the source data),
// then any extras, then Exceptions / Comments / Source file.
function buildDefaultOrder(columns: string[]): string[] {
  const present = new Set(columns);
  const canonical = CANONICAL_ORDER.filter(
    (c) => VIRTUAL_CANONICAL.has(c) || present.has(c),
  );
  const extras = columns.filter(
    (c) =>
      !canonical.includes(c as (typeof CANONICAL_ORDER)[number]) &&
      !TAIL_COLS.includes(c),
  );
  return [...canonical, ...extras, ...TAIL_COLS];
}

// Reconcile a saved order against current columns: keep saved positions where
// possible, append new columns at the end (before tail metadata cols).
function reconcileOrder(saved: string[], current: string[]): string[] {
  const all = buildDefaultOrder(current);
  const present = new Set(all);
  const kept = saved.filter((c) => present.has(c));
  const appended = all.filter((c) => !kept.includes(c));
  return [...kept, ...appended];
}

function InlineCell({ value, width, col, rowId, onCellEdit }: {
  value: string;
  width: number;
  col: string;
  rowId: number;
  onCellEdit: (rowId: number, column: string, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [value]);

  const commit = useCallback(() => {
    setEditing(false);
    if (draft !== value) {
      onCellEdit(rowId, col, draft);
    }
  }, [draft, value, rowId, col, onCellEdit]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(value);
  }, [value]);

  if (editing) {
    return (
      <div className="px-1 py-0.5" style={{ width, minWidth: MIN_COL_W }}>
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          className="h-7 text-xs px-2"
        />
      </div>
    );
  }

  return (
    <div
      className="truncate px-3 py-1.5 cursor-text hover:bg-muted/50 rounded-sm transition-colors"
      style={{ width, minWidth: MIN_COL_W }}
      title={`${value} (double-click to edit)`}
      onDoubleClick={startEdit}
    >
      {value}
    </div>
  );
}

export function AssetTable({ rows, columns, sort, onSort, edits, onEdit, onCellEdit, onUndoLast, selectedIds, onSelectionChange, importedAt, staleThreshold }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Persisted column order
  const [displayCols, setDisplayCols] = useState<string[]>(() => {
    const saved = loadColumnOrder();
    return saved ? reconcileOrder(saved, columns) : buildDefaultOrder(columns);
  });

  // When the source columns change (new import, new fields), re-reconcile
  useEffect(() => {
    setDisplayCols((prev) => reconcileOrder(prev, columns));
  }, [columns]);

  // Persisted widths
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const saved = loadColumnWidths();
    const m: Record<string, number> = { ...saved };
    for (const c of buildDefaultOrder(columns)) {
      if (m[c] === undefined) m[c] = DEFAULT_COL_W;
    }
    return m;
  });

  useEffect(() => {
    saveColumnWidths(colWidths);
  }, [colWidths]);

  const updateOrder = useCallback((next: string[]) => {
    setDisplayCols(next);
    saveColumnOrder(next);
  }, []);

  const totalWidth = useMemo(
    () => CHECKBOX_COL_W + displayCols.reduce((s, c) => s + (colWidths[c] ?? DEFAULT_COL_W), 0),
    [displayCols, colWidths],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  const allSelected = rows.length > 0 && selectedIds.size === rows.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(rows.map((r) => r.id)));
    }
  }, [allSelected, rows, onSelectionChange]);

  const handleSelectRow = useCallback((rowId: number) => {
    const next = new Set(selectedIds);
    if (next.has(rowId)) next.delete(rowId);
    else next.add(rowId);
    onSelectionChange(next);
  }, [selectedIds, onSelectionChange]);

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

  // Drag-to-reorder
  const dragColRef = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const handleDragStart = useCallback((col: string, e: React.DragEvent) => {
    dragColRef.current = col;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", col);
  }, []);

  const handleDragOver = useCallback((col: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCol !== col) setDragOverCol(col);
  }, [dragOverCol]);

  const handleDragLeave = useCallback(() => {
    setDragOverCol(null);
  }, []);

  const handleDrop = useCallback((targetCol: string, e: React.DragEvent) => {
    e.preventDefault();
    const sourceCol = dragColRef.current;
    dragColRef.current = null;
    setDragOverCol(null);
    if (!sourceCol || sourceCol === targetCol) return;
    const next = [...displayCols];
    const fromIdx = next.indexOf(sourceCol);
    const toIdx = next.indexOf(targetCol);
    if (fromIdx === -1 || toIdx === -1) return;
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, sourceCol);
    updateOrder(next);
  }, [displayCols, updateOrder]);

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
          <div
            className="flex items-center justify-center px-1 py-2.5"
            style={{ width: CHECKBOX_COL_W, minWidth: CHECKBOX_COL_W }}
          >
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={handleSelectAll}
              aria-label="Select all"
            />
          </div>
          {displayCols.map((col) => {
            const isDragOver = dragOverCol === col;
            return (
              <div
                key={col}
                draggable
                onDragStart={(e) => handleDragStart(col, e)}
                onDragOver={(e) => handleDragOver(col, e)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(col, e)}
                className={cn(
                  "relative flex items-center gap-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none transition-colors",
                  isDragOver && "bg-primary/15 ring-1 ring-primary/40 ring-inset",
                )}
                style={{ width: colWidths[col] ?? DEFAULT_COL_W, minWidth: MIN_COL_W }}
                title="Drag to reorder"
              >
                <GripVertical className="h-3 w-3 opacity-30 cursor-grab active:cursor-grabbing shrink-0" />
                <button
                  className="flex items-center gap-1 hover:text-foreground transition-colors min-w-0"
                  onClick={() => onSort(col)}
                >
                  <span className="truncate">{col}</span>
                  {sortIcon(col)}
                </button>
                <div
                  className="absolute right-0 top-1 bottom-1 w-1 cursor-col-resize hover:bg-primary/40 rounded"
                  draggable={false}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onResizeStart(col, e.clientX);
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Virtual rows */}
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vRow) => {
            const row = rows[vRow.index];
            const isOdd = vRow.index % 2 === 1;
            const hasEx = row.exceptions.length > 0;
            const editKey = getEditKey(row.id);
            const rowEdits = edits[editKey];
            const isSelected = selectedIds.has(row.id);

            return (
              <div
                key={row.id}
                className={`absolute left-0 flex items-center text-sm ${
                  isSelected
                    ? "bg-primary/10"
                    : hasEx
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
                <div
                  className="flex items-center justify-center px-1"
                  style={{ width: CHECKBOX_COL_W, minWidth: CHECKBOX_COL_W }}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => handleSelectRow(row.id)}
                    aria-label={`Select ${row.computername}`}
                  />
                </div>
                {displayCols.map((col) => {
                  const w = colWidths[col] ?? DEFAULT_COL_W;

                  if (col === "Status") {
                    const val = rowEdits?.status ?? "";
                    return (
                      <div key={col} className="px-1 py-0.5" style={{ width: w, minWidth: MIN_COL_W }}>
                        <Select
                          value={val || "__none__"}
                          onValueChange={(v) => onEdit(row.id, "status", v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger className="h-7 text-xs border-transparent bg-transparent hover:border-border">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  }

                  if (col === "Warranty until") {
                    const val = rowEdits?.warrantyUntil ?? "";
                    let date: Date | undefined;
                    if (val) {
                      const parsed = parseISO(val);
                      if (!isNaN(parsed.getTime())) date = parsed;
                    }
                    return (
                      <div key={col} className="px-1 py-0.5" style={{ width: w, minWidth: MIN_COL_W }}>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              className={cn(
                                "h-7 w-full justify-start text-xs font-normal px-2",
                                !date && "text-muted-foreground",
                              )}
                            >
                              <CalendarIcon className="h-3 w-3 mr-1 shrink-0" />
                              {date ? format(date, "yyyy-MM-dd") : (val || "—")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={date}
                              onSelect={(d) =>
                                onEdit(row.id, "warrantyUntil", d ? format(d, "yyyy-MM-dd") : "")
                              }
                              initialFocus
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    );
                  }

                  if (col === "User Active?" || col === "Skanska computer?") {
                    const isActive = col === "User Active?";
                    const editKey: keyof AssetEdits = isActive ? "userActive" : "skanskaComputer";
                    const effective: YesNo = isActive
                      ? effectiveUserActive(rowEdits)
                      : effectiveSkanska(rowEdits, row.computername);
                    return (
                      <div key={col} className="px-1 py-0.5" style={{ width: w, minWidth: MIN_COL_W }}>
                        <Select
                          value={effective || "__none__"}
                          onValueChange={(v) => onEdit(row.id, editKey, v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger
                            className={cn(
                              "h-7 text-xs border-transparent bg-transparent hover:border-border",
                              effective === "no" && "text-destructive",
                              effective === "" && "text-muted-foreground",
                            )}
                          >
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  }

                  if (col === COMMENTS_COL) {
                    const val = rowEdits?.comment ?? "";
                    const entries = parseEntries(val);
                    const canUndo = entries.some((e) => !e.isNote && !!e.field);
                    return (
                      <CommentCell
                        key={col}
                        value={val}
                        width={w}
                        rowId={row.id}
                        onEdit={(rid, v) => onEdit(rid, "comment", v)}
                        onUndo={onUndoLast}
                        canUndo={canUndo}
                      />
                    );
                  }

                  // Exceptions and Source file are read-only
                  if (NON_EDITABLE_COLS.has(col)) {
                    const val = col === "Exceptions" ? row.exceptions.join(", ") : row.sourceFile;
                    return (
                      <div
                        key={col}
                        className="truncate px-3 py-1.5"
                        style={{ width: w, minWidth: MIN_COL_W }}
                        title={val}
                      >
                        {col === "Exceptions" && val ? (
                          <span className="text-destructive text-xs font-medium">{val}</span>
                        ) : (
                          val
                        )}
                      </div>
                    );
                  }

                  // Editable raw data columns — double-click to edit
                  const val = row.raw[col] ?? "";
                  const isLastLogon = col === "Last logon date";
                  const days = isLastLogon ? daysSince(val) : null;
                  const isStaleVal = isLastLogon && days !== null && days > staleThreshold;
                  const cell = (
                    <div
                      key={col}
                      className={cn(
                        "flex items-center",
                        isStaleVal && "text-amber-600 dark:text-amber-400",
                      )}
                      style={{ width: w, minWidth: MIN_COL_W }}
                    >
                      {isStaleVal && (
                        <AlertTriangle className="h-3 w-3 ml-2 shrink-0" strokeWidth={2} />
                      )}
                      <InlineCell
                        value={val}
                        width={isStaleVal ? Math.max(MIN_COL_W, w - 16) : w}
                        col={col}
                        rowId={row.id}
                        onCellEdit={onCellEdit}
                      />
                    </div>
                  );
                  if (isLastLogon && val) {
                    const stamp = importedAt ? getImportedAt(importedAt, row.id, col) : undefined;
                    let stampLabel: string | null = null;
                    if (stamp) {
                      const d = new Date(stamp);
                      stampLabel = isNaN(d.getTime())
                        ? stamp
                        : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
                    }
                    if (stampLabel || isStaleVal) {
                      return (
                        <Tooltip key={col}>
                          <TooltipTrigger asChild>
                            <div>{cell}</div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {stampLabel && <div>Imported on {stampLabel}</div>}
                            {days !== null && (
                              <div>
                                {days} day{days === 1 ? "" : "s"} since last logon
                              </div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }
                  }
                  return cell;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import { useRef, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AssetRow, SortState } from "@/lib/asset-types";
import type { AssetEdits, YesNo } from "@/lib/asset-edits";
import { STATUS_OPTIONS, getEditKey, effectiveSkanska, effectiveUserActive, effectiveExceptions } from "@/lib/asset-edits";
import {
  loadColumnOrder, saveColumnOrder, loadColumnWidths, saveColumnWidths,
} from "@/lib/asset-store";
import { ArrowUp, ArrowDown, ArrowUpDown, GripVertical, AlertTriangle, Filter, X } from "lucide-react";
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
import { ColumnFilterPopover, COLUMN_FILTER_BLANK_TOKEN } from "./ColumnFilterPopover";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";

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
  /** ms epoch of the most recent import; cells imported at/after this glow. */
  lastImportAt?: number | null;
  staleThreshold: number;
  /** Open the user-history drawer for this username. */
  onOpenUser?: (user: string) => void;
  /** Open the asset-history drawer for this row. */
  onOpenAsset?: (row: AssetRow) => void;
  /** Visible rows after in-table filters. */
  onVisibleRowsChange?: (rows: AssetRow[]) => void;
  /** Whether any in-table column filters are active. */
  onColumnFiltersActiveChange?: (active: boolean) => void;
  /** Changes to this value clear all in-table column filters. */
  resetColumnFiltersSignal?: number;
}

const MIN_COL_W = 80;
const DEFAULT_COL_W = 160;
const CHECKBOX_COL_W = 40;
const EDITABLE_COLS = ["Status", "Warranty until"] as const;
const NON_EDITABLE_COLS = new Set(["Exceptions", "Source file"]);
const COMMENTS_COL = "Comments";
const HIDDEN_COLUMN_KEYS = new Set(["last account activity", "lst account activity"]);

// Canonical left-to-right display order.
const CANONICAL_ORDER = [
  "Username", "Name", "Computername", "Modell", "Last logon date",
  "Status", "Warranty until", "AD Create.Date", "Company", "Email", "Department", "Manager",
  "User Active?", "Skanska computer?", "OU",
] as const;

// Virtual app-managed columns — always shown even when the source file
// has no matching header. Their values come from the edits store, not row.raw.
const VIRTUAL_CANONICAL = new Set<string>(["Status", "Warranty until", "User Active?", "Skanska computer?"]);
const TAIL_COLS = ["Exceptions", COMMENTS_COL, "Source file"];

// Build the default display column order: canonical fields in fixed order
// (virtual ones always included; the rest only when present in the source data),
// then any extras, then Exceptions / Comments / Source file.
function buildDefaultOrder(columns: string[]): string[] {
  const isHidden = (c: string) => HIDDEN_COLUMN_KEYS.has(c.trim().toLowerCase());
  const present = new Set(columns);
  const canonical = CANONICAL_ORDER.filter(
    (c) => !isHidden(c) && (VIRTUAL_CANONICAL.has(c) || present.has(c)),
  );
  const extras = columns.filter(
    (c) =>
      !canonical.includes(c as (typeof CANONICAL_ORDER)[number]) &&
      !TAIL_COLS.includes(c) &&
      !isHidden(c),
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

export function AssetTable({ rows, columns, sort, onSort, edits, onEdit, onCellEdit, onUndoLast, selectedIds, onSelectionChange, importedAt, lastImportAt, staleThreshold, onOpenUser, onOpenAsset, onVisibleRowsChange, onColumnFiltersActiveChange, resetColumnFiltersSignal }: Props) {
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

  // ── Per-column Excel-style filters ───────────────────────────────────────
  // Empty array (or missing entry) => no filter on that column.
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  /** Resolve the displayed string value for a row + column, mirroring how the cell renders. */
  const getCellValue = useCallback(
    (row: AssetRow, col: string): string => {
      const editKey = getEditKey(row.id);
      const rowEdits = edits[editKey];
      if (col === "Status") return rowEdits?.status ?? "";
      if (col === "Warranty until") return rowEdits?.warrantyUntil ?? "";
      if (col === "User Active?") return effectiveUserActive(rowEdits);
      if (col === "Skanska computer?") return effectiveSkanska(rowEdits, row.computername);
      if (col === COMMENTS_COL) return rowEdits?.comment ?? "";
      if (col === "Exceptions") return effectiveExceptions(row, rowEdits).join(", ");
      if (col === "Source file") return row.sourceFile;
      if (col === "Username") return row.user || row.raw[col] || "";
      if (col === "Computername") return row.computername || row.raw[col] || "";
      return row.raw[col] ?? "";
    },
    [edits],
  );

  /** Distinct values per column, computed from the unfiltered row set. */
  const distinctByColumn = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of displayCols) {
      const set = new Set<string>();
      for (const r of rows) set.add(getCellValue(r, col));
      map[col] = [...set];
    }
    return map;
  }, [displayCols, rows, getCellValue]);

  /** Apply per-column filters on top of the parent-supplied rows. */
  const visibleRows = useMemo(() => {
    const activeCols = Object.keys(columnFilters).filter(
      (c) => columnFilters[c] && columnFilters[c].length > 0,
    );
    if (activeCols.length === 0) return rows;
    return rows.filter((r) =>
      activeCols.every((c) => {
        const sel = columnFilters[c];
        const v = getCellValue(r, c);
        const token = v === "" ? COLUMN_FILTER_BLANK_TOKEN : v;
        return sel.includes(token);
      }),
    );
  }, [rows, columnFilters, getCellValue]);

  const setColumnFilter = useCallback((col: string, next: string[]) => {
    setColumnFilters((prev) => {
      const updated = { ...prev };
      if (next.length === 0) delete updated[col];
      else updated[col] = next;
      return updated;
    });
  }, []);

  const clearAllColumnFilters = useCallback(() => setColumnFilters({}), []);
  useEffect(() => { setColumnFilters({}); }, [resetColumnFiltersSignal]);
  const activeColumnFilterCount = Object.keys(columnFilters).filter(
    (c) => columnFilters[c] && columnFilters[c].length > 0,
  ).length;
  const onVisibleRowsChangeRef = useRef(onVisibleRowsChange);
  useEffect(() => { onVisibleRowsChangeRef.current = onVisibleRowsChange; }, [onVisibleRowsChange]);
  useEffect(() => { onVisibleRowsChangeRef.current?.(visibleRows); }, [visibleRows]);
  const onColumnFiltersActiveChangeRef = useRef(onColumnFiltersActiveChange);
  useEffect(() => { onColumnFiltersActiveChangeRef.current = onColumnFiltersActiveChange; }, [onColumnFiltersActiveChange]);
  useEffect(() => {
    onColumnFiltersActiveChangeRef.current?.(activeColumnFilterCount > 0);
    return () => onColumnFiltersActiveChangeRef.current?.(false);
  }, [activeColumnFilterCount]);

  const getColumnLabel = useCallback((col: string): string => {
    if (col === "Status") return "Computer Status";
    if (col === "OU") return "User Location";
    return col;
  }, []);

  const canRightClickFilter = useCallback((col: string): boolean => {
    return col !== COMMENTS_COL && col !== "Exceptions";
  }, []);
  const applyRightClickFilter = useCallback((col: string, value: string) => {
    const token = value === "" ? COLUMN_FILTER_BLANK_TOKEN : value;
    setColumnFilter(col, [token]);
  }, [setColumnFilter]);
  const clearRightClickFilter = useCallback((col: string) => setColumnFilter(col, []), [setColumnFilter]);
  const wrapRightClickFilter = useCallback((col: string, value: string, child: React.ReactNode) => {
    if (!canRightClickFilter(col)) return child;
    const hasFilterOnColumn = (columnFilters[col] ?? []).length > 0;
    const hasAnyFilter = activeColumnFilterCount > 0;
    return (
      <ContextMenu key={col}>
        <ContextMenuTrigger asChild>{child}</ContextMenuTrigger>
        <ContextMenuContent className="w-64">
          <ContextMenuLabel>{getColumnLabel(col)}</ContextMenuLabel>
          <ContextMenuItem onClick={() => applyRightClickFilter(col, value)}>
            Filter by “{value || "(blank)"}”
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={!hasFilterOnColumn} onClick={() => clearRightClickFilter(col)}>
            Clear column filter
          </ContextMenuItem>
          <ContextMenuItem disabled={!hasAnyFilter} onClick={clearAllColumnFilters}>
            Clear all column filters
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }, [canRightClickFilter, columnFilters, activeColumnFilterCount, getColumnLabel, applyRightClickFilter, clearRightClickFilter, clearAllColumnFilters]);

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  const allSelected = visibleRows.length > 0 && visibleRows.every((r) => selectedIds.has(r.id));
  const someSelected = visibleRows.some((r) => selectedIds.has(r.id)) && !allSelected;

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      const next = new Set(selectedIds);
      for (const r of visibleRows) next.delete(r.id);
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      for (const r of visibleRows) next.add(r.id);
      onSelectionChange(next);
    }
  }, [allSelected, visibleRows, selectedIds, onSelectionChange]);

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
    <div className="flex flex-1 flex-col min-h-0">
      {activeColumnFilterCount > 0 && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5 text-primary" />
          <span>
            <strong className="text-foreground">{visibleRows.length}</strong> of {rows.length} rows
            shown — {activeColumnFilterCount} column filter{activeColumnFilterCount === 1 ? "" : "s"} active
          </span>
          <button
            type="button"
            onClick={clearAllColumnFilters}
            className="ml-1 inline-flex items-center gap-1 rounded px-2 py-0.5 hover:bg-accent text-foreground"
          >
            <X className="h-3 w-3" /> Clear all
          </button>
        </div>
      )}
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
                  <span className="truncate">{getColumnLabel(col)}</span>
                  {sortIcon(col)}
                </button>
                <ColumnFilterPopover
                  column={col}
                  values={distinctByColumn[col] ?? []}
                  selected={columnFilters[col] ?? []}
                  onChange={(next) => setColumnFilter(col, next)}
                />
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
            const row = visibleRows[vRow.index];
            const isOdd = vRow.index % 2 === 1;
            const editKey = getEditKey(row.id);
            const rowEdits = edits[editKey];
            const rowEffectiveExceptions = effectiveExceptions(row, rowEdits);
            const hasEx = rowEffectiveExceptions.length > 0;
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
                  // Highlight cells whose value was just imported in the most
                  // recent import action. The wrapper sits on top of the cell
                  // and renders a ring + soft tint without altering layout.
                  const cellStamp = importedAt ? getImportedAt(importedAt, row.id, col) : undefined;
                  const isFreshImport =
                    !!lastImportAt &&
                    !!cellStamp &&
                    new Date(cellStamp).getTime() >= lastImportAt - 1000; // 1s grace for clock skew
                  const withHighlight = (node: ReactNode): ReactNode =>
                    isFreshImport ? (
                      <div key={col} className="relative" style={{ width: w, minWidth: MIN_COL_W }}>
                        {node}
                        <div
                          className="pointer-events-none absolute inset-0 rounded-sm bg-primary/10 ring-1 ring-primary/40 animate-pulse"
                          aria-hidden
                        />
                      </div>
                    ) : (
                      node
                    );

                  if (col === "Status") {
                    const val = rowEdits?.status ?? "";
                    const statusCell = (
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
                    return withHighlight(wrapRightClickFilter(col, val, statusCell));
                  }

                  if (col === "Warranty until") {
                    const val = rowEdits?.warrantyUntil ?? "";
                    let date: Date | undefined;
                    if (val) {
                      const parsed = parseISO(val);
                      if (!isNaN(parsed.getTime())) date = parsed;
                    }
                    const warrantyCell = (
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
                    return withHighlight(wrapRightClickFilter(col, val, warrantyCell));
                  }

                  if (col === "User Active?" || col === "Skanska computer?") {
                    const isActive = col === "User Active?";
                    const editKey: keyof AssetEdits = isActive ? "userActive" : "skanskaComputer";
                    const effective: YesNo = isActive
                      ? effectiveUserActive(rowEdits)
                      : effectiveSkanska(rowEdits, row.computername);
                    const yesNoCell = (
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
                    return withHighlight(wrapRightClickFilter(col, effective, yesNoCell));
                  }

                  if (col === COMMENTS_COL) {
                    const val = rowEdits?.comment ?? "";
                    const entries = parseEntries(val);
                    const canUndo = entries.some((e) => !e.isNote && !!e.field);
                    return withHighlight(
                      <CommentCell
                        key={col}
                        value={val}
                        width={w}
                        rowId={row.id}
                        onEdit={(rid, v) => onEdit(rid, "comment", v)}
                        onUndo={onUndoLast}
                        canUndo={canUndo}
                      />,
                    );
                  }

                  // Exceptions and Source file are read-only
                  if (NON_EDITABLE_COLS.has(col)) {
                    const val = col === "Exceptions" ? rowEffectiveExceptions.join(", ") : row.sourceFile;
                    const readOnlyCell = (
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
                    return withHighlight(wrapRightClickFilter(col, val, readOnlyCell));
                  }

                  // Clickable Username / Computername — open the relevant drawer.
                  if (col === "Username" && onOpenUser) {
                    const val = row.user || row.raw[col] || "";
                    const userCell = (
                      <div
                        key={col}
                        className="px-1 py-0.5 flex items-center"
                        style={{ width: w, minWidth: MIN_COL_W }}
                      >
                        {val ? (
                          <button
                            type="button"
                            onClick={() => onOpenUser(val)}
                            className="truncate text-left text-primary hover:underline px-2 py-1 rounded-sm hover:bg-primary/10 transition-colors w-full"
                            title={`View user history: ${val}`}
                          >
                            {val}
                          </button>
                        ) : (
                          <span className="px-3 py-1.5 text-muted-foreground italic text-xs">—</span>
                        )}
                      </div>
                    );
                    return wrapRightClickFilter(col, val, userCell);
                  }
                  if (col === "Computername" && onOpenAsset) {
                    const val = row.computername || row.raw[col] || "";
                    const computerCell = (
                      <div
                        key={col}
                        className="px-1 py-0.5 flex items-center"
                        style={{ width: w, minWidth: MIN_COL_W }}
                      >
                        {val ? (
                          <button
                            type="button"
                            onClick={() => onOpenAsset(row)}
                            className="truncate text-left text-primary hover:underline px-2 py-1 rounded-sm hover:bg-primary/10 transition-colors w-full"
                            title={`View asset history: ${val}`}
                          >
                            {val}
                          </button>
                        ) : (
                          <span className="px-3 py-1.5 text-muted-foreground italic text-xs">—</span>
                        )}
                      </div>
                    );
                    return wrapRightClickFilter(col, val, computerCell);
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
                  const withRightClick = wrapRightClickFilter(col, val, cell);
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
                            <div>{withRightClick}</div>
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
                  return withRightClick;
                })}
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { AssetData, AssetRow, SortState } from "@/lib/asset-types";
import { saveData, loadData, clearData } from "@/lib/asset-store";
import { getSheetNames, parseSheet } from "@/lib/excel-parser";
import { exportCSV } from "@/lib/csv-export";
import { KpiCards } from "./KpiCards";
import { FilterBar } from "./FilterBar";
import { AssetTable } from "./AssetTable";
import { SheetPicker } from "./SheetPicker";
import { PrivacyFooter } from "./PrivacyFooter";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, Trash2, Download, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function useStickyState() {
  const [data, setDataState] = useState<AssetData | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDataState(loadData());
    setHydrated(true);
  }, []);

  const setData = useCallback((d: AssetData | null) => {
    setDataState(d);
    if (d) {
      if (!saveData(d)) toast.error("Data too large for local storage.");
    }
  }, []);
  return [data, setData, hydrated] as const;
}

export function AssetViewer() {
  const [data, setData, hydrated] = useStickyState();
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState("__all__");
  const [userFilter, setUserFilter] = useState("__all__");
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [activeCard, setActiveCard] = useState<import("./KpiCards").KpiKey | null>(null);
  const [sort, setSort] = useState<SortState>({ column: "", dir: null });
  const [confirmClear, setConfirmClear] = useState(false);
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const [pendingSheets, setPendingSheets] = useState<string[]>([]);
  const pendingBuffer = useRef<ArrayBuffer | null>(null);
  const pendingFilename = useRef("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCardClick = useCallback((key: import("./KpiCards").KpiKey) => {
    // Toggle off if clicking same card
    if (activeCard === key) {
      setActiveCard(null);
      setExceptionsOnly(false);
      return;
    }
    setActiveCard(key);
    setExceptionsOnly(key === "exceptions");
  }, [activeCard]);

  const handleFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    const sheets = getSheetNames(buffer);
    if (sheets.length > 1) {
      pendingBuffer.current = buffer;
      pendingFilename.current = file.name;
      setPendingSheets(sheets);
      setSheetPickerOpen(true);
    } else {
      const parsed = parseSheet(buffer, sheets[0], file.name);
      setData(parsed);
      toast.success(`Loaded ${parsed.rows.length} rows from "${file.name}"`);
    }
  }, [setData]);

  const handleSheetPick = useCallback((sheet: string) => {
    setSheetPickerOpen(false);
    if (pendingBuffer.current) {
      const parsed = parseSheet(pendingBuffer.current, sheet, pendingFilename.current);
      setData(parsed);
      toast.success(`Loaded ${parsed.rows.length} rows from sheet "${sheet}"`);
      pendingBuffer.current = null;
    }
  }, [setData]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  const handleClear = useCallback(() => {
    clearData();
    setData(null);
    setSearch("");
    setModelFilter("__all__");
    setUserFilter("__all__");
    setExceptionsOnly(false);
    setSort({ column: "", dir: null });
    setConfirmClear(false);
    toast.success("Local data cleared.");
  }, [setData]);

  const toggleSort = useCallback((col: string) => {
    setSort((prev) => {
      if (prev.column !== col) return { column: col, dir: "asc" };
      if (prev.dir === "asc") return { column: col, dir: "desc" };
      return { column: "", dir: null };
    });
  }, []);

  const rows = data?.rows ?? [];
  const columns = data?.columns ?? [];

  const models = useMemo(
    () => [...new Set(rows.map((r) => r.modell).filter(Boolean))].sort(),
    [rows],
  );
  const users = useMemo(
    () => [...new Set(rows.map((r) => r.user).filter(Boolean))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    let result = rows;
    // Card-based filters
    if (activeCard === "exceptions") result = result.filter((r) => r.exceptions.length > 0);
    else if (activeCard === "users") result = result.filter((r) => r.user !== "");
    else if (activeCard === "models") result = result.filter((r) => r.modell !== "");
    if (exceptionsOnly && activeCard !== "exceptions") result = result.filter((r) => r.exceptions.length > 0);
    if (modelFilter !== "__all__") result = result.filter((r) => r.modell === modelFilter);
    if (userFilter !== "__all__") result = result.filter((r) => r.user === userFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) =>
        columns.some((c) => (r.raw[c] ?? "").toLowerCase().includes(q)),
      );
    }
    if (sort.column && sort.dir) {
      const col = sort.column;
      const dir = sort.dir === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => {
        const va = col === "Exceptions" ? a.exceptions.join(", ") : (a.raw[col] ?? "");
        const vb = col === "Exceptions" ? b.exceptions.join(", ") : (b.raw[col] ?? "");
        return va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" }) * dir;
      });
    }
    return result;
  }, [rows, columns, search, modelFilter, userFilter, exceptionsOnly, activeCard, sort]);

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-background text-foreground">
        {/* Header */}
        <header className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">HQ Asset Overview</h1>
              {data && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last loaded: {data.filename} — {new Date(data.loadedAt).toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 text-chart-2" />
                    <span className="hidden sm:inline">Private</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Data stays on this device — no network calls</TooltipContent>
              </Tooltip>

              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFileChange} className="hidden" />
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" />
                {data ? "Replace Data" : "Load Excel"}
              </Button>
              {data && (
                <>
                  <Button size="sm" variant="outline" onClick={() => exportCSV(filtered, columns)}>
                    <Download className="h-4 w-4 mr-1" /> Export CSV
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setConfirmClear(true)}>
                    <Trash2 className="h-4 w-4 mr-1" /> Clear
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Body */}
        {data ? (
          <div className="flex flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
            <KpiCards rows={rows} activeCard={activeCard} onCardClick={handleCardClick} />
            <FilterBar
              search={search} onSearch={setSearch}
              modelFilter={modelFilter} onModelFilter={setModelFilter}
              userFilter={userFilter} onUserFilter={setUserFilter}
              exceptionsOnly={exceptionsOnly} onExceptionsOnly={setExceptionsOnly}
              models={models} users={users}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{filtered.length.toLocaleString()} of {rows.length.toLocaleString()} rows</span>
            </div>
            <AssetTable rows={filtered} columns={columns} sort={sort} onSort={toggleSort} />
            <PrivacyFooter />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-6">
            <RefreshCw className="h-12 w-12 text-muted-foreground/40" strokeWidth={1} />
            <p className="text-muted-foreground text-sm max-w-md">
              Load an Excel file (.xlsx) to view your HQ asset inventory. Data will be processed entirely in your browser and stored locally.
            </p>
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" /> Load Excel
            </Button>
            <PrivacyFooter />
          </div>
        )}

        {/* Clear confirmation */}
        <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all local data?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the loaded asset data from your browser. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleClear}>Clear Data</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Sheet picker */}
        <SheetPicker
          open={sheetPickerOpen}
          sheets={pendingSheets}
          onPick={handleSheetPick}
          onCancel={() => setSheetPickerOpen(false)}
        />
      </div>
    </TooltipProvider>
  );
}

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { AssetData, AssetRow, SortState } from "@/lib/asset-types";
import type { AssetEdits } from "@/lib/asset-edits";
import { saveData, loadData, clearData } from "@/lib/asset-store";
import { loadEdits, saveEdits, clearEdits, getEditKey } from "@/lib/asset-edits";
import { getSheetNames, parseSheet, mergeData } from "@/lib/excel-parser";
import { exportCSV } from "@/lib/csv-export";
import { KpiCards } from "./KpiCards";
import type { KpiKey } from "./KpiCards";
import { FilterBar } from "./FilterBar";
import { AssetTable } from "./AssetTable";
import { AuditDashboard } from "./AuditDashboard";
import { SheetPicker } from "./SheetPicker";
import { PrivacyFooter } from "./PrivacyFooter";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, Trash2, Download, ShieldCheck, RefreshCw, Plus } from "lucide-react";
import { AddRowDialog } from "./AddRowDialog";
import type { AssetStatus } from "@/lib/asset-edits";
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
  const [edits, setEditsState] = useState<Record<string, AssetEdits>>({});
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState("__all__");
  const [userFilter, setUserFilter] = useState("__all__");
  const [sourceFilter, setSourceFilter] = useState("__all__");
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [activeCard, setActiveCard] = useState<KpiKey | null>(null);
  const [sort, setSort] = useState<SortState>({ column: "", dir: null });
  const [confirmClear, setConfirmClear] = useState(false);
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const [pendingSheets, setPendingSheets] = useState<string[]>([]);
  const [importModeOpen, setImportModeOpen] = useState(false);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const pendingBuffer = useRef<ArrayBuffer | null>(null);
  const pendingFilename = useRef("");
  const pendingParsed = useRef<AssetData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditsState(loadEdits());
  }, []);

  const handleEdit = useCallback((rowId: number, field: keyof AssetEdits, value: string) => {
    setEditsState((prev) => {
      const key = getEditKey(rowId);
      const current = prev[key] ?? { status: "", warrantyUntil: "" };
      const next = { ...prev, [key]: { ...current, [field]: value } };
      saveEdits(next);
      return next;
    });
  }, []);

  const handleCardClick = useCallback((key: KpiKey) => {
    if (activeCard === key) {
      setActiveCard(null);
      setExceptionsOnly(false);
      return;
    }
    setActiveCard(key);
    setExceptionsOnly(key === "exceptions");
  }, [activeCard]);

  const applyParsed = useCallback((parsed: AssetData) => {
    if (data) {
      pendingParsed.current = parsed;
      setImportModeOpen(true);
    } else {
      setData(parsed);
      toast.success(`Loaded ${parsed.rows.length} rows from "${parsed.filename}"`);
    }
  }, [data, setData]);

  const handleImportReplace = useCallback(() => {
    setImportModeOpen(false);
    if (pendingParsed.current) {
      setData(pendingParsed.current);
      toast.success(`Replaced with ${pendingParsed.current.rows.length} rows`);
      pendingParsed.current = null;
    }
  }, [setData]);

  const handleImportAdd = useCallback(() => {
    setImportModeOpen(false);
    if (pendingParsed.current && data) {
      const merged = mergeData(data, pendingParsed.current);
      setData(merged);
      toast.success(`Added ${pendingParsed.current.rows.length} rows (total: ${merged.rows.length})`);
      pendingParsed.current = null;
    }
  }, [data, setData]);



  const handleAddRow = useCallback((raw: Record<string, string>, status: AssetStatus, warrantyUntil: string) => {
    if (!data) return;
    const newId = Math.max(...data.rows.map((r) => r.id), 0) + 1;
    const cnKey = Object.keys(raw).find((k) => k.toLowerCase() === "computername") ?? "";
    const modelKey = Object.keys(raw).find((k) => k.toLowerCase() === "modell") ?? "";
    const userKey = Object.keys(raw).find((k) => k.toLowerCase() === "user") ?? "";
    const computername = cnKey ? (raw[cnKey] ?? "").trim() : "";
    const modell = modelKey ? (raw[modelKey] ?? "").trim() : "";
    const user = userKey ? (raw[userKey] ?? "").trim() : "";
    const exceptions: string[] = [];
    if (!computername) exceptions.push("Missing Computername");
    if (!user) exceptions.push("Missing User");
    if (!modell) exceptions.push("Missing Modell");
    // Check for duplicate computername
    if (computername && data.rows.some((r) => r.computername.toLowerCase() === computername.toLowerCase())) {
      exceptions.push("Duplicate Computername (cross-file)");
    }
    const newRow: AssetRow = { id: newId, computername, modell, user, raw, exceptions, sourceFile: "Manual entry" };
    const updatedData: AssetData = { ...data, rows: [...data.rows, newRow] };
    setData(updatedData);
    // Save status/warranty as edits
    if (status || warrantyUntil) {
      setEditsState((prev) => {
        const next = { ...prev, [String(newId)]: { status, warrantyUntil } };
        saveEdits(next);
        return next;
      });
    }
    toast.success(`Added manual row "${computername || "Unnamed"}"`);
  }, [data, setData]);

  const handleFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    const sheets = getSheetNames(buffer);
    if (sheets.length > 1) {
      pendingBuffer.current = buffer;
      pendingFilename.current = file.name;
      setPendingSheets(sheets);
      setSheetPickerOpen(true);
    } else {
      applyParsed(parseSheet(buffer, sheets[0], file.name));
    }
  }, [applyParsed]);

  const handleSheetPick = useCallback((sheet: string) => {
    setSheetPickerOpen(false);
    if (pendingBuffer.current) {
      applyParsed(parseSheet(pendingBuffer.current, sheet, pendingFilename.current));
      pendingBuffer.current = null;
    }
  }, [applyParsed]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  const handleClear = useCallback(() => {
    clearData();
    clearEdits();
    setData(null);
    setEditsState({});
    setSearch("");
    setModelFilter("__all__");
    setUserFilter("__all__");
    setSourceFilter("__all__");
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
    () => [...new Set(rows.map((r) => r.user).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [rows],
  );
  const sources = useMemo(
    () => [...new Set(rows.map((r) => r.sourceFile).filter(Boolean))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    let result = rows;
    if (activeCard === "exceptions") result = result.filter((r) => r.exceptions.length > 0);
    else if (activeCard === "users") result = result.filter((r) => r.user !== "");
    else if (activeCard === "models") result = result.filter((r) => r.modell !== "");
    if (exceptionsOnly && activeCard !== "exceptions") result = result.filter((r) => r.exceptions.length > 0);
    if (modelFilter !== "__all__") result = result.filter((r) => r.modell === modelFilter);
    if (userFilter !== "__all__") result = result.filter((r) => r.user === userFilter);
    if (sourceFilter !== "__all__") result = result.filter((r) => r.sourceFile === sourceFilter);
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
        let va: string, vb: string;
        if (col === "Exceptions") {
          va = a.exceptions.join(", ");
          vb = b.exceptions.join(", ");
        } else if (col === "Status") {
          va = edits[getEditKey(a.id)]?.status ?? "";
          vb = edits[getEditKey(b.id)]?.status ?? "";
        } else if (col === "Warranty until") {
          va = edits[getEditKey(a.id)]?.warrantyUntil ?? "";
          vb = edits[getEditKey(b.id)]?.warrantyUntil ?? "";
        } else {
          va = a.raw[col] ?? "";
          vb = b.raw[col] ?? "";
        }
        return va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" }) * dir;
      });
    }
    return result;
  }, [rows, columns, search, modelFilter, userFilter, sourceFilter, exceptionsOnly, activeCard, sort, edits]);

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-background text-foreground">
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
                  <Button size="sm" variant="outline" onClick={() => setAddRowOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add Row
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportCSV(filtered, columns, edits)}>
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

        {data ? (
          <div className="flex flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
            <KpiCards rows={rows} activeCard={activeCard} onCardClick={handleCardClick} />

            <Tabs defaultValue="table" className="flex flex-1 flex-col overflow-hidden">
              <TabsList className="w-fit">
                <TabsTrigger value="table">Asset List</TabsTrigger>
                <TabsTrigger value="audit">Audit Report</TabsTrigger>
              </TabsList>

              <TabsContent value="table" className="flex flex-1 flex-col gap-4 overflow-hidden mt-4">
                <FilterBar
                  search={search} onSearch={setSearch}
                  modelFilter={modelFilter} onModelFilter={setModelFilter}
                  userFilter={userFilter} onUserFilter={setUserFilter}
                  sourceFilter={sourceFilter} onSourceFilter={setSourceFilter}
                  exceptionsOnly={exceptionsOnly} onExceptionsOnly={setExceptionsOnly}
                  models={models} users={users} sources={sources}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{filtered.length.toLocaleString()} of {rows.length.toLocaleString()} rows</span>
                </div>
                <AssetTable
                  rows={filtered}
                  columns={columns}
                  sort={sort}
                  onSort={toggleSort}
                  edits={edits}
                  onEdit={handleEdit}
                />
              </TabsContent>

              <TabsContent value="audit" className="flex-1 overflow-auto mt-4">
                <AuditDashboard rows={rows} edits={edits} />
              </TabsContent>
            </Tabs>

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

        <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all local data?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the loaded asset data and any edits from your browser.
                {hasManualOrEdits && (
                  <span className="block mt-2 font-semibold text-destructive">
                    ⚠ You have manual entries or edits that will be lost.
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleClear}>Clear Data</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <SheetPicker
          open={sheetPickerOpen}
          sheets={pendingSheets}
          onPick={handleSheetPick}
          onCancel={() => setSheetPickerOpen(false)}
        />

        <AlertDialog open={importModeOpen} onOpenChange={setImportModeOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Data already loaded</AlertDialogTitle>
              <AlertDialogDescription>
                Would you like to replace all existing data or add the new rows to the current dataset? Duplicates will be flagged as exceptions.
                {hasManualOrEdits && (
                  <span className="block mt-2 font-semibold text-destructive">
                    ⚠ Replacing will discard your manual entries and edits.
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleImportAdd} className={buttonVariants({ variant: "outline" })}>
                Add Data
              </AlertDialogAction>
              <AlertDialogAction onClick={handleImportReplace}>
                Replace All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AddRowDialog
          open={addRowOpen}
          onOpenChange={setAddRowOpen}
          columns={columns}
          onSave={handleAddRow}
        />
      </div>
    </TooltipProvider>
  );
}

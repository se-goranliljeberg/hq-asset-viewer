import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { AssetData, AssetRow, SortState } from "@/lib/asset-types";
import type { AssetEdits, AssetStatus } from "@/lib/asset-edits";
import {
  saveData, loadData, clearData, clearColumnOrder,
  loadMapping, saveMapping, clearAllMappings,
  isMigrated, markMigrated,
} from "@/lib/asset-store";
import { loadEdits, saveEdits, clearEdits, getEditKey, STATUS_OPTIONS } from "@/lib/asset-edits";
import {
  appendComment, describeChange, popLastEntry,
  getStoredInitials, setStoredInitials,
} from "@/lib/comment-log";
import {
  getSheetNames, parseSheetWithMapping, mergeData, enrichWithUsers,
  inspectSheet, headerSetHash, migrateToCanonical,
  type Mapping, type ParseResult,
} from "@/lib/excel-parser";
import { exportCSV } from "@/lib/csv-export";
import { KpiCards } from "./KpiCards";
import type { KpiKey } from "./KpiCards";
import { FilterBar, STATUS_NONE_TOKEN } from "./FilterBar";
import { ActiveFilterChips, type FilterChip } from "./ActiveFilterChips";
import { AssetTable } from "./AssetTable";
import { AuditDashboard } from "./AuditDashboard";
import { SheetPicker } from "./SheetPicker";
import { PrivacyFooter } from "./PrivacyFooter";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, Trash2, Download, ShieldCheck, RefreshCw, Plus, Bug, BookOpen } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AddRowDialog } from "./AddRowDialog";
import { ImportDebugger } from "./ImportDebugger";
import { ColumnMappingDialog } from "./ColumnMappingDialog";
import { InitialsPromptDialog } from "./InitialsPromptDialog";
import { WhatsNewToast } from "./WhatsNewToast";

import { toast } from "sonner";

const FILTER_STORAGE_KEYS = {
  models: "hq_filter_models",
  users: "hq_filter_users",
  sources: "hq_filter_sources",
  status: "hq_filter_status",
} as const;

function loadFilterFromStorage(key: string, fallback: string[]): string[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) return parsed;
  } catch { /* noop */ }
  return fallback;
}

function saveFilterToStorage(key: string, value: string[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

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
  return [data, setData, hydrated, setDataState] as const;
}

export function AssetViewer() {
  const [data, setData, hydrated, setDataDirect] = useStickyState();
  const [edits, setEditsState] = useState<Record<string, AssetEdits>>({});
  const defaultStatusFilter = useMemo(
    () => [STATUS_NONE_TOKEN, ...STATUS_OPTIONS].filter((s) => s !== "Sent back to broker"),
    [],
  );
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState<string[]>(() => loadFilterFromStorage(FILTER_STORAGE_KEYS.models, []));
  const [userFilter, setUserFilter] = useState<string[]>(() => loadFilterFromStorage(FILTER_STORAGE_KEYS.users, []));
  const [sourceFilter, setSourceFilter] = useState<string[]>(() => loadFilterFromStorage(FILTER_STORAGE_KEYS.sources, []));
  // Default: exclude "Sent back to broker" — show everything else (incl. no-status rows).
  const [statusFilter, setStatusFilter] = useState<string[]>(() =>
    loadFilterFromStorage(FILTER_STORAGE_KEYS.status, defaultStatusFilter),
  );

  // Persist filter selections so they survive reloads.
  useEffect(() => { saveFilterToStorage(FILTER_STORAGE_KEYS.models, modelFilter); }, [modelFilter]);
  useEffect(() => { saveFilterToStorage(FILTER_STORAGE_KEYS.users, userFilter); }, [userFilter]);
  useEffect(() => { saveFilterToStorage(FILTER_STORAGE_KEYS.sources, sourceFilter); }, [sourceFilter]);
  useEffect(() => { saveFilterToStorage(FILTER_STORAGE_KEYS.status, statusFilter); }, [statusFilter]);
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [activeCard, setActiveCard] = useState<KpiKey | null>(null);
  const [sort, setSort] = useState<SortState>({ column: "", dir: null });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const [pendingSheets, setPendingSheets] = useState<string[]>([]);
  const [importModeOpen, setImportModeOpen] = useState(false);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [pendingIsUsersFile, setPendingIsUsersFile] = useState(false);
  const pendingBuffer = useRef<ArrayBuffer | null>(null);
  const pendingFilename = useRef("");
  const pendingSheet = useRef("");
  const pendingParsed = useRef<AssetData | null>(null);
  const pendingSeedEdits = useRef<Record<string, AssetEdits>>({});

  // Mapping dialog state
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingHeaders, setMappingHeaders] = useState<string[]>([]);
  const [mappingSamples, setMappingSamples] = useState<Record<string, string>>({});
  const [mappingInitial, setMappingInitial] = useState<Mapping | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Initials prompt — shown once on first audit-logging edit if not stored yet.
  const [initialsOpen, setInitialsOpen] = useState(false);
  const pendingAfterInitials = useRef<(() => void) | null>(null);

  const ensureInitials = useCallback((proceed: () => void) => {
    if (getStoredInitials()) {
      proceed();
      return;
    }
    pendingAfterInitials.current = proceed;
    setInitialsOpen(true);
  }, []);

  const handleInitialsConfirm = useCallback((value: string) => {
    setStoredInitials(value);
    setInitialsOpen(false);
    const cb = pendingAfterInitials.current;
    pendingAfterInitials.current = null;
    if (cb) cb();
  }, []);

  const handleInitialsSkip = useCallback(() => {
    setInitialsOpen(false);
    const cb = pendingAfterInitials.current;
    pendingAfterInitials.current = null;
    if (cb) cb();
  }, []);

  useEffect(() => {
    // Sanitize edits on load: clear warrantyUntil values that aren't valid YYYY-MM-DD,
    // which would otherwise crash the date picker with "Invalid time value".
    const loaded = loadEdits();
    let dirty = false;
    const cleaned: typeof loaded = {};
    for (const [k, v] of Object.entries(loaded)) {
      const w = v.warrantyUntil ?? "";
      if (w && !/^\d{4}-\d{2}-\d{2}$/.test(w)) {
        cleaned[k] = { ...v, warrantyUntil: "" };
        dirty = true;
      } else {
        cleaned[k] = v;
      }
    }
    if (dirty) saveEdits(cleaned);
    setEditsState(cleaned);
  }, []);

  // One-time canonical migration on hydrate
  useEffect(() => {
    if (!hydrated || !data || isMigrated()) return;
    const { data: migrated, changed } = migrateToCanonical(data);
    markMigrated();
    if (changed) {
      setDataDirect(migrated);
      saveData(migrated);
      toast.success("Cleaned up legacy column duplicates.");
    }
  }, [hydrated, data, setDataDirect]);

  const performEdit = useCallback((rowId: number, field: keyof AssetEdits, value: string) => {
    setEditsState((prev) => {
      const key = getEditKey(rowId);
      const current = prev[key] ?? { status: "", warrantyUntil: "" };
      const updated: AssetEdits = { ...current, [field]: value };
      if (field !== "comment" && (current[field] ?? "") !== value) {
        const label =
          field === "status" ? "Status" :
          field === "warrantyUntil" ? "Warranty until" :
          String(field);
        updated.comment = appendComment(
          current.comment,
          describeChange(label, String(current[field] ?? ""), value),
        );
      }
      const next = { ...prev, [key]: updated };
      saveEdits(next);
      return next;
    });
  }, []);

  const handleEdit = useCallback((rowId: number, field: keyof AssetEdits, value: string) => {
    if (field === "comment") {
      performEdit(rowId, field, value);
      return;
    }
    ensureInitials(() => performEdit(rowId, field, value));
  }, [performEdit, ensureInitials]);

  const performCellEdit = useCallback((rowId: number, column: string, value: string) => {
    if (!data) return;
    let prevValue = "";
    const updatedRows = data.rows.map((r) => {
      if (r.id !== rowId) return r;
      prevValue = r.raw[column] ?? "";
      const newRaw = { ...r.raw, [column]: value };
      const colLower = column.toLowerCase();
      return {
        ...r,
        raw: newRaw,
        computername: colLower === "computername" ? value.trim() : r.computername,
        modell: colLower === "modell" ? value.trim() : r.modell,
        user: colLower === "user" ? value.trim() : r.user,
      };
    });
    setData({ ...data, rows: updatedRows });
    if (prevValue !== value) {
      setEditsState((prev) => {
        const key = getEditKey(rowId);
        const current = prev[key] ?? { status: "", warrantyUntil: "" };
        const next = {
          ...prev,
          [key]: {
            ...current,
            comment: appendComment(current.comment, describeChange(column, prevValue, value)),
          },
        };
        saveEdits(next);
        return next;
      });
    }
  }, [data, setData]);

  const handleCellEdit = useCallback((rowId: number, column: string, value: string) => {
    ensureInitials(() => performCellEdit(rowId, column, value));
  }, [performCellEdit, ensureInitials]);

  /**
   * Undo the last audit entry on a row: strip it from Comments and revert
   * the corresponding field to its "from" value.
   */
  const handleUndoLast = useCallback((rowId: number) => {
    const key = getEditKey(rowId);
    const current = edits[key];
    if (!current) {
      toast.error("Nothing to undo on this row.");
      return;
    }
    const { remainder, popped } = popLastEntry(current.comment);
    if (!popped || popped.isNote || !popped.field) {
      toast.error("Nothing to undo on this row.");
      return;
    }
    const fromVal = popped.from ?? "";
    const fieldName = popped.field;

    if (fieldName === "Status") {
      const next = { ...edits, [key]: { ...current, status: fromVal as AssetStatus, comment: remainder } };
      setEditsState(next);
      saveEdits(next);
      toast.success(`Reverted Status → "${fromVal || "(empty)"}"`);
      return;
    }
    if (fieldName === "Warranty until") {
      const next = { ...edits, [key]: { ...current, warrantyUntil: fromVal, comment: remainder } };
      setEditsState(next);
      saveEdits(next);
      toast.success(`Reverted Warranty until → "${fromVal || "(empty)"}"`);
      return;
    }
    // Otherwise treat as a raw column edit.
    if (data) {
      const updatedRows = data.rows.map((r) => {
        if (r.id !== rowId) return r;
        const newRaw = { ...r.raw, [fieldName]: fromVal };
        const colLower = fieldName.toLowerCase();
        return {
          ...r,
          raw: newRaw,
          computername: colLower === "computername" ? fromVal.trim() : r.computername,
          modell: colLower === "modell" ? fromVal.trim() : r.modell,
          user: colLower === "user" ? fromVal.trim() : r.user,
        };
      });
      setData({ ...data, rows: updatedRows });
    }
    const next = { ...edits, [key]: { ...current, comment: remainder } };
    setEditsState(next);
    saveEdits(next);
    toast.success(`Reverted ${fieldName} → "${fromVal || "(empty)"}"`);
  }, [edits, data, setData]);

  const handleCardClick = useCallback((key: KpiKey) => {
    if (activeCard === key) {
      setActiveCard(null);
      setExceptionsOnly(false);
      return;
    }
    setActiveCard(key);
    setExceptionsOnly(key === "exceptions");
  }, [activeCard]);

  const applySeedEdits = useCallback((seed: Record<string, AssetEdits>) => {
    if (Object.keys(seed).length > 0) {
      setEditsState((prev) => {
        const next = { ...prev, ...seed };
        saveEdits(next);
        return next;
      });
    }
  }, []);

  const applyParsed = useCallback((result: ParseResult) => {
    if (data) {
      pendingParsed.current = result.data;
      pendingSeedEdits.current = result.seedEdits;
      setPendingIsUsersFile(result.isUsersFile);
      setImportModeOpen(true);
    } else {
      setData(result.data);
      applySeedEdits(result.seedEdits);
      toast.success(`Loaded ${result.data.rows.length} rows from "${result.data.filename}"`);
    }
  }, [data, setData, applySeedEdits]);

  const handleImportEnrich = useCallback(() => {
    setImportModeOpen(false);
    if (pendingParsed.current && data) {
      const merged = enrichWithUsers(data, pendingParsed.current);
      setData(merged);
      applySeedEdits(pendingSeedEdits.current);
      toast.success(`Enriched users — total rows: ${merged.rows.length}`);
      pendingParsed.current = null;
      pendingSeedEdits.current = {};
      setPendingIsUsersFile(false);
    }
  }, [data, setData, applySeedEdits]);

  const handleImportReplace = useCallback(() => {
    setImportModeOpen(false);
    if (pendingParsed.current) {
      setData(pendingParsed.current);
      applySeedEdits(pendingSeedEdits.current);
      toast.success(`Replaced with ${pendingParsed.current.rows.length} rows`);
      pendingParsed.current = null;
      pendingSeedEdits.current = {};
    }
  }, [setData, applySeedEdits]);

  const handleImportAdd = useCallback(() => {
    setImportModeOpen(false);
    if (pendingParsed.current && data) {
      const merged = mergeData(data, pendingParsed.current);
      setData(merged);
      applySeedEdits(pendingSeedEdits.current);
      toast.success(`Added ${pendingParsed.current.rows.length} rows (total: ${merged.rows.length})`);
      pendingParsed.current = null;
      pendingSeedEdits.current = {};
    }
  }, [data, setData, applySeedEdits]);


  const handleAddRow = useCallback((raw: Record<string, string>, status: AssetStatus, warrantyUntil: string) => {
    if (!data) return;
    ensureInitials(() => {
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
      if (computername && data.rows.some((r) => r.computername.toLowerCase() === computername.toLowerCase())) {
        exceptions.push("Duplicate Computername (cross-file)");
      }
      const newRow: AssetRow = { id: newId, computername, modell, user, raw, exceptions, sourceFile: "Manual entry" };
      const updatedData: AssetData = { ...data, rows: [...data.rows, newRow] };
      setData(updatedData);

      const filledFields = Object.entries(raw)
        .filter(([, v]) => v && v.trim() !== "")
        .map(([k]) => k);
      const summary = filledFields.length > 0
        ? `Row added manually with ${filledFields.join(", ")}`
        : "Row added manually";
      const initialComment = appendComment("", summary);
      const withStatus = status
        ? appendComment(initialComment, describeChange("Status", "", status))
        : initialComment;
      const withWarranty = warrantyUntil
        ? appendComment(withStatus, describeChange("Warranty until", "", warrantyUntil))
        : withStatus;

      setEditsState((prev) => {
        const next = { ...prev, [String(newId)]: { status, warrantyUntil, comment: withWarranty } };
        saveEdits(next);
        return next;
      });
      toast.success(`Added manual row "${computername || "Unnamed"}"`);
    });
  }, [data, setData, ensureInitials]);

  const openMappingFor = useCallback((buffer: ArrayBuffer, sheet: string, filename: string) => {
    pendingBuffer.current = buffer;
    pendingFilename.current = filename;
    pendingSheet.current = sheet;
    const inspected = inspectSheet(buffer, sheet);
    if (inspected.headers.length === 0) {
      toast.error("Sheet is empty.");
      return;
    }
    const hash = headerSetHash(inspected.headers);
    const saved = loadMapping(hash);
    setMappingHeaders(inspected.headers);
    setMappingSamples(inspected.samples);
    setMappingInitial(saved);
    setMappingOpen(true);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    const sheets = getSheetNames(buffer);
    if (sheets.length > 1) {
      pendingBuffer.current = buffer;
      pendingFilename.current = file.name;
      setPendingSheets(sheets);
      setSheetPickerOpen(true);
    } else {
      openMappingFor(buffer, sheets[0], file.name);
    }
  }, [openMappingFor]);

  const handleSheetPick = useCallback((sheet: string) => {
    setSheetPickerOpen(false);
    if (pendingBuffer.current) {
      openMappingFor(pendingBuffer.current, sheet, pendingFilename.current);
    }
  }, [openMappingFor]);

  const handleMappingApply = useCallback((mapping: Mapping, remember: boolean) => {
    setMappingOpen(false);
    if (!pendingBuffer.current) return;
    if (remember) saveMapping(headerSetHash(mappingHeaders), mapping);
    const result = parseSheetWithMapping(
      pendingBuffer.current,
      pendingSheet.current,
      pendingFilename.current,
      mapping,
    );
    applyParsed(result);
    pendingBuffer.current = null;
  }, [applyParsed, mappingHeaders]);

  const handleMappingCancel = useCallback(() => {
    setMappingOpen(false);
    pendingBuffer.current = null;
  }, []);

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
    setModelFilter([]);
    setUserFilter([]);
    setSourceFilter([]);
    setStatusFilter(defaultStatusFilter);
    setExceptionsOnly(false);
    setSort({ column: "", dir: null });
    setConfirmClear(false);
    toast.success("Local data cleared.");
  }, [setData, defaultStatusFilter]);

  const clearAllFilters = useCallback(() => {
    setSearch("");
    setModelFilter([]);
    setUserFilter([]);
    setSourceFilter([]);
    setStatusFilter([]);
    setExceptionsOnly(false);
  }, []);

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

  const hasManualOrEdits = useMemo(() => {
    const hasEditsVal = Object.values(edits).some((e) => e.status !== "" || e.warrantyUntil !== "");
    const hasManual = rows.some((r) => r.sourceFile === "Manual entry");
    return hasEditsVal || hasManual;
  }, [edits, rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (activeCard === "exceptions") result = result.filter((r) => r.exceptions.length > 0);
    else if (activeCard === "users") result = result.filter((r) => r.user !== "");
    else if (activeCard === "models") result = result.filter((r) => r.modell !== "");
    if (exceptionsOnly && activeCard !== "exceptions") result = result.filter((r) => r.exceptions.length > 0);
    if (modelFilter.length > 0) result = result.filter((r) => modelFilter.includes(r.modell));
    if (userFilter.length > 0) result = result.filter((r) => userFilter.includes(r.user));
    if (sourceFilter.length > 0) result = result.filter((r) => sourceFilter.includes(r.sourceFile));
    if (statusFilter.length > 0) {
      result = result.filter((r) => {
        const s = edits[getEditKey(r.id)]?.status ?? "";
        if (s === "") return statusFilter.includes(STATUS_NONE_TOKEN);
        return statusFilter.includes(s);
      });
    }
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
        } else if (col === "Comments") {
          va = edits[getEditKey(a.id)]?.comment ?? "";
          vb = edits[getEditKey(b.id)]?.comment ?? "";
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

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/documentation">
                      <BookOpen className="h-4 w-4 mr-1" /> Documentation
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Technical documentation & user guide</TooltipContent>
              </Tooltip>

              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFileChange} className="hidden" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" onClick={() => setDebugOpen(true)}>
                    <Bug className="h-4 w-4 mr-1" /> Debug Import
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Inspect a file before importing — shows columns, dates, warnings</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" onClick={() => fileRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" />
                    {data ? "Replace Data" : "Load Excel"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Import an Excel file (.xlsx / .xls)</TooltipContent>
              </Tooltip>
              {data && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" onClick={() => setAddRowOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" /> Add Row
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Manually add a new asset row</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" onClick={() => exportCSV(filtered, columns, edits)}>
                        <Download className="h-4 w-4 mr-1" /> Export CSV
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Export filtered rows as CSV file</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="destructive" onClick={() => setConfirmClear(true)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Clear
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove all loaded data from browser</TooltipContent>
                  </Tooltip>
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
                  statusFilter={statusFilter} onStatusFilter={setStatusFilter}
                  exceptionsOnly={exceptionsOnly} onExceptionsOnly={setExceptionsOnly}
                  models={models} users={users} sources={sources}
                  statuses={[...STATUS_OPTIONS]}
                  onResetColumns={() => {
                    clearColumnOrder();
                    localStorage.removeItem("hq_asset_column_widths");
                    toast.success("Column layout reset — reload to apply.");
                  }}
                  onResetMappings={() => {
                    const n = clearAllMappings();
                    toast.success(n > 0 ? `Forgot ${n} saved mapping(s).` : "No saved mappings to clear.");
                  }}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{filtered.length.toLocaleString()} of {rows.length.toLocaleString()} rows</span>
                  <span className="hidden sm:flex items-center gap-3 text-muted-foreground/70">
                    <span>💡 Double-click a cell to edit</span>
                    <span>·</span>
                    <span>☑ Use checkboxes for batch status changes</span>
                    <span>·</span>
                    <span>↕ Click column headers to sort</span>
                  </span>
                </div>
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
                    <span className="text-sm font-medium">{selectedIds.size} selected</span>
                    <Select
                      value="__batch__"
                      onValueChange={(v) => {
                        if (v === "__batch__") return;
                        const statusVal = v === "__none__" ? "" : v;
                        ensureInitials(() => {
                          setEditsState((prev) => {
                            const next = { ...prev };
                            for (const id of selectedIds) {
                              const key = getEditKey(id);
                              const current = next[key] ?? { status: "", warrantyUntil: "" };
                              const changed = current.status !== statusVal;
                              next[key] = {
                                ...current,
                                status: statusVal as AssetStatus,
                                comment: changed
                                  ? appendComment(
                                      current.comment,
                                      `${describeChange("Status", current.status, statusVal)} (batch)`,
                                    )
                                  : current.comment,
                              };
                            }
                            saveEdits(next);
                            return next;
                          });
                          toast.success(`Updated status for ${selectedIds.size} rows`);
                        });
                      }}
                    >
                      <SelectTrigger className="h-8 w-[200px] text-xs">
                        <SelectValue placeholder="Set status for selected…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__batch__" disabled>Set status for selected…</SelectItem>
                        <SelectItem value="__none__">— Clear status</SelectItem>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                      Deselect all
                    </Button>
                  </div>
                )}
                <AssetTable
                  rows={filtered}
                  columns={columns}
                  sort={sort}
                  onSort={toggleSort}
                  edits={edits}
                  onEdit={handleEdit}
                  onCellEdit={handleCellEdit}
                  onUndoLast={handleUndoLast}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
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
              <AlertDialogTitle>
                {pendingIsUsersFile ? "Users file detected" : "Data already loaded"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pendingIsUsersFile ? (
                  <>
                    This file looks like a user list (no Computername column). You can{" "}
                    <strong>enrich existing rows</strong> with email/department/creation date
                    by matching on User or Email. Unmatched users will be added as new rows
                    flagged "User without computer".
                  </>
                ) : (
                  <>Would you like to replace all existing data or add the new rows to the current dataset? Duplicates will be flagged as exceptions.</>
                )}
                {hasManualOrEdits && (
                  <span className="block mt-2 font-semibold text-destructive">
                    ⚠ Replacing will discard your manual entries and edits.
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {pendingIsUsersFile && (
                <AlertDialogAction onClick={handleImportEnrich}>
                  Enrich Users
                </AlertDialogAction>
              )}
              <AlertDialogAction onClick={handleImportAdd} className={buttonVariants({ variant: "outline" })}>
                Add Data
              </AlertDialogAction>
              <AlertDialogAction onClick={handleImportReplace} className={buttonVariants({ variant: pendingIsUsersFile ? "outline" : "default" })}>
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

        <ImportDebugger open={debugOpen} onOpenChange={setDebugOpen} />

        <ColumnMappingDialog
          open={mappingOpen}
          filename={pendingFilename.current}
          sheetName={pendingSheet.current}
          headers={mappingHeaders}
          samples={mappingSamples}
          initialMapping={mappingInitial}
          onApply={handleMappingApply}
          onCancel={handleMappingCancel}
        />

        <WhatsNewToast />
        <InitialsPromptDialog
          open={initialsOpen}
          onConfirm={handleInitialsConfirm}
          onCancel={handleInitialsSkip}
        />
      </div>
    </TooltipProvider>
  );
}

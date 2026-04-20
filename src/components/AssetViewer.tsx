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
  detectUsernameConflicts,
  type Mapping, type ParseResult, type UsernameConflict,
} from "@/lib/excel-parser";
import { exportCSV } from "@/lib/csv-export";
import { KpiCards } from "./KpiCards";
import type { KpiKey } from "./KpiCards";
import { FilterBar, STATUS_NONE_TOKEN, type SkanskaFilter } from "./FilterBar";
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
import { ReplaceDeviceDialog, type ReplaceSource, type OldDeviceDestination } from "./ReplaceDeviceDialog";
import { ImportDebugger } from "./ImportDebugger";
import { ColumnMappingDialog } from "./ColumnMappingDialog";
import { InitialsPromptDialog } from "./InitialsPromptDialog";
import { WhatsNewToast } from "./WhatsNewToast";
import { MultiAssetImportDialog, type MultiAssetResolution } from "./MultiAssetImportDialog";
import { AssetHistoryDrawer } from "./AssetHistoryDrawer";
import { UserHistoryDrawer } from "./UserHistoryDrawer";
import { APP_VERSION, useHasUnseenVersion } from "@/lib/version-state";
import { loadImportMeta, saveImportMeta, mergeImportMeta, type ImportMeta } from "@/lib/import-meta";
import { ImportConflictDialog, type ConflictResolutions } from "./ImportConflictDialog";
import { loadStaleThreshold, saveStaleThreshold, DEFAULT_STALE_THRESHOLD_DAYS } from "@/lib/stale-config";
import { effectiveSkanska, effectiveUserActive, effectiveExceptions, recordLifecycleEvent, computeMultiComputerUsers } from "@/lib/asset-edits";
import type { AssetRow as _AssetRow, LifecycleState } from "@/lib/asset-types";
import { detectUserMultiAssetIncoming, type MultiAssetIncoming, migrateLifecycle } from "@/lib/excel-parser";
import { isLifecycleMigrated, markLifecycleMigrated } from "@/lib/asset-store";

import { toast } from "sonner";

const FILTER_STORAGE_KEYS = {
  models: "hq_filter_models",
  users: "hq_filter_users",
  managers: "hq_filter_managers",
  sources: "hq_filter_sources",
  status: "hq_filter_status",
  excludeInactive: "hq_filter_exclude_inactive",
  skanska: "hq_filter_skanska",
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
  const hasUnseenVersion = useHasUnseenVersion();
  const [edits, setEditsState] = useState<Record<string, AssetEdits>>({});
  const [importMeta, setImportMeta] = useState<ImportMeta>({});

  useEffect(() => { setImportMeta(loadImportMeta()); }, []);

  const mergeAndPersistMeta = useCallback((incoming: ImportMeta) => {
    setImportMeta((prev) => {
      const next = mergeImportMeta(prev, incoming);
      saveImportMeta(next);
      return next;
    });
  }, []);
  const defaultStatusFilter = useMemo(
    () => [STATUS_NONE_TOKEN, ...STATUS_OPTIONS].filter((s) => s !== "Sent back to broker"),
    [],
  );
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState<string[]>(() => loadFilterFromStorage(FILTER_STORAGE_KEYS.models, []));
  const [userFilter, setUserFilter] = useState<string[]>(() => loadFilterFromStorage(FILTER_STORAGE_KEYS.users, []));
  const [managerFilter, setManagerFilter] = useState<string[]>(() => loadFilterFromStorage(FILTER_STORAGE_KEYS.managers, []));
  const [sourceFilter, setSourceFilter] = useState<string[]>(() => loadFilterFromStorage(FILTER_STORAGE_KEYS.sources, []));
  // Default: exclude "Sent back to broker" — show everything else (incl. no-status rows).
  const [statusFilter, setStatusFilter] = useState<string[]>(() =>
    loadFilterFromStorage(FILTER_STORAGE_KEYS.status, defaultStatusFilter),
  );
  const [excludeInactive, setExcludeInactive] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEYS.excludeInactive);
      return raw === null ? false : raw === "true";
    } catch { return false; }
  });
  const [skanskaFilter, setSkanskaFilter] = useState<SkanskaFilter>(() => {
    if (typeof window === "undefined") return "all";
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEYS.skanska);
      if (raw === "all" || raw === "skanska" || raw === "non-skanska") return raw;
    } catch { /* noop */ }
    return "all";
  });
  const [staleThreshold, setStaleThresholdState] = useState<number>(() => loadStaleThreshold());

  // Persist filter selections so they survive reloads.
  useEffect(() => { saveFilterToStorage(FILTER_STORAGE_KEYS.models, modelFilter); }, [modelFilter]);
  useEffect(() => { saveFilterToStorage(FILTER_STORAGE_KEYS.users, userFilter); }, [userFilter]);
  useEffect(() => { saveFilterToStorage(FILTER_STORAGE_KEYS.managers, managerFilter); }, [managerFilter]);
  useEffect(() => { saveFilterToStorage(FILTER_STORAGE_KEYS.sources, sourceFilter); }, [sourceFilter]);
  useEffect(() => { saveFilterToStorage(FILTER_STORAGE_KEYS.status, statusFilter); }, [statusFilter]);
  useEffect(() => {
    try { localStorage.setItem(FILTER_STORAGE_KEYS.excludeInactive, String(excludeInactive)); } catch { /* noop */ }
  }, [excludeInactive]);
  useEffect(() => {
    try { localStorage.setItem(FILTER_STORAGE_KEYS.skanska, skanskaFilter); } catch { /* noop */ }
  }, [skanskaFilter]);
  const setStaleThreshold = useCallback((n: number) => {
    setStaleThresholdState(n);
    saveStaleThreshold(n);
  }, []);
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [activeCard, setActiveCard] = useState<KpiKey | null>(null);
  const [sort, setSort] = useState<SortState>({ column: "", dir: null });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const [pendingSheets, setPendingSheets] = useState<string[]>([]);
  const [importModeOpen, setImportModeOpen] = useState(false);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [pendingIsUsersFile, setPendingIsUsersFile] = useState(false);

  // Multi-asset import dialog state (incoming computer for an existing user).
  const [multiAssetOpen, setMultiAssetOpen] = useState(false);
  const [pendingMultiAssetCases, setPendingMultiAssetCases] = useState<MultiAssetIncoming[]>([]);

  // Asset history drawer state.
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [historyDrawerRow, setHistoryDrawerRow] = useState<_AssetRow | null>(null);

  // User profile drawer state (opened from Audit Report).
  const [userDrawerOpen, setUserDrawerOpen] = useState(false);
  const [userDrawerKey, setUserDrawerKey] = useState<string | null>(null);
  const [userDrawerDisplay, setUserDrawerDisplay] = useState("");

  // Conflict resolution dialog state
  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingConflicts, setPendingConflicts] = useState<UsernameConflict[]>([]);
  const pendingMode = useRef<"add" | "enrich">("add");
  const pendingBuffer = useRef<ArrayBuffer | null>(null);
  const pendingFilename = useRef("");
  const pendingSheet = useRef("");
  const pendingParsed = useRef<AssetData | null>(null);
  const pendingSeedEdits = useRef<Record<string, AssetEdits>>({});
  const pendingImportedAt = useRef<Record<number, Record<string, string>>>({});

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

  const remapImportedAt = useCallback(
    (rowsCount: number, idMapper: (origIdx: number) => number | null): ImportMeta => {
      const out: ImportMeta = {};
      const src = pendingImportedAt.current;
      for (let i = 0; i < rowsCount; i++) {
        const stamps = src[i];
        if (!stamps) continue;
        const newId = idMapper(i);
        if (newId === null) continue;
        out[newId] = { ...stamps };
      }
      return out;
    },
    [],
  );

  const applyParsed = useCallback((result: ParseResult) => {
    if (data) {
      pendingParsed.current = result.data;
      pendingSeedEdits.current = result.seedEdits;
      pendingImportedAt.current = result.importedAt;
      setPendingIsUsersFile(result.isUsersFile);
      setImportModeOpen(true);
    } else {
      setData(result.data);
      applySeedEdits(result.seedEdits);
      // Fresh load: row ids === original idx in parse result.
      const meta: ImportMeta = {};
      for (const [k, v] of Object.entries(result.importedAt)) meta[Number(k)] = { ...v };
      mergeAndPersistMeta(meta);
      toast.success(`Loaded ${result.data.rows.length} rows from "${result.data.filename}"`);
    }
  }, [data, setData, applySeedEdits, mergeAndPersistMeta]);

  /** Apply user-chosen field overwrites for duplicate-username rows. */
  const applyConflictResolutions = useCallback((resolutions: ConflictResolutions) => {
    if (!data || !pendingParsed.current) return;
    const incoming = pendingParsed.current;
    const seedMap = pendingSeedEdits.current;
    const stamps = pendingImportedAt.current;
    const importIso = new Date().toISOString();

    // Build incoming row by id (use existingRowId from conflicts).
    const incomingByExistingId = new Map<number, { row: AssetRow; idx: number }>();
    for (const c of pendingConflicts) {
      incomingByExistingId.set(c.existingRow.id, { row: c.incomingRow, idx: c.incomingIdx });
    }

    const newImportedAt: ImportMeta = {};
    const newSeedPatch: Record<string, AssetEdits> = {};
    const auditByRow = new Map<number, string[]>();

    const updatedRows = data.rows.map((r) => {
      const fieldsToApply = resolutions.get(r.id);
      const inc = incomingByExistingId.get(r.id);
      if (!fieldsToApply || fieldsToApply.size === 0 || !inc) return r;
      const newRaw = { ...r.raw };
      const incomingSeed = seedMap[String(inc.idx)] ?? {};
      const audit: string[] = [];
      let nextStatus = r.computername; // unused placeholder
      let nextSeed: AssetEdits | undefined;

      for (const field of fieldsToApply) {
        if (field === "Status") {
          const newVal = (incomingSeed.status ?? "") as string;
          const oldVal = "(seed)"; void oldVal;
          nextSeed = { ...(nextSeed ?? { status: "", warrantyUntil: "" }), status: incomingSeed.status ?? "" };
          audit.push(`Status to "${newVal || "(empty)"}"`);
        } else if (field === "Warranty until") {
          nextSeed = { ...(nextSeed ?? { status: "", warrantyUntil: "" }), warrantyUntil: incomingSeed.warrantyUntil ?? "" };
          audit.push(`Warranty until to "${incomingSeed.warrantyUntil || "(empty)"}"`);
        } else if (field === "User Active?") {
          nextSeed = { ...(nextSeed ?? { status: "", warrantyUntil: "" }), userActive: incomingSeed.userActive ?? "" };
          audit.push(`User Active? to "${incomingSeed.userActive || "(empty)"}"`);
        } else if (field === "Skanska computer?") {
          nextSeed = { ...(nextSeed ?? { status: "", warrantyUntil: "" }), skanskaComputer: incomingSeed.skanskaComputer ?? "" };
          audit.push(`Skanska computer? to "${incomingSeed.skanskaComputer || "(empty)"}"`);
        } else {
          const oldVal = newRaw[field] ?? "";
          const newVal = inc.row.raw[field] ?? "";
          newRaw[field] = newVal;
          audit.push(`${field} from "${oldVal || "(empty)"}" to "${newVal}"`);
          if (!newImportedAt[r.id]) newImportedAt[r.id] = {};
          newImportedAt[r.id][field] = importIso;
        }
      }
      void nextStatus;
      if (nextSeed) newSeedPatch[String(r.id)] = nextSeed;
      if (audit.length > 0) auditByRow.set(r.id, audit);

      // Sync mirror props
      const cn = (newRaw["Computername"] ?? r.computername).trim();
      const md = (newRaw["Modell"] ?? r.modell).trim();
      const us = (newRaw["Username"] ?? r.user).trim();
      return { ...r, raw: newRaw, computername: cn, modell: md, user: us };
    });

    setData({ ...data, rows: updatedRows });

    // Append audit comments + merge seed patches
    if (auditByRow.size > 0 || Object.keys(newSeedPatch).length > 0) {
      setEditsState((prev) => {
        const next = { ...prev };
        for (const [rowId, msgs] of auditByRow.entries()) {
          const key = getEditKey(rowId);
          const cur = next[key] ?? { status: "", warrantyUntil: "" };
          const merged = { ...cur, ...(newSeedPatch[String(rowId)] ?? {}) };
          merged.comment = appendComment(cur.comment, `Imported update: ${msgs.join(", ")}`);
          next[key] = merged;
        }
        // Apply seed patches that had no audit (shouldn't happen, but be safe).
        for (const [k, patch] of Object.entries(newSeedPatch)) {
          if (!auditByRow.has(Number(k))) {
            next[k] = { ...(next[k] ?? { status: "", warrantyUntil: "" }), ...patch };
          }
        }
        saveEdits(next);
        return next;
      });
    }
    if (Object.keys(newImportedAt).length > 0) mergeAndPersistMeta(newImportedAt);
  }, [data, setData, mergeAndPersistMeta, pendingConflicts]);

  const handleImportEnrich = useCallback(() => {
    setImportModeOpen(false);
    if (pendingParsed.current && data) {
      const incoming = pendingParsed.current;
      // Detect username conflicts first.
      const { conflicts, nonConflicting } = detectUsernameConflicts(
        data, incoming, pendingSeedEdits.current, edits,
      );
      if (conflicts.length > 0) {
        pendingParsed.current = { ...incoming, rows: nonConflicting.map((n) => n.row) };
        const newSeed: Record<string, AssetEdits> = {};
        const newStamps: Record<number, Record<string, string>> = {};
        nonConflicting.forEach((n, newIdx) => {
          const oldSeed = pendingSeedEdits.current[String(n.incomingIdx)];
          if (oldSeed) newSeed[String(newIdx)] = oldSeed;
          const oldStamps = pendingImportedAt.current[n.incomingIdx];
          if (oldStamps) newStamps[newIdx] = oldStamps;
        });
        pendingSeedEdits.current = newSeed;
        pendingImportedAt.current = newStamps;
        setPendingConflicts(conflicts);
        pendingMode.current = "enrich";
        setConflictOpen(true);
        return;
      }
      const merged = enrichWithUsers(data, incoming);
      setData(merged);
      // Enrich keeps existing row ids; only unmatched incoming rows are appended
      // with new ids starting at maxExistingId + 1. Remap seed edits so any
      // imported Status / Warranty values land on the right rows.
      const maxExistingId = data.rows.reduce((m, r) => Math.max(m, r.id), -1);
      const matchedUserKeys = new Set<string>();
      const byUserExisting = new Map<string, number>();
      const byEmailExisting = new Map<string, number>();
      for (const r of data.rows) {
        if (r.user) byUserExisting.set(r.user.toLowerCase(), r.id);
        const e = (r.raw["Email"] ?? "").toLowerCase();
        if (e) byEmailExisting.set(e, r.id);
      }
      const remappedSeed: Record<string, AssetEdits> = {};
      const idMap = new Map<number, number>();
      let unmatchedCounter = 0;
      incoming.rows.forEach((row, i) => {
        const u = row.user.toLowerCase();
        const e = (row.raw["Email"] ?? "").toLowerCase();
        const matchId: number | null =
          (u ? byUserExisting.get(u) : undefined) ??
          (e ? byEmailExisting.get(e) : undefined) ??
          null;
        let assignedId: number;
        if (matchId !== null && !matchedUserKeys.has(String(matchId))) {
          matchedUserKeys.add(String(matchId));
          assignedId = matchId;
        } else {
          assignedId = maxExistingId + 1 + unmatchedCounter;
          unmatchedCounter++;
        }
        idMap.set(i, assignedId);
        const seed = pendingSeedEdits.current[String(i)];
        if (seed) remappedSeed[String(assignedId)] = seed;
      });
      applySeedEdits(remappedSeed);
      mergeAndPersistMeta(remapImportedAt(incoming.rows.length, (i) => idMap.get(i) ?? null));
      toast.success(`Enriched users — total rows: ${merged.rows.length}`);
      pendingParsed.current = null;
      pendingSeedEdits.current = {};
      pendingImportedAt.current = {};
      setPendingIsUsersFile(false);
    }
  }, [data, edits, setData, applySeedEdits, mergeAndPersistMeta, remapImportedAt]);

  const handleImportReplace = useCallback(() => {
    setImportModeOpen(false);
    if (pendingParsed.current) {
      setData(pendingParsed.current);
      applySeedEdits(pendingSeedEdits.current);
      // Replace: row ids === original idx
      const meta: ImportMeta = {};
      for (const [k, v] of Object.entries(pendingImportedAt.current)) meta[Number(k)] = { ...v };
      // Replace clobbers prior data, so reset rather than merge.
      saveImportMeta(meta);
      setImportMeta(meta);
      toast.success(`Replaced with ${pendingParsed.current.rows.length} rows`);
      pendingParsed.current = null;
      pendingSeedEdits.current = {};
      pendingImportedAt.current = {};
    }
  }, [setData, applySeedEdits]);

  const handleImportAdd = useCallback(() => {
    setImportModeOpen(false);
    if (pendingParsed.current && data) {
      const incoming = pendingParsed.current;
      // Detect username conflicts first.
      const { conflicts, nonConflicting } = detectUsernameConflicts(
        data, incoming, pendingSeedEdits.current, edits,
      );
      if (conflicts.length > 0) {
        // Stash filtered incoming for the post-conflict step.
        pendingParsed.current = { ...incoming, rows: nonConflicting.map((n) => n.row) };
        // Remap seed edits to the filtered incoming list (re-index to 0..N).
        const newSeed: Record<string, AssetEdits> = {};
        const newStamps: Record<number, Record<string, string>> = {};
        nonConflicting.forEach((n, newIdx) => {
          const oldSeed = pendingSeedEdits.current[String(n.incomingIdx)];
          if (oldSeed) newSeed[String(newIdx)] = oldSeed;
          const oldStamps = pendingImportedAt.current[n.incomingIdx];
          if (oldStamps) newStamps[newIdx] = oldStamps;
        });
        pendingSeedEdits.current = newSeed;
        pendingImportedAt.current = newStamps;
        setPendingConflicts(conflicts);
        pendingMode.current = "add";
        setConflictOpen(true);
        return;
      }
      // No conflicts — proceed with merge as before.
      const merged = mergeData(data, incoming);
      setData(merged);
      const maxExistingId = data.rows.reduce((m, r) => Math.max(m, r.id), -1);
      const remappedSeed: Record<string, AssetEdits> = {};
      for (const [oldKey, seed] of Object.entries(pendingSeedEdits.current)) {
        const oldIdx = Number(oldKey);
        if (Number.isFinite(oldIdx)) {
          remappedSeed[String(maxExistingId + 1 + oldIdx)] = seed;
        }
      }
      applySeedEdits(remappedSeed);
      mergeAndPersistMeta(remapImportedAt(incoming.rows.length, (i) => maxExistingId + 1 + i));
      toast.success(`Added ${incoming.rows.length} rows (total: ${merged.rows.length})`);
      pendingParsed.current = null;
      pendingSeedEdits.current = {};
      pendingImportedAt.current = {};
    }
  }, [data, edits, setData, applySeedEdits, mergeAndPersistMeta, remapImportedAt]);

  const handleConflictApply = useCallback((resolutions: ConflictResolutions) => {
    setConflictOpen(false);
    applyConflictResolutions(resolutions);
    // Continue with non-conflicting rows via the original mode flow.
    if (data && pendingParsed.current && pendingParsed.current.rows.length > 0) {
      const incoming = pendingParsed.current;
      if (pendingMode.current === "enrich") {
        const merged = enrichWithUsers(data, incoming);
        setData(merged);
        const maxExistingId = data.rows.reduce((m, r) => Math.max(m, r.id), -1);
        const remappedSeed: Record<string, AssetEdits> = {};
        incoming.rows.forEach((_row, i) => {
          const seed = pendingSeedEdits.current[String(i)];
          if (seed) remappedSeed[String(maxExistingId + 1 + i)] = seed;
        });
        applySeedEdits(remappedSeed);
        mergeAndPersistMeta(remapImportedAt(incoming.rows.length, (i) => maxExistingId + 1 + i));
        toast.success(`Resolved conflicts and enriched — total rows: ${merged.rows.length}`);
      } else {
        const merged = mergeData(data, incoming);
        setData(merged);
        const maxExistingId = data.rows.reduce((m, r) => Math.max(m, r.id), -1);
        const remappedSeed: Record<string, AssetEdits> = {};
        for (const [oldKey, seed] of Object.entries(pendingSeedEdits.current)) {
          const oldIdx = Number(oldKey);
          if (Number.isFinite(oldIdx)) remappedSeed[String(maxExistingId + 1 + oldIdx)] = seed;
        }
        applySeedEdits(remappedSeed);
        mergeAndPersistMeta(remapImportedAt(incoming.rows.length, (i) => maxExistingId + 1 + i));
        toast.success(`Resolved conflicts and added ${incoming.rows.length} new rows`);
      }
    } else {
      toast.success("Resolved duplicate-username conflicts.");
    }
    pendingParsed.current = null;
    pendingSeedEdits.current = {};
    pendingImportedAt.current = {};
    setPendingConflicts([]);
  }, [data, setData, applySeedEdits, mergeAndPersistMeta, remapImportedAt, applyConflictResolutions]);

  const handleConflictCancel = useCallback(() => {
    setConflictOpen(false);
    setPendingConflicts([]);
    pendingParsed.current = null;
    pendingSeedEdits.current = {};
    pendingImportedAt.current = {};
    toast.info("Import cancelled.");
  }, []);

  // ─── Multi-asset import resolution ──────────────────────────────────────
  const handleMultiAssetApply = useCallback((resolutions: MultiAssetResolution[]) => {
    setMultiAssetOpen(false);
    if (!data || !pendingParsed.current) {
      setPendingMultiAssetCases([]);
      return;
    }
    const incoming = pendingParsed.current;
    const dropIdx = new Set<number>();
    const replacements: MultiAssetResolution[] = [];
    for (const r of resolutions) {
      if (r.choice === "skip") dropIdx.add(r.incomingIdx);
      else if (r.choice === "replace") {
        dropIdx.add(r.incomingIdx);
        replacements.push(r);
      }
    }

    if (replacements.length > 0) {
      ensureInitials(() => {
        for (const r of replacements) {
          const inc = incoming.rows[r.incomingIdx];
          if (!inc || r.replaceExistingRowId === undefined) continue;
          handleReplaceDevice(
            r.replaceExistingRowId,
            { kind: "new", computername: inc.computername, modell: inc.modell, warrantyUntil: "" },
            (r.oldDestination ?? "In stock") as OldDeviceDestination,
          );
        }
      });
    }

    const keptRows: AssetRow[] = [];
    const keptOriginalIdx: number[] = [];
    incoming.rows.forEach((row, i) => {
      if (!dropIdx.has(i)) {
        keptRows.push(row);
        keptOriginalIdx.push(i);
      }
    });

    if (keptRows.length === 0) {
      pendingParsed.current = null;
      pendingSeedEdits.current = {};
      pendingImportedAt.current = {};
      setPendingMultiAssetCases([]);
      toast.success("Import resolved.");
      return;
    }

    const newSeed: Record<string, AssetEdits> = {};
    const newStamps: Record<number, Record<string, string>> = {};
    keptOriginalIdx.forEach((origIdx, newIdx) => {
      const s = pendingSeedEdits.current[String(origIdx)];
      if (s) newSeed[String(newIdx)] = s;
      const st = pendingImportedAt.current[origIdx];
      if (st) newStamps[newIdx] = st;
    });
    pendingSeedEdits.current = newSeed;
    pendingImportedAt.current = newStamps;

    const filtered: AssetData = { ...incoming, rows: keptRows };
    const merged = mergeData(data, filtered);
    setData(merged);
    const maxExistingId = data.rows.reduce((m, r) => Math.max(m, r.id), -1);
    const remappedSeed: Record<string, AssetEdits> = {};
    for (const [oldKey, seed] of Object.entries(pendingSeedEdits.current)) {
      const oldIdx = Number(oldKey);
      if (Number.isFinite(oldIdx)) remappedSeed[String(maxExistingId + 1 + oldIdx)] = seed;
    }
    applySeedEdits(remappedSeed);
    mergeAndPersistMeta(remapImportedAt(filtered.rows.length, (i) => maxExistingId + 1 + i));
    toast.success(`Added ${filtered.rows.length} rows; resolved ${replacements.length} replacement${replacements.length === 1 ? "" : "s"}.`);

    pendingParsed.current = null;
    pendingSeedEdits.current = {};
    pendingImportedAt.current = {};
    setPendingMultiAssetCases([]);
  }, [data, setData, ensureInitials, applySeedEdits, mergeAndPersistMeta, remapImportedAt, handleReplaceDevice]);

  const handleMultiAssetCancel = useCallback(() => {
    setMultiAssetOpen(false);
    setPendingMultiAssetCases([]);
    pendingParsed.current = null;
    pendingSeedEdits.current = {};
    pendingImportedAt.current = {};
    toast.info("Import cancelled.");
  }, []);




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

  const handleReplaceDevice = useCallback(
    (rowId: number, source: ReplaceSource, oldDestination: OldDeviceDestination) => {
      if (!data) return;
      ensureInitials(() => {
        const target = data.rows.find((r) => r.id === rowId);
        if (!target) return;
        const oldUser = target.user;
        const oldComputername = target.computername;
        const oldModell = target.modell;
        const nowIso = new Date().toISOString();

        // Build the "old asset" row: keep its computername/modell, clear user, set status.
        const oldStatus: LifecycleState = oldDestination;
        let oldRow: AssetRow = {
          ...target,
          user: "",
          raw: { ...target.raw, Username: "" },
        };
        if (oldComputername.trim()) {
          oldRow = recordLifecycleEvent(oldRow, {
            from: "Deployed at user",
            to: oldStatus,
            prevUser: oldUser,
            note: source.kind === "new"
              ? `Replaced with new device ${source.computername}`
              : `Replaced with in-stock device`,
            at: nowIso,
          });
        }

        let updatedRows = data.rows.map((r) => (r.id === rowId ? oldRow : r));

        // Build / pick the "new asset" row.
        let newAssetId: number;
        if (source.kind === "new") {
          newAssetId = Math.max(...updatedRows.map((r) => r.id), 0) + 1;
          let newRow: AssetRow = {
            id: newAssetId,
            computername: source.computername,
            modell: source.modell,
            user: oldUser,
            raw: {
              Computername: source.computername,
              Modell: source.modell,
              Username: oldUser,
            },
            exceptions: [],
            sourceFile: "Replace device",
            assetKind: "computer",
          };
          newRow = recordLifecycleEvent(newRow, {
            to: "Deployed at user",
            user: oldUser,
            note: `New device replacing ${oldComputername || "(none)"}`,
            at: nowIso,
          });
          updatedRows = [...updatedRows, newRow];
        } else {
          newAssetId = source.sourceRowId;
          updatedRows = updatedRows.map((r) => {
            if (r.id !== newAssetId) return r;
            const reassigned = {
              ...r,
              user: oldUser,
              raw: { ...r.raw, Username: oldUser },
            };
            return recordLifecycleEvent(reassigned, {
              from: "In stock",
              to: "Deployed at user",
              user: oldUser,
              note: `Re-assigned from stock to ${oldUser || "(no user)"}`,
              at: nowIso,
            });
          });
        }

        setData({ ...data, rows: updatedRows });

        // Update edits: old row gets new status; new row gets Deployed status (+ warranty if provided).
        setEditsState((prev) => {
          const next = { ...prev };
          if (oldComputername.trim()) {
            const oldKey = getEditKey(rowId);
            const cur = next[oldKey] ?? { status: "", warrantyUntil: "" };
            next[oldKey] = {
              ...cur,
              status: oldStatus,
              comment: appendComment(
                cur.comment,
                `Device returned: user "${oldUser || "(none)"}" unassigned, status → "${oldStatus}"`,
              ),
            };
          }
          const newKey = getEditKey(newAssetId);
          const curNew = next[newKey] ?? { status: "", warrantyUntil: "" };
          const newWarranty = source.kind === "new" && source.warrantyUntil
            ? source.warrantyUntil
            : curNew.warrantyUntil;
          next[newKey] = {
            ...curNew,
            status: "Deployed at user",
            warrantyUntil: newWarranty,
            comment: appendComment(
              curNew.comment,
              source.kind === "new"
                ? `Device deployed to "${oldUser || "(no user)"}" (replacing ${oldComputername || "(none)"})`
                : `Device re-deployed from stock to "${oldUser || "(no user)"}"`,
            ),
          };
          saveEdits(next);
          return next;
        });

        toast.success(
          source.kind === "new"
            ? `Replaced device for "${oldUser || "user"}" → ${source.computername}`
            : `Re-assigned in-stock device to "${oldUser || "user"}"`,
        );
      });
    },
    [data, setData, ensureInitials],
  );

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
    setManagerFilter([]);
    setStatusFilter(defaultStatusFilter);
    setExceptionsOnly(false);
    setExcludeInactive(false);
    setSkanskaFilter("all");
    setConfirmClear(false);
    toast.success("Local data cleared.");
  }, [setData, defaultStatusFilter]);

  const clearAllFilters = useCallback(() => {
    setSearch("");
    setModelFilter([]);
    setUserFilter([]);
    setManagerFilter([]);
    setSourceFilter([]);
    setStatusFilter([]);
    setExceptionsOnly(false);
    setExcludeInactive(false);
    setSkanskaFilter("all");
  }, []);

  /** Restore every filter to its app-level default (used by the Reset filters button). */
  const resetFiltersToDefaults = useCallback(() => {
    setSearch("");
    setModelFilter([]);
    setUserFilter([]);
    setManagerFilter([]);
    setSourceFilter([]);
    setStatusFilter(defaultStatusFilter);
    setExceptionsOnly(false);
    setExcludeInactive(false);
    setSkanskaFilter("all");
    toast.success("Filters reset to defaults.");
  }, [defaultStatusFilter]);

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

  const managers = useMemo(
    () => [...new Set(rows.map((r) => (r.raw["Manager"] ?? "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [rows],
  );

  const hasManualOrEdits = useMemo(() => {
    const hasEditsVal = Object.values(edits).some((e) => e.status !== "" || e.warrantyUntil !== "");
    const hasManual = rows.some((r) => r.sourceFile === "Manual entry");
    return hasEditsVal || hasManual;
  }, [edits, rows]);

  const filtered = useMemo(() => {
    const exOf = (r: AssetRow) => effectiveExceptions(r, edits[getEditKey(r.id)]);
    let result = rows;
    if (activeCard === "exceptions") result = result.filter((r) => exOf(r).length > 0);
    else if (activeCard === "users") result = result.filter((r) => r.user !== "");
    else if (activeCard === "models") result = result.filter((r) => r.modell !== "");
    else if (activeCard === "stale") {
      result = result.filter((r) => {
        const v = r.raw["Last logon date"] ?? "";
        if (!v) return false;
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
        if (!m) return false;
        const then = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return Math.floor((Date.now() - then) / 86_400_000) > staleThreshold;
      });
    }
    if (exceptionsOnly && activeCard !== "exceptions") result = result.filter((r) => exOf(r).length > 0);
    if (excludeInactive) {
      result = result.filter((r) => effectiveUserActive(edits[getEditKey(r.id)]) !== "no");
    }
    if (skanskaFilter !== "all") {
      result = result.filter((r) => {
        const eff = effectiveSkanska(edits[getEditKey(r.id)], r.computername);
        if (skanskaFilter === "skanska") return eff === "yes" || eff === "";
        return eff === "no";
      });
    }
    if (modelFilter.length > 0) result = result.filter((r) => modelFilter.includes(r.modell));
    if (userFilter.length > 0) result = result.filter((r) => userFilter.includes(r.user));
    if (managerFilter.length > 0) result = result.filter((r) => managerFilter.includes((r.raw["Manager"] ?? "").trim()));
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
          va = exOf(a).join(", ");
          vb = exOf(b).join(", ");
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
  }, [rows, columns, search, modelFilter, userFilter, managerFilter, sourceFilter, statusFilter, exceptionsOnly, excludeInactive, skanskaFilter, activeCard, sort, edits, staleThreshold]);

  const activeChips = useMemo<FilterChip[]>(() => {
    const out: FilterChip[] = [];
    for (const v of modelFilter) {
      out.push({ key: `model:${v}`, group: "Model", value: v, onRemove: () => setModelFilter((p) => p.filter((x) => x !== v)) });
    }
    for (const v of userFilter) {
      out.push({ key: `user:${v}`, group: "User", value: v, onRemove: () => setUserFilter((p) => p.filter((x) => x !== v)) });
    }
    for (const v of sourceFilter) {
      out.push({ key: `source:${v}`, group: "Source", value: v, onRemove: () => setSourceFilter((p) => p.filter((x) => x !== v)) });
    }
    // Status defaults to "all except Sent back to broker" — only show chips when the user
    // diverges from that default, otherwise the bar would always be cluttered.
    const statusSorted = [...statusFilter].sort();
    const defaultSorted = [...defaultStatusFilter].sort();
    const isStatusDefault =
      statusSorted.length === defaultSorted.length &&
      statusSorted.every((v, i) => v === defaultSorted[i]);
    if (!isStatusDefault) {
      for (const v of statusFilter) {
        const label = v === STATUS_NONE_TOKEN ? "No status set" : v;
        out.push({
          key: `status:${v}`,
          group: "Status",
          value: label,
          onRemove: () => setStatusFilter((p) => p.filter((x) => x !== v)),
        });
      }
    }
    if (search.trim()) {
      out.push({ key: "search", group: "Search", value: search.trim(), onRemove: () => setSearch("") });
    }
    if (exceptionsOnly) {
      out.push({ key: "exceptions", group: "Show", value: "Exceptions only", onRemove: () => setExceptionsOnly(false) });
    }
    for (const v of managerFilter) {
      out.push({ key: `manager:${v}`, group: "Manager", value: v, onRemove: () => setManagerFilter((p) => p.filter((x) => x !== v)) });
    }
    if (excludeInactive) {
      out.push({ key: "exclude-inactive", group: "Hide", value: "Inactive users", onRemove: () => setExcludeInactive(false) });
    }
    if (skanskaFilter !== "all") {
      const label = skanskaFilter === "skanska" ? "Skanska only" : "Non-Skanska only";
      out.push({ key: `skanska:${skanskaFilter}`, group: "Devices", value: label, onRemove: () => setSkanskaFilter("all") });
    }
    return out;
  }, [modelFilter, userFilter, sourceFilter, statusFilter, defaultStatusFilter, search, exceptionsOnly, managerFilter, excludeInactive, skanskaFilter]);

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <header className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold tracking-tight flex items-baseline gap-2">
                HQ Asset Overview
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/documentation/changelog"
                      className="text-xs font-normal font-mono text-muted-foreground hover:text-foreground transition-colors"
                    >
                      v{APP_VERSION}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>View changelog</TooltipContent>
                </Tooltip>
              </h1>
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
                  <Button size="sm" variant="ghost" asChild className="relative">
                    <Link to="/documentation">
                      <BookOpen className="h-4 w-4 mr-1" /> Documentation
                      {hasUnseenVersion && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-chart-2 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider text-background">
                          New
                        </span>
                      )}
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {hasUnseenVersion ? `New in v${APP_VERSION} — open to view changelog` : "Technical documentation & user guide"}
                </TooltipContent>
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
            <KpiCards
              rows={rows}
              edits={edits}
              staleThreshold={staleThreshold}
              activeCard={activeCard}
              onCardClick={handleCardClick}
            />

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
                  managerFilter={managerFilter} onManagerFilter={setManagerFilter}
                  sourceFilter={sourceFilter} onSourceFilter={setSourceFilter}
                  statusFilter={statusFilter} onStatusFilter={setStatusFilter}
                  exceptionsOnly={exceptionsOnly} onExceptionsOnly={setExceptionsOnly}
                  excludeInactive={excludeInactive} onExcludeInactive={setExcludeInactive}
                  skanskaFilter={skanskaFilter} onSkanskaFilter={setSkanskaFilter}
                  staleThreshold={staleThreshold} onStaleThreshold={setStaleThreshold}
                  models={models} users={users} managers={managers} sources={sources}
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
                  onResetFilters={resetFiltersToDefaults}
                />
                <ActiveFilterChips chips={activeChips} onClearAll={clearAllFilters} />
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
                    {selectedIds.size === 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReplaceOpen(true)}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Replace device
                      </Button>
                    )}
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
                  importedAt={importMeta}
                  staleThreshold={staleThreshold}
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

        <ReplaceDeviceDialog
          open={replaceOpen}
          onOpenChange={setReplaceOpen}
          row={
            selectedIds.size === 1
              ? rows.find((r) => r.id === Array.from(selectedIds)[0]) ?? null
              : null
          }
          allRows={rows}
          edits={edits}
          onReplace={handleReplaceDevice}
        />

        <MultiAssetImportDialog
          open={multiAssetOpen}
          cases={pendingMultiAssetCases}
          onApply={handleMultiAssetApply}
          onCancel={handleMultiAssetCancel}
        />

        <AssetHistoryDrawer
          open={historyDrawerOpen}
          onOpenChange={setHistoryDrawerOpen}
          row={historyDrawerRow}
          edits={edits}
          importedAt={importMeta}
          onPickUser={(u) => {
            setUserFilter([u]);
            setHistoryDrawerOpen(false);
            toast.success(`Filtered by user "${u}"`);
          }}
        />

        <UserHistoryDrawer
          open={userDrawerOpen}
          onOpenChange={setUserDrawerOpen}
          userKey={userDrawerKey}
          userDisplay={userDrawerDisplay}
          rows={rows}
          edits={edits}
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

        <ImportConflictDialog
          open={conflictOpen}
          conflicts={pendingConflicts}
          onApply={handleConflictApply}
          onCancel={handleConflictCancel}
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

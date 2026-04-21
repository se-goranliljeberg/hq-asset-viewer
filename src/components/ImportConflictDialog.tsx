import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { UsernameConflict } from "@/lib/excel-parser";

export type ConflictResolutions = Map<number /* existingRowId */, Set<string /* fieldName */>>;

interface Props {
  open: boolean;
  conflicts: UsernameConflict[];
  onApply: (resolutions: ConflictResolutions) => void;
  onCancel: () => void;
}

/**
 * Lets the user choose which incoming fields to overwrite for each duplicate
 * username. Defaults to nothing checked (keep existing).
 *
 * Provides three batch helpers:
 *   • "Replace all data"        — overwrite every diff for every row.
 *   • "Apply [field] for all"   — toggle a single field across every conflict
 *                                 in one click (per-field batch).
 *   • Per-row "Select all/Skip all" buttons.
 *
 * Empty existing values are auto-filled upstream (in detectUsernameConflicts)
 * and never appear here — this dialog only surfaces *real* conflicts.
 */
export function ImportConflictDialog({ open, conflicts, onApply, onCancel }: Props) {
  const [picks, setPicks] = useState<ConflictResolutions>(new Map());

  useEffect(() => {
    if (open) setPicks(new Map());
  }, [open, conflicts]);

  const totalDiffs = useMemo(
    () => conflicts.reduce((s, c) => s + c.diffs.length, 0),
    [conflicts],
  );

  const totalChosen = useMemo(() => {
    let n = 0;
    for (const set of picks.values()) n += set.size;
    return n;
  }, [picks]);

  // Distinct field names that appear across at least one conflict — drives
  // the per-field batch toggles at the top.
  const fieldsAcrossConflicts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of conflicts) {
      for (const d of c.diffs) {
        counts.set(d.field, (counts.get(d.field) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [conflicts]);

  // For a given field, count rows where it is currently checked vs total rows
  // where it appears as a diff — drives the batch toggle's "all selected" state.
  const fieldSelectionState = useMemo(() => {
    const map = new Map<string, { selected: number; total: number }>();
    for (const [field, total] of fieldsAcrossConflicts) {
      let selected = 0;
      for (const c of conflicts) {
        const set = picks.get(c.existingRow.id);
        if (!set) continue;
        if (c.diffs.some((d) => d.field === field) && set.has(field)) selected++;
      }
      map.set(field, { selected, total });
    }
    return map;
  }, [picks, conflicts, fieldsAcrossConflicts]);

  const toggleField = (rowId: number, field: string) => {
    setPicks((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(rowId) ?? []);
      if (set.has(field)) set.delete(field);
      else set.add(field);
      if (set.size === 0) next.delete(rowId);
      else next.set(rowId, set);
      return next;
    });
  };

  const selectAllForRow = (conflict: UsernameConflict) => {
    setPicks((prev) => {
      const next = new Map(prev);
      next.set(conflict.existingRow.id, new Set(conflict.diffs.map((d) => d.field)));
      return next;
    });
  };

  const skipAllForRow = (conflict: UsernameConflict) => {
    setPicks((prev) => {
      const next = new Map(prev);
      next.delete(conflict.existingRow.id);
      return next;
    });
  };

  const selectAllGlobal = () => {
    const next: ConflictResolutions = new Map();
    for (const c of conflicts) {
      next.set(c.existingRow.id, new Set(c.diffs.map((d) => d.field)));
    }
    setPicks(next);
  };

  const skipAllGlobal = () => setPicks(new Map());

  /** Toggle a single field across every conflict that has it as a diff. */
  const toggleFieldForAll = (field: string) => {
    const state = fieldSelectionState.get(field);
    const turnOn = !state || state.selected < state.total;
    setPicks((prev) => {
      const next = new Map(prev);
      for (const c of conflicts) {
        if (!c.diffs.some((d) => d.field === field)) continue;
        const set = new Set(next.get(c.existingRow.id) ?? []);
        if (turnOn) set.add(field);
        else set.delete(field);
        if (set.size === 0) next.delete(c.existingRow.id);
        else next.set(c.existingRow.id, set);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <DialogTitle>Resolve duplicate usernames</DialogTitle>
          <DialogDescription>
            {conflicts.length} user{conflicts.length === 1 ? "" : "s"} from the import already
            exist with conflicting values. Pick what to overwrite — anything left unchecked keeps
            the existing value. Empty existing values are filled in automatically.
          </DialogDescription>
        </DialogHeader>

        {/* Sticky toolbar: global + per-field batch controls */}
        <div className="px-6 py-3 border-b border-border space-y-2 bg-muted/30">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">
              {totalChosen} of {totalDiffs} field{totalDiffs === 1 ? "" : "s"} selected
            </span>
            <div className="ml-auto flex flex-wrap gap-1">
              <Button size="sm" variant="default" onClick={selectAllGlobal}>
                Replace all data
              </Button>
              <Button size="sm" variant="outline" onClick={skipAllGlobal}>
                Skip all
              </Button>
            </div>
          </div>
          {fieldsAcrossConflicts.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Apply field for all duplicates
              </div>
              <div className="flex flex-wrap gap-1">
                {fieldsAcrossConflicts.map(([field, count]) => {
                  const st = fieldSelectionState.get(field) ?? { selected: 0, total: 0 };
                  const allOn = st.selected === st.total && st.total > 0;
                  return (
                    <Button
                      key={field}
                      size="sm"
                      variant={allOn ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => toggleFieldForAll(field)}
                      title={`${st.selected}/${st.total} selected`}
                    >
                      {field}
                      <Badge
                        variant="secondary"
                        className="ml-1.5 h-4 px-1 text-[10px] leading-none"
                      >
                        {st.selected}/{count}
                      </Badge>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable conflict list — uses native overflow so nested scroll works */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
          <div className="space-y-4">
            {conflicts.map((c) => {
              const selectedSet = picks.get(c.existingRow.id) ?? new Set<string>();
              return (
                <div key={c.existingRow.id} className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {c.existingRow.user || "(no user)"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        Existing: {c.existingRow.computername || "—"} · {c.existingRow.modell || "—"}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" onClick={() => selectAllForRow(c)}>
                        Select all
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => skipAllForRow(c)}>
                        Skip all
                      </Button>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {c.diffs.map((d) => {
                      const checked = selectedSet.has(d.field);
                      return (
                        <label
                          key={d.field}
                          className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleField(c.existingRow.id, d.field)}
                          />
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground truncate">
                            {d.field}
                          </span>
                          <span className="text-xs truncate" title={d.oldVal || "(empty)"}>
                            <span className="text-muted-foreground">old: </span>
                            <span className="line-through opacity-70">{d.oldVal || "—"}</span>
                          </span>
                          <span className="text-xs truncate" title={d.newVal}>
                            <span className="text-muted-foreground">new: </span>
                            <span className={checked ? "font-semibold text-primary" : ""}>{d.newVal}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onCancel}>Cancel import</Button>
          <Button onClick={() => onApply(picks)}>
            Apply {totalChosen > 0 ? `(${totalChosen} change${totalChosen === 1 ? "" : "s"})` : "& skip duplicates"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
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
 * username. Default = nothing checked (keep existing).
 */
export function ImportConflictDialog({ open, conflicts, onApply, onCancel }: Props) {
  // state: rowId -> Set of fields chosen to overwrite.
  const [picks, setPicks] = useState<ConflictResolutions>(new Map());

  // Reset state on each open.
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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Resolve duplicate usernames</DialogTitle>
          <DialogDescription>
            {conflicts.length} user{conflicts.length === 1 ? "" : "s"} from the import already exist.
            Pick the fields you want to overwrite — anything left unchecked keeps the existing value.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border pb-2 text-xs">
          <span className="text-muted-foreground">
            {totalChosen} of {totalDiffs} field{totalDiffs === 1 ? "" : "s"} selected
          </span>
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={selectAllGlobal}>Select all</Button>
            <Button size="sm" variant="ghost" onClick={skipAllGlobal}>Skip all</Button>
          </div>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 py-2">
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
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel import</Button>
          <Button onClick={() => onApply(picks)}>
            Apply {totalChosen > 0 ? `(${totalChosen} change${totalChosen === 1 ? "" : "s"})` : "& skip duplicates"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

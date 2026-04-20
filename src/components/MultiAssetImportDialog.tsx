import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { MultiAssetIncoming } from "@/lib/excel-parser";

export type MultiAssetChoice = "add" | "replace" | "skip";

export interface MultiAssetResolution {
  /** Original incoming-row index. */
  incomingIdx: number;
  choice: MultiAssetChoice;
  /** Existing row to replace when choice === "replace". */
  replaceExistingRowId?: number;
  /** Where to send the old device when replacing. */
  oldDestination?: "In stock" | "Sent back to broker";
}

interface Props {
  open: boolean;
  cases: MultiAssetIncoming[];
  onApply: (resolutions: MultiAssetResolution[]) => void;
  onCancel: () => void;
}

/**
 * Per-incoming-row decision panel for users that already own a different
 * computer in the existing dataset. Default is "Add as additional device".
 */
export function MultiAssetImportDialog({ open, cases, onApply, onCancel }: Props) {
  const [decisions, setDecisions] = useState<Map<number, MultiAssetResolution>>(new Map());

  useEffect(() => {
    if (open) {
      const init = new Map<number, MultiAssetResolution>();
      for (const c of cases) {
        init.set(c.incomingIdx, {
          incomingIdx: c.incomingIdx,
          choice: "add",
          oldDestination: "In stock",
        });
      }
      setDecisions(init);
    }
  }, [open, cases]);

  const setChoice = (incomingIdx: number, choice: MultiAssetChoice) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      const cur = next.get(incomingIdx) ?? { incomingIdx, choice: "add" };
      const target = cases.find((c) => c.incomingIdx === incomingIdx);
      next.set(incomingIdx, {
        ...cur,
        choice,
        oldDestination: cur.oldDestination ?? "In stock",
        replaceExistingRowId:
          choice === "replace"
            ? cur.replaceExistingRowId ?? target?.existingRows[0]?.id
            : undefined,
      });
      return next;
    });
  };

  const setReplaceTarget = (incomingIdx: number, rowId: number) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      const cur = next.get(incomingIdx) ?? { incomingIdx, choice: "add" };
      next.set(incomingIdx, { ...cur, replaceExistingRowId: rowId });
      return next;
    });
  };

  const setOldDestination = (incomingIdx: number, dest: "In stock" | "Sent back to broker") => {
    setDecisions((prev) => {
      const next = new Map(prev);
      const cur = next.get(incomingIdx) ?? { incomingIdx, choice: "add" };
      next.set(incomingIdx, { ...cur, oldDestination: dest });
      return next;
    });
  };

  const summary = useMemo(() => {
    let add = 0, rep = 0, skip = 0;
    for (const d of decisions.values()) {
      if (d.choice === "add") add++;
      else if (d.choice === "replace") rep++;
      else skip++;
    }
    return { add, rep, skip };
  }, [decisions]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Users with multiple computers</DialogTitle>
          <DialogDescription>
            {cases.length} incoming device{cases.length === 1 ? "" : "s"} would give a user a new
            computer alongside one they already have. Pick what to do for each.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border pb-2 text-xs">
          <Badge variant="outline" className="text-[10px]">+{summary.add} add</Badge>
          <Badge variant="outline" className="text-[10px]">↻{summary.rep} replace</Badge>
          <Badge variant="outline" className="text-[10px]">×{summary.skip} skip</Badge>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-3 py-2">
            {cases.map((c) => {
              const d = decisions.get(c.incomingIdx);
              const choice = d?.choice ?? "add";
              return (
                <div key={c.incomingIdx} className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border px-3 py-2">
                    <div className="text-sm font-medium truncate">{c.user}</div>
                    <div className="text-xs text-muted-foreground">
                      Already has: {c.existingRows.map((r) => r.computername).join(", ")}
                    </div>
                    <div className="text-xs mt-1">
                      Incoming: <span className="font-mono">{c.incomingRow.computername}</span>
                      {c.incomingRow.modell ? ` · ${c.incomingRow.modell}` : ""}
                    </div>
                  </div>
                  <div className="px-3 py-2 space-y-2">
                    <div className="flex gap-2 flex-wrap">
                      {(["add", "replace", "skip"] as MultiAssetChoice[]).map((opt) => (
                        <Button
                          key={opt}
                          size="sm"
                          variant={choice === opt ? "default" : "outline"}
                          onClick={() => setChoice(c.incomingIdx, opt)}
                        >
                          {opt === "add" && "Add as additional"}
                          {opt === "replace" && "Replace"}
                          {opt === "skip" && "Skip"}
                        </Button>
                      ))}
                    </div>
                    {choice === "replace" && (
                      <div className="grid gap-2 sm:grid-cols-2 pt-1">
                        <div className="grid gap-1">
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Replace which device?
                          </span>
                          <Select
                            value={String(d?.replaceExistingRowId ?? c.existingRows[0].id)}
                            onValueChange={(v) => setReplaceTarget(c.incomingIdx, Number(v))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {c.existingRows.map((r) => (
                                <SelectItem key={r.id} value={String(r.id)}>
                                  {r.computername} {r.modell ? `· ${r.modell}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1">
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Send old device to
                          </span>
                          <Select
                            value={d?.oldDestination ?? "In stock"}
                            onValueChange={(v) => setOldDestination(c.incomingIdx, v as "In stock" | "Sent back to broker")}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="In stock">In stock</SelectItem>
                              <SelectItem value="Sent back to broker">Sent back to broker</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel import</Button>
          <Button onClick={() => onApply(Array.from(decisions.values()))}>
            Apply {decisions.size > 0 ? `(${decisions.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useMemo } from "react";
import type { AssetRow } from "@/lib/asset-types";
import type { AssetEdits } from "@/lib/asset-edits";
import { getEditKey, effectiveUserActive } from "@/lib/asset-edits";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Monitor, History, User } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lowercased username key. */
  userKey: string | null;
  /** Display spelling for the user. */
  userDisplay: string;
  rows: AssetRow[];
  edits: Record<string, AssetEdits>;
}

interface DeviceSummary {
  row: AssetRow;
  current: boolean;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function UserHistoryDrawer({ open, onOpenChange, userKey, userDisplay, rows, edits }: Props) {
  const { current, past, events } = useMemo(() => {
    if (!userKey) return { current: [], past: [], events: [] as Array<{ row: AssetRow; ev: NonNullable<AssetRow["history"]>[number] }> };
    const cur: DeviceSummary[] = [];
    const pst: DeviceSummary[] = [];
    const evs: Array<{ row: AssetRow; ev: NonNullable<AssetRow["history"]>[number] }> = [];

    for (const r of rows) {
      const isCurrent = (r.user ?? "").trim().toLowerCase() === userKey;
      const wasOwner = (r.previousUsers ?? []).some((u) => u.toLowerCase() === userKey);
      const historyMentions = (r.history ?? []).some(
        (ev) =>
          (ev.user ?? "").toLowerCase() === userKey ||
          (ev.prevUser ?? "").toLowerCase() === userKey,
      );
      if (isCurrent && r.computername.trim()) {
        cur.push({ row: r, current: true });
      } else if ((wasOwner || historyMentions) && r.computername.trim()) {
        pst.push({ row: r, current: false });
      }
      if (historyMentions) {
        for (const ev of r.history ?? []) {
          if (
            (ev.user ?? "").toLowerCase() === userKey ||
            (ev.prevUser ?? "").toLowerCase() === userKey
          ) {
            evs.push({ row: r, ev });
          }
        }
      }
    }
    evs.sort((a, b) => (a.ev.at < b.ev.at ? 1 : -1));
    return { current: cur, past: pst, events: evs };
  }, [userKey, rows]);

  // Active flag: any current row marks user inactive => inactive.
  const isInactive = useMemo(() => {
    if (!userKey) return false;
    for (const r of rows) {
      if ((r.user ?? "").trim().toLowerCase() !== userKey) continue;
      const e = edits[getEditKey(r.id)];
      if (effectiveUserActive(e) === "no") return true;
    }
    return false;
  }, [rows, edits, userKey]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <User className="h-4 w-4" />
            {userDisplay}
            {isInactive ? (
              <Badge variant="destructive" className="text-[10px]">Inactive</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">Active</Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            User profile — devices and lifecycle events.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Current devices ({current.length})
            </h4>
            {current.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">None assigned.</p>
            ) : (
              <ul className="space-y-1.5">
                {current.map(({ row }) => (
                  <li key={row.id} className="rounded-md border border-border px-3 py-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Monitor className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium">{row.computername}</span>
                    </div>
                    <div className="text-muted-foreground mt-0.5">{row.modell || "(no model)"}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Past devices ({past.length})
            </h4>
            {past.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No prior devices on record.</p>
            ) : (
              <ul className="space-y-1.5">
                {past.map(({ row }) => (
                  <li key={row.id} className="rounded-md border border-border px-3 py-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{row.computername}</span>
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      {row.modell || "(no model)"}
                      {row.user && row.user.toLowerCase() !== userKey ? ` · now with ${row.user}` : " · unassigned"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Separator />

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              Lifecycle events ({events.length})
            </h4>
            <ScrollArea className="max-h-[45vh] pr-2 -mr-2">
              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No lifecycle events recorded for this user.
                </p>
              ) : (
                <ol className="space-y-2">
                  {events.map(({ row, ev }, i) => (
                    <li key={i} className="rounded-md border border-border px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2 text-muted-foreground">
                        <span>{fmtDate(ev.at)}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {row.computername || "(no cn)"}
                        </Badge>
                      </div>
                      <div className="mt-1 text-foreground">
                        {ev.from ? `"${ev.from}"` : "(none)"} → "{ev.to}"
                      </div>
                      {ev.user && (
                        <div className="text-muted-foreground mt-0.5">→ {ev.user}</div>
                      )}
                      {ev.prevUser && (
                        <div className="text-muted-foreground mt-0.5">← {ev.prevUser}</div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </ScrollArea>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

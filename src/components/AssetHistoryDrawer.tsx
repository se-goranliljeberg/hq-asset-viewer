import { useMemo } from "react";
import type { AssetRow, LifecycleEvent } from "@/lib/asset-types";
import type { AssetEdits } from "@/lib/asset-edits";
import { getEditKey } from "@/lib/asset-edits";
import { parseEntries } from "@/lib/comment-log";
import { getImportedAt, type ImportMeta } from "@/lib/import-meta";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Clock, User, Monitor } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: AssetRow | null;
  edits: Record<string, AssetEdits>;
  importedAt: ImportMeta;
  /** Click handler for "filter table to this user" affordance. */
  onPickUser?: (user: string) => void;
}

interface TimelineItem {
  at: string;
  kind: "lifecycle" | "import" | "comment";
  title: string;
  detail?: string;
  by?: string;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function describe(event: LifecycleEvent): string {
  const fromLabel = event.from ? `"${event.from}"` : "(none)";
  let s = `${fromLabel} → "${event.to}"`;
  if (event.user) s += ` · assigned to ${event.user}`;
  if (event.prevUser) s += ` · previously ${event.prevUser}`;
  return s;
}

export function AssetHistoryDrawer({ open, onOpenChange, row, edits, importedAt, onPickUser }: Props) {
  const timeline = useMemo<TimelineItem[]>(() => {
    if (!row) return [];
    const items: TimelineItem[] = [];

    for (const ev of row.history ?? []) {
      items.push({
        at: ev.at,
        kind: "lifecycle",
        title: describe(ev),
        detail: ev.note,
        by: ev.by,
      });
    }

    // Imported-at stamps (earliest one becomes the "Imported on …" entry).
    const stamps = importedAt[row.id];
    if (stamps) {
      const first = Object.values(stamps)
        .filter((v): v is string => typeof v === "string")
        .sort()[0];
      if (first) {
        items.push({
          at: first,
          kind: "import",
          title: `Imported from ${row.sourceFile || "source file"}`,
        });
      }
    }

    // Comment-log entries (best-effort date parse).
    const e = edits[getEditKey(row.id)];
    const entries = parseEntries(e?.comment);
    for (const entry of entries) {
      const dateStr = entry.date ?? "";
      let iso = dateStr;
      // Convert "YYYY-MM-DD HH:MM" → ISO-ish for sorting consistency.
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(dateStr)) {
        iso = dateStr.replace(" ", "T") + ":00";
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        iso = `${dateStr}T00:00:00`;
      }
      items.push({
        at: iso || new Date(0).toISOString(),
        kind: "comment",
        title: entry.field
          ? `${entry.field}: "${entry.from || "(empty)"}" → "${entry.to || "(empty)"}"`
          : entry.change,
        by: entry.initials,
      });
    }

    items.sort((a, b) => (a.at < b.at ? 1 : -1));
    return items;
  }, [row, edits, importedAt]);

  const previousUsers = row?.previousUsers ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            {row?.computername || "(no computername)"}
          </SheetTitle>
          <SheetDescription>
            {row?.modell || "(no model)"} · {row?.sourceFile}
          </SheetDescription>
        </SheetHeader>

        {row && (
          <div className="mt-4 space-y-4">
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Current user
              </h4>
              {row.user ? (
                <Button
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() => onPickUser?.(row.user)}
                >
                  <User className="h-3.5 w-3.5 mr-1" />
                  {row.user}
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground italic">No user assigned</span>
              )}
            </section>

            {previousUsers.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Previous users
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {previousUsers.map((u) => (
                    <Button
                      key={u}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => onPickUser?.(u)}
                    >
                      <User className="h-3 w-3 mr-1" />
                      {u}
                    </Button>
                  ))}
                </div>
              </section>
            )}

            <Separator />

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Timeline ({timeline.length})
              </h4>
              <ScrollArea className="max-h-[55vh] pr-2 -mr-2">
                {timeline.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No history recorded yet.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {timeline.map((item, i) => (
                      <li
                        key={i}
                        className="rounded-md border border-border px-3 py-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2 text-muted-foreground">
                          <span>{fmtDate(item.at)}</span>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {item.kind}
                            </Badge>
                            {item.by && (
                              <span className="rounded bg-primary/15 text-primary px-1.5 py-0.5 text-[10px] font-mono font-semibold">
                                {item.by}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 text-foreground">{item.title}</div>
                        {item.detail && (
                          <div className="mt-1 text-muted-foreground italic">{item.detail}</div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </ScrollArea>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

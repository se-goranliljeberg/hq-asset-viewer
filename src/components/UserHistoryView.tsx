import { useMemo, useState } from "react";
import type { AssetRow } from "@/lib/asset-types";
import type { AssetEdits } from "@/lib/asset-edits";
import { getEditKey, effectiveUserActive } from "@/lib/asset-edits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Search, User, Monitor, History } from "lucide-react";

interface Props {
  rows: AssetRow[];
  edits: Record<string, AssetEdits>;
  onOpenAsset: (row: AssetRow) => void;
}

interface UserSummary {
  key: string;
  display: string;
  current: AssetRow[];
  past: AssetRow[];
  inactive: boolean;
  totalEvents: number;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function UserHistoryView({ rows, edits, onOpenAsset }: Props) {
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const userSummaries = useMemo<UserSummary[]>(() => {
    const map = new Map<string, UserSummary>();

    const ensure = (rawUser: string): UserSummary | null => {
      const key = rawUser.trim().toLowerCase();
      if (!key) return null;
      let s = map.get(key);
      if (!s) {
        s = { key, display: rawUser.trim(), current: [], past: [], inactive: false, totalEvents: 0 };
        map.set(key, s);
      }
      // Prefer the most-cased display.
      if (rawUser.trim().length > s.display.length) s.display = rawUser.trim();
      return s;
    };

    for (const r of rows) {
      // Current owner.
      const cur = ensure(r.user);
      if (cur && r.computername.trim()) cur.current.push(r);
      if (cur) {
        const e = edits[getEditKey(r.id)];
        if (effectiveUserActive(e) === "no") cur.inactive = true;
      }

      // Previous owners.
      for (const u of r.previousUsers ?? []) {
        const past = ensure(u);
        if (past && past.key !== cur?.key && r.computername.trim()) {
          past.past.push(r);
        }
      }

      // History event mentions.
      for (const ev of r.history ?? []) {
        for (const candidate of [ev.user, ev.prevUser]) {
          if (!candidate) continue;
          const s = ensure(candidate);
          if (!s) continue;
          s.totalEvents += 1;
          if (
            s.key !== cur?.key &&
            r.computername.trim() &&
            !s.past.some((p) => p.id === r.id)
          ) {
            s.past.push(r);
          }
        }
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.display.localeCompare(b.display),
    );
  }, [rows, edits]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? userSummaries.filter(
            (u) =>
              u.display.toLowerCase().includes(q) ||
              u.current.some(
                (r) =>
                  r.computername.toLowerCase().includes(q) ||
                  r.modell.toLowerCase().includes(q),
              ) ||
              u.past.some(
                (r) =>
                  r.computername.toLowerCase().includes(q) ||
                  r.modell.toLowerCase().includes(q),
              ),
          )
        : userSummaries,
    [userSummaries, q],
  );

  const selected = useMemo(
    () => userSummaries.find((u) => u.key === selectedKey) ?? null,
    [userSummaries, selectedKey],
  );

  // Build the lifecycle event list for the selected user.
  const selectedEvents = useMemo(() => {
    if (!selected) return [];
    const out: Array<{ row: AssetRow; ev: NonNullable<AssetRow["history"]>[number] }> = [];
    for (const r of rows) {
      for (const ev of r.history ?? []) {
        if (
          (ev.user ?? "").toLowerCase() === selected.key ||
          (ev.prevUser ?? "").toLowerCase() === selected.key
        ) {
          out.push({ row: r, ev });
        }
      }
    }
    out.sort((a, b) => (a.ev.at < b.ev.at ? 1 : -1));
    return out;
  }, [rows, selected]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      {/* Left: user list */}
      <Card className="lg:max-h-[calc(100vh-220px)] flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="h-4 w-4" />
            Users ({userSummaries.length})
          </CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users or devices…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full max-h-[60vh] lg:max-h-none">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground italic p-4 text-center">
                No users match.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((u) => {
                  const isSelected = selectedKey === u.key;
                  return (
                    <li key={u.key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(u.key)}
                        className={`w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors ${
                          isSelected ? "bg-primary/10" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm truncate">{u.display}</span>
                          {u.inactive && (
                            <Badge variant="destructive" className="text-[10px] shrink-0">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {u.current.length} current · {u.past.length} past
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right: profile */}
      <div>
        {!selected ? (
          <Card>
            <CardContent className="p-12 text-center text-sm text-muted-foreground">
              Select a user from the list to see their device history and lifecycle events.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {selected.display}
                  {selected.inactive ? (
                    <Badge variant="destructive" className="text-[10px]">Inactive</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">Active</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Current devices ({selected.current.length})
                  </h4>
                  {selected.current.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">None assigned.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {selected.current.map((row) => (
                        <li
                          key={row.id}
                          className="rounded-md border border-border px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-1.5">
                            <Monitor className="h-3.5 w-3.5 text-primary" />
                            <button
                              type="button"
                              onClick={() => onOpenAsset(row)}
                              className="font-medium text-primary hover:underline"
                            >
                              {row.computername}
                            </button>
                          </div>
                          <div className="text-muted-foreground mt-0.5">
                            {row.modell || "(no model)"}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Past devices ({selected.past.length})
                  </h4>
                  {selected.past.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No prior devices on record.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {selected.past.map((row) => (
                        <li
                          key={row.id}
                          className="rounded-md border border-border px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-1.5">
                            <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                            <button
                              type="button"
                              onClick={() => onOpenAsset(row)}
                              className="font-medium text-primary hover:underline"
                            >
                              {row.computername}
                            </button>
                          </div>
                          <div className="text-muted-foreground mt-0.5">
                            {row.modell || "(no model)"}
                            {row.user && row.user.toLowerCase() !== selected.key
                              ? ` · now with ${row.user}`
                              : " · unassigned"}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Lifecycle events ({selectedEvents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[45vh] pr-2 -mr-2">
                  {selectedEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center italic">
                      No lifecycle events recorded for this user.
                    </p>
                  ) : (
                    <ol className="space-y-2">
                      {selectedEvents.map(({ row, ev }, i) => (
                        <li
                          key={i}
                          className="rounded-md border border-border px-3 py-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2 text-muted-foreground">
                            <span>{fmtDate(ev.at)}</span>
                            <button
                              type="button"
                              onClick={() => onOpenAsset(row)}
                              className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted/60"
                            >
                              {row.computername || "(no cn)"}
                            </button>
                          </div>
                          <div className="mt-1 text-foreground">
                            {ev.from ? `"${ev.from}"` : "(none)"} → "{ev.to}"
                          </div>
                          {ev.note && (
                            <div className="mt-1 text-muted-foreground italic">{ev.note}</div>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <Separator />
            <p className="text-[11px] text-muted-foreground italic">
              Tip: clicking a username or computername anywhere in the app opens these history views.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

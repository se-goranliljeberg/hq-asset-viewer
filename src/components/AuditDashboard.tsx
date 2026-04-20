import { useMemo, useState } from "react";
import type { AssetRow } from "@/lib/asset-types";
import type { AssetEdits } from "@/lib/asset-edits";
import { getEditKey, effectiveUserActive, effectiveSkanska, effectiveExceptions } from "@/lib/asset-edits";
import { isStale, loadStaleThreshold } from "@/lib/stale-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, UserX, Users, AlertTriangle, Monitor, Clock } from "lucide-react";

interface Props {
  rows: AssetRow[];
  edits: Record<string, AssetEdits>;
}

interface UserSummary {
  user: string;            // canonical (lowercased) key
  displayName: string;     // first non-empty raw spelling we saw
  active: boolean;         // false if any row marks the user as inactive
  rowCount: number;        // total rows for this user (computers + user-only)
  computers: string[];     // distinct computernames associated with this user
  models: string[];        // distinct models
  managers: string[];      // distinct managers
  departments: string[];   // distinct departments
  companies: string[];     // distinct companies
  hasNonSkanska: boolean;  // owns at least one non-Skanska device
  staleCount: number;      // rows with stale Last logon date
  exceptions: string[];    // distinct exceptions across rows
  lastLogon: string;       // most recent Last logon date string we saw
  isLeaverWithDevice: boolean; // inactive AND owns at least one computername
  rows: AssetRow[];
}

type AuditFilterKey =
  | null
  | "inactive"
  | "leaverWithDevice"
  | "withoutComputer"
  | "multiComputer"
  | "nonSkanska"
  | "withExceptions"
  | "stale";

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function maxDateString(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  // Best-effort lexicographic compare works for ISO-like YYYY-MM-DD;
  // for free-form dates we just keep the longer one.
  return a > b ? a : b;
}

export function AuditDashboard({ rows, edits }: Props) {
  const [search, setSearch] = useState("");
  const [filterKey, setFilterKey] = useState<AuditFilterKey>(null);
  const staleThreshold = loadStaleThreshold();

  const users: UserSummary[] = useMemo(() => {
    const map = new Map<string, UserSummary>();
    for (const r of rows) {
      const rawUser = (r.user || r.raw["Username"] || "").trim();
      if (!rawUser) continue; // user-centric view: skip orphan computers
      const key = rawUser.toLowerCase();
      const e = edits[getEditKey(r.id)];
      const isInactive = effectiveUserActive(e) === "no";
      const isNonSkanska = effectiveSkanska(e, r.computername) === "no";
      const stale = isStale(r.raw["Last logon date"] ?? "", staleThreshold);

      let entry = map.get(key);
      if (!entry) {
        entry = {
          user: key,
          displayName: rawUser,
          active: true,
          rowCount: 0,
          computers: [],
          models: [],
          managers: [],
          departments: [],
          companies: [],
          hasNonSkanska: false,
          staleCount: 0,
          exceptions: [],
          lastLogon: "",
          isLeaverWithDevice: false,
          rows: [],
        };
        map.set(key, entry);
      }
      entry.rowCount++;
      entry.rows.push(r);
      entry.computers.push(r.computername);
      entry.models.push(r.modell);
      entry.managers.push(r.raw["Manager"] ?? "");
      entry.departments.push(r.raw["Department"] ?? "");
      entry.companies.push(r.raw["Company"] ?? "");
      entry.exceptions.push(...effectiveExceptions(r, e));
      entry.lastLogon = maxDateString(entry.lastLogon, r.raw["Last logon date"] ?? "");
      if (isInactive) entry.active = false;
      if (isInactive && r.computername.trim()) entry.isLeaverWithDevice = true;
      if (isNonSkanska) entry.hasNonSkanska = true;
      if (stale) entry.staleCount++;
    }
    // Dedupe array fields.
    for (const u of map.values()) {
      u.computers = uniq(u.computers);
      u.models = uniq(u.models);
      u.managers = uniq(u.managers);
      u.departments = uniq(u.departments);
      u.companies = uniq(u.companies);
      u.exceptions = uniq(u.exceptions);
    }
    return [...map.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
    );
  }, [rows, edits, staleThreshold]);

  const filtered = useMemo(() => {
    let result = users;
    switch (filterKey) {
      case "inactive":          result = result.filter((u) => !u.active); break;
      case "leaverWithDevice":  result = result.filter((u) => u.isLeaverWithDevice); break;
      case "withoutComputer":   result = result.filter((u) => u.computers.length === 0); break;
      case "multiComputer":     result = result.filter((u) => u.computers.length > 1); break;
      case "nonSkanska":        result = result.filter((u) => u.hasNonSkanska); break;
      case "withExceptions":    result = result.filter((u) => u.exceptions.length > 0); break;
      case "stale":             result = result.filter((u) => u.staleCount > 0); break;
      case null: break;
    }
    const q = search.trim().toLowerCase();
    if (!q) return result;
    return result.filter((u) =>
      u.displayName.toLowerCase().includes(q) ||
      u.computers.some((c) => c.toLowerCase().includes(q)) ||
      u.managers.some((m) => m.toLowerCase().includes(q)) ||
      u.departments.some((d) => d.toLowerCase().includes(q)),
    );
  }, [users, search, filterKey]);

  // KPI roll-ups (all user-centric).
  const totalUsers = users.length;
  const inactiveUsers = users.filter((u) => !u.active).length;
  const usersWithoutComputer = users.filter((u) => u.computers.length === 0).length;
  const usersWithMultipleComputers = users.filter((u) => u.computers.length > 1).length;
  const nonSkanskaUsers = users.filter((u) => u.hasNonSkanska).length;
  const usersWithExceptions = users.filter((u) => u.exceptions.length > 0).length;
  const staleUsers = users.filter((u) => u.staleCount > 0).length;
  // Leavers who still have a Skanska computer assigned. Computed from rows
  // directly so we count any inactive user holding a non-empty computername.
  const leaversWithDevice = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const e = edits[getEditKey(r.id)];
      if (effectiveUserActive(e) !== "no") continue;
      if (!r.computername.trim()) continue;
      const key = (r.user || r.raw["Username"] || "").trim().toLowerCase();
      if (!key) continue;
      set.add(key);
    }
    return set.size;
  }, [rows, edits]);

  const kpis: { key: AuditFilterKey; label: string; value: number; icon: typeof Users; color: string; tooltip: string }[] = [
    {
      key: null,
      label: "Total Users",
      value: totalUsers,
      icon: Users,
      color: "text-primary",
      tooltip: "Distinct people across all imported rows (case-insensitive). User-only and computer-only rows are merged when a username is present. Click to clear any active KPI filter.",
    },
    {
      key: "inactive",
      label: "Inactive Users",
      value: inactiveUsers,
      icon: UserX,
      color: "text-destructive",
      tooltip: "Users where any row has 'User Active?' set to No — likely leavers whose accounts/devices need follow-up. Click to filter.",
    },
    {
      key: "leaverWithDevice",
      label: "Leavers w/ Device",
      value: leaversWithDevice,
      icon: AlertTriangle,
      color: "text-destructive",
      tooltip: "Inactive users (User Active? = No) who still have a Computername assigned. These rows carry the 'Assigned to inactive user' exception and should be top of the off-boarding list. Click to filter.",
    },
    {
      key: "withoutComputer",
      label: "Without Computer",
      value: usersWithoutComputer,
      icon: AlertTriangle,
      color: "text-amber-500",
      tooltip: "Users present in the data but not associated with any Computername — typically Citrix/BYOD users or unprovisioned accounts. Click to filter.",
    },
    {
      key: "multiComputer",
      label: "Multi-Computer",
      value: usersWithMultipleComputers,
      icon: Monitor,
      color: "text-chart-3",
      tooltip: "Users currently linked to more than one Computername. Useful for spotting duplicate assignments or pending hardware swaps. Click to filter.",
    },
    {
      key: "nonSkanska",
      label: "Non-Skanska Devices",
      value: nonSkanskaUsers,
      icon: Monitor,
      color: "text-chart-4",
      tooltip: "Users who own at least one device explicitly marked as 'Skanska computer? = No' (BYOD, consultant gear, VDI, etc.). Click to filter.",
    },
    {
      key: "withExceptions",
      label: "With Exceptions",
      value: usersWithExceptions,
      icon: AlertTriangle,
      color: "text-destructive",
      tooltip: "Users whose rows carry one or more data-quality flags (Missing user, Inactive user, Assigned to inactive user, Warranty expired, etc.). Click to filter.",
    },
    {
      key: "stale",
      label: `Stale (>${staleThreshold}d)`,
      value: staleUsers,
      icon: Clock,
      color: "text-amber-500",
      tooltip: `Users with at least one row whose 'Last logon date' is older than ${staleThreshold} days. Threshold is configurable in the FilterBar. Click to filter.`,
    },
  ];

  const activeKpiLabel = filterKey ? kpis.find((k) => k.key === filterKey)?.label ?? null : null;

  return (
    <div className="space-y-6">
      {/* User-centric KPI roll-up */}
      <section>
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
          User Roll-Up
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {kpis.map((k) => {
            const isActive = filterKey === k.key && k.key !== null;
            return (
              <Tooltip key={k.label}>
                <TooltipTrigger asChild>
                  <Card
                    onClick={() => {
                      if (k.key === null) setFilterKey(null);
                      else setFilterKey((prev) => (prev === k.key ? null : k.key));
                    }}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      isActive ? "ring-2 ring-primary shadow-md" : ""
                    }`}
                  >
                    <CardHeader className="pb-2 p-4">
                      <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                        <k.icon className={`h-3.5 w-3.5 ${k.color}`} strokeWidth={2} />
                        {k.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <p className={`text-2xl font-bold tabular-nums ${k.color}`}>
                        {k.value.toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                  {k.tooltip}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </section>

      {/* Per-user table */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Per-User Detail
          </h2>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search user, computer, manager…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Computers</TableHead>
                    <TableHead>Models</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Last Logon</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8 text-sm">
                        No users match the current search.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((u) => (
                    <TableRow key={u.user}>
                      <TableCell className="font-medium text-sm">{u.displayName}</TableCell>
                      <TableCell>
                        {u.active ? (
                          <Badge variant="secondary" className="text-xs">Active</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {u.computers.length === 0 ? (
                          <span className="text-muted-foreground text-xs italic">none</span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={u.computers.length > 1 ? "font-semibold text-chart-3" : ""}>
                                {u.computers.length}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">
                              {u.computers.join(", ")}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[14rem] truncate">
                        {u.models.join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs">{u.managers.join(", ") || "—"}</TableCell>
                      <TableCell className="text-xs">{u.departments.join(", ") || "—"}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {u.lastLogon || <span className="text-muted-foreground italic">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {u.hasNonSkanska && (
                            <Badge variant="outline" className="text-[10px] border-chart-4/40 text-chart-4">
                              Non-Skanska
                            </Badge>
                          )}
                          {u.staleCount > 0 && (
                            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400">
                              Stale ×{u.staleCount}
                            </Badge>
                          )}
                          {u.exceptions.map((ex) => (
                            <Badge key={ex} variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                              {ex}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground mt-2">
          Showing {filtered.length.toLocaleString()} of {users.length.toLocaleString()} users.
        </p>
      </section>
    </div>
  );
}

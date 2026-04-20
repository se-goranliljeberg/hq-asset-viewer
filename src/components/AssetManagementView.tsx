import { useMemo, useState } from "react";
import type { AssetRow } from "@/lib/asset-types";
import type { AssetEdits } from "@/lib/asset-edits";
import { getEditKey, computeMultiComputerUsers } from "@/lib/asset-edits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Boxes, Send, Users, Search, Monitor, ArrowRight } from "lucide-react";

interface Props {
  rows: AssetRow[];
  edits: Record<string, AssetEdits>;
  onOpenUser: (user: string) => void;
  onOpenAsset: (row: AssetRow) => void;
}

interface RowWithStatus {
  row: AssetRow;
  status: string;
}

export function AssetManagementView({ rows, edits, onOpenUser, onOpenAsset }: Props) {
  const [search, setSearch] = useState("");

  const enriched: RowWithStatus[] = useMemo(
    () =>
      rows
        .filter((r) => r.computername.trim()) // only physical computer rows
        .map((r) => ({
          row: r,
          status: edits[getEditKey(r.id)]?.status ?? "",
        })),
    [rows, edits],
  );

  const inStock = useMemo(
    () => enriched.filter((e) => e.status === "In stock"),
    [enriched],
  );
  const deployed = useMemo(
    () => enriched.filter((e) => e.status === "Deployed at user"),
    [enriched],
  );
  const broker = useMemo(
    () => enriched.filter((e) => e.status === "Sent back to broker"),
    [enriched],
  );
  const noStatus = useMemo(
    () => enriched.filter((e) => !e.status),
    [enriched],
  );

  // Users currently holding multiple devices = handover candidates.
  const multiUserSet = useMemo(() => computeMultiComputerUsers(rows), [rows]);
  const handoverUsers = useMemo(() => {
    const map = new Map<string, AssetRow[]>();
    for (const r of rows) {
      const key = r.user.trim().toLowerCase();
      if (!key) continue;
      if (!multiUserSet.has(key)) continue;
      if (!r.computername.trim()) continue;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .map(([key, devices]) => ({
        userKey: key,
        userDisplay: devices[0]?.user ?? key,
        devices,
      }))
      .sort((a, b) => b.devices.length - a.devices.length);
  }, [rows, multiUserSet]);

  const q = search.trim().toLowerCase();
  const filterFn = (e: RowWithStatus) =>
    !q ||
    e.row.computername.toLowerCase().includes(q) ||
    e.row.modell.toLowerCase().includes(q) ||
    e.row.user.toLowerCase().includes(q);

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          icon={<Boxes className="h-4 w-4" />}
          label="In stock"
          value={inStock.length}
          tone="primary"
        />
        <KpiTile
          icon={<Monitor className="h-4 w-4" />}
          label="Deployed at user"
          value={deployed.length}
          tone="default"
        />
        <KpiTile
          icon={<Send className="h-4 w-4" />}
          label="Sent back to broker"
          value={broker.length}
          tone="muted"
        />
        <KpiTile
          icon={<Users className="h-4 w-4" />}
          label="Users w/ handover"
          value={handoverUsers.length}
          tone="warning"
        />
      </div>

      {noStatus.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {noStatus.length} computer row{noStatus.length === 1 ? "" : "s"} have no
          lifecycle status set yet — set Status on those rows to include them in
          the counts above.
        </p>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search computers, models, or users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <DeviceTable
        title="In stock — available for re-deployment"
        icon={<Boxes className="h-4 w-4" />}
        items={inStock.filter(filterFn)}
        emptyMessage="No devices in stock."
        onOpenAsset={onOpenAsset}
        onOpenUser={onOpenUser}
        showUser={false}
      />

      <DeviceTable
        title="Deployed at user"
        icon={<Monitor className="h-4 w-4" />}
        items={deployed.filter(filterFn)}
        emptyMessage="No devices currently deployed."
        onOpenAsset={onOpenAsset}
        onOpenUser={onOpenUser}
        showUser
      />

      <DeviceTable
        title="Sent back to broker"
        icon={<Send className="h-4 w-4" />}
        items={broker.filter(filterFn)}
        emptyMessage="No devices have been sent back."
        onOpenAsset={onOpenAsset}
        onOpenUser={onOpenUser}
        showUser={false}
      />

      {/* Handover panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />
            Users holding multiple devices ({handoverUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {handoverUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No users currently hold more than one device.
            </p>
          ) : (
            <ul className="space-y-3">
              {handoverUsers
                .filter(
                  (h) =>
                    !q ||
                    h.userDisplay.toLowerCase().includes(q) ||
                    h.devices.some(
                      (d) =>
                        d.computername.toLowerCase().includes(q) ||
                        d.modell.toLowerCase().includes(q),
                    ),
                )
                .map((h) => (
                  <li
                    key={h.userKey}
                    className="rounded-md border border-border p-3"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Button
                        variant="link"
                        className="h-auto p-0 text-sm font-semibold"
                        onClick={() => onOpenUser(h.userDisplay)}
                      >
                        {h.userDisplay}
                      </Button>
                      <Badge variant="secondary" className="text-[10px]">
                        {h.devices.length} devices
                      </Badge>
                    </div>
                    <ul className="space-y-1">
                      {h.devices.map((d) => (
                        <li
                          key={d.id}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <ArrowRight className="h-3 w-3" />
                          <button
                            type="button"
                            onClick={() => onOpenAsset(d)}
                            className="text-primary hover:underline"
                          >
                            {d.computername}
                          </button>
                          <span>· {d.modell || "(no model)"}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "primary" | "default" | "muted" | "warning";
}) {
  const toneClass =
    tone === "primary"
      ? "border-primary/40 bg-primary/5"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/5"
        : tone === "muted"
          ? "border-border bg-muted/30"
          : "border-border";
  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
          {icon}
          <span>{label}</span>
        </div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function DeviceTable({
  title,
  icon,
  items,
  emptyMessage,
  onOpenAsset,
  onOpenUser,
  showUser,
}: {
  title: string;
  icon: React.ReactNode;
  items: RowWithStatus[];
  emptyMessage: string;
  onOpenAsset: (row: AssetRow) => void;
  onOpenUser: (user: string) => void;
  showUser: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {icon}
          {title}
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">{emptyMessage}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Computername</TableHead>
                <TableHead>Model</TableHead>
                {showUser && <TableHead>User</TableHead>}
                <TableHead>Source file</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.slice(0, 200).map(({ row }) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => onOpenAsset(row)}
                      className="text-primary hover:underline text-sm font-medium"
                    >
                      {row.computername}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.modell || "—"}
                  </TableCell>
                  {showUser && (
                    <TableCell>
                      {row.user ? (
                        <button
                          type="button"
                          onClick={() => onOpenUser(row.user)}
                          className="text-primary hover:underline text-sm"
                        >
                          {row.user}
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-sm italic">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-xs text-muted-foreground">
                    {row.sourceFile}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {items.length > 200 && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            Showing first 200 of {items.length}. Refine with the search above.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

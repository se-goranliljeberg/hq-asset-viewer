import { useMemo } from "react";
import type { AssetRow } from "@/lib/asset-types";
import type { AssetEdits } from "@/lib/asset-edits";
import { getEditKey, STATUS_OPTIONS } from "@/lib/asset-edits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Props {
  rows: AssetRow[];
  edits: Record<string, AssetEdits>;
}

export function AuditDashboard({ rows, edits }: Props) {
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { "No status set": 0 };
    STATUS_OPTIONS.forEach((s) => (counts[s] = 0));
    rows.forEach((r) => {
      const s = edits[getEditKey(r.id)]?.status || "";
      if (s) counts[s] = (counts[s] ?? 0) + 1;
      else counts["No status set"]++;
    });
    return counts;
  }, [rows, edits]);

  const warrantyCounts = useMemo(() => {
    const today = new Date();
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const result = { expired: 0, expiring: 0, valid: 0, none: 0 };
    rows.forEach((r) => {
      const w = edits[getEditKey(r.id)]?.warrantyUntil || "";
      if (!w) { result.none++; return; }
      const d = new Date(w);
      if (d < today) result.expired++;
      else if (d <= in30) result.expiring++;
      else result.valid++;
    });
    return result;
  }, [rows, edits]);

  const sourceStats = useMemo(() => {
    const map = new Map<string, { total: number; exceptions: number; statuses: Record<string, number> }>();
    rows.forEach((r) => {
      const src = r.sourceFile || "(unknown)";
      if (!map.has(src)) map.set(src, { total: 0, exceptions: 0, statuses: {} });
      const entry = map.get(src)!;
      entry.total++;
      if (r.exceptions.length > 0) entry.exceptions++;
      const s = edits[getEditKey(r.id)]?.status || "No status";
      entry.statuses[s] = (entry.statuses[s] ?? 0) + 1;
    });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [rows, edits]);

  const topExceptions = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => r.exceptions.forEach((e) => counts.set(e, (counts.get(e) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* Status Breakdown */}
      <section>
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Status Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(statusCounts).map(([label, count]) => (
            <Card key={label}>
              <CardHeader className="pb-2 p-4">
                <CardTitle className="text-xs text-muted-foreground font-medium">{label}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-2xl font-bold tabular-nums">{count.toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Warranty Overview */}
      <section>
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Warranty Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ["Expired", warrantyCounts.expired, "text-destructive"],
            ["Expiring (30d)", warrantyCounts.expiring, "text-chart-3"],
            ["Valid", warrantyCounts.valid, "text-chart-2"],
            ["No warranty set", warrantyCounts.none, "text-muted-foreground"],
          ] as const).map(([label, count, color]) => (
            <Card key={label}>
              <CardHeader className="pb-2 p-4">
                <CardTitle className="text-xs text-muted-foreground font-medium">{label}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className={`text-2xl font-bold tabular-nums ${color}`}>{count.toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Per-source summary */}
      {sourceStats.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Per-Source File Summary</h2>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source File</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead className="text-right">Exceptions</TableHead>
                    <TableHead>Status Distribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sourceStats.map(([src, stat]) => (
                    <TableRow key={src}>
                      <TableCell className="font-medium text-xs">{src}</TableCell>
                      <TableCell className="text-right tabular-nums">{stat.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{stat.exceptions}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(stat.statuses).map(([s, c]) => (
                            <Badge key={s} variant="secondary" className="text-xs">
                              {s}: {c}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Top Exceptions */}
      {topExceptions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Top Exceptions</h2>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Exception</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topExceptions.map(([exc, count]) => (
                    <TableRow key={exc}>
                      <TableCell className="text-xs">{exc}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

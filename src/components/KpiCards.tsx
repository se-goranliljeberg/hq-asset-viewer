import type { AssetRow } from "@/lib/asset-types";
import type { AssetEdits } from "@/lib/asset-edits";
import { getEditKey } from "@/lib/asset-edits";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Monitor, Users, Cpu, AlertTriangle, Clock } from "lucide-react";
import { isStale } from "@/lib/stale-config";

export type KpiKey = "total" | "users" | "models" | "exceptions" | "stale";

interface Props {
  rows: AssetRow[];
  edits: Record<string, AssetEdits>;
  staleThreshold: number;
  activeCard: KpiKey | null;
  onCardClick: (key: KpiKey) => void;
}

export function KpiCards({ rows, edits, staleThreshold, activeCard, onCardClick }: Props) {
  // Total Assets = unique computernames (case-insensitive, ignoring blanks).
  // Rationale: a single physical asset is identified by its computername; users-only
  // rows (no computer) must not inflate the count, and accidental duplicates from
  // re-imports collapse to one entry.
  const uniqueComputers = new Set(
    rows
      .map((r) => r.computername.trim().toLowerCase())
      .filter((c) => c !== ""),
  ).size;
  const total = uniqueComputers;
  const uniqueUsers = new Set(rows.map((r) => r.user.toLowerCase()).filter(Boolean)).size;
  const uniqueModels = new Set(rows.map((r) => r.modell.toLowerCase()).filter(Boolean)).size;
  const exceptions = rows.filter((r) => r.exceptions.length > 0).length;
  const stale = rows.filter((r) => isStale(r.raw["Last logon date"] ?? "", staleThreshold)).length;

  // Suppress lint: edits intentionally accepted for future per-row KPI logic.
  void edits; void getEditKey;

  const cards: { key: KpiKey; label: string; value: number; icon: typeof Monitor; color: string; tooltip?: string }[] = [
    {
      key: "total",
      label: "Total Assets",
      value: total,
      icon: Monitor,
      color: "text-primary",
      tooltip:
        "Unique Computernames (case-insensitive). Rows without a computername — e.g. users-only entries — are excluded, and duplicate rows referring to the same machine are counted once.",
    },
    { key: "users", label: "Unique Users", value: uniqueUsers, icon: Users, color: "text-chart-2" },
    { key: "models", label: "Unique Models", value: uniqueModels, icon: Cpu, color: "text-chart-3" },
    { key: "exceptions", label: "Exceptions", value: exceptions, icon: AlertTriangle, color: "text-destructive" },
    { key: "stale", label: `Stale (>${staleThreshold}d)`, value: stale, icon: Clock, color: "text-amber-500" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {cards.map((c) => {
        const isActive = activeCard === c.key;
        const card = (
          <Card
            key={c.key}
            className={`border-border/60 cursor-pointer transition-all hover:shadow-md ${isActive ? "ring-2 ring-primary shadow-md" : ""}`}
            onClick={() => onCardClick(c.key)}
          >
            <CardContent className="flex items-center gap-4 p-5">
              <c.icon className={`h-8 w-8 shrink-0 ${c.color}`} strokeWidth={1.5} />
              <div>
                <p className="text-2xl font-semibold tracking-tight">{c.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        );
        if (!c.tooltip) return <div key={c.key}>{card}</div>;
        return (
          <Tooltip key={c.key}>
            <TooltipTrigger asChild>{card}</TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-relaxed">{c.tooltip}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

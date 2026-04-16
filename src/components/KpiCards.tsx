import type { AssetRow } from "@/lib/asset-types";
import { Card, CardContent } from "@/components/ui/card";
import { Monitor, Users, Cpu, AlertTriangle } from "lucide-react";

interface Props {
  rows: AssetRow[];
}

export function KpiCards({ rows }: Props) {
  const total = rows.length;
  const uniqueUsers = new Set(rows.map((r) => r.user.toLowerCase()).filter(Boolean)).size;
  const uniqueModels = new Set(rows.map((r) => r.modell.toLowerCase()).filter(Boolean)).size;
  const exceptions = rows.filter((r) => r.exceptions.length > 0).length;

  const cards = [
    { label: "Total Assets", value: total, icon: Monitor, color: "text-primary" },
    { label: "Unique Users", value: uniqueUsers, icon: Users, color: "text-chart-2" },
    { label: "Unique Models", value: uniqueModels, icon: Cpu, color: "text-chart-3" },
    { label: "Exceptions", value: exceptions, icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="border-border/60">
          <CardContent className="flex items-center gap-4 p-5">
            <c.icon className={`h-8 w-8 shrink-0 ${c.color}`} strokeWidth={1.5} />
            <div>
              <p className="text-2xl font-semibold tracking-tight">{c.value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

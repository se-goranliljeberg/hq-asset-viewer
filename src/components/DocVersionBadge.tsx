import pkg from "../../package.json";
import { Badge } from "@/components/ui/badge";

/**
 * Small version + last-updated badge sourced from package.json so it stays
 * accurate without manual upkeep on each documentation page.
 */
export function DocVersionBadge() {
  const version = (pkg as { version?: string }).version ?? "0.0.0";
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="secondary" className="font-mono">v{version}</Badge>
      <span>·</span>
      <span>Last updated {today}</span>
    </div>
  );
}

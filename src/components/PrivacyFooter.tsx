import { ShieldCheck } from "lucide-react";

export function PrivacyFooter() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-t border-border pt-4 mt-4">
      <ShieldCheck className="h-4 w-4 text-chart-2" />
      <span>Data stays on this device</span>
      <span className="hidden sm:inline">•</span>
      <span>Stored only in your browser local storage</span>
      <span className="hidden sm:inline">•</span>
      <span>Use &quot;Clear local data&quot; to remove it</span>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, RotateCcw } from "lucide-react";
import {
  CANONICAL_FIELDS, suggestMapping,
  type Mapping, type MappingValue, type CanonicalField,
} from "@/lib/excel-parser";

interface Props {
  open: boolean;
  filename: string;
  sheetName: string;
  headers: string[];
  samples: Record<string, string>;
  initialMapping?: Mapping | null;
  onApply: (mapping: Mapping, remember: boolean) => void;
  onCancel: () => void;
}

const IGNORE: MappingValue = "ignore";

function buildInitial(headers: string[], saved?: Mapping | null): Mapping {
  if (saved) {
    const m: Mapping = {};
    for (const h of headers) m[h] = saved[h] ?? "ignore";
    return m;
  }
  const suggested = suggestMapping(headers);
  const m: Mapping = {};
  for (const h of headers) m[h] = suggested[h]?.field ?? "ignore";
  return m;
}

export function ColumnMappingDialog({
  open, filename, sheetName, headers, samples, initialMapping, onApply, onCancel,
}: Props) {
  const canonicalLabel = (f: CanonicalField) => (f === "OU" ? "Computer OU" : f);

  const [mapping, setMapping] = useState<Mapping>(() => buildInitial(headers, initialMapping));

  // Reset when a new file is opened.
  useEffect(() => {
    if (open) setMapping(buildInitial(headers, initialMapping));
  }, [open, headers, initialMapping]);

  const conflicts = useMemo(() => {
    const counts = new Map<CanonicalField, string[]>();
    for (const [h, v] of Object.entries(mapping)) {
      if (v === "ignore") continue;
      const arr = counts.get(v) ?? [];
      arr.push(h);
      counts.set(v, arr);
    }
    return [...counts.entries()].filter(([, arr]) => arr.length > 1);
  }, [mapping]);

  const handleReset = () => {
    setMapping(buildInitial(headers, null));
  };

  const handleApply = (remember: boolean) => {
    onApply(mapping, remember);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Map columns — {filename}</DialogTitle>
          <DialogDescription>
            Match each source header from "{sheetName}" to a canonical field, or choose Ignore.
            Only mapped fields will appear in the table.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b border-border">
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-left py-2 font-semibold">Source header</th>
                <th className="text-left py-2 font-semibold">Sample</th>
                <th className="text-left py-2 font-semibold w-[200px]">Map to</th>
              </tr>
            </thead>
            <tbody>
              {headers.map((h) => {
                const value = mapping[h] ?? "ignore";
                return (
                  <tr key={h} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium align-top">{h}</td>
                    <td className="py-2 pr-3 text-muted-foreground align-top truncate max-w-[260px]" title={samples[h] || ""}>
                      {samples[h] || <span className="italic opacity-50">empty</span>}
                    </td>
                    <td className="py-1.5 align-top">
                      <Select
                        value={value}
                        onValueChange={(v) => setMapping((p) => ({ ...p, [h]: v as MappingValue }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ignore">— Ignore —</SelectItem>
                          {CANONICAL_FIELDS.map((f) => (
                            <SelectItem key={f} value={f}>{canonicalLabel(f)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {conflicts.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-destructive mb-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Mapping conflicts
            </div>
            <ul className="space-y-0.5 list-disc list-inside">
              {conflicts.map(([field, hs]) => (
                <li key={field}>
                  <strong>{canonicalLabel(field)}</strong> is mapped from {hs.length} headers ({hs.join(", ")}). Last one wins.
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset to auto
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="outline" onClick={() => handleApply(false)}>Apply once</Button>
          <Button onClick={() => handleApply(true)}>Apply &amp; remember</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

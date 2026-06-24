import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  FolderOpen,
  FolderX,
  HardDrive,
  Settings,
  Archive,
  SlidersHorizontal,
} from "lucide-react";
import { DEFAULT_STALE_THRESHOLD_DAYS } from "@/lib/stale-config";

export interface SettingsValues {
  staleThresholdDays: number;
  maxRestorePoints: number;
  maxSaveWorkbookPerDay: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: SettingsValues;
  onSave: (next: SettingsValues) => void;
  /** Name of the active restore-point folder, or undefined = IndexedDB. */
  activeFolderName?: string;
  folderNeedsPermission?: boolean;
  onSelectFolder?: () => void;
  onClearFolder?: () => void;
  onReRequestPermission?: () => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  values,
  onSave,
  activeFolderName,
  folderNeedsPermission,
  onSelectFolder,
  onClearFolder,
  onReRequestPermission,
}: Props) {
  const [stale, setStale] = useState(String(values.staleThresholdDays));
  const [maxRp, setMaxRp] = useState(String(values.maxRestorePoints));
  const [maxSave, setMaxSave] = useState(String(values.maxSaveWorkbookPerDay));

  // Reset local state whenever the dialog opens with fresh values
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setStale(String(values.staleThresholdDays));
      setMaxRp(String(values.maxRestorePoints));
      setMaxSave(String(values.maxSaveWorkbookPerDay));
    }
    onOpenChange(o);
  };

  const parsePositiveInt = (s: string, fallback: number, min = 1, max = 9999) => {
    const n = parseInt(s, 10);
    if (!Number.isFinite(n) || n < min || n > max) return fallback;
    return n;
  };

  const handleSave = () => {
    onSave({
      staleThresholdDays: parsePositiveInt(stale, DEFAULT_STALE_THRESHOLD_DAYS, 1, 3650),
      maxRestorePoints: parsePositiveInt(maxRp, 20, 1, 200),
      maxSaveWorkbookPerDay: parsePositiveInt(maxSave, 3, 1, 50),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* ── Backup location ─────────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Archive className="h-4 w-4 text-muted-foreground" />
              Restore point storage
            </h3>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-2">
              {activeFolderName ? (
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {activeFolderName}
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
                    / restore-points
                  </Badge>
                </div>
              ) : folderNeedsPermission ? (
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                  <span className="flex-1 text-muted-foreground">
                    Permission needed for saved folder
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <HardDrive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">Browser storage (IndexedDB)</span>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-0.5">
                {activeFolderName ? (
                  onClearFolder && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-xs"
                      onClick={onClearFolder}
                    >
                      <FolderX className="h-3.5 w-3.5" />
                      Unlink folder
                    </Button>
                  )
                ) : folderNeedsPermission ? (
                  onReRequestPermission && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={onReRequestPermission}
                    >
                      Re-grant access
                    </Button>
                  )
                ) : null}
                {!activeFolderName && onSelectFolder && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={onSelectFolder}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Select folder…
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                When a folder is selected, restore points are saved as JSON files next to
                index.html and survive clearing browser storage.
              </p>
            </div>
          </section>

          <Separator />

          {/* ── Restore point limits ────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              Restore point limits
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="space-y-1">
                <Label htmlFor="maxRp" className="text-xs">
                  Max total restore points
                </Label>
                <Input
                  id="maxRp"
                  type="number"
                  min={1}
                  max={200}
                  className="h-8 text-sm"
                  value={maxRp}
                  onChange={(e) => setMaxRp(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Import-replace points are never pruned.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="maxSave" className="text-xs">
                  Max save-workbook per day
                </Label>
                <Input
                  id="maxSave"
                  type="number"
                  min={1}
                  max={50}
                  className="h-8 text-sm"
                  value={maxSave}
                  onChange={(e) => setMaxSave(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Older ones for the same day are pruned first.</p>
              </div>
            </div>
          </section>

          <Separator />

          {/* ── Stale threshold ─────────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              Stale last-logon threshold
            </h3>
            <div className="flex items-center gap-3">
              <Input
                id="stale"
                type="number"
                min={1}
                max={3650}
                className="h-8 w-28 text-sm"
                value={stale}
                onChange={(e) => setStale(e.target.value)}
              />
              <Label htmlFor="stale" className="text-sm text-muted-foreground">
                days
              </Label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Assets whose last-logon date is older than this many days are highlighted as
              stale. Default: {DEFAULT_STALE_THRESHOLD_DAYS} days.
            </p>
          </section>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

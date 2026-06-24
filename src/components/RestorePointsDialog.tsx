import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Trash2, Clock, FolderOpen, FolderX, HardDrive } from "lucide-react";
import type { RestorePointSummary, RestorePointKind } from "@/lib/restore-points";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: RestorePointSummary[];
  onRestore: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Name of the active folder, or undefined if using IndexedDB. */
  activeFolderName?: string;
  /** True when a folder handle is stored but permission has lapsed. */
  folderNeedsPermission?: boolean;
  onSelectFolder?: () => void;
  onClearFolder?: () => void;
  onReRequestPermission?: () => void;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDateHeading(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function kindLabel(kind: RestorePointKind | undefined): string {
  switch (kind) {
    case "import-replace": return "Import Replace";
    case "import-add": return "Import Add";
    case "import-enrich": return "Import Enrich";
    case "save-workbook": return "Save";
    case "replace-device": return "Replace Device";
    case "batch-status": return "Batch Status";
    case "clear-data": return "Clear";
    case "manual": return "Manual";
    default: return "Restore";
  }
}

function kindVariant(kind: RestorePointKind | undefined): "default" | "secondary" | "destructive" | "outline" {
  switch (kind) {
    case "import-replace": return "default";
    case "import-add": return "secondary";
    case "import-enrich": return "secondary";
    case "save-workbook": return "outline";
    case "clear-data": return "destructive";
    default: return "outline";
  }
}

export function RestorePointsDialog({
  open,
  onOpenChange,
  items,
  onRestore,
  onDelete,
  activeFolderName,
  folderNeedsPermission,
  onSelectFolder,
  onClearFolder,
  onReRequestPermission,
}: Props) {
  // Group by calendar day (ISO date prefix of createdAt).
  const groups: { day: string; label: string; entries: RestorePointSummary[] }[] = [];
  for (const item of items) {
    const day = item.createdAt.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.entries.push(item);
    } else {
      groups.push({ day, label: formatDateHeading(item.createdAt), entries: [item] });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Restore Points
          </DialogTitle>
        </DialogHeader>

        {/* ── Storage location bar ── */}
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
          {activeFolderName ? (
            <>
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-green-600" />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {activeFolderName}
              </span>
              <span className="shrink-0 text-muted-foreground">/ restore-points</span>
              {onClearFolder && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                  title="Stop using this folder (revert to browser storage)"
                  onClick={onClearFolder}
                >
                  <FolderX className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          ) : folderNeedsPermission ? (
            <>
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
              <span className="flex-1 text-muted-foreground">Permission needed for saved folder</span>
              {onReRequestPermission && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 shrink-0 px-2 text-xs"
                  onClick={onReRequestPermission}
                >
                  Re-grant
                </Button>
              )}
            </>
          ) : (
            <>
              <HardDrive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-muted-foreground">Browser storage (IndexedDB)</span>
            </>
          )}
          {!activeFolderName && onSelectFolder && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 shrink-0 px-2 text-xs"
              onClick={onSelectFolder}
              title="Save restore points to a folder on disk"
            >
              <FolderOpen className="mr-1 h-3 w-3" />
              Select folder
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No restore points saved yet.
            <br />
            They are created automatically before import operations and workbook saves.
          </p>
        ) : (
          <ScrollArea className="h-[380px] pr-2">
            <div className="space-y-3">
              {groups.map((group) => (
                <div key={group.day}>
                  <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.entries.map((item, idx) => (
                      <div key={item.id}>
                        {idx > 0 && <Separator className="my-0.5" />}
                        <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Badge variant={kindVariant(item.kind)} className="shrink-0 px-1.5 py-0 text-[10px]">
                                {kindLabel(item.kind)}
                              </Badge>
                              <p className="truncate text-sm font-medium">{item.label}</p>
                            </div>
                            <p className="ml-0 text-xs text-muted-foreground">
                              {formatTimestamp(item.createdAt)}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => onRestore(item.id)}
                              title="Restore to this point"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Restore
                            </Button>
                            {onDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => onDelete(item.id)}
                                title="Delete this restore point"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

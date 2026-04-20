import { useState, useCallback, useEffect } from "react";
import type { AssetRow } from "@/lib/asset-types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: AssetRow | null;
  onReplace: (
    rowId: number,
    newComputername: string,
    newModell: string,
    warrantyUntil: string,
  ) => void;
}

export function ReplaceDeviceDialog({ open, onOpenChange, row, onReplace }: Props) {
  const [computername, setComputername] = useState("");
  const [modell, setModell] = useState("");
  const [warrantyDate, setWarrantyDate] = useState<Date | undefined>();

  // Reset on open
  useEffect(() => {
    if (open) {
      setComputername("");
      setModell("");
      setWarrantyDate(undefined);
    }
  }, [open]);

  const canSave = computername.trim() !== "" && modell.trim() !== "";

  const handleSave = useCallback(() => {
    if (!row || !canSave) return;
    onReplace(
      row.id,
      computername.trim(),
      modell.trim(),
      warrantyDate ? format(warrantyDate, "yyyy-MM-dd") : "",
    );
    onOpenChange(false);
  }, [row, computername, modell, warrantyDate, canSave, onReplace, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Replace Device</DialogTitle>
          <DialogDescription>
            {row ? (
              <>
                Replacing device for user <strong>{row.user || "(no user)"}</strong>.
                Current device: <strong>{row.computername || "(none)"}</strong>
                {row.modell ? ` — ${row.modell}` : ""}.
                The old computername will be logged in Comments.
              </>
            ) : (
              "Select a single row first."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1">
            <Label htmlFor="replace-computername">New Computername *</Label>
            <Input
              id="replace-computername"
              value={computername}
              onChange={(e) => setComputername(e.target.value)}
              placeholder="e.g. HQ-LT-12345"
              autoFocus
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="replace-modell">New Modell *</Label>
            <Input
              id="replace-modell"
              value={modell}
              onChange={(e) => setModell(e.target.value)}
              placeholder="e.g. Lenovo ThinkPad X1"
            />
          </div>
          <div className="grid gap-1">
            <Label>Warranty until (optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !warrantyDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {warrantyDate ? format(warrantyDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={warrantyDate}
                  onSelect={setWarrantyDate}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>Replace</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

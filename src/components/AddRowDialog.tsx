import { useState, useCallback } from "react";
import type { AssetRow } from "@/lib/asset-types";
import { STATUS_OPTIONS, type AssetStatus } from "@/lib/asset-edits";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: string[];
  onSave: (raw: Record<string, string>, status: AssetStatus, warrantyUntil: string) => void;
}

const SKIP_COLS = new Set(["Exceptions", "Source file", "Status", "Warranty until"]);

export function AddRowDialog({ open, onOpenChange, columns, onSave }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<AssetStatus>("");
  const [warrantyDate, setWarrantyDate] = useState<Date | undefined>();

  const editableCols = columns.filter((c) => !SKIP_COLS.has(c));

  const handleSave = useCallback(() => {
    const raw: Record<string, string> = {};
    for (const col of columns) {
      raw[col] = values[col] ?? "";
    }
    onSave(raw, status, warrantyDate ? format(warrantyDate, "yyyy-MM-dd") : "");
    setValues({});
    setStatus("");
    setWarrantyDate(undefined);
    onOpenChange(false);
  }, [columns, values, status, warrantyDate, onSave, onOpenChange]);

  const handleCancel = useCallback(() => {
    setValues({});
    setStatus("");
    setWarrantyDate(undefined);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Asset</DialogTitle>
          <DialogDescription>Fill in the details for the new asset row.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {editableCols.map((col) => (
            <div key={col} className="grid gap-1">
              <Label htmlFor={`add-${col}`}>{col}</Label>
              <Input
                id={`add-${col}`}
                value={values[col] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [col]: e.target.value }))}
                placeholder={col}
              />
            </div>
          ))}

          <div className="grid gap-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AssetStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="No status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1">
            <Label>Warranty until</Label>
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
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useCallback, useEffect, useMemo } from "react";
import type { AssetRow } from "@/lib/asset-types";
import type { AssetEdits } from "@/lib/asset-edits";
import { getEditKey } from "@/lib/asset-edits";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type ReplaceSource =
  | { kind: "new"; computername: string; modell: string; warrantyUntil: string }
  | { kind: "stock"; sourceRowId: number };

export type OldDeviceDestination = "In stock" | "Sent back to broker";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: AssetRow | null;
  /** All rows + edits, used to populate the "From In Stock" picker. */
  allRows: AssetRow[];
  edits: Record<string, AssetEdits>;
  onReplace: (
    rowId: number,
    source: ReplaceSource,
    oldDestination: OldDeviceDestination,
  ) => void;
}

export function ReplaceDeviceDialog({
  open, onOpenChange, row, allRows, edits, onReplace,
}: Props) {
  const [tab, setTab] = useState<"new" | "stock">("new");
  const [computername, setComputername] = useState("");
  const [modell, setModell] = useState("");
  const [warrantyDate, setWarrantyDate] = useState<Date | undefined>();
  const [stockSearch, setStockSearch] = useState("");
  const [stockPickedId, setStockPickedId] = useState<number | null>(null);
  const [oldDestination, setOldDestination] = useState<OldDeviceDestination>("In stock");

  // Reset on open
  useEffect(() => {
    if (open) {
      setTab("new");
      setComputername("");
      setModell("");
      setWarrantyDate(undefined);
      setStockSearch("");
      setStockPickedId(null);
      setOldDestination("In stock");
    }
  }, [open]);

  // Devices currently In Stock with no assigned user (excluding the row being replaced).
  const inStockOptions = useMemo(() => {
    if (!row) return [] as AssetRow[];
    return allRows.filter((r) => {
      if (r.id === row.id) return false;
      if (!r.computername.trim()) return false;
      if (r.user.trim()) return false;
      const e = edits[getEditKey(r.id)];
      return e?.status === "In stock";
    });
  }, [allRows, edits, row]);

  const filteredStock = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    if (!q) return inStockOptions;
    return inStockOptions.filter(
      (r) =>
        r.computername.toLowerCase().includes(q) ||
        r.modell.toLowerCase().includes(q),
    );
  }, [inStockOptions, stockSearch]);

  const canSave =
    tab === "new"
      ? computername.trim() !== "" && modell.trim() !== ""
      : stockPickedId !== null;

  const handleSave = useCallback(() => {
    if (!row || !canSave) return;
    if (tab === "new") {
      onReplace(
        row.id,
        {
          kind: "new",
          computername: computername.trim(),
          modell: modell.trim(),
          warrantyUntil: warrantyDate ? format(warrantyDate, "yyyy-MM-dd") : "",
        },
        oldDestination,
      );
    } else if (stockPickedId !== null) {
      onReplace(row.id, { kind: "stock", sourceRowId: stockPickedId }, oldDestination);
    }
    onOpenChange(false);
  }, [row, canSave, tab, computername, modell, warrantyDate, stockPickedId, oldDestination, onReplace, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Replace Device</DialogTitle>
          <DialogDescription>
            {row ? (
              <>
                Replacing device for user <strong>{row.user || "(no user)"}</strong>.
                Current device: <strong>{row.computername || "(none)"}</strong>
                {row.modell ? ` — ${row.modell}` : ""}.
                The old asset becomes its own row with the chosen status; the user
                is reassigned to the new device.
              </>
            ) : (
              "Select a single row first."
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "new" | "stock")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new">New device</TabsTrigger>
            <TabsTrigger value="stock">
              From In Stock {inStockOptions.length > 0 ? `(${inStockOptions.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="space-y-3 mt-3">
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
          </TabsContent>

          <TabsContent value="stock" className="space-y-3 mt-3">
            {inStockOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded">
                No unassigned devices in stock right now.
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by computername or model"
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="max-h-64 overflow-auto rounded-md border border-border">
                  {filteredStock.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3 text-center">
                      No matches.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {filteredStock.map((r) => {
                        const isPicked = stockPickedId === r.id;
                        return (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => setStockPickedId(r.id)}
                              className={cn(
                                "w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors",
                                isPicked && "bg-primary/10",
                              )}
                            >
                              <div className="font-medium truncate">{r.computername}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {r.modell || "(no model)"}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        {row && row.computername.trim() && (
          <div className="grid gap-1 mt-2">
            <Label htmlFor="old-destination">Send old device to</Label>
            <Select value={oldDestination} onValueChange={(v) => setOldDestination(v as OldDeviceDestination)}>
              <SelectTrigger id="old-destination">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="In stock">In stock</SelectItem>
                <SelectItem value="Sent back to broker">Sent back to broker</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>Replace</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

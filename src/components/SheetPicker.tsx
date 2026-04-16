import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  sheets: string[];
  onPick: (sheet: string) => void;
  onCancel: () => void;
}

export function SheetPicker({ open, sheets, onPick, onCancel }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Select a sheet</DialogTitle>
          <DialogDescription>This workbook contains multiple sheets. Choose one to import.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          {sheets.map((s) => (
            <Button key={s} variant="outline" onClick={() => onPick(s)} className="justify-start">
              {s}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

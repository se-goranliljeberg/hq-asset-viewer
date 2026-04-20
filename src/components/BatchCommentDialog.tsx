import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onApply: (note: string) => void;
}

export function BatchCommentDialog({ open, onOpenChange, count, onApply }: Props) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  const canApply = note.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add comment to {count} row{count === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            The note will be appended to each selected row's audit log, attributed
            to your initials, and tagged "(batch)".
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="batch-note">Note</Label>
          <Textarea
            id="batch-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder='e.g. "Move to correct OU" or "Verify with manager"'
            rows={4}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (!canApply) return;
              onApply(note.trim());
              onOpenChange(false);
            }}
            disabled={!canApply}
          >
            Apply to {count} row{count === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

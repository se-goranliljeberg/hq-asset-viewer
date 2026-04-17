import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onConfirm: (initials: string) => void;
  onCancel: () => void;
}

export function InitialsPromptDialog({ open, onConfirm, onCancel }: Props) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  const submit = () => {
    const trimmed = value.trim().toUpperCase().slice(0, 4);
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Who's making changes?</DialogTitle>
          <DialogDescription>
            Enter your initials (2–4 letters). They'll be added to every audit-log entry for this
            browser. You can change this later by clearing site data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="initials">Initials</Label>
          <Input
            id="initials"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4))}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="e.g. JD"
            className="uppercase tracking-widest text-center text-base"
            maxLength={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Skip</Button>
          <Button onClick={submit} disabled={!value.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

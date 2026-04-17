import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { History, Undo2 } from "lucide-react";
import { parseEntries } from "@/lib/comment-log";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  width: number;
  rowId: number;
  onEdit: (rowId: number, value: string) => void;
  onUndo: (rowId: number) => void;
  canUndo: boolean;
}

const MIN_COL_W = 80;

export function CommentCell({ value, width, rowId, onEdit, onUndo, canUndo }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [historyOpen, setHistoryOpen] = useState(false);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== value) onEdit(rowId, draft);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(value);
  };

  const entries = parseEntries(value);

  if (editing) {
    return (
      <div className="px-1 py-0.5" style={{ width, minWidth: MIN_COL_W }}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1 px-1 py-1"
      style={{ width, minWidth: MIN_COL_W }}
    >
      <div
        className="flex-1 min-w-0 truncate cursor-text hover:bg-muted/50 rounded-sm px-2 py-1 text-xs"
        title={value ? `${value} (double-click to edit)` : "Double-click to edit"}
        onDoubleClick={startEdit}
      >
        {value || <span className="text-muted-foreground/50">—</span>}
      </div>

      <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              "h-6 w-6 shrink-0",
              entries.length === 0 && "opacity-30",
            )}
            title="Show change history"
            disabled={entries.length === 0}
          >
            <History className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="end">
          <div className="px-3 py-2 border-b border-border">
            <h4 className="text-sm font-semibold">Change history</h4>
            <p className="text-xs text-muted-foreground">
              {entries.length} {entries.length === 1 ? "entry" : "entries"} · raw text preserved for export
            </p>
          </div>
          <div className="max-h-80 overflow-auto p-2 space-y-1.5">
            {entries.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                No history yet.
              </p>
            ) : (
              [...entries].reverse().map((e, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-md border border-border px-3 py-2 text-xs",
                    e.isNote && "bg-muted/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 text-muted-foreground">
                    <span>{e.date ?? "—"}</span>
                    <div className="flex items-center gap-1.5">
                      {e.isBatch && (
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                          batch
                        </span>
                      )}
                      {e.initials && (
                        <span className="rounded bg-primary/15 text-primary px-1.5 py-0.5 text-[10px] font-mono font-semibold">
                          {e.initials}
                        </span>
                      )}
                      {e.isNote && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                          note
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-foreground">
                    {e.field ? (
                      <>
                        <span className="font-medium">{e.field}</span>{" "}
                        <span className="text-muted-foreground">from</span>{" "}
                        <span className="font-mono text-[11px]">"{e.from || "(empty)"}"</span>{" "}
                        <span className="text-muted-foreground">to</span>{" "}
                        <span className="font-mono text-[11px]">"{e.to || "(empty)"}"</span>
                      </>
                    ) : (
                      e.change
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn("h-6 w-6 shrink-0", !canUndo && "opacity-30")}
        title={canUndo ? "Undo last change for this row" : "Nothing to undo"}
        disabled={!canUndo}
        onClick={() => onUndo(rowId)}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

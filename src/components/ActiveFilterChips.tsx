import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface FilterChip {
  /** Stable key — usually `${group}:${value}`. */
  key: string;
  /** Group label shown before the value, e.g. "Model". */
  group: string;
  /** Value label shown to the user. */
  value: string;
  /** Called when the user clicks the × on this chip. */
  onRemove: () => void;
}

interface Props {
  chips: FilterChip[];
  onClearAll: () => void;
}

/**
 * Renders selected filter values as removable chips below the FilterBar.
 * Hidden when no filters are active.
 */
export function ActiveFilterChips({ chips, onClearAll }: Props) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Active filters:</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2.5 py-0.5 text-xs hover:bg-secondary transition-colors"
          title={`Remove ${chip.group}: ${chip.value}`}
        >
          <span className="text-muted-foreground">{chip.group}:</span>
          <span className="font-medium">{chip.value}</span>
          <X className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
        </button>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs text-muted-foreground"
        onClick={onClearAll}
      >
        Clear all
      </Button>
    </div>
  );
}

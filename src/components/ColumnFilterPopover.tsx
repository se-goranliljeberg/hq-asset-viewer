import * as React from "react";
import { Check, Filter, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const BLANK_TOKEN = "__blank__";
const BLANK_LABEL = "(Blanks)";

interface Props {
  /** Column display name (used only for the dialog header). */
  column: string;
  /** All distinct values currently present for this column (raw, unsorted ok). */
  values: string[];
  /** Currently-selected values. Empty array means "no filter" (everything passes). */
  selected: string[];
  onChange: (next: string[]) => void;
}

/**
 * Excel-style per-column filter: opens a checklist of distinct values for the
 * column with a search box, Select all / Clear, and a "(Blanks)" token for
 * empty cells. Selecting a non-empty subset toggles the funnel icon to active.
 */
export function ColumnFilterPopover({ column, values, selected, onChange }: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Build sorted distinct list, replacing empty strings with the BLANK token.
  const distinct = React.useMemo(() => {
    const set = new Set<string>();
    let hasBlank = false;
    for (const v of values) {
      if (v === "" || v == null) hasBlank = true;
      else set.add(v);
    }
    const sorted = [...set].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );
    return hasBlank ? [BLANK_TOKEN, ...sorted] : sorted;
  }, [values]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return distinct;
    return distinct.filter((v) => {
      if (v === BLANK_TOKEN) return BLANK_LABEL.toLowerCase().includes(q);
      return v.toLowerCase().includes(q);
    });
  }, [distinct, query]);

  const isActive = selected.length > 0 && selected.length < distinct.length;

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const selectAll = () => onChange([]);
  const clearAll = () => onChange(["__never_match__"]);

  // When no filter is set, the visual checkboxes show "all checked".
  const isChecked = (v: string) =>
    selected.length === 0 ? true : selected.includes(v);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Filter ${column}`}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "shrink-0 grid place-content-center h-5 w-5 rounded-sm transition-colors",
            isActive
              ? "text-primary bg-primary/15 ring-1 ring-primary/40"
              : "text-muted-foreground/50 hover:text-foreground hover:bg-accent",
          )}
        >
          <Filter className="h-3 w-3" strokeWidth={isActive ? 2.5 : 2} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[260px] p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b px-2 py-1.5 text-xs font-medium truncate" title={column}>
          Filter: {column}
        </div>
        <div className="flex items-center justify-between border-b px-2 py-1.5 text-xs">
          <button
            type="button"
            onClick={selectAll}
            className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-accent"
          >
            <Check className="h-3 w-3" /> Select all
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-accent text-muted-foreground"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
        <div className="relative border-b px-2 py-1.5">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="max-h-[280px] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {query ? "No matches" : "No values"}
            </div>
          )}
          {filtered.map((v) => {
            const checked = isChecked(v);
            const isBlank = v === BLANK_TOKEN;
            return (
              <button
                key={v}
                type="button"
                onClick={() => toggle(v)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent text-left"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-content-center rounded-sm border border-primary shadow-sm",
                    checked && "bg-primary text-primary-foreground",
                  )}
                >
                  {checked && <Check className="h-3 w-3" />}
                </span>
                <span className={cn("truncate", isBlank && "italic text-muted-foreground")}>
                  {isBlank ? BLANK_LABEL : v}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const COLUMN_FILTER_BLANK_TOKEN = BLANK_TOKEN;

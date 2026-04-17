import * as React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Visual-only checkbox used inside a clickable row button (cannot nest a real <button>). */
function CheckboxIcon({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-4 w-4 shrink-0 place-content-center rounded-sm border border-primary shadow-sm",
        checked && "bg-primary text-primary-foreground",
      )}
    >
      {checked && <Check className="h-3 w-3" />}
    </span>
  );
}


interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  allLabel?: string;
  className?: string;
  /** Optional special row representing "no value set". When selected, included in `selected` as this token. */
  noneOption?: { value: string; label: string };
  /** Show inline search box above the option list (auto-on for >8 options). */
  searchable?: boolean;
}

/**
 * Generic multi-select dropdown used by the filter bar.
 * Empty `selected` array == "All" (no filter applied).
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select…",
  allLabel = "All",
  className,
  noneOption,
  searchable,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const showSearch = searchable ?? options.length > 8;

  // Reset the search field when the popover closes so the next open is clean.
  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filteredOptions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const allOptionValues = React.useMemo(() => {
    return noneOption ? [noneOption.value, ...options] : options;
  }, [options, noneOption]);

  const isAll = selected.length === 0 || selected.length === allOptionValues.length;

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const selectAll = () => onChange([]);
  const clearAll = () => onChange(["__never_match__"]);

  const label = (() => {
    if (selected.length === 0) return allLabel;
    if (selected.length === 1) {
      const v = selected[0];
      if (v === "__never_match__") return "None";
      if (noneOption && v === noneOption.value) return noneOption.label;
      return v;
    }
    return `${selected.filter((s) => s !== "__never_match__").length} selected`;
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 justify-between font-normal text-sm",
            isAll && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{isAll ? placeholder : label}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <div className="flex items-center justify-between border-b px-2 py-1.5 text-xs">
          <button
            type="button"
            onClick={selectAll}
            className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-accent"
          >
            <Check className="h-3 w-3" /> All
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-accent text-muted-foreground"
          >
            <X className="h-3 w-3" /> None
          </button>
        </div>
        {showSearch && (
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
        )}
        <div className="max-h-[280px] overflow-y-auto py-1">
          {noneOption && (!query || noneOption.label.toLowerCase().includes(query.toLowerCase())) && (
            <button
              type="button"
              onClick={() => toggle(noneOption.value)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent text-left"
            >
              <CheckboxIcon checked={selected.includes(noneOption.value)} />
              <span className="italic text-muted-foreground">{noneOption.label}</span>
            </button>
          )}
              <span className="italic text-muted-foreground">{noneOption.label}</span>
            </button>
          )}
          {filteredOptions.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {query ? "No matches" : "No options"}
            </div>
          )}
          {filteredOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent text-left"
            >
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={() => toggle(opt)}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="truncate">{opt}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

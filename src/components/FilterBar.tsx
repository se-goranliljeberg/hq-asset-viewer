import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Search, RotateCcw, Eraser } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";

export type SkanskaFilter = "all" | "skanska" | "non-skanska";

interface Props {
  search: string;
  onSearch: (v: string) => void;
  modelFilter: string[];
  onModelFilter: (v: string[]) => void;
  userFilter: string[];
  onUserFilter: (v: string[]) => void;
  managerFilter: string[];
  onManagerFilter: (v: string[]) => void;
  sourceFilter: string[];
  onSourceFilter: (v: string[]) => void;
  statusFilter: string[];
  onStatusFilter: (v: string[]) => void;
  exceptionsOnly: boolean;
  onExceptionsOnly: (v: boolean) => void;
  excludeInactive: boolean;
  onExcludeInactive: (v: boolean) => void;
  skanskaFilter: SkanskaFilter;
  onSkanskaFilter: (v: SkanskaFilter) => void;
  staleThreshold: number;
  onStaleThreshold: (v: number) => void;
  models: string[];
  users: string[];
  managers: string[];
  sources: string[];
  statuses: string[];
  onResetColumns?: () => void;
  onResetMappings?: () => void;
}

export const STATUS_NONE_TOKEN = "__none__";

export function FilterBar({
  search, onSearch,
  modelFilter, onModelFilter,
  userFilter, onUserFilter,
  managerFilter, onManagerFilter,
  sourceFilter, onSourceFilter,
  statusFilter, onStatusFilter,
  exceptionsOnly, onExceptionsOnly,
  excludeInactive, onExcludeInactive,
  skanskaFilter, onSkanskaFilter,
  staleThreshold, onStaleThreshold,
  models, users, managers, sources, statuses,
  onResetColumns, onResetMappings,
}: Props) {
  const cycleSkanska = () => {
    const next: SkanskaFilter = skanskaFilter === "skanska"
      ? "non-skanska"
      : skanskaFilter === "non-skanska"
        ? "all"
        : "skanska";
    onSkanskaFilter(next);
  };
  const skanskaLabel =
    skanskaFilter === "skanska" ? "Skanska only" :
    skanskaFilter === "non-skanska" ? "Non-Skanska only" :
    "All devices";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search all columns…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <MultiSelect
        options={models}
        selected={modelFilter}
        onChange={onModelFilter}
        placeholder="All Models"
        allLabel="All Models"
        className="w-[180px]"
      />

      <MultiSelect
        options={users}
        selected={userFilter}
        onChange={onUserFilter}
        placeholder="All Users"
        allLabel="All Users"
        className="w-[180px]"
      />

      <MultiSelect
        options={managers}
        selected={managerFilter}
        onChange={onManagerFilter}
        placeholder="All Managers"
        allLabel="All Managers"
        className="w-[180px]"
      />

      {sources.length > 1 && (
        <MultiSelect
          options={sources}
          selected={sourceFilter}
          onChange={onSourceFilter}
          placeholder="All Sources"
          allLabel="All Sources"
          className="w-[200px]"
        />
      )}

      <MultiSelect
        options={statuses}
        selected={statusFilter}
        onChange={onStatusFilter}
        placeholder="All Statuses"
        allLabel="All Statuses"
        className="w-[200px]"
        noneOption={{ value: STATUS_NONE_TOKEN, label: "No status set" }}
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" className="h-9" onClick={cycleSkanska}>
            {skanskaLabel}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Cycle: Skanska only → Non-Skanska only → All</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <Switch checked={excludeInactive} onCheckedChange={onExcludeInactive} />
            <span className="text-sm text-muted-foreground whitespace-nowrap">Hide inactive</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>Hide users marked as inactive</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <Switch checked={exceptionsOnly} onCheckedChange={onExceptionsOnly} />
            <span className="text-sm text-muted-foreground whitespace-nowrap">Exceptions only</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>Show only rows with data quality issues</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Stale &gt;</span>
            <Input
              type="number"
              min={1}
              max={3650}
              value={staleThreshold}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n > 0) onStaleThreshold(Math.floor(n));
              }}
              className="h-8 w-16 text-xs"
            />
            <span className="text-xs text-muted-foreground">d</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>Days since last logon to flag as stale</TooltipContent>
      </Tooltip>

      <div className="ml-auto flex items-center gap-1">
        {onResetMappings && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onResetMappings}>
                <Eraser className="h-3.5 w-3.5 mr-1" /> Reset mappings
              </Button>
            </TooltipTrigger>
            <TooltipContent>Forget remembered column mappings for all imported files</TooltipContent>
          </Tooltip>
        )}
        {onResetColumns && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onResetColumns}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset columns
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset column order and widths to defaults</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

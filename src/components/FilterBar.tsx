import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

interface Props {
  search: string;
  onSearch: (v: string) => void;
  modelFilter: string;
  onModelFilter: (v: string) => void;
  userFilter: string;
  onUserFilter: (v: string) => void;
  sourceFilter: string;
  onSourceFilter: (v: string) => void;
  exceptionsOnly: boolean;
  onExceptionsOnly: (v: boolean) => void;
  models: string[];
  users: string[];
  sources: string[];
}

export function FilterBar({
  search, onSearch,
  modelFilter, onModelFilter,
  userFilter, onUserFilter,
  sourceFilter, onSourceFilter,
  exceptionsOnly, onExceptionsOnly,
  models, users, sources,
}: Props) {
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

      <Select value={modelFilter} onValueChange={onModelFilter}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All Models" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Models</SelectItem>
          {models.map((m) => (
            <SelectItem key={m} value={m}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={userFilter} onValueChange={onUserFilter}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All Users" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Users</SelectItem>
          {users.map((u) => (
            <SelectItem key={u} value={u}>{u}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {sources.length > 1 && (
        <Select value={sourceFilter} onValueChange={onSourceFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Sources</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center gap-2">
        <Switch checked={exceptionsOnly} onCheckedChange={onExceptionsOnly} />
        <span className="text-sm text-muted-foreground whitespace-nowrap">Exceptions only</span>
      </div>
    </div>
  );
}

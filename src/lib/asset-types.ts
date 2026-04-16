export interface AssetRow {
  id: number;
  computername: string;
  modell: string;
  user: string;
  raw: Record<string, string>;
  exceptions: string[];
  sourceFile: string;
}

export interface AssetData {
  rows: AssetRow[];
  columns: string[];
  filename: string;
  loadedAt: string;
}

export type SortDir = "asc" | "desc" | null;
export interface SortState {
  column: string;
  dir: SortDir;
}

export type LifecycleState = "In stock" | "Deployed at user" | "Sent back to broker";

export interface LifecycleEvent {
  /** ISO timestamp when this event was recorded. */
  at: string;
  /** Initials of the user who recorded it (matches comment-log convention). */
  by: string;
  /** Previous lifecycle state (empty for first-touch events). */
  from?: LifecycleState | "";
  /** New lifecycle state. */
  to: LifecycleState;
  /** Username this asset was assigned to immediately AFTER the event. */
  user?: string;
  /** Username this asset was unassigned FROM (during a replace/return). */
  prevUser?: string;
  /** Free-form note (e.g. "Replaced device with HQ-LT-99"). */
  note?: string;
}

// ─── Workbook provenance ───────────────────────────────────────────────────

export type SourceOriginKind = "imported" | "manual" | "generated";

export interface WorkbookRowRef {
  workbookId: string;
  sheetName: string;
  /** 1-based Excel row number (row 1 = header, row 2 = first data row). */
  rowNumber: number;
  /** canonical field name → original worksheet column header */
  sourceHeaders: Record<string, string>;
}

export interface WorkbookDatasetInfo {
  workbookId: string;
  filename: string;
  sheetName: string;
  fileType: "xlsx" | "xls" | "csv" | "unknown";
  saveEligible: boolean;
}

// ─── Core row / dataset ────────────────────────────────────────────────────

export interface AssetRow {
  id: number;
  computername: string;
  modell: string;
  user: string;
  raw: Record<string, string>;
  exceptions: string[];
  sourceFile: string;
  /**
   * "computer" rows represent a physical asset (have or once had a Computername).
   * "user-only" rows are user-list entries with no associated hardware.
   * Optional for backward compatibility with persisted data.
   */
  assetKind?: "computer" | "user-only";
  /** Append-only lifecycle log for this asset. */
  history?: LifecycleEvent[];
  /** Distinct usernames that have held this asset (most recent last). */
  previousUsers?: string[];
  /** How this row entered the dataset. */
  sourceOriginKind?: SourceOriginKind;
  /** Reference back to the source workbook row, used for direct save-back. */
  workbookRef?: WorkbookRowRef;
}

export interface AssetData {
  rows: AssetRow[];
  columns: string[];
  filename: string;
  loadedAt: string;
  /** Present when all rows came from a single xlsx/xls import. */
  workbookInfo?: WorkbookDatasetInfo;
}

export type SortDir = "asc" | "desc" | null;
export interface SortState {
  column: string;
  dir: SortDir;
}

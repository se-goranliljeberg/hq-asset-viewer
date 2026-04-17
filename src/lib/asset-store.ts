import type { AssetData } from "./asset-types";

const STORAGE_KEY = "hq_asset_data";
const COL_ORDER_KEY = "hq_asset_column_order";
const COL_WIDTHS_KEY = "hq_asset_column_widths";

export function saveData(data: AssetData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadData(): AssetData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AssetData;
  } catch {
    return null;
  }
}

export function clearData(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function loadColumnOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(COL_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveColumnOrder(order: string[]): void {
  try {
    localStorage.setItem(COL_ORDER_KEY, JSON.stringify(order));
  } catch {
    /* ignore */
  }
}

export function clearColumnOrder(): void {
  localStorage.removeItem(COL_ORDER_KEY);
}

export function loadColumnWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COL_WIDTHS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveColumnWidths(widths: Record<string, number>): void {
  try {
    localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(widths));
  } catch {
    /* ignore */
  }
}

import type { AssetData } from "./asset-types";
import type { Mapping } from "./excel-parser";

const STORAGE_KEY = "hq_asset_data";
const COL_ORDER_KEY = "hq_asset_column_order";
const COL_WIDTHS_KEY = "hq_asset_column_widths";
const MAPPING_PREFIX = "hq_mapping_";
const MIGRATION_KEY = "hq_canonical_migrated_v1";

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

// ---------- Mapping memory ----------

export function loadMapping(headerHash: string): Mapping | null {
  try {
    const raw = localStorage.getItem(MAPPING_PREFIX + headerHash);
    if (!raw) return null;
    return JSON.parse(raw) as Mapping;
  } catch {
    return null;
  }
}

export function saveMapping(headerHash: string, mapping: Mapping): void {
  try {
    localStorage.setItem(MAPPING_PREFIX + headerHash, JSON.stringify(mapping));
  } catch {
    /* ignore */
  }
}

export function clearAllMappings(): number {
  let count = 0;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(MAPPING_PREFIX)) {
      localStorage.removeItem(k);
      count++;
    }
  }
  return count;
}

// ---------- Canonical migration flag ----------

export function isMigrated(): boolean {
  return localStorage.getItem(MIGRATION_KEY) === "1";
}
export function markMigrated(): void {
  try {
    localStorage.setItem(MIGRATION_KEY, "1");
  } catch {
    /* ignore */
  }
}

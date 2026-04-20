

## Username-as-master imports + Active/Skanska columns + stale-logon highlighting + Manager filter

### 1. Schema additions

**`src/lib/asset-edits.ts`** — extend `AssetEdits`:
- `userActive?: "yes" | "no" | ""` (default treated as "yes" when unset)
- `skanskaComputer?: "yes" | "no" | ""` (empty when row has no computername; default "yes" otherwise)

**`src/lib/excel-parser.ts`** — add canonical fields `"User Active?"` and `"Skanska computer?"` with aliases (`enabled`, `accountdisabled`, `active`, `disabled` / `skanska computer`, `company device`, `corporate device`). Parse common truthy strings ("yes/no/true/false/1/0/enabled/disabled") into `"yes"`/`"no"` and seed into `edits` (similar to Status/Warranty seeding). On rows with empty Computername, set `skanskaComputer = ""`.

### 2. Username-as-master duplicate handling

**New file `src/components/ImportConflictDialog.tsx`** — modal listing each duplicate username (case-insensitive match against existing rows). For every conflicting row, show only fields where `existing !== incoming && incoming !== ""`. Each field has a checkbox (default off = keep existing). Header has "Select all" / "Skip all" per row. On confirm, returns a `Map<existingRowId, Set<fieldName>>`.

**`src/lib/excel-parser.ts`** — new helper `detectUsernameConflicts(existing, incoming)` returning `{ conflicts: Array<{ existingRow, incomingRow, diffs: Array<{field, oldVal, newVal}> }>, nonConflicting: AssetRow[] }`. Username matching is case-insensitive; rows without a username fall back to existing email/computername behavior (unchanged).

**`src/components/AssetViewer.tsx`** — modify `handleImportAdd` (and `handleImportEnrich`) flow:
1. After parse, run `detectUsernameConflicts`.
2. If conflicts exist → open `ImportConflictDialog` with the diff list.
3. On confirm: apply chosen field updates to existing rows (raw + canonical fields, plus `seedEdits` for Status/Warranty/userActive/skanskaComputer), append a single combined audit comment per row (`"Imported update: <field> from \"…\" to \"…\", …"`), then append truly-new (non-conflicting) rows via the existing `mergeData` path.
4. Update `importedAt` timestamps for the overwritten fields only.

The existing "Add / Replace / Enrich" mode dialog stays; conflict resolution runs after the user picks "Add" or "Enrich".

### 3. Exceptions and default filters

**`src/lib/excel-parser.ts`** — when building exceptions, add `"Inactive user"` when `userActive === "no"`. (Skanska false is not an exception — it's a category, filtered separately.)

**`src/components/AssetViewer.tsx`** — new persisted filter `excludeInactive` (default `true`) and `skanskaFilter` ("all" | "skanska" | "non-skanska", default `"skanska"`). Both stored in localStorage alongside other filters, applied in the `filtered` memo. New filter chips appear in `ActiveFilterChips` when they diverge from default.

### 4. Stale Last logon date

**New `src/lib/stale-config.ts`** — `loadStaleThreshold()` / `saveStaleThreshold()`, default 90 days, key `hq_stale_threshold_days`.

**`src/components/AssetTable.tsx`** — when rendering the `Last logon date` cell, compute days-since; if `> threshold`, wrap value in subtle warning style (`text-amber-600 dark:text-amber-400` + small icon), keep the existing import-timestamp tooltip and add `"X days since last logon"` to the tooltip line.

**`src/components/KpiCards.tsx`** — add fifth KPI key `"stale"` showing count of rows with stale logon. Clicking it filters to those rows (mirrors existing exceptions card behavior). Switch grid to `md:grid-cols-5`.

**Threshold control**: small inline input in `FilterBar` (or next to the Stale KPI) — number input "Stale after __ days", persisted.

### 5. Manager filter

**`src/components/FilterBar.tsx`** — add a `MultiSelect` for Manager, identical pattern to model/user filters.

**`src/components/AssetViewer.tsx`** — add `managerFilter` state with localStorage key `hq_filter_managers`, derive `managers` list from `rows[].raw["Manager"]`, apply in `filtered` memo, and add chips to `activeChips`.

### 6. Table column defaults

**`src/components/AssetTable.tsx`** — extend `CANONICAL_ORDER` with `"User Active?"` and `"Skanska computer?"`, add both to `VIRTUAL_CANONICAL` so they always appear. Render as Yes/No `Select` cells (similar to Status), reading/writing via `onEdit` to `edits.userActive` / `edits.skanskaComputer`.

### Files touched

- **Edit** `src/lib/asset-edits.ts` — add `userActive`, `skanskaComputer` fields.
- **Edit** `src/lib/excel-parser.ts` — new canonical fields, aliases, conflict detection helper, inactive-user exception.
- **Create** `src/lib/stale-config.ts` — threshold persistence.
- **Create** `src/components/ImportConflictDialog.tsx` — conflict resolution UI.
- **Edit** `src/components/AssetViewer.tsx` — wire conflict dialog into import flow, add Manager / Active / Skanska / stale filters & state, threshold control, default filters.
- **Edit** `src/components/AssetTable.tsx` — new columns, stale logon styling, threshold-aware tooltip.
- **Edit** `src/components/KpiCards.tsx` — add Stale Accounts card, switch to 5-column grid.
- **Edit** `src/components/FilterBar.tsx` — add Manager multi-select, Skanska tri-state, Inactive toggle, threshold input.

### Out of scope

- Changelog/version bump (separate `npm run bump` step).
- Bulk-editing Active/Skanska across selected rows (can be added later).


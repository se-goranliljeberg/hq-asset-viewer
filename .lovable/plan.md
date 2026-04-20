

## Add "Manager" and "Last logon date" canonical columns

Two new canonical columns, importable through the mapping dialog, with a hover tooltip on "Last logon date" showing when that specific value was imported.

### Schema changes (`src/lib/excel-parser.ts`)

- Extend `CANONICAL_FIELDS` with `"Manager"` and `"Last logon date"` (placed after `"Department"` and `"Last account activity"` respectively, to keep related fields grouped).
- Add `ALIASES` entries:
  - **Manager**: `manager`, `reports to`, `chef`, `linemanager`, `line manager`, `supervisor`
  - **Last logon date**: `last logon date`, `lastlogondate`, `last logon`, `lastlogon`, `last sign-in`, `lastsignin`
- Add `FUZZY_SUBSTRINGS` for both (`"manager"`, `"supervisor"` / `"last logon"`, `"sign-in"`).
- Important: since `"Last account activity"` previously also matched `last logon` aliases, switch its aliases/fuzzy to be more specific (`"last activity"`, `"account activity"`) so `Last logon date` wins for the obvious header. New imports of `"Last Logon Date"` will map to the new field; the old `Last account activity` still catches AD-style "last activity" headers.
- Treat `"Last logon date"` as a date field in `parseSheetWithMapping` (add to `dateFields` set so `normalizeDate` is applied).
- Include both new fields in `enrichWithUsers` enrichment loop (alongside `Name`, `Company`) so a users-file can populate them.

### Per-cell import timestamps (new lightweight store)

- New file `src/lib/import-meta.ts` exporting:
  - `ImportMeta = Record<number /*rowId*/, Partial<Record<string /*field*/, string /*ISO timestamp*/>>>`
  - `loadImportMeta()` / `saveImportMeta()` (localStorage key `hq_import_meta`)
  - Helper `setImportedAt(meta, rowId, field, iso)` and `getImportedAt(meta, rowId, field)`
- In `parseSheetWithMapping`, return per-row, per-field timestamps for any non-empty mapped value (focus on `Last logon date` and `Manager`, but stamp all canonical fields uniformly — cheap and future-proof). Add this to `ParseResult` as `importedAt: Record<number, Record<string, string>>`.
- In `AssetViewer.tsx`, after a successful import / merge / enrich, merge the new `importedAt` entries (remapped to new row ids — same pattern already used for `seedEdits`) into the persisted `ImportMeta`.

### Table display (`src/components/AssetTable.tsx`)

- Add `"Manager"` and `"Last logon date"` to `CANONICAL_ORDER`:
  - `... "Department", "Manager", "Last account activity", "Last logon date", ...`
- These are non-virtual (only show when present in source columns) — no change needed to `VIRTUAL_CANONICAL`.
- For the `"Last logon date"` cell: wrap the `InlineCell` value in a `Tooltip` (existing shadcn `tooltip.tsx`) showing `Imported on <YYYY-MM-DD HH:mm>` when an `importedAt` entry exists. Pass `importedAt` map down from `AssetViewer` as a prop on `AssetTable`.

### Mapping dialog (`src/components/ColumnMappingDialog.tsx`)

- No change required — the dialog already iterates `CANONICAL_FIELDS`, so the two new fields appear automatically in the "Map to" dropdown.

### Files touched

- **Edit** `src/lib/excel-parser.ts` — add fields, aliases, fuzzy, date-handling, importedAt in `ParseResult`.
- **Create** `src/lib/import-meta.ts` — persistent per-cell import timestamp store.
- **Edit** `src/components/AssetViewer.tsx` — merge `importedAt` after import/merge/enrich (with id remap), pass map to `AssetTable`.
- **Edit** `src/components/AssetTable.tsx` — add columns to canonical order, render tooltip on `Last logon date` cell.

### Out of scope

- Migration of existing stored data: old rows will simply have empty values for the two new columns and no import timestamp (tooltip just won't appear). No destructive change.
- Changelog stub: bumping version is a separate `npm run bump` step the user can trigger.




# Reorder columns, import users file, drag-to-reorder columns

Four related changes to the asset table:

## 1. Move "User" to first column
Update the display order so `User` appears as the first data column (after the checkbox). Done by reordering the `displayCols` array in `AssetTable.tsx` — `User` is moved to the front, all other columns follow.

## 2. Add three new columns: Email, Department, Creation date
Add these as standard data columns alongside the existing ones (Computername, Modell, User, etc.). They behave like normal raw columns — editable inline, included in export, filterable via search. The parser auto-picks them up if present in the imported Excel.

## 3. Import users-only file (enrich existing + add user-only rows)
- Detect a "users file" by checking whether **all rows have an empty Computername** (or by a header signature: presence of `Email` / `Department` / `Created` and absence of `Computername`).
- For each user row from the import:
  - **Match** by `User` (case-insensitive, also try `Email` as fallback) against existing rows.
  - **If matched**: enrich that existing row's `Email`, `Department`, `Creation date`, and `User` (if blank).
  - **If unmatched**: append as a new row with empty Computername. Add exception `"User without computer"` so it shows in audit/exceptions filters.
- The "Replace vs Add" dialog still appears, but a third option "**Enrich users**" is offered when a users-only file is detected — this is the recommended action for that file type.
- Column L name lookup: case-insensitive match against `user`, `username`, `samaccountname`.

## 4. Drag-to-reorder columns + persist order in localStorage
- Add drag handles to column headers in `AssetTable.tsx`. Use native HTML5 drag/drop (no new library) — drag a header onto another header to swap positions.
- Persist `columnOrder: string[]` to localStorage under key `hq_asset_column_order`. On load, apply saved order; new columns not in saved order appear at the end.
- A small "Reset column order" button in the filter bar restores default.
- Column widths (already in component state) get the same treatment: persist `colWidths` to localStorage under `hq_asset_column_widths` so resizing also survives reload.

## Technical notes (for reference)

**Files modified:**
- `src/lib/excel-parser.ts` — detect users-only files, expose helper `parseUsersFile()` returning rows tagged for enrichment vs append
- `src/components/AssetViewer.tsx` — handle "Enrich users" import mode; merge logic for matching by user/email
- `src/components/AssetTable.tsx` — drag handlers on headers, default User-first order, persisted widths/order
- `src/lib/asset-store.ts` — add `loadColumnOrder` / `saveColumnOrder` / `loadColumnWidths` / `saveColumnWidths` helpers
- `src/components/AddRowDialog.tsx` — auto-include Email / Department / Creation date inputs (it already iterates `columns`, so this is automatic once the columns exist)

**New exception type:** `"User without computer"` — shown in audit dashboard and filter-by-exception views.

**Backward compatibility:** Existing data in localStorage continues to work; missing Email/Department/Creation date columns are added on next import or appear empty in existing rows.


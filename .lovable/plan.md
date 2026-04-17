

# Manual column mapping + canonical schema

## What's wrong now
- The system has only 3 canonical user-info columns (`Email`, `Department`, `Creation date`). Any unrecognized header (e.g. a second "Email" variant, or "Name"/"Company"/"Last activity") shows up as a separate raw column → duplicate `Email` columns visible.
- The parser auto-guesses headers via aliases. When it guesses wrong, the user has no way to correct it — the bad mapping just becomes data.
- The Import Debugger doesn't show which source headers were matched to which canonical fields.

## The fix

### 1. Define the canonical schema (single source of truth)
In `excel-parser.ts`, declare 11 canonical fields the app understands, with default alias lists:

| Canonical               | Default aliases                                                  |
|-------------------------|------------------------------------------------------------------|
| Username                | user, username, samaccountname, "username (pre-windows 2000)", logon name |
| Name                    | name, displayname, full name, fullname                           |
| Computername            | computername, computer name, hostname, host                      |
| Modell                  | modell, model, devicemodel                                       |
| Last account activity   | last account activity, lastlogon, last logon, lastlogondate      |
| Status                  | status                                                           |
| Warranty until          | warranty until, warranty, warrantydate                           |
| AD Create.Date          | ad create.date, creation date, createdate, whencreated, created  |
| Company                 | company, organization, org                                       |
| Email                   | email, mail, e-mail, userprincipalname, upn                      |
| Department              | department, dept, avdelning                                      |

These become the only "data columns" that ever reach the table — every source header is either mapped to one of them or marked **Ignore**.

### 2. Mapping flow on every import
After picking the sheet (and before applying), open a new **Column Mapping dialog**:

- Left column: each source header from the file with a sample value (first non-empty row).
- Right column: a `<Select>` per row offering: every canonical field + "Ignore".
- Pre-fills the Select using current alias logic (so the common case is one click).
- Footer shows duplicate detection: e.g. "Two headers map to Email — one will overwrite the other" (warning, not blocking).
- "Reset to auto" button + "Apply mapping" button.

Per-file mappings are remembered in `localStorage` keyed by a hash of the source header set, so re-importing a file with the same headers skips straight through (or shows the dialog with the saved mapping pre-applied). A "Mapping memory" reset lives in the FilterBar next to "Reset columns".

### 3. Parser refactor
`parseSheet` becomes a two-step:
1. `inspectSheet(buffer, sheet) → { headers, samplesByHeader, suggestedMapping }` — pure inspection, no row construction.
2. `parseSheetWithMapping(buffer, sheet, filename, mapping) → ParseResult` — applies the explicit mapping, builds rows. Only canonical fields land in `row.raw`; "Ignore" headers are dropped entirely. This eliminates the duplicate-column problem at the source.

`isUsersFile` detection still works (computername empty in all rows + at least one user-info canonical present).

### 4. Import Debugger upgrade
Add a "Detected mapping" panel showing every source header → canonical field (or "Ignore" / "Unmatched") with confidence (alias-match vs fuzzy vs none). Same auto-suggestion logic as the real importer, so the debugger predicts what will happen.

### 5. Migrate existing loaded data
On first load after this change, scan `data.columns` and `row.raw` and:
- Drop any column not in the canonical list.
- Merge any aliases of `Email` into canonical `Email` (etc.). This removes the existing duplicate Email column without re-importing.

A one-time toast confirms the cleanup.

## Files to change

- `src/lib/excel-parser.ts` — canonical schema, `inspectSheet`, `parseSheetWithMapping`, alias/fuzzy auto-suggest, mapping-storage helpers
- `src/components/ColumnMappingDialog.tsx` (new) — the per-import mapping UI
- `src/components/AssetViewer.tsx` — wire mapping dialog between sheet pick and parse; one-time data migration on hydrate
- `src/components/ImportDebugger.tsx` — add detected-mapping panel
- `src/lib/asset-store.ts` — `loadMapping(headerHash) / saveMapping / clearAllMappings`
- `src/components/AssetTable.tsx` — default column order updated to the 11 canonical columns in the requested left-to-right order (Username, Name, Computername, Modell, Last account activity, Status, Warranty until, AD Create.Date, Company, Email, Department)
- `src/components/FilterBar.tsx` — add "Reset mappings" button next to "Reset columns"

## Notes
- "User" stays as the row's logical user identity — it's just renamed to "Username" in the canonical column list and table header.
- Email-local-part fallback (jdoe@... → jdoe) still applies when Username is unmapped/empty but Email is present.
- No new dependencies.


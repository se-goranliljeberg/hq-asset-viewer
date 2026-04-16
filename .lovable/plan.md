

# Add Manual Row Entry with Unsaved-Changes Warning

## Overview
Add an "Add Row" button that opens a dialog where the user fills in all columns (including Status and Warranty until), then saves. The new row is added to the dataset and persisted in localStorage. Warn the user before destructive actions (Clear, Replace) if there are unsaved manual entries or edits.

## Changes

### 1. New component: `src/components/AddRowDialog.tsx`
- A Dialog with a form containing an Input for each column in `data.columns` (Computername, Modell, User, etc.)
- A Select dropdown for Status (same options as the table)
- A date picker for Warranty until
- "Save" and "Cancel" buttons
- On save: construct an `AssetRow` with a new ID (`max(existing) + 1`), `sourceFile: "Manual entry"`, populate `raw` from form values, run exception checks (missing user/model), call a callback to add the row

### 2. `src/components/AssetViewer.tsx` — Wire up Add Row
- Import and render `AddRowDialog`
- Add `handleAddRow` callback that appends the new row to `data.rows`, updates columns if needed, and saves via `setData`
- Add "Add Row" button in the header toolbar (next to Export CSV)
- **Unsaved changes warning**: Track whether manual rows or edits exist. Before Clear and Replace actions, check if edits have been made and show an extra warning: "You have manual entries/edits that will be lost."
  - Enhance the existing Clear confirmation dialog text to mention edits will be lost
  - Enhance the Replace confirmation in the import dialog similarly

### 3. `src/lib/csv-export.ts` — Already handles `sourceFile`, no changes needed

### 4. Duplicate detection
- When adding a manual row, re-check all rows for duplicate computernames (same logic as `mergeData`)

## Files
- **New**: `src/components/AddRowDialog.tsx`
- **Modified**: `src/components/AssetViewer.tsx` (add button, handler, warning logic)


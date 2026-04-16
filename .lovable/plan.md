

# Add Data / Replace Data Upload + Source File Column

## Overview
When uploading a new file while data already exists, show a dialog asking "Replace all data" or "Add data". Track which file each row came from. Detect cross-file duplicate computernames as exceptions.

## Changes

### 1. `src/lib/asset-types.ts` — Add `sourceFile` field
- Add `sourceFile: string` to `AssetRow`

### 2. `src/lib/excel-parser.ts` — Store source filename per row
- Set `sourceFile: filename` on each parsed `AssetRow`
- Export a new `mergeData(existing: AssetData, incoming: AssetData): AssetData` function that:
  - Combines rows from both datasets, re-indexing IDs to avoid collisions
  - Merges column sets (union of both)
  - Re-runs duplicate computername detection across all combined rows, adding "Duplicate computername" exception where needed
  - Sets filename to comma-joined list and loadedAt to current time

### 3. `src/components/AssetViewer.tsx` — Add/Replace dialog
- Add state for `importMode: "replace" | "add" | null` and refs for pending parsed data
- When a file is uploaded and data already exists, show an AlertDialog: "Replace all data" or "Add to existing data"
- On "Replace": behave as before (overwrite)
- On "Add": call `mergeData(existingData, newData)` and save the merged result
- The "Source file" column is automatically shown via the table's `columns` list (it comes from `raw`)

### 4. `src/components/AssetTable.tsx` — Display source file column
- The "Source file" column will be appended to `displayCols` as a virtual column (like Exceptions)
- Render `row.sourceFile` for that column

### 5. `src/lib/csv-export.ts` — Include source file in export
- Add "Source file" to the exported columns, pulling from `row.sourceFile`

## Technical Notes
- Row IDs for merged data: existing rows keep their IDs, new rows get IDs starting from `max(existing) + 1`
- Duplicate detection runs across the full merged dataset
- Column union ensures rows from different files with different columns still display correctly (missing values show as empty)


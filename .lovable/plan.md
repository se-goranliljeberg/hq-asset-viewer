

# Fix Duplicate Columns on Re-Import

## Problem
When you export a CSV, the export appends 4 extra columns: **Status**, **Warranty until**, **Exceptions**, **Source file**. When that CSV is opened in Excel, saved as .xlsx, and re-imported, these become part of the parsed data columns. The table then adds its own Status/Warranty/Exceptions/Source file columns again, resulting in a double set.

## Solution
Strip the known appended columns from the parsed column list during import. This way, re-imported files won't carry duplicate metadata columns.

### Change: `src/lib/excel-parser.ts` — `parseSheet()`
After computing `originalColumns`, filter out the 4 columns that the CSV export appends:

```typescript
const EXPORT_EXTRA_COLS = new Set(["Status", "Warranty until", "Exceptions", "Source file"]);
const dataColumns = originalColumns.filter(c => !EXPORT_EXTRA_COLS.has(c));
```

Use `dataColumns` instead of `originalColumns` for the `columns` return value and for building `raw`. Additionally, if the imported file has a "Status" or "Warranty until" column, pre-populate the edits from those values so the data isn't lost — it just moves to the correct place.

### Files modified
- `src/lib/excel-parser.ts` — filter out export-appended columns; optionally seed edits from re-imported Status/Warranty columns


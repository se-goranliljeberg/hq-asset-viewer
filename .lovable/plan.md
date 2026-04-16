

# Source File Filter + Audit Dashboard

## Overview
Two additions: (1) a "Source file" dropdown in the filter bar, and (2) a tabbed audit dashboard view with summary charts and status breakdown, all client-side.

## Changes

### 1. Source file filter — `FilterBar.tsx` + `AssetViewer.tsx`
- Add `sourceFilter` / `onSourceFilter` / `sources: string[]` props to FilterBar
- Add a new Select dropdown: "All Sources" / per-file options
- In AssetViewer, derive `sources` from `[...new Set(rows.map(r => r.sourceFile))]`, add `sourceFilter` state, apply it in the `filtered` memo

### 2. Audit Dashboard — new `AuditDashboard.tsx` component
A tab-switchable view (Table / Audit) above the main content area, using Tabs from shadcn. The Audit tab shows:

- **Status breakdown**: Card grid showing count of "In stock", "Deployed at user", "Sent back to broker", and "No status set"
- **Warranty overview**: Cards for "Expired" (warranty date < today), "Expiring in 30 days", "Valid", "No warranty set"
- **Per-source-file summary**: Table showing each source file with row count, exception count, and status distribution
- **Exceptions summary**: Top exceptions by frequency (grouped and counted)

All computed client-side from `rows` + `edits`. Uses existing Card, Table, and Badge components.

### 3. Wire up in `AssetViewer.tsx`
- Add a Tabs component wrapping the existing table view and the new audit view
- "Asset List" tab shows existing FilterBar + AssetTable
- "Audit Report" tab shows AuditDashboard
- Both tabs share the same KPI cards at the top

### Files modified
- `src/components/FilterBar.tsx` — add source file dropdown
- `src/components/AssetViewer.tsx` — add sourceFilter state, derive sources list, add Tabs for table/audit toggle
- `src/components/AuditDashboard.tsx` — new file with audit report cards and tables


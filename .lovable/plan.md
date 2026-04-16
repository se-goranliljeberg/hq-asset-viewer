
# HQ Asset Overview — Local Excel Viewer

## Overview
A fully client-side, privacy-first Excel asset viewer built as a single-page React app. All data stays on the user's device — no backend, no network calls at runtime, no telemetry.

## Pages & Layout

### Single Page: Asset Overview
- **Top header bar**: "HQ Asset Overview" title + "Last loaded: filename - timestamp" subtitle
- **Privacy badge**: Small shield icon with "Data stays on this device" tooltip
- **Action buttons**: "Load Excel", "Replace Data", "Export CSV", "Clear Local Data" (with confirmation dialog)

### KPI Cards Row (4 cards)
- Total Assets (row count)
- Unique Users
- Unique Models
- Exceptions (missing user, duplicate computername, missing model)

### Filter Bar
- Global search input
- Model dropdown filter
- User dropdown filter
- "Exceptions only" toggle switch

### Interactive Data Table
- Sticky header, column sorting, alternating row colors
- Column resizing via drag handles
- Exception rows highlighted with subtle red/amber indicator
- Virtual scrolling via `@tanstack/react-virtual` for performance on 5k–20k rows

### Data Quality Rules
- Required columns detected case-insensitively: Computername, Modell, User
- Flags: duplicate Computername, empty/missing User, empty/missing Modell
- All text trimmed/normalized; original values displayed

### Sheet Picker
- If the Excel file has multiple sheets, a dialog lets the user choose which sheet to import

### Data Handling Info Section
- Footer or collapsible panel with explicit privacy statements
- "Clear local data" button with confirm dialog

## Technical Approach
- **Excel parsing**: SheetJS (`xlsx` package) — fully client-side
- **Persistence**: LocalStorage (with fallback messaging if data exceeds quota)
- **Virtual scrolling**: `@tanstack/react-virtual` for large datasets
- **No SSR/server functions used** — purely client-rendered SPA behavior
- **Export**: Client-side CSV generation via Blob/download

## Libraries to Add
- `xlsx` (SheetJS) — client-side Excel parsing
- `@tanstack/react-virtual` — row virtualization
- `file-saver` — CSV export download helper

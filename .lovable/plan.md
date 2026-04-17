
The user wants two documentation pages plus a Documentation link in the app navigation:

1. **Technical/IT-Security documentation** — for IT/Security approval
2. **User guide** — for end users using the app

Let me look at the routing and main layout to figure out where to add the link.

Key facts about this app (from context):
- Client-side only Excel/CSV asset viewer
- Data stored in browser localStorage only — no backend, no server, no auth
- TanStack Start framework, deployed as static-ish on Cloudflare Worker
- Parses .xlsx files locally with SheetJS (excel-parser.ts)
- Canonical schema with manual column mapping
- Inline edits, comments with audit log, CSV export
- Privacy footer already says "Data stays on this device"

This is a meaningful documentation task — definitely warrants a plan.

## Plan

### New routes

1. **`src/routes/documentation.tsx`** — landing page with two cards/links:
   - "Technical & Security Documentation" → `/documentation/technical`
   - "User Guide" → `/documentation/user-guide`
   
   Use a layout file `documentation.tsx` with `<Outlet />` + sidebar nav, plus an index route `documentation.index.tsx`.

   Actually simpler: one layout `documentation.tsx` with sidebar (Overview / Technical / User Guide), and three child routes:
   - `documentation.index.tsx` — overview
   - `documentation.technical.tsx`
   - `documentation.user-guide.tsx`

### Navigation link

In `src/routes/__root.tsx` (or wherever the top header lives — need to verify), add a "Documentation" link in the header next to existing navigation. Will check `__root.tsx` and `routes/index.tsx` to find the right spot.

### Content — Technical & Security doc

Sections:
- **Overview** — purpose, what it does, what it doesn't do
- **Architecture**
  - Frontend: React 19 + TanStack Start + Vite 7 + Tailwind v4
  - No backend, no database, no API calls to external services for data
  - Hosted on Cloudflare Workers (static SSR shell)
  - File parsing in-browser via SheetJS (xlsx)
- **Data flow diagram** (ASCII): User file → Browser parse → localStorage → UI
- **Data storage**
  - All data in browser `localStorage` under keys: `hq_asset_data`, `hq_asset_edits`, `hq_asset_column_order`, `hq_asset_column_widths`, `hq_mapping_*`, `hq_canonical_migrated_v1`
  - Data never leaves the user's device
  - No telemetry, no analytics, no third-party trackers
- **Security posture**
  - No authentication required (no user accounts, no PII transmitted)
  - No network requests with user data
  - HTTPS-only via Cloudflare
  - CSP / standard browser sandboxing applies
  - No cookies set by app
- **Privacy / GDPR**
  - User controls all data; "Clear local data" button removes everything
  - No data processor relationship — data never reaches Skanska/Lovable servers
  - User responsible for not sharing exported CSVs improperly
- **Dependencies** — list key npm packages (React, TanStack, xlsx, lucide, radix-ui, tailwind)
- **Browser compatibility** — modern Chromium/Firefox/Safari, requires localStorage (~5-10MB)
- **Limitations** — localStorage quota (~5MB), single-device, no multi-user collaboration
- **Deployment** — Cloudflare Workers, build with `bun run build`
- **Audit log** — every manual edit appends `Date: YYYY-MM-DD Change: …` to Comments column
- **Export controls** — CSV export is user-initiated, downloads locally only

### Content — User Guide

Sections:
- **Getting Started** — drag/drop or click to upload .xlsx
- **Sheet selection** — choose which sheet to import
- **Column mapping** — explain the dialog, canonical fields, "Ignore"
- **Importing additional files** — merging users-file with computers-file
- **Table features** — sorting, filtering, search, KPI cards
- **Editing data** — inline double-click edit on Status, Warranty, Comments; what gets logged
- **Batch updates** — select multiple rows, change status at once
- **Adding new rows** — manual entry
- **Comments / audit log** — auto-append format, never overwritten
- **Exceptions** — what each one means (Missing user, Missing computer, User without computer, etc.)
- **Reset columns / mappings** — what they do
- **Exporting** — CSV format, included columns
- **Clear local data** — what gets deleted, no undo
- **What to think about**
  - Always re-import after major source-file changes
  - Saved mappings remembered per file-header-set
  - Updates to canonical schema may trigger one-time migration
  - Single-device — your edits don't sync to other browsers
- **Troubleshooting** — Import Debugger usage

### Files to create/modify

- **Create** `src/routes/documentation.tsx` — layout with sidebar nav + Outlet
- **Create** `src/routes/documentation.index.tsx` — overview landing
- **Create** `src/routes/documentation.technical.tsx` — IT/Security doc
- **Create** `src/routes/documentation.user-guide.tsx` — user guide
- **Modify** `src/routes/__root.tsx` or `src/routes/index.tsx` — add "Documentation" link in header (need to check which holds the header)

### Visual style

- Use existing shadcn `Card`, `Badge`, `Separator`, `ScrollArea` components
- Match the existing dark theme / design tokens
- Sidebar nav on left (sticky), content area on right
- ASCII data-flow diagram in `<pre>` block for Technical doc
- Anchor links / table of contents at top of each long doc

No new dependencies needed.

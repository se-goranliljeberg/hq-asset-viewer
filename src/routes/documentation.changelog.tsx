import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DocVersionBadge } from "@/components/DocVersionBadge";
import { markVersionSeen } from "@/lib/version-state";

export const Route = createFileRoute("/documentation/changelog")({
  component: ChangelogPage,
  head: () => ({
    meta: [
      { title: "Changelog — HQ Asset Viewer" },
      { name: "description", content: "Complete history of changes to the HQ Asset Viewer." },
    ],
  }),
});

interface Release {
  version: string;
  date: string;
  title: string;
  added?: string[];
  changed?: string[];
  fixed?: string[];
  removed?: string[];
}

const RELEASES: Release[] = [
  {
    version: "0.4.3",
    date: "2026-04-23",
    title: "CSV export history, comment round-trip & smarter import highlight",
    added: [
      "CSV export now includes a 'Change History' column serialising each row's full lifecycle timeline (timestamp, initials, from → to state, user changes, notes) so audit history travels with the file.",
      "Imported cells are briefly highlighted with a subtle blue glow after Add Data and Enrich Users imports, making it obvious which fields were just touched. The highlight clears itself after ~60 seconds.",
    ],
    fixed: [
      "Comments column is now imported correctly: re-importing a previously exported file restores existing comments instead of dropping them, so comments round-trip cleanly.",
      "Full / Replace All imports no longer trigger the cell highlight — the glow would otherwise cover every cell on a fresh load and carry no signal. Highlight is now scoped to incremental imports (Add / Enrich / conflict resolution) only.",
    ],
  },
  {
    version: "0.4.2",
    date: "2026-04-22",
    title: "Leaver planning end-date column",
    added: [
      "New canonical `End date` column for leaver planning/reporting (expected last working day / departure date), including alias and fuzzy-header detection during import.",
      "`End date` now participates in date normalization on import and in users-file enrichment, so it round-trips cleanly through import workflows.",
      "`End date` is included in CSV exports automatically as part of the canonical/raw columns set.",
    ],
    fixed: [
      "End date edits are now user-scoped (keyed by username) instead of row-scoped, so setting it once applies across all rows for that person and legacy per-row stored values are auto-migrated.",
      "Full-import (Replace All) no longer triggers the blue cell-highlight; the highlight is now shown only after Add Data and Enrich Users imports.",
    ],
  },
  {
    version: "0.4.1",
    date: "2026-04-20",
    title: "Handover state, Asset Management & User History tabs",
    added: [
      "New 'User keeps old device' option in Replace Device → Send old device to. Choose this for handover periods: the user keeps both the old and new computer for a while (to migrate data, finish setup), and the old device stays on its own row with status 'Deployed at user' and the same username — flagged automatically as a multi-device user.",
      "New Asset Management tab: a lifecycle dashboard showing counts of devices In stock, Deployed at user, and Sent back to broker, plus a panel listing every user currently holding multiple devices (handover candidates). Search filters all sections at once.",
      "New User History tab: a master/detail view with a searchable user list on the left and the selected user's current devices, past devices, and lifecycle events on the right.",
      "Username and Computername cells in the Asset List are now clickable: click a username to open the User profile drawer, click a computername to open the Asset history drawer. Same drawers used everywhere — Audit Report, Asset Management, User History — so navigation feels consistent.",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-04-20",
    title: "Asset lifecycle management",
    added: [
      "Computers are now first-class assets with their own lifecycle: In stock → Deployed at user → In stock → Sent back to broker. Each transition is timestamped, attributed to the editor's initials, and appended to a per-asset history log.",
      "Replace Device flow now splits into two rows: the old asset stays as its own row (user cleared, status set to your choice of 'In stock' or 'Sent back to broker'), and the new asset becomes its own row deployed to the user.",
      "Replace Device dialog has a new 'From In Stock' tab — pick an unassigned in-stock device instead of typing a brand-new one. Re-assigning records an 'In stock → Deployed at user' lifecycle event automatically.",
      "Asset history side drawer: select a single row, click the new 'History' button, and see the full timeline (lifecycle events, comments, import stamps), the current user, and clickable previous-user chips that filter the table.",
      "User profile drawer in the Audit Report: click any row in Per-User Detail to see the user's current devices, past devices, and lifecycle events touching them.",
      "Multi-asset import prompt: when you import a Computername for a user that already owns one, you're asked per row whether to add it as an additional device, replace the existing one (with a destination choice), or skip it.",
      "New 'User has multiple computers' exception is computed dataset-wide and surfaces in the Exceptions cell, KPI counters, and audit roll-up automatically.",
    ],
    changed: [
      "AssetRow gained three optional fields (assetKind, history, previousUsers). Existing rows are migrated transparently on first load via the hq_lifecycle_migrated_v1 flag — no re-import needed.",
    ],
  },
  {
    version: "0.3.4",
    date: "2026-04-20",
    title: "Clickable Audit Report KPIs",
    added: [
      "Every KPI card on the Audit Report (Inactive Users, Leavers w/ Device, Without Computer, Multi-Computer, Non-Skanska Devices, With Exceptions, Stale) is now a clickable filter for the Per-User Detail table. Clicking a card filters the table to just those users; clicking it again — or clicking Total Users — clears the filter.",
      "Active KPI gets a primary-coloured ring so the current filter is obvious at a glance.",
      "Dismissible filter chip next to the 'Per-User Detail' header shows the active KPI label (e.g. 'Leavers w/ Device ✕') and clears the filter on click.",
      "Search composes on top of the KPI filter, so you can pick a segment and then refine by name, computer, manager or department.",
    ],
    changed: [
      "User Roll-Up grid expanded from 7 to 8 columns on lg+ to accommodate the new Total Users / clear-filter card alongside the seven segment cards.",
    ],
  },
  {
    version: "0.3.3",
    date: "2026-04-20",
    title: "Dynamic exceptions, Leavers w/ Device KPI & Hide-inactive default off",
    added: [
      "New 'Assigned to inactive user' exception: rows where User Active? = No but a Computername is still assigned are now flagged automatically — these are leavers who still hold company hardware.",
      "New 'Leavers w/ Device' KPI on the Audit Report (User Roll-Up section) counting distinct inactive users with at least one assigned Computername. Tooltip explains exactly what it counts.",
    ],
    changed: [
      "Exceptions are now computed dynamically from the current User Active? / Skanska computer? values instead of being frozen at import time. Toggling either field updates the Exceptions cell, the Exceptions KPI, the Exceptions-only filter and the audit report immediately — no re-import needed.",
      "Skanska computer? = No now suppresses the 'Missing computer' / 'User without computer' exceptions: the user is not expected to have a Skanska device, so it shouldn't count as a data-quality issue.",
      "User Active? = No with no Computername also suppresses 'Missing computer'; only 'Inactive user' remains. Toggling Active back to Yes strips any leftover 'Inactive user' / 'Assigned to inactive user' tags inherited from the source file.",
      "Hide inactive filter now defaults to OFF (was ON). Your choice is still persisted to localStorage (hq_filter_exclude_inactive), so previous installs keep their preference.",
      "User Guide §8 (User Active? & Skanska computer?), §10 (Filters) and §14 (Exceptions) rewritten to describe the dynamic exception ruleset and the new Hide-inactive default.",
    ],
  },
  {
    version: "0.3.2",
    date: "2026-04-20",
    title: "User-centric Audit Report & KPI tooltips",
    added: [
      "Tooltips on every KPI card on the main asset list view (Total Assets, Unique Users, Unique Models, Exceptions, Stale) explaining exactly what each card counts and how clicking it filters the table. The Stale tooltip dynamically reflects the configured stale threshold (e.g. 'older than 90 days').",
      "User-centric Audit Report: the dashboard is now grouped by user (case-insensitive) instead of by asset row. New user-level KPIs at the top — Total Users, Inactive Users, Users without Computers, Multi-Computer Users, Non-Skanska Device owners, Users with Exceptions, and Stale Users.",
      "Per-User Detail table in the Audit Report: searchable list of every user with their active status, computernames (shown via tooltip when multiple), managers, departments, most recent logon date, and per-user data-quality flags (Stale, Non-Skanska, No computer, Multi-computer, Inactive).",
    ],
    changed: [
      "Audit Report layout reorganised around the user as the primary entity; asset-level breakdowns (Status, exceptions, sources) are still available but secondary to the per-user roll-up.",
    ],
  },
  {
    version: "0.3.1",
    date: "2026-04-20",
    title: "Reset filters button & unique-computername Total Assets",
    added: [
      "'Reset filters' button in the FilterBar (next to Reset mappings / Reset columns) that restores every filter to its app-level default in one click: clears search, Model, User, Manager, Source and KPI selection; restores the default Status set; turns Hide inactive back on; and sets Skanska computer? back to 'Skanska only'.",
      "Tooltip on the Total Assets KPI card explaining what it counts.",
    ],
    changed: [
      "Total Assets KPI now counts unique Computernames (case-insensitive, blanks excluded) instead of all rows. Users-only entries no longer inflate the count, and accidental duplicates from re-imports collapse to one entry.",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-04-20",
    title: "Username-as-master imports, Active/Skanska tracking, stale-logon highlighting & Manager filter",
    added: [
      "Username-as-master duplicate handling on import: incoming rows whose Username already exists open a new Import Conflict dialog showing field-by-field diffs (existing vs incoming); the user picks exactly which fields to overwrite per row. Truly-new rows still flow through the normal Add path.",
      "Two new canonical columns: 'User Active?' and 'Skanska computer?' (Yes/No). Both are importable (with aliases like enabled/disabled, company device, etc.), inline-editable, exported to CSV, and always shown in the table.",
      "Inactive users (User Active? = No) are flagged with a new 'Inactive user' exception and hidden by default via a persisted 'Hide inactive' filter.",
      "Skanska computer tri-state filter (All / Skanska / Non-Skanska), defaulting to Skanska only. Rows with empty Computername keep Skanska computer? blank and are not auto-classified.",
      "Stale Last logon date highlighting: values older than the configurable threshold are rendered in amber with a 'X days since last logon' tooltip.",
      "New 'Stale (>Nd)' KPI card (5-card grid) that filters the table to stale accounts when clicked.",
      "Configurable stale threshold (default 90 days) with a small inline input in the FilterBar, persisted to localStorage (hq_stale_threshold_days).",
      "Manager filter chip in the FilterBar: multi-select with search over rows[].raw['Manager'], persisted to localStorage like the other filters, and shown in the active filter chips row.",
      "Warranty change comments are now logged in the same audit comment stream as other edits, with HH:MM timestamps in addition to the date.",
    ],
    changed: [
      "Total Assets KPI now counts rows with a non-empty Computername (instead of all rows), so users-only entries no longer inflate the asset count.",
      "Audit-log timestamp format extended to include HH:MM alongside the date.",
      "KPI card grid is now 5 columns on md+ screens to fit the new Stale card.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-04-17",
    title: "Documentation, change history & undo",
    added: [
      "Documentation section in the app header (Overview, Technical & Security, User Guide, Changelog) with a sticky sidebar and per-page metadata.",
      "Per-row Undo last change button that strips the most recent audit entry and reverts the corresponding field (Status, Warranty until, or any raw column).",
      "Show change history popover on the Comments cell with a clean reverse-chronological timeline; raw text is preserved for export.",
      "Initials prompt on first audit-logging edit; initials are stamped into every entry and stored locally (hq_audit_user_initials).",
      "Version + last-updated badge on every documentation page, sourced from package.json.",
      "Re-enabled Status as a virtual canonical column that is always shown in the table even if the source file has no Status header.",
    ],
    changed: [
      "Audit-log format upgraded from `Date: YYYY-MM-DD Change: …` to `Date: YYYY-MM-DD [INI] Change: …` (legacy entries still parse).",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-04-17",
    title: "Canonical schema & manual column mapping",
    added: [
      "Canonical schema with 11 fields: Username, Name, Computername, Modell, Last account activity, Status, Warranty until, AD Create.Date, Company, Email, Department.",
      "Column Mapping dialog shown after sheet selection with auto-suggested mappings, sample values per header, and an Ignore option.",
      "Per-file mapping memory keyed by header-set hash, persisted in localStorage.",
      "Reset mappings button in the FilterBar to clear remembered mappings.",
      "Detected mapping panel in the Import Debugger.",
      "Comments column (free text) between Exceptions and Source file, included in CSV exports.",
      "Append-only audit log written to Comments on every manual edit, batch update and Add Row.",
    ],
    changed: [
      "Two-step parser: inspectSheet() returns headers/samples/suggestions; parseSheetWithMapping() builds rows from the user-confirmed mapping.",
      "Default column order updated to the canonical left-to-right sequence.",
      "One-time data migration on hydrate: drops non-canonical columns and merges legacy alias columns (e.g. duplicate Email).",
    ],
    fixed: [
      "Duplicate Email column caused by alias mismatches between source files.",
      "Bad auto-guesses now correctable by the user without touching the source file.",
    ],
  },
  {
    version: "0.0.7",
    date: "2026-04-17",
    title: "Users-file enrichment & column layout",
    added: [
      "Move the User column to the first data column.",
      "User-only file import: rows with empty Computername are added as new entries flagged 'User without computer'.",
      "Email, Department and Creation date as standard editable / exportable fields.",
      "Drag-and-drop column reordering with persisted order and widths in localStorage.",
      "Reset columns button in the FilterBar.",
    ],
  },
  {
    version: "0.0.6",
    date: "2026-04-16",
    title: "Import debugger & mapping diagnostics",
    added: [
      "Debug Import dialog to inspect a file before importing — shows sheets, headers, samples, detected mappings and warnings.",
    ],
    fixed: [
      "Re-importing an exported CSV/XLSX created duplicate Status / Warranty until / Exceptions / Source file columns; metadata columns are now stripped from input and restored into the edits store.",
    ],
  },
  {
    version: "0.0.5",
    date: "2026-04-16",
    title: "Inline editing & manual rows",
    added: [
      "Inline editing on raw cells (double-click, Enter to save, Esc to cancel).",
      "Add Row dialog for manual entries; new rows are tagged with sourceFile = 'Manual entry'.",
      "Unsaved-changes warning when an action would discard manual entries or edits.",
      "Row selection with checkboxes (including indeterminate Select All) and a batch action bar to update Status across all selected rows.",
    ],
  },
  {
    version: "0.0.4",
    date: "2026-04-16",
    title: "Source file filter & audit dashboard",
    added: [
      "Source file dropdown in the FilterBar.",
      "Audit Report tab with Status breakdown, exceptions summary and per-source counts.",
    ],
    changed: [
      "User filter now sorts case-insensitively (aaron, Anders, Bert, Björn).",
    ],
  },
  {
    version: "0.0.3",
    date: "2026-04-16",
    title: "Multi-file import & source tracking",
    added: [
      "Multi-file upload flow: when data is already loaded, choose Replace All or Add Data.",
      "Source file column on every row.",
      "Cross-file duplicate Computername detection added to Exceptions.",
    ],
  },
  {
    version: "0.0.2",
    date: "2026-04-16",
    title: "Editable Status & Warranty until",
    added: [
      "Status column with dropdown (In stock, Deployed at user, Sent back to broker).",
      "Warranty until column with date picker (YYYY-MM-DD).",
      "Edits persisted to localStorage and included in CSV export.",
      "Interactive KPI cards: clicking a card filters the table to that segment.",
    ],
    fixed: [
      "Hydration mismatch on initial load.",
    ],
  },
  {
    version: "0.0.1",
    date: "2026-04-16",
    title: "Initial release — HQ Asset Overview",
    added: [
      "Privacy-first single-page app — all parsing and storage happens in the browser; no backend, no telemetry.",
      "Excel (.xlsx / .xls) import via SheetJS with sheet picker for multi-sheet workbooks.",
      "Virtualised data table for large lists (5k–20k+ rows).",
      "KPI cards: total rows, users, models, exceptions.",
      "Filter bar with search, model, user and exceptions-only filters; sortable column headers.",
      "Exceptions detection: missing user, duplicate computername, stale activity, expired warranty.",
      "CSV export of the filtered view.",
      "Clear local data action with confirmation.",
      "Privacy footer noting that data stays on the device.",
    ],
  },
];

const SECTION_LABEL: Record<keyof Omit<Release, "version" | "date" | "title">, string> = {
  added: "Added",
  changed: "Changed",
  fixed: "Fixed",
  removed: "Removed",
};

const SECTION_TONE: Record<string, string> = {
  added: "border-chart-2/40 bg-chart-2/10 text-chart-2",
  changed: "border-primary/40 bg-primary/10 text-primary",
  fixed: "border-chart-4/40 bg-chart-4/10 text-chart-4",
  removed: "border-destructive/40 bg-destructive/10 text-destructive",
};

function ChangelogPage() {
  // Opening the changelog clears the "NEW" badge in the app header.
  useEffect(() => { markVersionSeen(); }, []);
  return (
    <article className="space-y-8 max-w-3xl">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Badge variant="secondary">Release history</Badge>
          <DocVersionBadge />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Changelog</h1>
        <p className="text-muted-foreground">
          Every notable change to the HQ Asset Viewer, newest first. Versions follow{" "}
          <a href="https://semver.org" className="underline" target="_blank" rel="noreferrer">
            semantic versioning
          </a>
          .
        </p>
      </header>

      <div className="space-y-6">
        {RELEASES.map((r) => (
          <Card key={r.version}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono text-xs">v{r.version}</Badge>
                  <CardTitle className="text-lg">{r.title}</CardTitle>
                </div>
                <span className="text-xs text-muted-foreground">{r.date}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(["added", "changed", "fixed", "removed"] as const).map((key) => {
                const items = r[key];
                if (!items || items.length === 0) return null;
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SECTION_TONE[key]}`}
                      >
                        {SECTION_LABEL[key]}
                      </span>
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-sm text-foreground/90">
                      {items.map((it, i) => (
                        <li key={i}>{it}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Versions before 0.1.0 reflect rapid iteration during the initial build. Per-feature commits
        are summarised by topic.
      </p>
    </article>
  );
}

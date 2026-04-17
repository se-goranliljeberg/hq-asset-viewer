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

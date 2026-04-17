import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Info, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/documentation/user-guide")({
  component: UserGuide,
  head: () => ({
    meta: [
      { title: "User Guide — HQ Asset Viewer" },
      {
        name: "description",
        content:
          "Step-by-step guide to importing, mapping, editing and exporting your HQ asset list.",
      },
    ],
  }),
});

const sections = [
  { id: "getting-started", label: "1. Getting started" },
  { id: "sheet-selection", label: "2. Sheet selection" },
  { id: "column-mapping", label: "3. Column mapping" },
  { id: "merging", label: "4. Adding a users file" },
  { id: "table", label: "5. Working with the table" },
  { id: "editing", label: "6. Editing data" },
  { id: "batch", label: "7. Batch updates" },
  { id: "add-row", label: "8. Adding new rows" },
  { id: "comments", label: "9. Comments & audit log" },
  { id: "exceptions", label: "10. Exceptions" },
  { id: "reset", label: "11. Reset columns / mappings" },
  { id: "export", label: "12. Exporting" },
  { id: "clear", label: "13. Clearing local data" },
  { id: "think", label: "14. What to think about" },
  { id: "troubleshooting", label: "15. Troubleshooting" },
];

function UserGuide() {
  return (
    <article className="space-y-8 max-w-3xl">
      <header className="space-y-3">
        <Badge variant="secondary">For end users</Badge>
        <h1 className="text-3xl font-bold tracking-tight">User Guide</h1>
        <p className="text-muted-foreground">
          A practical walkthrough of every feature in the HQ Asset Viewer — what to do, what
          happens, and what to watch out for.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Table of contents</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-primary hover:underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Section id="getting-started" title="1. Getting started">
        <p>
          Click <strong>Load Excel</strong> in the top-right of the app and pick an
          <code> .xlsx </code> or <code> .xls </code> file. The file is read directly in your
          browser — nothing is uploaded.
        </p>
        <Tip>
          The first time you load a file, the app will guide you through sheet selection and column
          mapping.
        </Tip>
      </Section>

      <Section id="sheet-selection" title="2. Sheet selection">
        <p>
          If the workbook has multiple sheets, you&rsquo;ll be asked which one to import. Pick the
          sheet that contains the asset list (or, for a users-only file, the user list).
        </p>
      </Section>

      <Section id="column-mapping" title="3. Column mapping">
        <p>
          After picking the sheet, the <strong>Column Mapping</strong> dialog opens. On the left
          you&rsquo;ll see every header from the source file with a sample value. On the right you
          choose which canonical field it should become — or <strong>Ignore</strong> to drop it.
        </p>
        <p className="mt-2">The 11 canonical fields the app understands are:</p>
        <p className="mt-1 font-mono text-xs">
          Username · Name · Computername · Modell · Last account activity · Status · Warranty until
          · AD Create.Date · Company · Email · Department
        </p>
        <Info_>
          The app pre-fills the mapping using known aliases (e.g. <code>mail</code> → Email,
          <code> samaccountname </code> → Username). Most imports are one click.
        </Info_>
        <Tip>
          Check &ldquo;Remember this mapping&rdquo; to skip the dialog next time you import a file
          with the same set of headers.
        </Tip>
        <Warning>
          If two source headers map to the same canonical field, the app will warn you — only one
          will be kept.
        </Warning>
      </Section>

      <Section id="merging" title="4. Adding a users file">
        <p>
          You can load a <em>users</em> file (with no Computername column) on top of an existing
          asset list. The app detects this automatically and offers to <strong>enrich</strong> the
          existing rows: matching usernames will get their Email, Department, Name, Company etc.
          filled in.
        </p>
        <p className="mt-2">
          You can also choose <strong>Replace</strong> to discard the current data and start fresh
          with the new file.
        </p>
      </Section>

      <Section id="table" title="5. Working with the table">
        <ul className="list-disc list-inside space-y-1">
          <li>Click any column header to sort by that column.</li>
          <li>Use the search box and filter chips above the table to narrow down rows.</li>
          <li>KPI cards at the top show counts; click one to filter to that segment.</li>
          <li>Drag column edges to resize, drag headers to reorder.</li>
        </ul>
      </Section>

      <Section id="editing" title="6. Editing data">
        <p>
          Double-click an editable cell (Status, Warranty until, Comments, etc.) to edit it in
          place. Press <kbd>Enter</kbd> to save, <kbd>Esc</kbd> to cancel.
        </p>
        <Info_>Every save automatically appends an entry to the row&rsquo;s Comments column — see §9.</Info_>
      </Section>

      <Section id="batch" title="7. Batch updates">
        <p>
          Tick the checkboxes on the left of multiple rows, then use the batch action bar to change
          their Status in one go. Each affected row gets its own audit entry marked
          <em> (batch) </em> in Comments.
        </p>
      </Section>

      <Section id="add-row" title="8. Adding new rows">
        <p>
          Click <strong>Add Row</strong> in the header to enter a new asset manually. The new row is
          stamped with a creation entry in its Comments column summarising the values you entered.
        </p>
      </Section>

      <Section id="comments" title="9. Comments & audit log">
        <p>
          Comments is a free-text column you can write anything in (e.g. &ldquo;lost
          computer&rdquo;, &ldquo;to be removed&rdquo;). Whenever you change a field, a line is
          <strong> appended </strong> in this format:
        </p>
        <pre className="rounded-md bg-secondary/40 border border-border p-3 text-xs mt-2">
{`Date: 2026-04-17 Change: Status from "Active" to "Retired"`}
        </pre>
        <p className="mt-2">
          Existing comments are never overwritten — entries are joined with <code> | </code>. The
          Comments column is included in CSV exports.
        </p>
      </Section>

      <Section id="exceptions" title="10. Exceptions">
        <p>The Exceptions column flags rows that need attention:</p>
        <ul className="list-disc list-inside space-y-1 mt-1">
          <li><strong>Missing user</strong> — Computer record has no associated user.</li>
          <li><strong>Missing computer</strong> — User has no computer assigned.</li>
          <li><strong>Inactive &gt; 90 days</strong> — Last account activity is stale.</li>
          <li><strong>Warranty expired</strong> — Warranty date has passed.</li>
        </ul>
      </Section>

      <Section id="reset" title="11. Reset columns / mappings">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Reset columns</strong> — restores the default left-to-right order and widths.
            Your data and edits are not affected.
          </li>
          <li>
            <strong>Reset mappings</strong> — clears all remembered import mappings. Next time you
            import, the dialog will appear with auto-suggested mappings only.
          </li>
        </ul>
      </Section>

      <Section id="export" title="12. Exporting">
        <p>
          <strong>Export CSV</strong> downloads the currently filtered rows including all visible
          columns plus Comments and Exceptions. The CSV is generated in your browser; no copy is
          stored or transmitted anywhere.
        </p>
      </Section>

      <Section id="clear" title="13. Clearing local data">
        <Warning>
          <strong>Clear</strong> removes the loaded data, edits, mappings and column preferences
          from your browser. <strong>This cannot be undone.</strong> Export to CSV first if you
          want to keep a record.
        </Warning>
      </Section>

      <Section id="think" title="14. What to think about">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Re-import after big source changes.</strong> The app cannot detect changes in
            the underlying systems — re-export and re-import to refresh.
          </li>
          <li>
            <strong>Mappings are remembered per file structure.</strong> If your source file gains
            or renames a column, the mapping dialog will reopen so you can confirm.
          </li>
          <li>
            <strong>Edits are local to this browser.</strong> They don&rsquo;t sync to other
            devices or colleagues. Export CSV to share.
          </li>
          <li>
            <strong>Schema migrations.</strong> When the app updates its canonical schema, your
            existing data is migrated once on load (a one-time toast confirms this).
          </li>
          <li>
            <strong>Browser storage limits.</strong> Very large files may exceed the
            <code> localStorage </code> quota; the app will warn you.
          </li>
        </ul>
      </Section>

      <Section id="troubleshooting" title="15. Troubleshooting">
        <p>
          Use <strong>Debug Import</strong> in the header to inspect a file before importing. It
          shows the detected sheets, headers, sample values and the suggested canonical mapping —
          useful when something doesn&rsquo;t end up where you expect.
        </p>
        <p className="mt-2">
          If a column ends up with the wrong data, re-import the file and adjust the mapping in the
          Column Mapping dialog. Tick &ldquo;Remember&rdquo; to make the fix stick.
        </p>
      </Section>
    </article>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-2">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <Separator />
      <div className="text-sm leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex gap-2 rounded-md border border-chart-2/30 bg-chart-2/10 p-3 text-sm">
      <CheckCircle2 className="h-4 w-4 text-chart-2 mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function Info_({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
      <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

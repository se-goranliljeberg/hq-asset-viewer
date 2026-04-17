import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DocVersionBadge } from "@/components/DocVersionBadge";

export const Route = createFileRoute("/documentation/technical")({
  component: TechnicalDoc,
  head: () => ({
    meta: [
      { title: "Technical & Security Documentation — HQ Asset Viewer" },
      {
        name: "description",
        content:
          "Architecture, data flow, storage, dependencies and security posture of the HQ Asset Viewer for IT & Security review.",
      },
    ],
  }),
});

const sections = [
  { id: "overview", label: "1. Overview" },
  { id: "architecture", label: "2. Architecture" },
  { id: "data-flow", label: "3. Data Flow" },
  { id: "storage", label: "4. Data Storage" },
  { id: "security", label: "5. Security Posture" },
  { id: "privacy", label: "6. Privacy & GDPR" },
  { id: "dependencies", label: "7. Dependencies" },
  { id: "compatibility", label: "8. Browser Compatibility" },
  { id: "limitations", label: "9. Limitations" },
  { id: "deployment", label: "10. Deployment & Versioning" },
  { id: "audit", label: "11. Audit Log" },
  { id: "export", label: "12. Export Controls" },
  { id: "approval", label: "13. Approval Checklist" },
];

function TechnicalDoc() {
  return (
    <article className="space-y-8 max-w-3xl">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Badge variant="secondary">For IT & Security review</Badge>
          <DocVersionBadge />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Technical & Security Documentation</h1>
        <p className="text-muted-foreground">
          This document describes the architecture, data handling and security characteristics of
          the HQ Asset Viewer. It is intended to support an internal IT & Security approval process.
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

      <Section id="overview" title="1. Overview">
        <p>
          The HQ Asset Viewer is a single-page web application that lets a user load an Excel
          (<code>.xlsx</code>/<code>.xls</code>) export of HQ assets, view it in a structured table,
          enrich it with a separate users export, edit selected fields inline, keep an audit trail
          and export the result as CSV.
        </p>
        <p className="mt-2">
          <strong>What it does:</strong> Parse Excel locally in the browser, normalise to a
          canonical schema, render & filter rows, persist edits in <code>localStorage</code>, export
          CSV.
        </p>
        <p className="mt-2">
          <strong>What it does not do:</strong> Upload files, talk to an asset database, sync
          between users or devices, store data on a server, perform authentication, send telemetry
          or analytics.
        </p>
      </Section>

      <Section id="architecture" title="2. Architecture">
        <p>The application is a static-style SPA served from a Cloudflare Worker.</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>
            <strong>Framework:</strong> React 19 + TanStack Start (router) + Vite 7 build.
          </li>
          <li>
            <strong>Styling:</strong> Tailwind CSS v4 with semantic design tokens (no inline
            colours).
          </li>
          <li>
            <strong>Excel parsing:</strong> SheetJS (<code>xlsx</code>) loaded as a regular npm
            dependency, executed entirely client-side.
          </li>
          <li>
            <strong>Hosting:</strong> Cloudflare Workers edge runtime — only serves the static SSR
            shell; no application backend.
          </li>
          <li>
            <strong>State:</strong> React state in memory + <code>localStorage</code> for
            persistence.
          </li>
        </ul>
      </Section>

      <Section id="data-flow" title="3. Data Flow">
        <pre className="rounded-md bg-secondary/40 border border-border p-4 text-xs leading-relaxed overflow-x-auto">
{`  ┌────────────┐    1. select file    ┌──────────────────┐
  │  User PC   │ ───────────────────▶ │  Browser tab     │
  │  .xlsx     │                      │  (this app)      │
  └────────────┘                      └────────┬─────────┘
                                               │
                            2. parse via SheetJS in-browser
                                               ▼
                                       ┌──────────────────┐
                                       │ In-memory rows   │
                                       │ + canonical map  │
                                       └────────┬─────────┘
                                               │
                  3. persist to localStorage (same origin only)
                                               ▼
                                       ┌──────────────────┐
                                       │ window.localStorage
                                       │ keys: hq_asset_* │
                                       └────────┬─────────┘
                                               │
                          4. user-initiated CSV download
                                               ▼
                                       ┌──────────────────┐
                                       │   User PC disk   │
                                       └──────────────────┘

  ❌ No step in this flow contacts a backend, an external API,
     an analytics provider or a logging endpoint.`}
        </pre>
      </Section>

      <Section id="storage" title="4. Data Storage">
        <p>
          All user data lives in the browser&rsquo;s <code>localStorage</code>, scoped to the app
          origin. The keys used are:
        </p>
        <ul className="list-disc list-inside space-y-1 mt-2 font-mono text-xs">
          <li><code>hq_asset_data</code> — parsed asset rows + columns</li>
          <li><code>hq_asset_edits</code> — manual edits & comments per row</li>
          <li><code>hq_asset_column_order</code> — user&rsquo;s column ordering</li>
          <li><code>hq_asset_column_widths</code> — user&rsquo;s column widths</li>
          <li><code>hq_mapping_*</code> — saved column mappings keyed by header-set hash</li>
          <li><code>hq_canonical_migrated_v1</code> — one-time migration flag</li>
        </ul>
        <p className="mt-2">
          Data never leaves the browser. There is no IndexedDB, no cookies, no Service Worker
          caching of user data, no third-party storage. Clearing site data in the browser fully
          wipes the application state.
        </p>
      </Section>

      <Section id="security" title="5. Security Posture">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Authentication:</strong> None required. The app does not handle credentials,
            tokens or session data.
          </li>
          <li>
            <strong>Network egress with user data:</strong> None. The app makes no <code>fetch</code>
            /<code>XMLHttpRequest</code>/<code>WebSocket</code> calls carrying user content. Outbound
            traffic is limited to the initial static asset download (HTML/CSS/JS/fonts) over HTTPS.
          </li>
          <li>
            <strong>Transport:</strong> HTTPS-only via Cloudflare; HSTS handled by the platform.
          </li>
          <li>
            <strong>Cookies:</strong> The application does not set any cookies.
          </li>
          <li>
            <strong>Sandboxing:</strong> Standard browser same-origin policy and JavaScript sandbox
            apply. File parsing happens in the same renderer process; no plugins or native code.
          </li>
          <li>
            <strong>Third-party scripts:</strong> Only Google Fonts (CSS + WOFF2) is loaded from
            external origins for typography. No analytics, no tag managers, no advertising scripts.
          </li>
          <li>
            <strong>Supply chain:</strong> All dependencies are pinned in <code>package.json</code>
            and built from source at deploy time.
          </li>
        </ul>
      </Section>

      <Section id="privacy" title="6. Privacy & GDPR">
        <ul className="list-disc list-inside space-y-1">
          <li>
            The application does not act as a data processor for the publisher. Personal data
            contained in the Excel file (e.g. usernames, email addresses) never reaches any server
            controlled by the publisher.
          </li>
          <li>
            The user is in full control of their data and can delete it at any time using the
            in-app <em>Clear</em> button or by clearing site data in the browser.
          </li>
          <li>
            CSV export is user-initiated and downloaded only to the user&rsquo;s own device.
            Onward distribution of the exported file is the user&rsquo;s responsibility.
          </li>
          <li>
            No data subject rights workflow is required at the application level because the
            publisher does not store any data subject information.
          </li>
        </ul>
      </Section>

      <Section id="dependencies" title="7. Dependencies">
        <p>Key runtime dependencies (all pure JavaScript, no native binaries):</p>
        <ul className="list-disc list-inside space-y-1 mt-2 font-mono text-xs">
          <li>react, react-dom (v19)</li>
          <li>@tanstack/react-router, @tanstack/react-start</li>
          <li>vite (v7)</li>
          <li>tailwindcss (v4)</li>
          <li>xlsx (SheetJS) — Excel parsing</li>
          <li>@radix-ui/* — accessible UI primitives</li>
          <li>lucide-react — icon set</li>
          <li>sonner — toast notifications</li>
          <li>class-variance-authority, clsx, tailwind-merge — class utilities</li>
        </ul>
      </Section>

      <Section id="compatibility" title="8. Browser Compatibility">
        <p>
          Targeted browsers: current and previous major versions of Chromium-based browsers (Edge,
          Chrome), Firefox and Safari. Requires <code>localStorage</code> (~5–10&nbsp;MB depending
          on browser) and the <code>FileReader</code> API. JavaScript must be enabled.
        </p>
      </Section>

      <Section id="limitations" title="9. Limitations">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Storage quota:</strong> <code>localStorage</code> is limited to ~5&nbsp;MB per
            origin in most browsers. Very large asset lists (tens of thousands of rows with many
            columns) may not fit.
          </li>
          <li>
            <strong>Single-device:</strong> Edits are not synced between browsers, devices or
            users.
          </li>
          <li>
            <strong>No multi-user collaboration:</strong> Concurrent edits and conflict resolution
            are out of scope.
          </li>
          <li>
            <strong>No server-side validation:</strong> Imported data is trusted as-is; the user is
            responsible for the source file.
          </li>
        </ul>
      </Section>

      <Section id="deployment" title="10. Deployment & Versioning">
        <p>
          Built with <code>bun run build</code> (or <code>npm run build</code>) and deployed to
          Cloudflare Workers. The Worker only serves static SSR output and assets — no server-side
          business logic, no environment secrets are exposed at runtime.
        </p>
        <h3 className="font-semibold mt-4 mb-2">Version bump helper</h3>
        <p>
          The single source of truth for the application version is the <code>version</code> field
          in <code>package.json</code>. It is consumed by the documentation badge
          (<code>DocVersionBadge</code>) and by the in-app &ldquo;What&rsquo;s new&rdquo; toast
          (<code>WhatsNewToast</code>). After any meaningful change, run one of the helper scripts
          to bump it before deploying:
        </p>
        <pre className="rounded-md bg-secondary/40 border border-border p-3 text-xs mt-2">
{`npm run bump          # patch  e.g. 0.2.0 → 0.2.1
npm run bump:minor    # minor  e.g. 0.2.0 → 0.3.0
npm run bump:major    # major  e.g. 0.2.0 → 1.0.0`}
        </pre>
        <p className="mt-2">
          The script lives at <code>scripts/bump-version.mjs</code>. It only edits
          <code> package.json</code>; add a matching entry to
          <code> src/routes/documentation.changelog.tsx</code> in the same change so the changelog
          stays in sync.
        </p>
        <h3 className="font-semibold mt-4 mb-2">&ldquo;What&rsquo;s new&rdquo; notification</h3>
        <p>
          On load, the app compares the current <code>package.json</code> version against the value
          stored under <code>hq_last_seen_version</code> in <code>localStorage</code>. If the stored
          version is older (or missing), a one-time toast appears with a link to the changelog.
          Dismissing or auto-closing the toast records the current version, so it will not appear
          again until the next bump. The check is purely client-side; no telemetry is sent.
        </p>
      </Section>

      <Section id="audit" title="11. Audit Log">
        <p>
          Every manual change to a row appends a human-readable entry to that row&rsquo;s
          <em> Comments </em> column in the format:
        </p>
        <pre className="rounded-md bg-secondary/40 border border-border p-3 text-xs mt-2">
{`Date: YYYY-MM-DD Change: <field> from "<old>" to "<new>"`}
        </pre>
        <p className="mt-2">
          Multiple entries are joined with <code> | </code>. Existing comments are never
          overwritten. The Comments column is included in CSV exports, so the audit trail follows
          the data wherever it goes.
        </p>
      </Section>

      <Section id="export" title="12. Export Controls">
        <p>
          CSV export is always user-initiated, occurs entirely in the browser via a generated
          <code> Blob </code> and triggers a standard browser download. No copy of the export is
          transmitted or retained outside the user&rsquo;s device.
        </p>
      </Section>

      <Section id="approval" title="13. Approval Checklist">
        <ul className="space-y-1">
          {[
            "No backend storage of user data",
            "No telemetry, analytics or third-party trackers",
            "No authentication or credential handling",
            "All processing in-browser; HTTPS-only delivery",
            "Append-only audit log on edits",
            "User can wipe all data at any time",
            "Open dependencies, no native binaries",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm">
              <span className="text-chart-2 mt-0.5">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
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

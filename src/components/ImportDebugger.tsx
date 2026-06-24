import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { normalizeDate, suggestMapping, CANONICAL_FIELDS, type MappingDetection } from "@/lib/excel-parser";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SheetReport {
  sheetName: string;
  rowCount: number;
  columns: string[];
  dateColumns: { col: string; samples: { raw: unknown; type: string; normalized: string; ok: boolean }[] }[];
  preview: Record<string, unknown>[];
  warnings: string[];
  detectedAs: string;
  mapping: Record<string, MappingDetection>;
}

const DATE_HEADER_HINTS = ["date", "warranty", "created", "creation", "last logon", "last activity"];

const canonicalLabel = (field: string) => (field === "OU" ? "Computer OU" : field);

function isDateHeader(name: string): boolean {
  const n = name.toLowerCase();
  return DATE_HEADER_HINTS.some((h) => n.includes(h));
}

function detectFileType(mapping: Record<string, MappingDetection>, columns: string[], rows: Record<string, unknown>[]): string {
  const mappedFields = new Set(Object.values(mapping).map((m) => m.field));
  const hasCN = mappedFields.has("Computername");
  const hasUserInfo = ["Email", "Department", "AD Create.Date"].some((f) => mappedFields.has(f as never));
  if (!hasCN && hasUserInfo) return "Users-only file (will trigger Enrich Users mode)";
  if (hasCN) {
    const cnHeader = Object.entries(mapping).find(([, m]) => m.field === "Computername")?.[0];
    if (cnHeader) {
      const allEmpty = rows.every((r) => !String(r[cnHeader] ?? "").trim());
      if (allEmpty && hasUserInfo) return "Users-only file (Computername present but empty)";
    }
    return "HQ asset inventory file";
  }
  return "Unknown — no Computername or user-info columns detected";
}

export function ImportDebugger({ open, onOpenChange }: Props) {
  const [reports, setReports] = useState<SheetReport[]>([]);
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    setFilename(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const newReports: SheetReport[] = [];

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });

        if (jsonRows.length === 0) {
          newReports.push({
            sheetName, rowCount: 0, columns: [], dateColumns: [], preview: [],
            warnings: ["Empty sheet"], detectedAs: "—", mapping: {},
          });
          continue;
        }

        const columns = Object.keys(jsonRows[0]);
        const warnings: string[] = [];

        for (const col of columns) {
          if (col !== col.trim()) warnings.push(`Column "${col}" has leading/trailing whitespace`);
        }

        const dateColumns = columns
          .filter(isDateHeader)
          .map((col) => {
            const samples = jsonRows.slice(0, 5).map((r) => {
              const raw = r[col];
              const type = raw === null || raw === undefined
                ? "null"
                : raw instanceof Date ? "Date" : typeof raw;
              const normalized = normalizeDate(raw);
              return { raw, type, normalized, ok: !raw || !!normalized };
            });
            return { col, samples };
          });

        for (const dc of dateColumns) {
          const bad = dc.samples.filter((s) => !s.ok);
          if (bad.length) {
            warnings.push(`Column "${dc.col}" has ${bad.length} unparseable date(s) in first 5 rows`);
          }
        }

        const exportCols = ["Status", "Warranty until", "Exceptions", "Comments", "Source file"];
        const reimportedCols = exportCols.filter((c) => columns.includes(c));
        if (reimportedCols.length) {
          warnings.push(`Looks like a re-imported export — these columns will be stripped: ${reimportedCols.join(", ")}`);
        }

        const mapping = suggestMapping(columns);
        // Conflict warnings
        const fieldCounts = new Map<string, string[]>();
        for (const [h, det] of Object.entries(mapping)) {
          if (det.field === "ignore") continue;
          const arr = fieldCounts.get(det.field) ?? [];
          arr.push(h);
          fieldCounts.set(det.field, arr);
        }
        for (const [field, hs] of fieldCounts.entries()) {
          if (hs.length > 1) warnings.push(`Conflict: ${hs.length} headers map to "${canonicalLabel(field)}" (${hs.join(", ")})`);
        }
        // Unmapped fields warning (informational)
        const unmapped = columns.filter((c) => mapping[c]?.field === "ignore");
        if (unmapped.length) {
          warnings.push(`${unmapped.length} header(s) will be ignored: ${unmapped.join(", ")}`);
        }

        newReports.push({
          sheetName,
          rowCount: jsonRows.length,
          columns,
          dateColumns,
          preview: jsonRows.slice(0, 5),
          warnings,
          detectedAs: detectFileType(mapping, columns, jsonRows),
          mapping,
        });
      }

      setReports(newReports);
    } catch (err) {
      setReports([{
        sheetName: "Error",
        rowCount: 0, columns: [], dateColumns: [], preview: [],
        warnings: [`Failed to parse: ${err instanceof Error ? err.message : String(err)}`],
        detectedAs: "—", mapping: {},
      }]);
    } finally {
      setLoading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Debugger</DialogTitle>
          <DialogDescription>
            Inspect an Excel file before importing. Shows detected file type, columns, sample values,
            date parsing, and the suggested mapping to canonical fields — without changing your data.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFileChange} className="hidden" />
          <Button onClick={() => fileRef.current?.click()} disabled={loading}>
            <Upload className="h-4 w-4 mr-1" /> {loading ? "Analyzing…" : "Choose file to inspect"}
          </Button>
          {filename && <span className="text-sm text-muted-foreground truncate">{filename}</span>}
        </div>

        {reports.length > 0 && (
          <Tabs defaultValue={reports[0].sheetName} className="mt-2">
            <TabsList className="flex-wrap h-auto">
              {reports.map((r) => (
                <TabsTrigger key={r.sheetName} value={r.sheetName}>
                  {r.sheetName} ({r.rowCount})
                </TabsTrigger>
              ))}
            </TabsList>

            {reports.map((r) => (
              <TabsContent key={r.sheetName} value={r.sheetName} className="space-y-4 mt-3">
                <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1 text-sm">
                  <div><strong>Detected as:</strong> {r.detectedAs}</div>
                  <div><strong>Rows:</strong> {r.rowCount.toLocaleString()}</div>
                  <div><strong>Columns ({r.columns.length}):</strong> {r.columns.join(", ") || "—"}</div>
                </div>

                {r.warnings.length > 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                    <div className="flex items-center gap-1.5 font-semibold text-destructive text-sm mb-2">
                      <AlertTriangle className="h-4 w-4" /> Warnings
                    </div>
                    <ul className="text-xs space-y-1 list-disc list-inside">
                      {r.warnings.map((w, i) => (<li key={i}>{w}</li>))}
                    </ul>
                  </div>
                )}

                {r.warnings.length === 0 && (
                  <div className="rounded-md border border-chart-2/40 bg-chart-2/5 p-3 flex items-center gap-2 text-sm text-chart-2">
                    <CheckCircle2 className="h-4 w-4" /> No issues detected.
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Detected mapping</h4>
                  <div className="rounded-md border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-1.5">Source header</th>
                          <th className="text-left px-3 py-1.5">→ Canonical field</th>
                          <th className="text-left px-3 py-1.5">Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.columns.map((c) => {
                          const det = r.mapping[c];
                          const field = det?.field ?? "ignore";
                          const conf = det?.confidence ?? "none";
                          const isCanonical = (CANONICAL_FIELDS as readonly string[]).includes(field);
                          return (
                            <tr key={c} className={field === "ignore" ? "bg-muted/20" : ""}>
                              <td className="px-3 py-1 font-medium">{c}</td>
                              <td className="px-3 py-1">
                                {isCanonical ? (
                                  <span className="font-mono">{canonicalLabel(field)}</span>
                                ) : (
                                  <span className="text-muted-foreground italic">Ignore</span>
                                )}
                              </td>
                              <td className="px-3 py-1">
                                <span className={
                                  conf === "alias" ? "text-chart-2" :
                                  conf === "fuzzy" ? "text-chart-4" :
                                  "text-muted-foreground"
                                }>
                                  {conf}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {r.dateColumns.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Date columns</h4>
                    <div className="space-y-3">
                      {r.dateColumns.map((dc) => (
                        <div key={dc.col} className="rounded-md border border-border overflow-hidden">
                          <div className="px-3 py-1.5 bg-muted/50 text-sm font-medium">{dc.col}</div>
                          <table className="w-full text-xs">
                            <thead className="bg-muted/30">
                              <tr>
                                <th className="text-left px-3 py-1.5">Raw value</th>
                                <th className="text-left px-3 py-1.5">Type</th>
                                <th className="text-left px-3 py-1.5">Normalized</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dc.samples.map((s, i) => (
                                <tr key={i} className={!s.ok ? "bg-destructive/5" : ""}>
                                  <td className="px-3 py-1 font-mono">{JSON.stringify(s.raw)}</td>
                                  <td className="px-3 py-1">{s.type}</td>
                                  <td className="px-3 py-1 font-mono">{s.normalized || <span className="text-destructive">— unparseable —</span>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">First 5 rows</h4>
                  <div className="rounded-md border border-border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          {r.columns.map((c) => (
                            <th key={c} className="text-left px-3 py-1.5 whitespace-nowrap">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {r.preview.map((row, i) => (
                          <tr key={i} className={i % 2 ? "bg-muted/20" : ""}>
                            {r.columns.map((c) => {
                              const v = row[c];
                              const display = v instanceof Date
                                ? v.toISOString()
                                : v === null || v === undefined ? "" : String(v);
                              return (
                                <td key={c} className="px-3 py-1 max-w-[200px] truncate" title={display}>
                                  {display}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

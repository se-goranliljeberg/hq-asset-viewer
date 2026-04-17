/**
 * Append an audit entry to a row's comment field.
 * Format: "Date: YYYY-MM-DD Change: <description>"
 * Multiple entries are joined with " | ".
 */
export function appendComment(existing: string | undefined, change: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const entry = `Date: ${today} Change: ${change}`;
  const prev = (existing ?? "").trim();
  if (!prev) return entry;
  return `${prev} | ${entry}`;
}

export function describeChange(column: string, from: string, to: string): string {
  const f = from === "" ? "(empty)" : from;
  const t = to === "" ? "(empty)" : to;
  return `${column} from "${f}" to "${t}"`;
}

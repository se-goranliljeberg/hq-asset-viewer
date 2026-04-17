

# Fix duplicate Creation Date column, warranty zero, and exception labels

## Issues from screenshot

1. **Duplicate Creation Date column** — The imported users file has header `Creation Date` (capital D). The parser also adds a canonical `Creation date` (lowercase d) column from `USER_INFO_COLUMNS`, plus normalizes the date into it. Result: two columns — the raw garbage one (Excel serial floats like `45779.43...`) and the correctly formatted one (`2025-05-02`). Same risk exists for `Email` vs `Email Address`, `Department` (matches), etc.
2. **Warranty `1899-12-30`** — Excel cells with `0` get converted by `normalizeDate` (Excel serial 0 → 1899-12-30). Should treat `0`, empty, and obvious sentinel values as no warranty.
3. **"Missing user" shown when user is present** — In `parseSheet`, a row's `user` field is read from `userKey` (literal `User`/`Username`/`sAMAccountName`). The users file column L is probably `Email Address` or similar non-standard name, so `userKey` is null and `user` ends up empty even though the email column has data. The exception is then raised incorrectly.
4. **"Missing model" → "Missing computer"** — Per user request, rename the exception to `"Missing computer"` (and skip raising it for users-only rows where model is naturally absent).

## Fixes

### `src/lib/excel-parser.ts`

**A. Drop the original alias columns once they map to a canonical name.** When `emailKey`, `deptKey`, or `createdKey` is matched to a non-canonical header (e.g. `Email Address`, `Creation Date`), remove that original header from `dataColumns` so only the canonical `Email` / `Department` / `Creation date` column remains.

```ts
const aliasKeysToDrop = [emailKey, deptKey, createdKey].filter(
  (k): k is string => !!k && !USER_INFO_COLUMNS.includes(k as any)
);
const dataColumnsFiltered = dataColumns.filter(c => !aliasKeysToDrop.includes(c));
```

Also strip these from each row's `raw` so they don't carry duplicated values.

**B. Treat zero/sentinel as empty in `normalizeDate`.** Reject Excel serial `0` (and values < 1, which map to pre-1900) and the literal string `"0"`:

```ts
if (typeof input === "number") {
  if (!isFinite(input) || input <= 0) return "";
  // ...
}
if (s === "0") return "";
```

Also guard the resulting year — reject anything before 1970 as a sentinel.

**C. Fix user detection for the users file.** When `userKey` is null but `emailKey` exists, derive the user from the email's local-part (`jdoe@skanska.com` → `jdoe`). Only raise `"Missing user"` if neither user nor email is present.

**D. Rename and gate exceptions.**
- `"Missing model"` → `"Missing computer"`
- Only raise `"Missing computer"` when the row is NOT a users-only row (users without a computer already get `"User without computer"`)
- Recompute `"Missing user"` after the email-derivation step

### Files modified
- `src/lib/excel-parser.ts` — alias-column dedup, zero/sentinel date handling, email→user fallback, exception relabel/gating

No UI changes needed — once the parser stops emitting the duplicate `Creation Date` column, the table renders only the correct one.




## Remove Highlight on Full Imports

The "fresh import" highlight should fire only for **Add data** and **Enrich data** flows — not for full/replace imports (where every cell would light up, which is meaningless and visually noisy).

### Current behaviour

`mergeAndPersistMeta` in `src/components/AssetViewer.tsx` always calls `setLastImportAt(Date.now())`, which the table reads to glow recently-imported cells.

Two import paths currently trigger highlighting incorrectly:

1. **Fresh load** (`applyParsed`, line 924) — when there's no existing data, the file becomes the entire dataset. Every cell is "freshly imported" → entire table glows.
2. **Replace** (`handleImportReplace`, line 1122) — already correctly resets `setLastImportAt(null)` after the merge call, so this one is fine.

Add (line 1183) and Enrich (line 1102) and the conflict-resolution continuations (lines 1208, 1228, 1331) should keep highlighting — those are the cases where you're augmenting existing rows and want to see what changed.

### Change

Split `mergeAndPersistMeta` into two behaviours by adding an optional `highlight` flag (default `true`), then call it with `highlight: false` from the fresh-load branch of `applyParsed`.

```ts
const mergeAndPersistMeta = useCallback(
  (incoming: ImportMeta, opts: { highlight?: boolean } = {}) => {
    setImportMeta((prev) => {
      const next = mergeImportMeta(prev, incoming);
      saveImportMeta(next);
      return next;
    });
    if (opts.highlight !== false) setLastImportAt(Date.now());
    else setLastImportAt(null);
  },
  [],
);
```

Then in `applyParsed`'s fresh-load branch (line 924):

```ts
mergeAndPersistMeta(meta, { highlight: false });
```

`handleImportReplace` keeps its explicit `setLastImportAt(null)` (it doesn't go through `mergeAndPersistMeta` at all — it writes meta directly), so no change there.

Add / Enrich / conflict-resolution paths continue to call `mergeAndPersistMeta(...)` with no second argument → highlighting stays on for those.

### Files touched

- `src/components/AssetViewer.tsx` — modify `mergeAndPersistMeta` signature + the one fresh-load call site at line 924.

No changes needed to `AssetTable.tsx`, `csv-export.ts`, or anywhere else.


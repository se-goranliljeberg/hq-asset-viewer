## Asset Lifecycle Management

Today each row is a snapshot of "user + computer". We're extending the model so a **computer is a first-class asset** with its own lifecycle (`In stock → Deployed at user → In stock → Sent back to broker`), full history, and user-history rollups. Existing data keeps working; the new behaviours layer on top.

---

### 1. Data model changes (`src/lib/asset-types.ts`, `asset-edits.ts`)

Add lifecycle fields to `AssetRow` (all optional → backward compatible):

```ts
type LifecycleState = "In stock" | "Deployed at user" | "Sent back to broker";

interface LifecycleEvent {
  at: string;                 // ISO timestamp
  by: string;                 // user initials (existing system)
  from?: LifecycleState | "";
  to: LifecycleState;
  user?: string;              // assigned-to user at the moment of the event
  prevUser?: string;          // user being unassigned
  note?: string;
}

interface AssetRow {
  // existing fields...
  assetKind?: "computer" | "user-only";   // default "computer" when computername present
  history?: LifecycleEvent[];             // append-only lifecycle log
  previousUsers?: string[];               // distinct usernames who held this asset
}
```

`Status` (already on `AssetEdits`) becomes the canonical lifecycle state. We add a small helper `recordLifecycleEvent(row, edits, event)` that appends to `history`, updates `previousUsers`, and writes a human comment via the existing `appendComment` audit log.

### 2. Replace Device flow → split into two rows

`ReplaceDeviceDialog` (existing) and `handleReplaceDevice` (`AssetViewer.tsx` line ~746) currently overwrite the same row. New behaviour:

- **Old asset** stays as its own row, user cleared, `Status` set to user's choice (`In stock` default, or `Sent back to broker`), lifecycle event `Deployed at user → <chosen>` recorded with `prevUser`.
- **New asset** becomes a new row with the user attached, `Status = Deployed at user`, lifecycle event `(none) → Deployed at user` recorded.
- Dialog gets a new section: **"Source of replacement device"** with two tabs:
  - _New device_ — current Computername / Modell / Warranty inputs.
  - _From In Stock_ — searchable list of existing rows where `Status = "In stock"` and no user assigned. Picking one re-assigns that row instead of creating a new one (records `In stock → Deployed at user` event).

### 3. Multi-computer per user — collapsed display + exception

When several rows share the same `user` (case-insensitive, trimmed), the asset list shows them as **separate rows** as today (so each computer keeps its own status/warranty), but:

- Each such row gets a new **"Multi-device"** badge in the Computername cell (small chip with count, e.g. `2 of 3`), with a tooltip listing the sibling computernames.
- A new exception **"User has multiple computers"** is added in `effectiveExceptions` whenever `_multiComputerUsers` (computed once per dataset and passed in) contains the row's user. The existing exception flow + KPI counter picks it up automatically.
- The Audit Report's **Multi-Computer** KPI already exists — it stays, now backed by the same set.

(Why separate rows rather than one merged row: each device has its own warranty, status, history. A merged row would lose that. The badge gives the "shown together" feel without sacrificing per-asset truth.)

### 4. Import — duplicate-asset prompt

`detectUsernameConflicts` (in `excel-parser.ts`) is reused. A new sibling helper `detectUserMultiAssetIncoming` runs _after_ conflict resolution and finds incoming rows whose username already has a Computername in the dataset with a _different_ incoming Computername. The user is prompted via a new lightweight dialog (`MultiAssetImportDialog`) per affected user with three options:

1. **Add as additional device** (default) — adds the new row, leaves the old assignment, both rows get the multi-device badge & exception.
2. **Replace** — runs the same split-into-two-rows flow as §2, asking "Send old device to: In stock / Sent back to broker".
3. **Skip** — drops the incoming row.

### 5. Asset history side panel (`AssetHistoryDrawer.tsx`, new)

A new "History" button appears in the row actions (selection toolbar, plus a clock icon when a single row is selected). Opens a Sheet showing:

- **Lifecycle timeline** for this asset — events from `row.history`, plus seeded "Imported on …" entries from `importMeta`.
- **Current user** + **Previous users** list (clickable → filters table by that user).
- **Comments / audit log** (re-uses the existing `parseEntries` view).

### 6. User history view (Audit Report)

In `AuditDashboard.tsx`, clicking a row in **Per-User Detail** opens a "User profile" Sheet showing:

- Current device(s) assigned.
- **Past devices** — derived from any row whose `previousUsers` includes this user, OR any row currently no-user whose history mentions this user.
- Lifecycle events filtered to those touching this user.

### 7. localStorage persistence

`AssetData` already persists via `saveData`. The new fields (`history`, `previousUsers`, `assetKind`) ride along inside `AssetData.rows`, so no new keys are needed. A one-time migration in the existing `migrateToCanonical` flow (or a new `migrateLifecycle` flag `hq_lifecycle_migrated_v1`) backfills `assetKind` for existing rows: `computername` non-empty → `"computer"`, else `"user-only"`. Empty `history` arrays are left implicit.

### 8. Documentation & changelog

- New User Guide section "Asset lifecycle" covering: what the four states mean, how Replace Device works, how multi-computer users show up, how to read the History drawer and User profile.
- Changelog entry for v0.4.0 (minor bump — this is a new capability, not a patch).

---

### Files touched

**Edited**

- `src/lib/asset-types.ts` — new lifecycle types on `AssetRow`.
- `src/lib/asset-edits.ts` — `recordLifecycleEvent`, "User has multiple computers" exception support.
- `src/lib/excel-parser.ts` — `detectUserMultiAssetIncoming`, migration backfill for `assetKind`.
- `src/lib/asset-store.ts` — new migration flag, no schema-level changes.
- `src/components/AssetViewer.tsx` — split-row replace flow, multi-asset import dialog wiring, computing `multiComputerUsers` set, passing it down, history drawer state.
- `src/components/ReplaceDeviceDialog.tsx` — tabs for New / From In Stock, "send old device to" choice.
- `src/components/AssetTable.tsx` — Multi-device badge in Computername cell, "History" affordance.
- `src/components/AuditDashboard.tsx` — clickable user rows → User profile drawer.
- `src/components/KpiCards.tsx` — no logic change (multi-computer already counted via exceptions).
- `src/routes/documentation.user-guide.tsx`, `documentation.changelog.tsx`.
- `package.json` → 0.4.0.

**New**

- `src/components/AssetHistoryDrawer.tsx`
- `src/components/UserHistoryDrawer.tsx`
- `src/components/MultiAssetImportDialog.tsx`

# Payment groups: persistent choices + rename — design

Owner-approved 2026-07-14 ("yes go ahead and close gaps") after reviewing the
industry comparison: keep the id-referenced-instrument / attribute-bucket
model; close the two gaps; **no** `paymentGroups` table, **no**
issuer/network fields.

## Decisions

1. **Group chips derive from data.** `AddMethodSheet` offers
   `groupChoices(methods)`: the four built-in names in rank order, then every
   custom group found on existing methods (archived included — the settings
   tree shows them, so add must too), alphabetical, deduped, `Custom…` last.
   A custom group with no remaining methods disappears on its own — groups
   have no existence outside their members, so there is no orphan
   bookkeeping.
2. **`renameGroup(from, to)` in db.ts.** Trims `to`; rejects empty (same copy
   as addPaymentMethod); rejects built-in `from` — the four names are fixed
   vocabulary (rank, emoji, add-chips); allowing their rename would recreate
   the generic-UPI duplication one level up. Renaming **onto** any existing
   name (built-in included) merges buckets — nothing is lost, methods just
   re-bucket. Same-name rename is a no-op. One `filter().modify()` bulk
   update — `group` is unindexed and ~21 rows; expenses never store group,
   so no cascade exists by construction.
3. **✎ on custom group headers** in the settings tree, `window.prompt`
   pattern like method rename. The header row becomes `.group-head` (flex)
   holding the toggle + optional icon-btn — buttons cannot nest. An expanded
   group stays expanded across its own rename (openGroups swaps the key).
4. **Method rename** already exists (id-referenced) — nothing to build.

## Not doing

- No rename for built-in group names (revisit as a display-map if ever
  wanted). No per-group custom emoji. No schema/backup/prefs change of any
  kind — group strings already ride inside method rows in every backup;
  restoring an old backup restores old names (existing edits-win-by-id
  contract, same as label renames).

## Blast radius

db.ts domain op (no version block — dexie-migration ritual not triggered:
nothing persisted changes shape), lib/paymentMeta helper, AddMethodSheet,
SettingsDrawer, index.css. Live queries make picker/tree/History follow a
rename automatically.

## Tests

- db.test.ts `renameGroup`: re-buckets members only, trims, rejects empty,
  rejects each built-in, merges on collision, no-op on same name.
- paymentMeta.test.ts `groupChoices`: built-ins always in rank order,
  customs appended alphabetically deduped, archived-only groups included.
- UI verified in dev server, both themes, 375px.

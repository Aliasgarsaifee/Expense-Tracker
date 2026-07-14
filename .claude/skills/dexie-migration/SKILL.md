---
name: dexie-migration
description: The schema-change ritual for src/db.ts (Dexie over IndexedDB). Use whenever a change adds, removes, renames, or re-types ANYTHING persisted — a field on Expense/PaymentMethod/Category, a new table or index, seeded defaults, or a request like "store X" / "remember Y per expense". Even a one-line schema tweak goes through this ritual; phones in the wild hold irreplaceable data on every version ever shipped and a migration runs exactly once per device.
---

# Dexie migration ritual

Phones in the wild are the production fleet. There is no server to fix data on,
no way to re-run a botched migration, and the owner's real ledger is on the
line. That is why version blocks in `createDb()` are **append-only** and why
the test comes before the migration.

## Step 0 — challenge the change

Before adding anything to the schema, ask:

- Can it be **derived** instead of stored? (Totals, groupings, and labels are
  computed in `src/lib/` — storage is for facts, not caches.)
- Does the new shape let you **fold something old away**? Precedent: the v3
  migration folded `kind` + `cardType` into one `group` field instead of
  carrying both. Migrations may simplify; they must never just accrete.
- New fields on existing tables should be **optional** — v1/v2 rows exist and
  will not have them (`paymentMethodId?` is the precedent). Handle `undefined`
  everywhere, forever.

## The ritual, in order

### 1. Write the upgrade-path test first (red)

Build a legacy database containing **only the version blocks that existed
before your change**, seed old-shape rows (include edge rows: missing optional
fields, archived records), close it, then reopen through `createDb(name)` so
your new `upgrade()` runs. Pattern from `src/db.test.ts` ("migrations" block):

```ts
const name = `MigrationV4-${crypto.randomUUID()}`
const legacy = new Dexie(name)
legacy.version(1).stores({ expenses: 'id, spentOn, category, createdAt' })
// ...repeat existing blocks up to the CURRENT latest version, old shapes only
await legacy.table('expenses').add({ id: 'old-1', amount: 450, category: 'Food',
  spentOn: '2026-06-20', createdAt: '2026-06-20T13:00:00.000Z' })
legacy.close()

const upgraded = createDb(name) // runs the new upgrade()
try {
  // assert the transformed shape, and that old junk fields are gone
} finally {
  upgraded.close()
  await Dexie.delete(name)
}
```

### 2. Extend the fresh-install test

`populate` seeds fresh installs and **skips `upgrade()` entirely** — the two
paths must produce identical shapes. The "seeding" describe block in
db.test.ts asserts the fresh path; keep it in sync with what your upgrade
produces.

### 3. Append `version(N+1)` in createDb()

- Never edit an existing `version()` block — devices on that version already
  ran it.
- `upgrade()` transforms existing rows; delete superseded fields explicitly
  (see the v3 block: `delete m.kind`).
- Update the `populate` seed in the same commit if the defaults changed.
- Never change a seeded id (`pm-cash`, `pm-upi`, `cat-*`) — cross-install
  backup merging depends on them.

### 4. Decide the backup impact (src/lib/backup.ts)

- A new persisted field rides along in exports automatically, but
  `parseRecord`/`parseMethod`/`parseCategory` must **accept its absence** —
  every backup ever exported must import forever (the `currency ?? 'INR'`
  default is the precedent).
- Bump the envelope `version` in `backupToJson` only when the envelope shape
  itself changes, and teach the parser the old shape (as `groupFromRaw` does
  for v2 methods).
- Add an import test with an old-format fixture, plus an export → import
  round-trip test for the new field.

### 5. Decide the CSV impact

`CSV_HEADER` is a published format users' spreadsheets rely on. New columns
append at the end; reordering or removing is a breaking change to decide
deliberately, not a side effect.

### 6. Gates

`npm test && npm run lint && npm run build`, then reload the dev server with
existing data so the upgrade actually executes against a real (browser)
IndexedDB — watch the console for Dexie upgrade errors.

## Blast-radius checklist (paste into the plan)

- [ ] Upgrade-path test for every prior version that can reach this one
- [ ] Fresh-install seed test still matches
- [ ] `populate` and `upgrade()` produce identical shapes
- [ ] Backup import accepts files that predate the field
- [ ] Round-trip: export new shape → import → identical
- [ ] CSV columns unchanged (or consciously appended)
- [ ] All reads of the table handle rows missing the new field

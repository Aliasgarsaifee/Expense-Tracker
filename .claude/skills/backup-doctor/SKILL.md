---
name: backup-doctor
description: Inspect, validate, repair, and safely re-import expense-tracker backup JSON (v1/v2/v3 envelopes or bare expense arrays) and recover user data. Use when an import throws an "Invalid backup" error, a backup file looks wrong or truncated, data went missing, two installs need merging, or the user is restoring onto a new phone or after a reset.
---

# Backup doctor

Backups are the only thing standing between this app and data loss — treat a
user's backup file like a production database. Never edit the original; copy
it into the scratchpad and work there.

## What a valid file looks like (src/lib/backup.ts)

`parseBackupJson` accepts, oldest to newest:

- a **bare array** of expense records (v1-era / hand-edited files)
- an **envelope** `{ app, version, exportedAt, expenses, paymentMethods?, categories? }`
- v2 payment methods carrying `kind` (`'cash'|'upi'|'card'`) + `cardType`
  — folded into `group` by `groupFromRaw`
- expenses without `currency` (pre-v2) — defaulted to `'INR'`

Per-record rules (error messages carry the **1-based position**, so
"record 37" = index 36):

| Field | Rule |
|---|---|
| `id` | non-empty string (all record types) |
| `amount` | finite number > 0 |
| `spentOn` | matches `^\d{4}-\d{2}-\d{2}$` — a full timestamp here **fails** |
| `createdAt` | non-empty string |
| `currency` | optional; if present, non-empty string |
| `note` / `paymentMethodId` | optional; if present, string (non-empty for paymentMethodId) |
| method `group`/`kind` | must yield a group via `groupFromRaw`, else invalid |
| category `emoji` | non-empty string — required |

## Diagnose

Write a scratch test (or a quick node script in the scratchpad) that calls
`parseBackupJson` on the file and print the thrown message — it names the
first bad record. Loop: fix, re-parse, until clean. Common repairs:

- `amount` exported as a string → convert to number; `0`/negative rows are
  junk entries to remove (they were never valid app data).
- `spentOn` with a time suffix → truncate to the date part.
- Missing category `emoji` (hand-built files) → add one; `'🏷️'` is the
  app's default.
- Unknown `paymentMethodId` → leave it; parse allows it and the UI treats
  the method as absent. Do not invent methods.
- Duplicate labels differing only by case → parse passes; `importBackup`
  merges them by lowercase label. Expected, not a bug.

## How import merges (so you can predict the result)

`importBackup` runs in one all-or-nothing transaction:

- **Upsert by id** (`bulkPut`) — re-importing the same file never duplicates;
  the imported row wins over the local one with the same id.
- Same **label**, different id (methods/categories from another install) →
  the local record survives; incoming expenses are **rewritten** to point at
  it (`paymentMethodId` remapped, `category` label relabeled).
- Built-in seeds (`pm-cash`, `cat-*`, plus the retired `pm-upi` in pre-v4
  files) share ids across installs by design, so they merge cleanly. Never
  rename ids in a backup file.

## Safety rails

- On device, every import first writes `pre-import-YYYY-MM-DD.json` to
  Documents/Backups (`writePreImportSnapshot`) — it is **never auto-pruned**,
  so a wrong-file import is reversible by importing that snapshot back.
- Auto-backups: `auto-backup-YYYY-MM-DD.json`, last 7 kept, only that exact
  pattern ever pruned; manual exports are `expense-backup-*`. Anything else
  in the folder is the user's — untouchable.
- After a repair + import, verify: entry counts per month in History, totals
  per currency in Summary, and that no phantom categories/methods appeared
  in the Settings drawer.

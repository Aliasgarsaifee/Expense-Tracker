---
name: repro-first
description: Debugging discipline for this repo — reproduce every bug as a failing vitest before writing any fix, using fake-indexeddb and an isolated createDb() instance; includes the WKWebView-vs-browser gotcha table for "works in dev but breaks on the phone" reports. Use for ANY bug report, wrong total/date/ordering, data weirdness, import failure, or device-only misbehavior — before proposing a fix.
---

# Repro first

Pair this with `superpowers:systematic-debugging` (which owns the root-cause
process); this skill adds the repo's mechanics. The rule: **no fix lands
before a test reproduces the bug.** The test is cheap here — the entire data
layer runs in Node — and it becomes the regression guard for free.

## Where to reproduce

- **Pure logic** (money, dates, summarize, history, currencies, backup
  parsing): a direct unit test in the co-located `*.test.ts`. Most "wrong
  number on screen" bugs live here or in db.ts, not in the component.
- **Anything touching persistence**: isolate with the db.test.ts pattern —

  ```ts
  const name = `bug-1234-${crypto.randomUUID()}`
  const bugDb = createDb(name)
  try {
    // seed the MINIMAL data that exhibits the bug, assert the CORRECT behavior
  } finally {
    bugDb.close()
    await Dexie.delete(name)
  }
  ```

  (Module-level functions like `addExpense` use the shared `db` — tests that
  go through them rely on `src/test/setup.ts`'s fake-indexeddb and the
  existing beforeEach-clearing convention in db.test.ts.)
- **Backup/import bugs**: feed the offending JSON (sanitized) to
  `parseBackupJson`/`importBackup` in a test — see the `backup-doctor` skill.

Write the assertion for the **correct** behavior, watch it fail for the
reported reason, then fix. If it fails for a *different* reason, you have not
found the bug yet.

## "It only happens on the phone"

Most device-only reports are logic bugs wearing a platform costume. Factor
the adapter out and the bug usually reproduces in Node. Check the usual
suspects first:

| Symptom smells like | Actual mechanism in this repo |
|---|---|
| Happens on app resume / next day | `visibilitychange` fires on foreground (App.tsx runs auto-backup then); `runAutoBackupIfDue` is also date-gated by `PREFS.lastAutoBackup` |
| Feature silently does nothing in browser | `Capacitor.isNativePlatform()` guards short-circuit on web (autoBackup, haptics, share) — by design, not a bug |
| Bottom of a sheet unreachable with keyboard open | `--kb` inset from `useKeyboardInset` (visualViewport) — `dvh` does NOT shrink in WKWebView |
| Export "fails" when user closes the sheet | Share sheet dismissal rejects with `/cancel/i` — exportFile treats it as success; new callers must too |
| Wrong grouping/format of numbers or dates | `Intl` with `en-IN` + ISO-string assumptions; test with multi-currency and lakh-scale amounts |
| Data "vanished" | WebKit storage eviction (persist() is best-effort) — check Files app → Backups before assuming a code bug |
| Layout off near notch/home bar | `env(safe-area-inset-*)` padding missing on a new pinned element |

If it genuinely needs the device, instrument with visible UI state or
`console.error` (Safari → Develop → iPhone attaches to the WKWebView), fix,
and add the device check to the `ship-to-iphone` smoke list.

## After green

Keep the repro test (rename it to describe the invariant, not the ticket),
then run `npm test && npm run lint && npm run build` and re-exercise the flow
in the dev server.

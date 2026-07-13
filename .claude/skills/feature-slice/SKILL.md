---
name: feature-slice
description: Break any feature or behavior change into thin vertical slices ordered for this repo — schema/migration → pure lib function → db operation → screen wiring → polish — each slice test-first, green, and browser-verified before the next begins. Use when starting implementation of anything user-visible, when turning a written plan into tasks, or whenever a change would otherwise land as one big diff.
---

# Feature slicing for this repo

This app lives on one phone and must always be installable — every commit
should leave it working. The repo's layering (`screens → db.ts + lib/ →
Dexie/Capacitor`) makes one slicing order natural, because the data layer is
cheap to test in Node while UI is verified visually in the dev server.

## The slice order

Work bottom-up; skip layers the feature doesn't touch:

1. **Schema/migration** — only if something new persists. Follow the
   `dexie-migration` skill; this slice ends with both upgrade-path and
   fresh-install tests green.
2. **Pure logic** — the computation as a pure function in `src/lib/`
   (co-located `*.test.ts`, written first). If a component would need to
   compute something, that computation belongs here instead.
3. **Domain operation** — the CRUD/validation/guard rules in `src/db.ts`,
   tested against an isolated `createDb('...')`. Error messages written here
   are user-facing copy — make them specific and actionable.
4. **Screen wiring** — connect via `useLiveQuery` and the exported db/lib
   functions. Screens compose; they do not compute. Reuse the existing
   vocabulary (chips, bottom sheets, toast-with-Undo) before inventing UI.
5. **Polish** — spacing, dark theme, haptics (`tapFeedback`), keyboard inset,
   empty states. Run the `pocket-ledger-design` verification loop.

## Definition of done, per slice

- New behavior has a test that failed first (slices 1–3) or was exercised in
  the dev server at a ~375px viewport in both themes (slices 4–5).
- `npm test && npm run lint && npm run build` green.
- The app still works end-to-end — a half-landed feature may be invisible,
  but never broken.

## Worked example — "monthly budget with a warning"

1. ~~Schema~~ → a single budget amount is a pref, not a table: `PREFS.budget`
   via `src/lib/prefs.ts` (no migration needed — challenge the schema first).
2. `lib/summarize.ts`: `budgetStatus(expenses, budget)` pure function + tests
   (under, over, multi-currency months, no-budget case).
3. ~~db op~~ → not needed; prefs cover persistence.
4. SummaryScreen: status line using the existing stat-tile pattern; Settings
   drawer: budget field.
5. Dark-theme pass, copy check, 375px + keyboard-open verification.

Two slices vanished at design time — that is the point. Reshape until the
feature falls out of the existing structure instead of bolting on parallel
paths.

## Fit with the other process skills

- Upstream: `superpowers:brainstorming` → `superpowers:writing-plans` decide
  *what*; this skill orders the *how*.
- Independent slices (rare — most stack) can fan out via
  `superpowers:subagent-driven-development`.
- Every slice runs `superpowers:test-driven-development` red → green →
  refactor internally.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local-first daily expense tracker: React 19 + TypeScript (Vite) → Dexie over
IndexedDB → Recharts, wrapped with Capacitor 8 (SPM mode, no CocoaPods) and
installed on the owner's iPhone with a free Apple ID (which forces a re-sign
from Xcode every ~7 days). No cloud, no account, no server. All data lives on
the device, so **persisted data is production data**: IndexedDB schema,
backup-file compatibility, and localStorage pref keys are forever.

## Project structure

```
expense-tracker/
├── index.html                  # single page; loads src/main.tsx
├── src/
│   ├── main.tsx                # bootstrap: bundled fonts, ErrorBoundary, storage.persist()
│   ├── App.tsx                 # shell: tab bar + settings drawer; all 3 screens stay mounted
│   ├── index.css               # the entire design system: tokens, dark theme, all component styles
│   ├── db.ts                   # Dexie schema (v4) + migrations + every persistence/domain op
│   ├── db.test.ts              # includes fresh-install seed and v1→v4 upgrade-path tests
│   ├── screens/                # AddScreen, HistoryScreen, SummaryScreen
│   ├── components/             # shared UI: ExpenseForm, sheets, pickers, chart, drawer
│   ├── lib/                    # helpers; pure ones have co-located *.test.ts
│   │   ├── money / dates / period / summarize / history / currencies   # pure, fully tested
│   │   ├── backup.ts           # JSON backup (v3) + CSV export; imports v1–v3
│   │   ├── prefs.ts            # localStorage wrapper (et-pref:*), deliberately outside Dexie
│   │   ├── autoBackup.ts       # daily snapshot → Documents/Backups, keeps last 7
│   │   └── exportFile / haptics / useKeyboardInset / useMeasuredWidth / paymentMeta   # platform adapters
│   └── test/setup.ts           # fake-indexeddb → Dexie runs unmodified in Node
├── ios/App/                    # Capacitor Xcode project (SPM mode: CapApp-SPM package, no Pods)
│   └── App/Info.plist          # hand-set: UIFileSharingEnabled + LSSupportsOpeningDocumentsInPlace
├── assets/                     # icon/splash source SVGs (the ₹ is a Fraunces glyph outlined to a path)
├── capacitor.config.ts         # appId com.saifee.expenses, webDir dist
├── vite.config.ts              # vitest (node env) + __APP_VERSION__ from package.json
├── .claude/skills/             # project skills — this repo's own rituals (see Skill playbook)
└── .oxlintrc.json              # oxlint: react hooks rules
```

## Commands

```bash
npm run dev                        # Vite dev server on :5173 (.claude/launch.json name: "expense-tracker")
npm test                           # all unit tests once (vitest, node env + fake-indexeddb)
npm run test:watch                 # vitest watch mode
npx vitest run src/db.test.ts      # one test file
npx vitest run -t "merges by id"   # tests matching a name
npm run lint                       # oxlint
npm run build                      # tsc -b type-check, then vite build → dist/
```

iOS install (full setup and the 7-day re-sign ritual are in README.md):

```bash
npm run build && npx cap sync ios && npx cap open ios   # then set Team, pick iPhone, Run in Xcode
```

Browser vs device: the dev server covers almost everything (file exports fall
back to plain downloads). Device-only: haptics, the iOS share sheet, backups
appearing in the Files app, real keyboard insets. Verify UI at a ~375px-wide
viewport in **both** light and dark themes.

### Quality gates

Nothing is "done" until all three pass **and** the changed flow was actually
exercised (dev server, or device for native paths):

```bash
npm test && npm run lint && npm run build
```

- **Lint** = oxlint (`.oxlintrc.json`: react/typescript/oxc plugins;
  `react/rules-of-hooks` is an error, `react/only-export-components` warns).
  It is fast but does **not** type-check.
- **Types** = `tsc -b`, which runs inside `npm run build` (strict, plus
  `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`,
  `verbatimModuleSyntax`). `npx tsc -b` alone is the quick type-check.
- **No formatter is configured** — match surrounding style by hand (see Code
  style). Adding prettier or any formatter is an ADR-level change, not a
  drive-by.

## Architecture

Dependency direction is one-way: `screens/components → db.ts + lib/ → Dexie/Capacitor`.

- **`src/db.ts` is the entire persistence + domain layer.** Schema, versioned
  migrations, and all CRUD with the domain rules (validation, duplicate-label
  checks, delete-guards, rename transactions). Errors thrown here are shown to
  users verbatim. UI code never touches Dexie tables directly — it calls the
  exported functions. Keep it that way.
- **`src/lib/` holds logic as pure functions** (money, dates, summarize,
  history, backup, currencies — all unit-tested) plus thin platform adapters
  (prefs, exportFile, autoBackup, haptics). New logic belongs here or in
  db.ts as something testable, not inline in a component.
- **Screens stay dumb and always mounted.** `App.tsx` hides inactive tabs with
  the `hidden` attribute so a half-typed entry survives tab switches — effects
  in hidden screens keep running. Reactivity is `useLiveQuery`
  (dexie-react-hooks); there is no router, no state library, no CSS framework,
  and that is deliberate.

### Data invariants

- All dates/timestamps are ISO strings; sorting relies on lexicographic ==
  chronological. Never store Date objects or locale strings.
- Amounts are plain numbers in their own currency; there is **no FX
  conversion** by design — per-currency values are kept separate everywhere
  (see `splitByCurrency`).
- `expenses.category` stores the category **label**, not the id — it is a
  foreign key by label. `renameCategory` relabels history in a transaction;
  anything touching category identity must preserve that.
- `paymentMethodId` may be absent (pre-v2 entries). Always handle undefined.
- Archive, don't delete: methods/categories referenced by entries can only be
  archived. Built-ins (`pm-cash`, `cat-*`) are undeletable; stable seeded ids
  exist so backups from different installs merge instead of duplicating.
  Never change or reuse a seeded id — `pm-upi` stopped being seeded in v4
  (UPI is a group, not an instrument), but its id stays reserved: pre-v4
  backups may resurrect it as an ordinary, deletable-when-unreferenced method.

### Migrations (the most dangerous code in the repo)

Version blocks in `createDb()` are **append-only** — phones in the wild can
be on any version ever shipped (v1–v4). A schema change means: add the next
`version(N)` with an `upgrade()` for existing installs, keep the `populate`
seed in sync for fresh installs, and test **both paths** (db.test.ts shows
the pattern: build an old-shape db via `createDb(name)`, close, reopen
upgraded). Precedents worth copying: the v3 migration *folded*
`kind`/`cardType` into one `group` field rather than carrying both, and v4
*removed* the seeded generic UPI method (delete-if-unreferenced,
archive-if-referenced) — migrations may simplify, never just accrete.

### The backup contract

- `backup.ts` import must accept v1, v2, and v3 files forever. Exports must
  round-trip losslessly; imports merge by id, and same-labeled
  methods/categories from a different install merge by label — re-importing
  must never duplicate.
- CSV export: fixed column order, formula-injection escaping, BOM for Excel.
- `autoBackup.ts` prunes only files matching the exact `auto-backup-` prefix
  (keeps 7); `pre-import-*.json` safety copies are never pruned. Users' own
  files in that folder must never be touched.
- `PREFS` keys live in device localStorage — renaming one orphans stored data.

### Design system

Everything visual is `src/index.css`: custom-property tokens on `:root`, dark
theme via `prefers-color-scheme`. The look is "warm paper, ink, ledger-green".

- Any new or changed hue must hold **WCAG AA 4.5:1 as text in both themes**;
  the validated pairs are documented in the file's header comment — update it.
- Type: Fraunces Variable for display and money (`.money` = tabular-nums;
  display uses `font-variation-settings` SOFT/WONK), Atkinson Hyperlegible for
  body. Fonts ship in the bundle; the app must render identically offline — no
  runtime network fetches, ever.
- Interaction vocabulary: chips, bottom sheets, a toast-with-Undo after save
  (plus a haptic tick on device), single column capped at 560px, bottom tabs.

## Coding principles

### 1. Plan before implementing

Never go straight to code for a feature or behavior change. The sequence is:
clarify intent (`superpowers:brainstorming`) → design (`engineering:system-design`;
an ADR via `engineering:architecture` for technology choices or real
trade-offs, e.g. adding a dependency) → written plan (`superpowers:writing-plans`).
A plan states the slices, the tests per slice, the blast radius, and how the
result will be verified.

### 2. Test-driven development

Use `superpowers:test-driven-development` (red → green → refactor). In this
repo that is cheap: the whole data layer runs in Node via fake-indexeddb, so
write the failing test first in a co-located `*.test.ts` (isolate db tests
with `createDb('unique-name')`). Schema changes get an upgrade-path test
before the migration is written. Screens have no unit tests — which is fine
only because logic is extracted into lib/db; keep extracting it, and verify
UI in the dev server instead.

### 3. Disciplined execution

Execute written plans with `superpowers:executing-plans`; fan independent
tasks out with `superpowers:subagent-driven-development`. Nothing is "done"
until `npm test`, `npm run lint`, and `npm run build` are green and the actual
flow was exercised (`superpowers:verification-before-completion`, `/verify`).
Then review (`/code-review` or `superpowers:requesting-code-review`) and run a
simplification pass (`/simplify`) on substantive diffs.

### 4. SOLID, as it applies here

- **S** — persistence rules in db.ts, computation in pure lib functions,
  screens only compose. A component that computes is a smell.
- **O** — extend via data, not branches: custom payment groups work through
  `groupRank`/`groupEmoji` fallbacks with zero switch edits. New variant-like
  features should follow that shape.
- **L** — user-created things are substitutable for built-ins: custom
  groups/categories must flow through every path built-ins do (the only
  built-in special case is the delete guard).
- **I** — components take the narrowest props that do the job, not whole
  records "for later".
- **D** — screens depend on db.ts exports and lib abstractions, never on
  Dexie or Capacitor APIs directly. That inversion is exactly why the domain
  layer is testable under Node.

### 5. Blast radius before any change

Before implementing, enumerate what the change can reach and say it in the
plan: persisted data (Dexie schema, backup files, PREFS keys), cross-screen
effects (all three screens are live simultaneously), the iOS shell
(Info.plist keys, Capacitor plugins), and offline behavior. High-blast zones
in this repo, in order: `db.ts` version blocks, `backup.ts` parse/serialize,
the category-label foreign key, `autoBackup.ts` pruning, `Info.plist`. Changes
there need tests on both the new and the legacy path.

### 6. Simplify, don't accrete

When a new feature doesn't fit the current shape, reshape the design so the
feature falls out naturally — do not bolt on flags, parallel code paths, or
special cases, and do not anchor on the existing implementation. Design what
the code would look like if the feature had always existed, then migrate to
it; tests and append-only migrations make that safe. Prefer the change that
adds the feature *and* leaves the code smaller. The same bias applies to
dependencies: every package ships to the phone, and the app currently needs
no router, no state library, no CSS framework — adding one is an ADR-level
decision, not a convenience.

## Skill playbook

Project skills in `.claude/skills/` encode this repo's own rituals; the rest
are installed globally. Reach for them by moment:

| Moment | Reach for |
|---|---|
| New feature / behavior change | `superpowers:brainstorming` → `superpowers:writing-plans`, then `feature-slice` to order the work |
| Component or data design | `engineering:system-design` |
| Tech choice, new dependency, trade-off | `engineering:architecture` (ADR) |
| Touching the Dexie schema, seeds, or anything persisted | `dexie-migration` — non-negotiable |
| Writing code | `superpowers:test-driven-development` |
| Executing a plan | `superpowers:executing-plans`, `superpowers:subagent-driven-development` |
| Any bug or unexpected behavior | `superpowers:systematic-debugging` + `repro-first` |
| Backup files, import errors, data recovery | `backup-doctor` |
| UI / visual work | `pocket-ledger-design` + `ios-feel`; `dataviz` for charts |
| Putting a build on the iPhone | `ship-to-iphone` |
| Before claiming done | `superpowers:verification-before-completion`, `/verify`, `/code-review`, `/simplify` |

## Code style

- Match the files around you: 2-space indent, single quotes, no semicolons,
  trailing commas.
- Comments state constraints and reasons ("why"), never narration; this
  codebase has a strong why-comment culture. Keep load-bearing invariants
  (like the WCAG pairs or CSV escaping) documented where they live.
- Errors thrown from db.ts/lib are user-facing copy: friendly, specific,
  actionable — "2 entries use this method — archive it instead".
- Best-effort side effects (prefs, haptics, auto-backup, `storage.persist()`)
  must never block or crash the UI; failures degrade silently or log.

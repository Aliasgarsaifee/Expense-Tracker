# History filters: multi-select, group shortcuts, date range

**Date:** 2026-07-14 · **Status:** approved (owner picked scope "everything" and
approach A "filter sheet") · **Supersedes** the single-select method row and the
jump auto-scroll shipped earlier the same day.

## Goal

Filtering in History today is single-select (one payment method, one category —
the category only settable via a Settings jump) plus month + search. The owner
wants robust in-screen filtering: several methods at once, several categories at
once, whole payment groups in one tap, and an arbitrary date range. Semantics:
**OR within a dimension, AND across dimensions.** All filter state stays
ephemeral screen state — nothing persisted, so no schema/backup/prefs exposure.

## Decisions (owner-approved)

- **Scope:** multi-select methods + categories, group shortcuts, date range —
  all in this round.
- **Shape:** one `Filters ▾` trigger chip + a bottom sheet (approach A). The
  always-visible **active-filters row** is the single source of truth for what
  the list is sliced to.
- **Month pager ↔ date range are mutually exclusive** in the UI (either slices
  time); `filterExpenses` itself honors both if both are ever passed.
- The long scrolling method picker row, the `All` chip, and the jump
  auto-scroll machinery (`pickerRow` ref, `data-id`, scrollIntoView effect) are
  **deleted** — with every filter always visible as a dismissible chip, the
  off-screen-pressed-chip problem no longer exists.

## Filter model (`src/lib/history.ts`)

```ts
export interface HistoryFilter {
  month?: string | null
  paymentMethodIds?: readonly string[] | null // OR within; empty/null = all
  categories?: readonly string[] | null       // OR within; empty/null = all
  from?: string | null // inclusive ISO date bound
  to?: string | null   // inclusive ISO date bound
  query?: string
}
```

- `filterExpenses` builds Sets from the arrays; an entry matches
  `paymentMethodIds` only via its `paymentMethodId` (entries without one never
  match a method filter — same as today), and `categories` by exact label.
- Date bounds compare lexicographically on ISO strings (repo invariant:
  lexicographic == chronological). `from` and `to` are each optional and
  inclusive; either alone is an open-ended range.
- `filterExpenses` stays pure over expenses and **never learns about groups** —
  the screen resolves group selections to member ids.
- `HistoryJump` decouples from `HistoryFilter` (no longer a `Pick`):
  `{ paymentMethodId?: string | null; category?: string | null }` — unchanged
  shape, so `App.tsx` and `SettingsDrawer.tsx` are untouched.

## Screen state (`HistoryScreen.tsx`)

```ts
const [methodIds, setMethodIds] = useState<string[]>([])   // individually picked
const [groups, setGroups] = useState<string[]>([])         // whole-group picks
const [catFilters, setCatFilters] = useState<string[]>([])
const [from, setFrom] = useState<string | null>(null)
const [to, setTo] = useState<string | null>(null)
const [sheetOpen, setSheetOpen] = useState(false)
// month, query, editing unchanged
```

- **Derived** `effectiveMethodIds = methodIds ∪ members(groups)` (from the live
  `filterChips` list — active + archived-but-referenced methods, unchanged
  visibility rule) → passed to `filterExpenses`. A method added to a selected
  group later is included automatically (derived at render — extend via data).
- **Group/member invariant: a group and any of its members are never both
  stored.** Selecting a group absorbs that group's ids out of `methodIds`;
  tapping a pressed member of a selected group *demotes* the group (group
  removed, its other members added individually). Member chips render pressed
  when individually picked **or** covered by a selected group.
- **Pruning guards** (generalizing today's render-phase guard): drop
  `methodIds` not in `filterChips`; drop `groups` with no members in
  `filterChips`; drop `catFilters` whose label no longer exists among visible
  categories (active + referenced-by-entries, mirroring the method rule).
- **Jump effect:** unchanged reset semantics — month=All time, query cleared,
  filters replaced by the set-of-one from the jump — now also clears
  groups/from/to and closes the sheet. No scrolling code.
- **Exclusivity:** setting `from` or `to` calls `setMonth(null)`; `MonthPager`
  `onChange` wraps to also clear `from`/`to` when a month (or All-time toggle)
  is picked.

## FilterSheet (`src/components/FilterSheet.tsx`, new)

Presentational + controlled: receives the visible methods (`filterChips` list),
visible categories, and the five filter values + setters; owns no filter state.
Standard sheet scaffolding (`.sheet-scrim` → `.sheet`, handle, `.sheet-head`
with title + `Done` as the head action). Everything applies **live**; the list
updates behind the sheet. No keyboard inset needed (date inputs open the iOS
wheel, not the keyboard).

1. **Methods** — `bucketize(visibleMethods)`; per bucket a group-header toggle
   chip (`{groupEmoji} {group} · {count}`, `aria-pressed` when the group is
   selected) followed by a wrapping `.chip-grid` of member chips (label +
   `chip-tag` "archived" where applicable). Single-member groups still render
   header + member for a consistent mental model.
2. **Categories** — one `.chip-grid` of `{emoji} {label}` multi-toggle chips.
3. **Date** — From / To fields reusing the `.date-field` CSS with a local
   optional-value variant (shared `DateField` requires a value): friendly
   label or a muted placeholder ("Start" / "End"), transparent native
   `input[type=date]` on top, and a ✕ clear button per set field. If both are
   set and from > to, **swap silently** on entry.
4. **Footer** — `Clear all` (btn-text; resets methods/groups/categories/dates,
   not month/query) and nothing else; `Done` lives in the sheet head.

## Chrome (History screen body)

- **Trigger:** a `Filters ▾` chip where the method row used to be;
  `aria-pressed` + a count when anything is active (`Filters · 3 ▾` — count =
  groups + methodIds + catFilters + (range ? 1 : 0)).
- **Active-filters row** (kept, generalized): one dismissible chip per selected
  group (`💳 Credit card ✕`), per individual method, per category, plus one
  date chip (`📅 12 Jun – 4 Jul ✕`; open-ended renders "from 12 Jun" / "until
  4 Jul"; its ✕ clears both bounds). Chip dates render day + short month via
  `toLocaleDateString('en-IN')`, appending the year when it isn't the current
  one (data spans 2023–2026). A `Clear all` text button caps the row when it
  holds ≥ 2 chips. Row hidden when nothing active.
- Search field, month pager, empty states, record-count row: unchanged. The
  empty-state "Clear filters" button resets the five filter dimensions
  (methods, groups, categories, date range, query) but never month — same
  scope as `filtersActive`.

## Testing

Lib (`history.test.ts`, rewrite single-select cases + add):
- OR within methods; OR within categories; AND across dimensions.
- Empty array / null / undefined for each plural field = no filtering.
- Entries without `paymentMethodId` never match a method filter.
- `from`/`to` inclusive bounds, each alone (open-ended), both, inverted range
  matches nothing (the swap is a UI rule).
- Combinations with month + query still compose.

Browser (dev server, 375px, light + dark, the full imported dataset):
- Sheet open/close; a group tap selects its whole multi-card group (one chip in
  the row); member tap
  demotes; absorb on group select; live list updates behind the sheet.
- Categories multi-select; date range sets pager to All time and vice versa;
  from>to swap; open-ended range chips.
- Settings jump still lands correctly (set-of-one, sheet closed); clear-all;
  filtered empty state; record-count row.

## Blast radius

- **Touched:** `lib/history.ts`, `lib/history.test.ts`, `screens/
  HistoryScreen.tsx`, new `components/FilterSheet.tsx`, small additive
  `index.css` (filter-sheet section spacing; reuse `.chip-grid`, `.sheet-*`,
  `.date-field`, `.chip` as-is).
- **Untouched:** `db.ts` (no schema), `backup.ts`, `prefs.ts`, `App.tsx`,
  `SettingsDrawer.tsx`, `MonthPager.tsx`, shared `DateField.tsx`.
- Nothing persisted → no migration, no backup-contract, no PREFS exposure.
- All three screens stay mounted: filter state changes only re-render History.

## Out of scope (explicit)

Date presets ("Last 30 days"), amount-range filter, saved filters, Summary
screen tap-through, persisting filters across restarts.

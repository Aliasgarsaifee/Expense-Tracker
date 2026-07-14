# History Multi-Select Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multi-select History filtering — several payment methods, whole payment groups, several categories, and an inclusive date range — edited in a bottom sheet, summarized in the always-visible active-filters chip row.

**Architecture:** `filterExpenses` goes plural (`paymentMethodIds`/`categories` arrays, `from`/`to` ISO bounds) and stays pure; group→member resolution and the group/member selection invariant live in pure `paymentMeta` helpers; a new controlled `FilterSheet` component edits the state that `HistoryScreen` owns. The old scrolling picker row and the jump auto-scroll machinery are deleted.

**Tech Stack:** React 19 + TypeScript (Vite), vitest (node env), existing CSS tokens/classes in `src/index.css`.

**Spec:** `docs/superpowers/specs/2026-07-14-history-filters-design.md`

## Global Constraints

- **Do NOT `git commit` anything.** Owner reviews the working tree and commits himself — every "commit" moment in this plan means "leave the change uncommitted and move on".
- Code style: 2-space indent, single quotes, no semicolons, trailing commas; comments state *why*, never narration.
- `verbatimModuleSyntax` is on — type-only imports must use `import type` / `type` specifiers. `noUnusedLocals`/`noUnusedParameters` are on — deleting code must also delete now-unused imports.
- Colors/spacing: reuse existing classes (`.chip`, `.chip-grid`, `.sheet-*`, `.field`, `.date-field`, `.btn-text`, `.btn-ghost`, `.chip-tag`, `.filter-row`); any new CSS uses tokens only, no hex.
- Dates are ISO strings compared lexicographically (repo invariant). Never construct locale strings for logic.
- Filter state is ephemeral — nothing touches `db.ts`, `backup.ts`, `prefs.ts`, or `App.tsx`.
- Quality gates before "done": `npm test && npm run lint && npm run build`, plus exercising the flow in the dev server (launch config name `expense-tracker`, port 5173) at ~375px in **both** themes.

---

### Task 1: Plural + dated `HistoryFilter` in lib/history

**Files:**
- Modify: `src/lib/history.ts:21-44`
- Test: `src/lib/history.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (Tasks 4 depends on these exact shapes):
  ```ts
  export interface HistoryFilter {
    month?: string | null
    paymentMethodIds?: readonly string[] | null // OR within; empty/null = all
    categories?: readonly string[] | null       // OR within; empty/null = all
    from?: string | null // inclusive ISO date bound
    to?: string | null   // inclusive ISO date bound
    query?: string
  }
  export interface HistoryJump { paymentMethodId?: string | null; category?: string | null }
  export function filterExpenses(expenses: Expense[], f: HistoryFilter): Expense[]
  ```

- [ ] **Step 1: Rewrite the filter tests for the plural shape and add date-bound tests**

In `src/lib/history.test.ts`, replace the five existing cases that use `paymentMethodId:`/`category:` filter keys and add the new coverage. The `exp()` helper at the top of the file stays as is. Replace the whole `describe('filterExpenses', …)` block with:

```ts
describe('filterExpenses', () => {
  it('returns everything when the filter has no criteria', () => {
    const rows = [exp(), exp({ spentOn: '2026-06-01' })]
    expect(filterExpenses(rows, {})).toEqual(rows)
    expect(
      filterExpenses(rows, {
        month: null,
        paymentMethodIds: null,
        categories: null,
        from: null,
        to: null,
        query: '',
      }),
    ).toEqual(rows)
    expect(filterExpenses(rows, { paymentMethodIds: [], categories: [] })).toEqual(rows)
    expect(filterExpenses(rows, { query: '   ' })).toEqual(rows)
  })

  it('keeps only expenses whose spentOn starts with the month', () => {
    const july12 = exp({ spentOn: '2026-07-12' })
    const july1 = exp({ spentOn: '2026-07-01' })
    const june30 = exp({ spentOn: '2026-06-30' })
    expect(filterExpenses([july12, july1, june30], { month: '2026-07' })).toEqual([
      july12,
      july1,
    ])
  })

  it('matches any of the given paymentMethodIds (OR within the dimension)', () => {
    const cash = exp({ paymentMethodId: CASH_METHOD_ID })
    const upi = exp({ paymentMethodId: UPI_METHOD_ID })
    const card = exp({ paymentMethodId: 'pm-card' })
    expect(
      filterExpenses([cash, upi, card], {
        paymentMethodIds: [CASH_METHOD_ID, UPI_METHOD_ID],
      }),
    ).toEqual([cash, upi])
  })

  it('never matches entries without a paymentMethodId against a method filter', () => {
    const cash = exp({ paymentMethodId: CASH_METHOD_ID })
    const none = exp()
    expect(filterExpenses([cash, none], { paymentMethodIds: [CASH_METHOD_ID] })).toEqual([
      cash,
    ])
  })

  it('matches any of the given category labels, exactly', () => {
    const food = exp({ category: 'Food' })
    const foodCourt = exp({ category: 'Food court' })
    const rent = exp({ category: 'Rent' })
    expect(filterExpenses([food, foodCourt, rent], { categories: ['Food'] })).toEqual([
      food,
    ])
    expect(
      filterExpenses([food, foodCourt, rent], { categories: ['Food', 'Rent'] }),
    ).toEqual([food, rent])
  })

  it('treats from/to as inclusive ISO date bounds', () => {
    const before = exp({ spentOn: '2026-07-01' })
    const onFrom = exp({ spentOn: '2026-07-02' })
    const inside = exp({ spentOn: '2026-07-10' })
    const onTo = exp({ spentOn: '2026-07-20' })
    const after = exp({ spentOn: '2026-07-21' })
    const rows = [before, onFrom, inside, onTo, after]
    expect(filterExpenses(rows, { from: '2026-07-02', to: '2026-07-20' })).toEqual([
      onFrom,
      inside,
      onTo,
    ])
  })

  it('supports open-ended ranges (only from, or only to)', () => {
    const june = exp({ spentOn: '2026-06-15' })
    const july = exp({ spentOn: '2026-07-15' })
    expect(filterExpenses([june, july], { from: '2026-07-01' })).toEqual([july])
    expect(filterExpenses([june, july], { to: '2026-06-30' })).toEqual([june])
  })

  it('matches nothing for an inverted range (the swap is a UI rule)', () => {
    const row = exp({ spentOn: '2026-07-10' })
    expect(filterExpenses([row], { from: '2026-07-20', to: '2026-07-01' })).toEqual([])
  })

  it('composes categories with methods, month, and query', () => {
    const hit = exp({
      spentOn: '2026-07-12',
      category: 'Food',
      paymentMethodId: CASH_METHOD_ID,
      note: 'chai',
    })
    const wrongCategory = exp({
      spentOn: '2026-07-12',
      category: 'Rent',
      paymentMethodId: CASH_METHOD_ID,
      note: 'chai',
    })
    expect(
      filterExpenses([hit, wrongCategory], {
        month: '2026-07',
        paymentMethodIds: [CASH_METHOD_ID],
        categories: ['Food'],
        query: 'chai',
      }),
    ).toEqual([hit])
  })

  it('matches the query against the note, case-insensitively', () => {
    const chai = exp({ note: 'Chai with Ravi' })
    const other = exp({ note: 'bus ticket' })
    expect(filterExpenses([chai, other], { query: 'CHAI' })).toEqual([chai])
  })

  it('matches the query against the category', () => {
    const transport = exp({ category: 'Transport' })
    const food = exp({ category: 'Food' })
    expect(filterExpenses([transport, food], { query: 'transport' })).toEqual([
      transport,
    ])
  })

  it('matches the query against the stringified amount', () => {
    const a = exp({ amount: 450.5 })
    const b = exp({ amount: 120 })
    expect(filterExpenses([a, b], { query: '450.5' })).toEqual([a])
    expect(filterExpenses([a, b], { query: '450' })).toEqual([a])
  })

  it('trims the query before matching', () => {
    const chai = exp({ note: 'chai' })
    expect(filterExpenses([chai, exp()], { query: '  chai  ' })).toEqual([chai])
  })

  it('does not crash on entries without a note', () => {
    const noteless = exp()
    delete noteless.note
    expect(filterExpenses([noteless], { query: 'zzz' })).toEqual([])
  })

  it('combines criteria with AND across dimensions', () => {
    const hit = exp({ spentOn: '2026-07-12', paymentMethodId: CASH_METHOD_ID, note: 'chai' })
    const wrongRange = exp({ spentOn: '2026-06-12', paymentMethodId: CASH_METHOD_ID, note: 'chai' })
    const wrongMethod = exp({ spentOn: '2026-07-12', paymentMethodId: UPI_METHOD_ID, note: 'chai' })
    const wrongQuery = exp({ spentOn: '2026-07-12', paymentMethodId: CASH_METHOD_ID, note: 'rent' })
    expect(
      filterExpenses([hit, wrongRange, wrongMethod, wrongQuery], {
        from: '2026-07-01',
        to: '2026-07-31',
        paymentMethodIds: [CASH_METHOD_ID],
        query: 'chai',
      }),
    ).toEqual([hit])
  })
})
```

- [ ] **Step 2: Run the test file to verify the new cases fail**

Run: `npx vitest run src/lib/history.test.ts`
Expected: FAIL — TypeScript/object-literal errors for the unknown keys (`paymentMethodIds`, `categories`, `from`, `to`) and assertion failures; the old single-key implementation ignores the new fields.

- [ ] **Step 3: Implement the plural filter in `src/lib/history.ts`**

Replace lines 21–44 (the `HistoryFilter` interface, `HistoryJump`, and `filterExpenses`) with:

```ts
export interface HistoryFilter {
  month?: string | null
  paymentMethodIds?: readonly string[] | null // OR within; empty/null = all
  categories?: readonly string[] | null       // OR within; empty/null = all
  from?: string | null // inclusive ISO date bound
  to?: string | null   // inclusive ISO date bound
  query?: string
}

// A settings-row tap: App hands this to HistoryScreen, which resets its view
// to show everything for the tapped method or category (a set-of-one).
export interface HistoryJump {
  paymentMethodId?: string | null
  category?: string | null
}

// Dimensions AND together; the id/label arrays OR within their dimension.
// Date bounds compare lexicographically — ISO dates make that chronological.
export function filterExpenses(expenses: Expense[], f: HistoryFilter): Expense[] {
  const q = f.query?.trim().toLowerCase() ?? ''
  const methodIds = f.paymentMethodIds?.length ? new Set(f.paymentMethodIds) : null
  const categories = f.categories?.length ? new Set(f.categories) : null
  return expenses.filter((e) => {
    if (f.month && !e.spentOn.startsWith(`${f.month}-`)) return false
    if (methodIds && (!e.paymentMethodId || !methodIds.has(e.paymentMethodId))) return false
    if (categories && !categories.has(e.category)) return false
    if (f.from && e.spentOn < f.from) return false
    if (f.to && e.spentOn > f.to) return false
    if (q) {
      const haystacks = [e.note ?? '', e.category, String(e.amount)]
      if (!haystacks.some((h) => h.toLowerCase().includes(q))) return false
    }
    return true
  })
}
```

`HistoryJump` deliberately stops being a `Pick<HistoryFilter, …>` so `App.tsx`/`SettingsDrawer.tsx` compile untouched.

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx vitest run src/lib/history.test.ts`
Expected: PASS (15 filterExpenses cases + the untouched groupByDay/groupByMonth/formatTotals suites).

Note: `src/screens/HistoryScreen.tsx` now fails `tsc` (it still passes `paymentMethodId`/`category`) — that is expected until Task 4; vitest doesn't type-check across files, so the test run stays green. Do not run `npm run build` between Tasks 1 and 4.

- [ ] **Step 5: Leave uncommitted** (owner commits; see Global Constraints)

---

### Task 2: `MethodSelection` toggle helpers in lib/paymentMeta

**Files:**
- Modify: `src/lib/paymentMeta.ts` (append at end)
- Test: `src/lib/paymentMeta.test.ts` (append at end)

**Interfaces:**
- Consumes: nothing new.
- Produces (Tasks 3–4 depend on these exact shapes):
  ```ts
  export interface MethodSelection { methodIds: string[]; groups: string[] }
  export function toggleGroup(sel: MethodSelection, group: string, memberIds: string[]): MethodSelection
  export function toggleMethod(sel: MethodSelection, method: { id: string; group: string }, groupMemberIds: string[]): MethodSelection
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/paymentMeta.test.ts` (the `pm` helper at the top is reused; extend the import line to `import { bucketize, groupChoices, groupEmoji, toggleGroup, toggleMethod } from './paymentMeta'`):

```ts
describe('toggleGroup', () => {
  it('selects a group and absorbs its individually-picked members', () => {
    const sel = { methodIds: ['hdfc', 'cash'], groups: [] }
    expect(toggleGroup(sel, 'Credit card', ['hdfc', 'icici'])).toEqual({
      methodIds: ['cash'],
      groups: ['Credit card'],
    })
  })

  it('deselects a selected group, leaving other picks alone', () => {
    const sel = { methodIds: ['cash'], groups: ['Credit card', 'UPI'] }
    expect(toggleGroup(sel, 'Credit card', ['hdfc', 'icici'])).toEqual({
      methodIds: ['cash'],
      groups: ['UPI'],
    })
  })
})

describe('toggleMethod', () => {
  it('adds an unselected method', () => {
    const sel = { methodIds: [], groups: [] }
    expect(
      toggleMethod(sel, { id: 'hdfc', group: 'Credit card' }, ['hdfc', 'icici']),
    ).toEqual({ methodIds: ['hdfc'], groups: [] })
  })

  it('removes an individually selected method', () => {
    const sel = { methodIds: ['hdfc', 'cash'], groups: [] }
    expect(
      toggleMethod(sel, { id: 'hdfc', group: 'Credit card' }, ['hdfc', 'icici']),
    ).toEqual({ methodIds: ['cash'], groups: [] })
  })

  it('demotes a selected group to its other members when one is toggled off', () => {
    const sel = { methodIds: ['cash'], groups: ['Credit card'] }
    expect(
      toggleMethod(sel, { id: 'hdfc', group: 'Credit card' }, ['hdfc', 'icici', 'bob']),
    ).toEqual({ methodIds: ['cash', 'icici', 'bob'], groups: [] })
  })

  it('demoting a single-member group deselects it entirely', () => {
    const sel = { methodIds: [], groups: ['Cash'] }
    expect(toggleMethod(sel, { id: 'cash', group: 'Cash' }, ['cash'])).toEqual({
      methodIds: [],
      groups: [],
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/paymentMeta.test.ts`
Expected: FAIL — `toggleGroup`/`toggleMethod` are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/paymentMeta.ts`:

```ts
// ——— History method-filter selection ———

// What the History filter sheet manipulates: whole groups plus individual
// methods. Invariant: a group and any of its members are never both stored —
// a selected group covers its members implicitly, future ones included.
export interface MethodSelection {
  methodIds: string[]
  groups: string[]
}

// Selecting a group absorbs its individually-picked members; deselecting
// just removes the group.
export function toggleGroup(
  sel: MethodSelection,
  group: string,
  memberIds: string[],
): MethodSelection {
  if (sel.groups.includes(group)) {
    return { methodIds: sel.methodIds, groups: sel.groups.filter((g) => g !== group) }
  }
  return {
    methodIds: sel.methodIds.filter((id) => !memberIds.includes(id)),
    groups: [...sel.groups, group],
  }
}

// Toggling a member of a selected group demotes the group to "everyone
// else"; otherwise it is a plain add/remove of that one method.
export function toggleMethod(
  sel: MethodSelection,
  method: { id: string; group: string },
  groupMemberIds: string[],
): MethodSelection {
  if (sel.groups.includes(method.group)) {
    return {
      groups: sel.groups.filter((g) => g !== method.group),
      methodIds: [...sel.methodIds, ...groupMemberIds.filter((id) => id !== method.id)],
    }
  }
  return sel.methodIds.includes(method.id)
    ? { groups: sel.groups, methodIds: sel.methodIds.filter((id) => id !== method.id) }
    : { groups: sel.groups, methodIds: [...sel.methodIds, method.id] }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/paymentMeta.test.ts`
Expected: PASS (existing 8 cases + 7 new).

- [ ] **Step 5: Leave uncommitted**

---

### Task 3: FilterSheet component + CSS

**Files:**
- Create: `src/components/FilterSheet.tsx`
- Modify: `src/index.css` (append a small block after the `.chip-tag` rule around line 933–940)

**Interfaces:**
- Consumes: `MethodSelection`, `toggleGroup`, `toggleMethod`, `bucketize`, `groupEmoji` from `../lib/paymentMeta`; `formatDateLong` from `../lib/dates`; `Category`, `PaymentMethod` types from `../db`.
- Produces (Task 4 mounts it): `FilterSheet` with props
  ```ts
  interface Props {
    open: boolean
    methods: PaymentMethod[]     // visible: active + archived-but-referenced
    categories: Category[]       // visible: active + referenced
    selection: MethodSelection
    onSelectionChange: (sel: MethodSelection) => void
    catFilters: string[]
    onCatFiltersChange: (labels: string[]) => void
    from: string | null
    to: string | null
    onRangeChange: (from: string | null, to: string | null) => void
    onClearAll: () => void
    onClose: () => void
  }
  ```

No unit test — screens/components are verified in the dev server (repo rule); all logic it calls is the pure, tested lib code.

- [ ] **Step 1: Create `src/components/FilterSheet.tsx`**

```tsx
import type { Category, PaymentMethod } from '../db'
import { formatDateLong } from '../lib/dates'
import {
  bucketize,
  groupEmoji,
  toggleGroup,
  toggleMethod,
  type MethodSelection,
} from '../lib/paymentMeta'

interface Props {
  open: boolean
  methods: PaymentMethod[]
  categories: Category[]
  selection: MethodSelection
  onSelectionChange: (sel: MethodSelection) => void
  catFilters: string[]
  onCatFiltersChange: (labels: string[]) => void
  from: string | null
  to: string | null
  onRangeChange: (from: string | null, to: string | null) => void
  onClearAll: () => void
  onClose: () => void
}

// Optional-bound date field: same friendly face as DateField, but empty means
// "no bound" and a set value is clearable. The ✕ needs a z-index because the
// transparent native input covers the whole field to keep the iOS wheel.
function RangeDateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (iso: string | null) => void
}) {
  return (
    <div className="date-field">
      <span className={value ? 'date-display' : 'date-display date-empty'}>
        {value ? formatDateLong(value) : label}
      </span>
      {value ? (
        <button
          type="button"
          className="btn-text date-clear"
          aria-label={`Clear ${label.toLowerCase()} date`}
          onClick={() => onChange(null)}
        >
          ✕
        </button>
      ) : (
        <span className="date-caret" aria-hidden="true">
          📅
        </span>
      )}
      <input
        type="date"
        aria-label={`${label} date`}
        value={value ?? ''}
        max="9999-12-31"
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  )
}

// Fully controlled: HistoryScreen owns every filter value. Everything applies
// live — the list updates behind the sheet — so Done only dismisses.
export function FilterSheet({
  open,
  methods,
  categories,
  selection,
  onSelectionChange,
  catFilters,
  onCatFiltersChange,
  from,
  to,
  onRangeChange,
  onClearAll,
  onClose,
}: Props) {
  if (!open) return null
  const buckets = bucketize(methods)
  const anyActive =
    selection.methodIds.length > 0 ||
    selection.groups.length > 0 ||
    catFilters.length > 0 ||
    from !== null ||
    to !== null

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        className="sheet filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Filter history"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-head">
          <h2 className="display">Filters</h2>
          <button className="btn-text" type="button" onClick={onClose}>
            Done
          </button>
        </header>

        <div className="field">
          <span>Paid with</span>
          <div className="filter-groups">
            {buckets.map(({ group, members }) => (
              <div key={group} className="chip-grid" role="group" aria-label={group}>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={selection.groups.includes(group)}
                  onClick={() =>
                    onSelectionChange(
                      toggleGroup(selection, group, members.map((m) => m.id)),
                    )
                  }
                >
                  <span aria-hidden="true">{groupEmoji(group)}</span> {group} ·{' '}
                  {members.length}
                </button>
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="chip"
                    aria-pressed={
                      selection.methodIds.includes(m.id) ||
                      selection.groups.includes(m.group)
                    }
                    onClick={() =>
                      onSelectionChange(
                        toggleMethod(selection, m, members.map((x) => x.id)),
                      )
                    }
                  >
                    {m.label}
                    {m.archived && <span className="chip-tag">archived</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Categories</span>
          <div className="chip-grid" role="group" aria-label="Category filter">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip"
                aria-pressed={catFilters.includes(c.label)}
                onClick={() =>
                  onCatFiltersChange(
                    catFilters.includes(c.label)
                      ? catFilters.filter((l) => l !== c.label)
                      : [...catFilters, c.label],
                  )
                }
              >
                <span aria-hidden="true">{c.emoji}</span> {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Between</span>
          <div className="filter-dates">
            <RangeDateField label="Start" value={from} onChange={(v) => onRangeChange(v, to)} />
            <RangeDateField label="End" value={to} onChange={(v) => onRangeChange(from, v)} />
          </div>
        </div>

        <button type="button" className="btn-ghost" disabled={!anyActive} onClick={onClearAll}>
          <span>Clear all filters</span>
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Append the CSS**

In `src/index.css`, directly after the `.chip-tag` rule block, add:

```css
/* ——— history filter sheet ——— */

.filter-sheet .field {
  margin-bottom: 20px;
}

.filter-groups {
  display: grid;
  gap: 12px;
}

.filter-dates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.date-display.date-empty {
  color: var(--ink-3);
}

/* Sits above the transparent native date input so it stays tappable. */
.date-clear {
  position: relative;
  z-index: 1;
  padding: 2px 8px;
}
```

- [ ] **Step 3: Type-check the new component in isolation**

Run: `npx tsc -b`
Expected: errors ONLY in `src/screens/HistoryScreen.tsx` (still on the old filter keys until Task 4) — none in `FilterSheet.tsx`. If `FilterSheet.tsx` itself errors, fix before moving on.

- [ ] **Step 4: Leave uncommitted**

---

### Task 4: Rewire HistoryScreen (and delete the picker row + auto-scroll)

**Files:**
- Modify: `src/screens/HistoryScreen.tsx` (full-file replacement below)

**Interfaces:**
- Consumes: everything produced by Tasks 1–3 exactly as declared there.
- Produces: no new exports; `App.tsx` keeps passing `jump?: HistoryJump | null` unchanged.

**What disappears vs. today's file:** the `pickerRow` ref + `useRef` import, the scroll-into-view logic in the jump effect, the scrolling method picker row (incl. the `All` chip and `data-id`), the single-select `methodFilter`/`categoryFilter` states, and the `activeMethod` derivation.

- [ ] **Step 1: Replace `src/screens/HistoryScreen.tsx` with:**

```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { EditSheet } from '../components/EditSheet'
import { FilterSheet } from '../components/FilterSheet'
import { MonthPager } from '../components/MonthPager'
import {
  listCategories,
  listExpenses,
  listPaymentMethods,
  type Category,
  type Expense,
  type PaymentMethod,
} from '../db'
import { monthLabel, monthOf, todayISO, yesterdayISO } from '../lib/dates'
import {
  filterExpenses,
  formatTotals,
  groupByDay,
  groupByMonth,
  type DayGroup,
  type HistoryJump,
  type MoneyByCurrency,
} from '../lib/history'
import { formatMoney } from '../lib/money'
import { groupEmoji, type MethodSelection } from '../lib/paymentMeta'

function dayLabel(iso: string): string {
  const today = todayISO()
  if (iso === today) return 'Today'
  if (iso === yesterdayISO()) return 'Yesterday'
  const d = new Date(iso + 'T00:00:00')
  const sameYear = iso.slice(0, 4) === today.slice(0, 4)
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

// Compact chip date ("12 Jun"), plus the year once it isn't the current one —
// the ledger reaches back to 2023.
function shortDate(iso: string): string {
  const sameYear = iso.slice(0, 4) === todayISO().slice(0, 4)
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

function EntryRow({
  expense,
  emoji,
  methodLabel,
  onEdit,
}: {
  expense: Expense
  emoji: string
  methodLabel?: string
  onEdit: (e: Expense) => void
}) {
  const sub = [expense.note ? expense.category : null, methodLabel]
    .filter(Boolean)
    .join(' · ')
  return (
    <li>
      <button type="button" className="entry" onClick={() => onEdit(expense)}>
        <span className="entry-emoji" aria-hidden="true">
          {emoji}
        </span>
        <span className="entry-text">
          <span className="entry-primary">{expense.note || expense.category}</span>
          {sub && <span className="entry-sub">{sub}</span>}
        </span>
        <span className="leader" aria-hidden="true" />
        <span className="entry-amount money">
          {formatMoney(expense.amount, expense.currency)}
        </span>
      </button>
    </li>
  )
}

function DaySection({
  group,
  labels,
  emojiFor,
  onEdit,
}: {
  group: DayGroup
  labels: Map<string, string>
  emojiFor: (category: string) => string
  onEdit: (e: Expense) => void
}) {
  return (
    <section className="day-group">
      <div className="day-head">
        <span>{dayLabel(group.date)}</span>
        <span className="day-total money">{formatTotals(group.totals)}</span>
      </div>
      <ul className="entries">
        {group.items.map((e) => (
          <EntryRow
            key={e.id}
            expense={e}
            emoji={emojiFor(e.category)}
            methodLabel={e.paymentMethodId ? labels.get(e.paymentMethodId) : undefined}
            onEdit={onEdit}
          />
        ))}
      </ul>
    </section>
  )
}

export function HistoryScreen({ jump }: { jump?: HistoryJump | null }) {
  const expenses = useLiveQuery(listExpenses)
  const methods = useLiveQuery(() => listPaymentMethods({ includeArchived: true }))
  const categories = useLiveQuery(() => listCategories({ includeArchived: true }))
  const [month, setMonth] = useState<string | null>(monthOf(todayISO()))
  const [selection, setSelection] = useState<MethodSelection>({ methodIds: [], groups: [] })
  const [catFilters, setCatFilters] = useState<string[]>([])
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Expense | null>(null)

  // A settings-row tap resets the whole view to that method/category: All
  // time, no search, nothing else filtered — the ledger slice for one thing.
  // App sends a fresh object per tap, so re-tapping the same row re-applies.
  useEffect(() => {
    if (!jump) return
    setMonth(null)
    setQuery('')
    setSelection({
      methodIds: jump.paymentMethodId ? [jump.paymentMethodId] : [],
      groups: [],
    })
    setCatFilters(jump.category ? [jump.category] : [])
    setFrom(null)
    setTo(null)
    setSheetOpen(false)
  }, [jump])

  const labels = useMemo(
    () => new Map((methods ?? []).map((m: PaymentMethod) => [m.id, m.label])),
    [methods],
  )
  const categoryEmojiByLabel = useMemo(
    () => new Map((categories ?? []).map((c: Category) => [c.label, c.emoji])),
    [categories],
  )
  // 🧾 covers labels with no category record (e.g. from an edited backup).
  const emojiFor = (category: string) =>
    categoryEmojiByLabel.get(category) ?? '🧾'

  // Archived cards stay filterable while old entries still point at them —
  // that is exactly the statement one still needs to reconcile.
  const referencedIds = useMemo(
    () => new Set((expenses ?? []).map((e) => e.paymentMethodId).filter(Boolean)),
    [expenses],
  )
  const filterChips = useMemo(
    () =>
      (methods ?? []).filter((m: PaymentMethod) => !m.archived || referencedIds.has(m.id)),
    [methods, referencedIds],
  )
  // The same rule for categories: archived ones stay filterable while entries
  // still carry their label.
  const referencedCategories = useMemo(
    () => new Set((expenses ?? []).map((e) => e.category)),
    [expenses],
  )
  const visibleCategories = useMemo(
    () =>
      (categories ?? []).filter(
        (c: Category) => !c.archived || referencedCategories.has(c.label),
      ),
    [categories, referencedCategories],
  )

  // A filtered-on method, group, or category can vanish (deleted, or archived
  // with its last referencing entry removed). Prune so nothing dangles as an
  // invisible active filter.
  if (expenses !== undefined && methods !== undefined) {
    const ids = selection.methodIds.filter((id) =>
      filterChips.some((m: PaymentMethod) => m.id === id),
    )
    const groups = selection.groups.filter((g) =>
      filterChips.some((m: PaymentMethod) => m.group === g),
    )
    if (ids.length !== selection.methodIds.length || groups.length !== selection.groups.length) {
      setSelection({ methodIds: ids, groups })
    }
  }
  if (expenses !== undefined && categories !== undefined) {
    const cats = catFilters.filter((l) =>
      visibleCategories.some((c: Category) => c.label === l),
    )
    if (cats.length !== catFilters.length) setCatFilters(cats)
  }

  // Whole-group picks resolve to member ids here, at render, so a method
  // added to a selected group later is included automatically.
  const effectiveMethodIds = useMemo(() => {
    const ids = new Set(selection.methodIds)
    for (const m of filterChips) if (selection.groups.includes(m.group)) ids.add(m.id)
    return [...ids]
  }, [selection, filterChips])

  const filtered = useMemo(
    () =>
      filterExpenses(expenses ?? [], {
        month,
        paymentMethodIds: effectiveMethodIds,
        categories: catFilters,
        from,
        to,
        query,
      }),
    [expenses, month, effectiveMethodIds, catFilters, from, to, query],
  )

  const totals = useMemo(() => {
    const out: MoneyByCurrency = {}
    for (const e of filtered) out[e.currency] = (out[e.currency] ?? 0) + e.amount
    return out
  }, [filtered])

  // ‹ › should reach any month that actually has data, even future-dated.
  const maxMonth = useMemo(() => {
    const current = monthOf(todayISO())
    const newest = expenses?.[0] ? monthOf(expenses[0].spentOn) : current
    return newest > current ? newest : current
  }, [expenses])

  const dayGroups = useMemo(
    () => (month === null ? [] : groupByDay(filtered)),
    [filtered, month],
  )
  const monthGroups = useMemo(
    () => (month === null ? groupByMonth(filtered) : []),
    [filtered, month],
  )

  // The pager and the date range both slice time — the last one touched wins,
  // so they never silently intersect to an empty list.
  function changeMonth(next: string | null) {
    setFrom(null)
    setTo(null)
    setMonth(next)
  }
  function applyRange(nextFrom: string | null, nextTo: string | null) {
    if (nextFrom && nextTo && nextFrom > nextTo) [nextFrom, nextTo] = [nextTo, nextFrom]
    setFrom(nextFrom)
    setTo(nextTo)
    if (nextFrom !== null || nextTo !== null) setMonth(null)
  }
  function clearFilters() {
    setSelection({ methodIds: [], groups: [] })
    setCatFilters([])
    setFrom(null)
    setTo(null)
  }

  if (expenses === undefined) return null // first IndexedDB read, avoid a flash

  const hasAnything = expenses.length > 0
  const hasMatches = filtered.length > 0
  const rangeActive = from !== null || to !== null
  const activeChipCount =
    selection.groups.length +
    selection.methodIds.length +
    catFilters.length +
    (rangeActive ? 1 : 0)
  const filtersActive = activeChipCount > 0 || query.trim() !== ''
  const rangeChipLabel =
    from && to
      ? `${shortDate(from)} – ${shortDate(to)}`
      : from
        ? `from ${shortDate(from)}`
        : to
          ? `until ${shortDate(to)}`
          : ''

  return (
    <div className="screen">
      <header className="screen-head">
        <p className="eyebrow">History</p>
        <h1 className="sr-only">History</h1>
      </header>

      <MonthPager month={month} onChange={changeMonth} allowAll maxMonth={maxMonth} />

      {hasAnything && (
        <>
          <div className="chip-row filter-row">
            <button
              type="button"
              className="chip"
              aria-pressed={activeChipCount > 0}
              aria-haspopup="dialog"
              onClick={() => setSheetOpen(true)}
            >
              Filters{activeChipCount > 0 ? ` · ${activeChipCount}` : ''}
              <span className="chip-caret" aria-hidden="true">
                ▾
              </span>
            </button>
          </div>

          {activeChipCount > 0 && (
            <div className="chip-row filter-row" role="group" aria-label="Active filters">
              {selection.groups.map((g) => (
                <button
                  key={`group-${g}`}
                  type="button"
                  className="chip"
                  aria-pressed="true"
                  aria-label={`Clear ${g} filter`}
                  onClick={() =>
                    setSelection({
                      methodIds: selection.methodIds,
                      groups: selection.groups.filter((x) => x !== g),
                    })
                  }
                >
                  <span aria-hidden="true">{groupEmoji(g)}</span> {g}
                  <span className="chip-caret" aria-hidden="true">
                    ✕
                  </span>
                </button>
              ))}
              {selection.methodIds.map((id) => {
                const m = (methods ?? []).find((x: PaymentMethod) => x.id === id)
                if (!m) return null
                return (
                  <button
                    key={id}
                    type="button"
                    className="chip"
                    aria-pressed="true"
                    aria-label={`Clear ${m.label} filter`}
                    onClick={() =>
                      setSelection({
                        groups: selection.groups,
                        methodIds: selection.methodIds.filter((x) => x !== id),
                      })
                    }
                  >
                    <span aria-hidden="true">{groupEmoji(m.group)}</span> {m.label}
                    <span className="chip-caret" aria-hidden="true">
                      ✕
                    </span>
                  </button>
                )
              })}
              {catFilters.map((label) => (
                <button
                  key={`cat-${label}`}
                  type="button"
                  className="chip"
                  aria-pressed="true"
                  aria-label={`Clear ${label} filter`}
                  onClick={() => setCatFilters(catFilters.filter((l) => l !== label))}
                >
                  <span aria-hidden="true">{emojiFor(label)}</span> {label}
                  <span className="chip-caret" aria-hidden="true">
                    ✕
                  </span>
                </button>
              ))}
              {rangeActive && (
                <button
                  type="button"
                  className="chip"
                  aria-pressed="true"
                  aria-label="Clear date range filter"
                  onClick={() => applyRange(null, null)}
                >
                  <span aria-hidden="true">📅</span> {rangeChipLabel}
                  <span className="chip-caret" aria-hidden="true">
                    ✕
                  </span>
                </button>
              )}
              {activeChipCount >= 2 && (
                <button type="button" className="btn-text" onClick={clearFilters}>
                  Clear all
                </button>
              )}
            </div>
          )}

          <div className="search-field">
            <span aria-hidden="true">🔎</span>
            <input
              type="search"
              placeholder="Search notes, categories, amounts…"
              aria-label="Search entries"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query !== '' && (
              <button
                type="button"
                className="btn-text"
                aria-label="Clear search"
                onClick={() => setQuery('')}
              >
                ✕
              </button>
            )}
          </div>
        </>
      )}

      {!hasAnything ? (
        <div className="empty">
          <p className="empty-mark display" aria-hidden="true">
            ₹
          </p>
          <p className="empty-title">The ledger is empty</p>
          <p className="empty-sub">Log your first expense from the Add tab.</p>
        </div>
      ) : !hasMatches ? (
        <div className="empty">
          <p className="empty-mark display" aria-hidden="true">
            ∅
          </p>
          <p className="empty-title">Nothing here</p>
          <p className="empty-sub">
            {filtersActive
              ? 'No entries match these filters.'
              : month
                ? `Nothing logged in ${monthLabel(month)}.`
                : 'Nothing logged yet.'}
          </p>
          {filtersActive && (
            <button
              type="button"
              className="btn-text clear-filters"
              onClick={() => {
                clearFilters()
                setQuery('')
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : month === null ? (
        monthGroups.map((g) => (
          <section key={g.month} className="month-group">
            <div className="month-head">
              <span className="display">{monthLabel(g.month)}</span>
              <span className="money">{formatTotals(g.totals)}</span>
            </div>
            {g.days.map((d) => (
              <DaySection
                key={d.date}
                group={d}
                labels={labels}
                emojiFor={emojiFor}
                onEdit={setEditing}
              />
            ))}
          </section>
        ))
      ) : (
        dayGroups.map((d) => (
          <DaySection
            key={d.date}
            group={d}
            labels={labels}
            emojiFor={emojiFor}
            onEdit={setEditing}
          />
        ))
      )}

      {hasMatches && (
        <p className="record-count">
          {filtered.length === 1 ? '1 entry' : `${filtered.length} entries`} ·{' '}
          {formatTotals(totals)}
        </p>
      )}

      <FilterSheet
        open={sheetOpen}
        methods={filterChips}
        categories={visibleCategories}
        selection={selection}
        onSelectionChange={setSelection}
        catFilters={catFilters}
        onCatFiltersChange={setCatFilters}
        from={from}
        to={to}
        onRangeChange={applyRange}
        onClearAll={clearFilters}
        onClose={() => setSheetOpen(false)}
      />
      <EditSheet expense={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
```

- [ ] **Step 2: Run all three gates**

Run: `npm test && npm run lint && npm run build`
Expected: all green — vitest suite passes (188 + new − rewritten ≈ 195+), oxlint clean, `tsc -b` + vite build succeed with zero unused-import complaints.

- [ ] **Step 3: Leave uncommitted**

---

### Task 5: Browser verification (both themes, real dataset)

**Files:** none (dev-server walkthrough; the preview db already holds the full imported dataset).

- [ ] **Step 1: Start/reuse the dev server** (launch config `expense-tracker`, viewport ≈375×812) and open History.
- [ ] **Step 2: Sheet basics** — tap `Filters ▾`: sheet opens with Paid with (buckets: Cash, UPI, Credit card, Debit card, Wallet), the category grid, Between fields, disabled Clear-all ghost.
- [ ] **Step 3: Group shortcut** — tap the multi-card `💳 Credit card` group header: all its member chips read pressed; behind the sheet the list narrows; active row shows ONE chip `💳 Credit card ✕`; trigger reads `Filters · 1`.
- [ ] **Step 4: Demote** — with Credit card selected, tap one member (any card): the group chip unpresses, the other members stay pressed individually; active row now shows the remaining method chips + `Clear all`.
- [ ] **Step 5: Absorb** — clear all; select two CC members individually, then tap the group header: active row collapses to the single group chip.
- [ ] **Step 6: Categories + compose** — select `🧳 Travel` and `🤝 Family & gifts` with Credit card active: record count reflects (CC) ∧ (Travel ∪ Family & gifts).
- [ ] **Step 7: Date range** — set Start 2024-10-25 / End 2024-11-05: pager flips to All time, `📅 25 Oct 2024 – 5 Nov 2024` chip appears; enter inverted dates and confirm the silent swap; clear one bound → `from …` open-ended label.
- [ ] **Step 8: Exclusivity** — with a range active, page to a month: range chip disappears; set a range again: pager returns to All time.
- [ ] **Step 9: Jump** — Settings → tap a method row: History shows exactly that one method chip, sheet closed, month = All time. Same for a category row.
- [ ] **Step 10: Dismissal + empty state** — ✕ chips one by one (list widens each time); build an impossible combo (e.g. Cash ∧ Travel ∧ 2023 week) and confirm the ∅ empty state's `Clear filters` resets chips **and** query but not month.
- [ ] **Step 11: Both themes** — repeat a composed-filter screenshot in light AND dark (`prefers-color-scheme`), checking chip contrast, sheet, date fields.
- [ ] **Step 12: Console/logs clean** — no errors in browser console or vite logs.

# Settings Tree + Tap-to-Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapsible group tree for methods/categories in the settings drawer; tapping a row opens History pre-filtered to it.

**Architecture:** Pure helpers first (`bucketize` shared from lib/paymentMeta, `category` in lib/history's filter), then HistoryScreen grows a category filter + a `jump` prop applied by effect, then SettingsDrawer renders the tree and App wires the jump event. No router, no schema change, nothing persisted.

**Tech Stack:** Existing only — React 19, Dexie live queries, vitest. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-14-settings-tree-design.md`
- 2-space indent, single quotes, no semicolons, trailing commas; comments say *why*.
- Screens have no unit tests — logic lands in `src/lib/` with tests; UI is verified in the dev server at 375px in **both themes**.
- Existing CSS tokens only (`--ink*`, `--line`, `--chip`, `--paper*`); no new hues, so no new WCAG pairs.
- 44px touch targets (halo pattern from `.icon-btn` where painted size is smaller).
- No commits inside tasks: this session leaves one reviewed working tree; the owner commits.

---

### Task 1: Share `bucketize` from lib/paymentMeta

**Files:**
- Modify: `src/lib/paymentMeta.ts`
- Create: `src/lib/paymentMeta.test.ts`
- Modify: `src/components/PaymentPicker.tsx` (delete local copy, import shared)

**Interfaces:**
- Produces: `export interface GroupBucket { group: string; members: PaymentMethod[] }`, `export function bucketize(methods: PaymentMethod[]): GroupBucket[]` — input must already be group-rank sorted (as `listPaymentMethods` returns).

- [ ] **Step 1: Write failing tests** in `src/lib/paymentMeta.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PaymentMethod } from '../db'
import { bucketize, groupEmoji } from './paymentMeta'

const pm = (id: string, group: string): PaymentMethod => ({
  id,
  label: id,
  group,
  createdAt: '2026-07-01T00:00:00.000Z',
})

describe('bucketize', () => {
  it('groups contiguous methods and keeps the incoming group order', () => {
    const buckets = bucketize([pm('cash', 'Cash'), pm('gpay', 'UPI'), pm('sbi', 'UPI')])
    expect(buckets.map((b) => b.group)).toEqual(['Cash', 'UPI'])
    expect(buckets[1].members.map((m) => m.id)).toEqual(['gpay', 'sbi'])
  })

  it('returns one single-member bucket per lone method', () => {
    const buckets = bucketize([pm('cash', 'Cash')])
    expect(buckets).toEqual([{ group: 'Cash', members: [pm('cash', 'Cash')] }])
  })

  it('returns no buckets for no methods', () => {
    expect(bucketize([])).toEqual([])
  })
})

describe('groupEmoji', () => {
  it('falls back to the generic mark for custom groups', () => {
    expect(groupEmoji('Wallet')).toBe('👛')
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/paymentMeta.test.ts` — expect FAIL (`bucketize` not exported).
- [ ] **Step 3: Move the implementation** — cut `GroupBucket`/`bucketize` from PaymentPicker verbatim into paymentMeta.ts (below `groupEmoji`), exported, with its "methods arrive group-rank sorted" comment; PaymentPicker imports them instead.
- [ ] **Step 4: Run** `npx vitest run src/lib/paymentMeta.test.ts` then `npm test` — all green.

### Task 2: Category filter in lib/history

**Files:**
- Modify: `src/lib/history.ts`
- Modify: `src/lib/history.test.ts`

**Interfaces:**
- Produces: `HistoryFilter` gains `category?: string | null` (exact label match); `export interface HistoryJump { paymentMethodId?: string; category?: string }`.

- [ ] **Step 1: Write failing tests** (append to the `filterExpenses` describe in history.test.ts):

```ts
it('filters by exact category label', () => {
  const food = exp({ category: 'Food' })
  const foodCourt = exp({ category: 'Food court' })
  expect(filterExpenses([food, foodCourt], { category: 'Food' })).toEqual([food])
})

it('composes category with method, month, and query', () => {
  const hit = exp({ spentOn: '2026-07-12', category: 'Food', paymentMethodId: CASH_METHOD_ID, note: 'chai' })
  const wrongCategory = exp({ spentOn: '2026-07-12', category: 'Rent', paymentMethodId: CASH_METHOD_ID, note: 'chai' })
  expect(
    filterExpenses([hit, wrongCategory], {
      month: '2026-07',
      paymentMethodId: CASH_METHOD_ID,
      category: 'Food',
      query: 'chai',
    }),
  ).toEqual([hit])
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/history.test.ts` — expect FAIL (category ignored → both records returned).
- [ ] **Step 3: Implement** — in `HistoryFilter` add `category?: string | null`; in `filterExpenses` add `if (f.category && e.category !== f.category) return false` beside the method check. Add:

```ts
// A settings-row tap: App hands this to HistoryScreen, which resets its view
// to show everything for the tapped method or category.
export interface HistoryJump {
  paymentMethodId?: string
  category?: string
}
```

- [ ] **Step 4: Run** `npm test` — green.

### Task 3: HistoryScreen — category chip + jump prop

**Files:**
- Modify: `src/screens/HistoryScreen.tsx`

**Interfaces:**
- Consumes: `HistoryJump` from `../lib/history`.
- Produces: `export function HistoryScreen({ jump }: { jump?: HistoryJump | null })`.

- [ ] **Step 1: Implement** — add `categoryFilter` state; apply `jump` in an effect (object identity re-triggers):

```tsx
const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

// A settings-row tap resets the whole view to that method/category: All
// time, no search, nothing else filtered — the ledger slice for one thing.
useEffect(() => {
  if (!jump) return
  setMonth(null)
  setQuery('')
  setMethodFilter(jump.paymentMethodId ?? null)
  setCategoryFilter(jump.category ?? null)
}, [jump])
```

Feed it through: `filterExpenses(expenses ?? [], { month, paymentMethodId: methodFilter, category: categoryFilter, query })`; include `categoryFilter !== null` in `filtersActive`; clear it in the empty-state "Clear filters" button. Render a dismissible chip between the method filter row and the search field:

```tsx
{categoryFilter !== null && (
  <div className="chip-row filter-row" role="group" aria-label="Category filter">
    <button
      type="button"
      className="chip"
      aria-pressed="true"
      aria-label={`Clear ${categoryFilter} filter`}
      onClick={() => setCategoryFilter(null)}
    >
      <span aria-hidden="true">{emojiFor(categoryFilter)}</span> {categoryFilter}
      <span className="chip-x" aria-hidden="true">✕</span>
    </button>
  </div>
)}
```

- [ ] **Step 2: Gates** `npm test && npm run lint && npx tsc -b` — App doesn't pass `jump` yet; prop is optional so everything stays green.

### Task 4: SettingsDrawer — collapsible tree + row taps

**Files:**
- Modify: `src/components/SettingsDrawer.tsx`

**Interfaces:**
- Consumes: `bucketize` (Task 1), `HistoryJump` (Task 2).
- Produces: `SettingsDrawer`/`DrawerBody` props gain `onJumpToHistory: (jump: HistoryJump) => void`.

- [ ] **Step 1: Implement** — state + buckets in DrawerBody (fresh per open, so collapsed by default):

```tsx
const methodBuckets = useMemo(() => bucketize(methods ?? []), [methods])
const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set())
const [categoriesOpen, setCategoriesOpen] = useState(false)

function toggleGroup(group: string) {
  setOpenGroups((prev) => {
    const next = new Set(prev)
    if (next.has(group)) next.delete(group)
    else next.add(group)
    return next
  })
}
```

Methods section: one `.group-toggle` button per bucket (`aria-expanded`, emoji, label, `.group-count`, `.group-caret` ▸/▾), members list rendered only when open. Row layout changes from `<span className="method-text">` to a tap button, actions unchanged:

```tsx
<button
  type="button"
  className="method-view"
  aria-label={`View ${m.label} in History`}
  onClick={() => onJumpToHistory({ paymentMethodId: m.id })}
>
  <span className="method-label">{m.label}</span>
  {sub && <span className="method-sub">{sub}</span>}
</button>
```

(Method rows drop the per-row group emoji — the group header already carries it; category rows keep their emoji and jump with `{ category: c.label }`.)

Categories section: the `drawer-title` h3 wraps a `.section-toggle` button (`Categories`, count, caret) controlling `categoriesOpen`. Both "Add …" buttons stay outside the collapsed regions. `AddMethodSheet onCreated` expands the new method's group (`setOpenGroups` add `m.group`); `AddCategorySheet onCreated` sets `categoriesOpen(true)` — a row born hidden looks like a failed add.

- [ ] **Step 2: Gates** `npm test && npm run lint && npx tsc -b` — App call site still compiles only if the new prop is threaded there in the same change set as Task 5; if running tasks separately, give `onJumpToHistory` a temporary default of `() => {}` and remove it in Task 5.

### Task 5: App wiring

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `HistoryJump`; `HistoryScreen jump` prop; `SettingsDrawer onJumpToHistory` prop.

- [ ] **Step 1: Implement**:

```tsx
const [historyJump, setHistoryJump] = useState<HistoryJump | null>(null)

// Fresh object per tap so an identical re-tap still re-triggers History's
// effect (identity is the event).
function jumpToHistory(jump: HistoryJump) {
  setHistoryJump({ ...jump })
  setTab('history')
  setSettingsOpen(false)
}
```

`<HistoryScreen jump={historyJump} />`, `<SettingsDrawer … onJumpToHistory={jumpToHistory} />`; remove any Task-4 default.

- [ ] **Step 2: Gates** `npm test && npm run lint && npm run build`.

### Task 6: CSS + full verification

**Files:**
- Modify: `src/index.css` (drawer section, ~line 1269+)

- [ ] **Step 1: Styles** — tokens only, 44px targets:

```css
.group-toggle,
.section-toggle {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  font-size: 15px;
  text-align: left;
}

.group-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}

.group-caret {
  color: var(--ink-3);
  font-size: 11px;
}

/* Members sit inside their group: indent + lighter separators. */
.group-members {
  padding-left: 12px;
}

.method-view {
  flex: 1;
  display: grid;
  gap: 1px;
  min-width: 0;
  padding: 0;
  background: none;
  border: 0;
  color: inherit;
  text-align: left;
  font: inherit;
}

.chip-x {
  margin-left: 6px;
  color: var(--ink-3);
}
```

(`.section-toggle` inside the h3 inherits the drawer-title type scale — override size/spacing inline in that rule if the uppercase 11px reads wrong; verify visually.)

- [ ] **Step 2: Browser verification at 375px, both themes** — expand/collapse every group; add a method while its group is collapsed (must auto-expand); tap a method row → History tab, All time, only its entries; tap a category row → dismissible chip + only its entries; ✕ restores; Clear filters in empty state clears category; archived-referenced method row still jumps and filters.
- [ ] **Step 3: Full gates** `npm test && npm run lint && npm run build`.

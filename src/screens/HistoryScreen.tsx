import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { EditSheet } from '../components/EditSheet'
import { FilterSheet } from '../components/FilterSheet'
import { Pager } from '../components/Pager'
import { SortSheet } from '../components/SortSheet'
import {
  listCategories,
  listExpenses,
  listPaymentMethods,
  type Category,
  type Expense,
  type PaymentMethod,
} from '../db'
import { addMonths, monthLabel, monthOf, todayISO, yesterdayISO } from '../lib/dates'
import {
  filterExpenses,
  formatTotals,
  groupByDay,
  groupByMonth,
  isGroupedSort,
  sortExpenses,
  type DayGroup,
  type HistoryJump,
  type HistorySort,
  type MoneyByCurrency,
} from '../lib/history'
import { formatMoney } from '../lib/money'
import { groupEmoji, type MethodSelection } from '../lib/paymentMeta'
import { getPref, PREFS, setPref } from '../lib/prefs'

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

const SORTS: HistorySort[] = ['newest', 'oldest', 'largest', 'smallest']
const SORT_WORD: Record<HistorySort, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  largest: 'Largest',
  smallest: 'Smallest',
}
function readSort(): HistorySort {
  const v = getPref(PREFS.historySort, 'newest')
  return SORTS.includes(v as HistorySort) ? (v as HistorySort) : 'newest'
}

function EntryRow({
  expense,
  emoji,
  methodLabel,
  date,
  onEdit,
}: {
  expense: Expense
  emoji: string
  methodLabel?: string
  date?: string
  onEdit: (e: Expense) => void
}) {
  const sub = [date, expense.note ? expense.category : null, methodLabel]
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
  const [sort, setSortState] = useState<HistorySort>(readSort)
  const [sortOpen, setSortOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Expense | null>(null)

  // A settings-row tap resets the whole view to that method/category: All
  // time, no search, nothing else filtered — the ledger slice for one thing.
  // App sends a fresh object per tap, so re-tapping the same row re-applies.
  useEffect(() => {
    if (!jump) return
    // month and from/to arrive mutually exclusive (a Summary drill sends one or
    // the other; a settings tap sends neither → All time), so setting all three
    // preserves the pager-XOR-range invariant.
    setMonth(jump.month ?? null)
    setQuery('')
    setSelection({
      methodIds: jump.paymentMethodId ? [jump.paymentMethodId] : [],
      groups: [],
    })
    setCatFilters(jump.category ? [jump.category] : [])
    setFrom(jump.from ?? null)
    setTo(jump.to ?? null)
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

  const grouped = isGroupedSort(sort)
  const sorted = useMemo(() => sortExpenses(filtered, sort), [filtered, sort])
  const dayGroups = useMemo(
    () => (month === null || !grouped ? [] : groupByDay(sorted)),
    [sorted, month, grouped],
  )
  const monthGroups = useMemo(
    () => (month === null && grouped ? groupByMonth(sorted) : []),
    [sorted, month, grouped],
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
  function changeSort(next: HistorySort) {
    setSortState(next)
    setPref(PREFS.historySort, next)
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
      ? from === to
        ? shortDate(from) // a single-day slice (e.g. a Summary biggest/busiest drill)
        : `${shortDate(from)} – ${shortDate(to)}`
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

      <Pager
        label={month === null ? 'All time' : monthLabel(month)}
        hint={month === null ? 'tap for monthly' : 'tap for all time'}
        labelAriaLabel={
          month === null
            ? 'Showing all time — switch to one month'
            : `Showing ${monthLabel(month)} — switch to all time`
        }
        onLabelClick={() => changeMonth(month === null ? monthOf(todayISO()) : null)}
        onPrev={() => month && changeMonth(addMonths(month, -1))}
        onNext={() => month && changeMonth(addMonths(month, 1))}
        prevDisabled={month === null}
        nextDisabled={month === null || month >= maxMonth}
      />

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
            <button
              type="button"
              className="chip"
              aria-haspopup="dialog"
              aria-label={`Sort: ${SORT_WORD[sort]} first — change`}
              onClick={() => setSortOpen(true)}
            >
              Sort · {SORT_WORD[sort]}
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
      ) : !grouped ? (
        <ul className="entries">
          {sorted.map((e) => (
            <EntryRow
              key={e.id}
              expense={e}
              emoji={emojiFor(e.category)}
              methodLabel={e.paymentMethodId ? labels.get(e.paymentMethodId) : undefined}
              date={shortDate(e.spentOn)}
              onEdit={setEditing}
            />
          ))}
        </ul>
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
      <SortSheet
        open={sortOpen}
        sort={sort}
        onSortChange={changeSort}
        onClose={() => setSortOpen(false)}
      />
      <EditSheet expense={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EditSheet } from '../components/EditSheet'
import { EntryRow } from '../components/EntryRow'
import { FilterSheet } from '../components/FilterSheet'
import { CloseIcon, FilterIcon, SearchIcon, SortIcon } from '../components/icons'
import { PeriodPager } from '../components/PeriodPager'
import { SortSheet } from '../components/SortSheet'
import { Toast } from '../components/Toast'
import {
  listCategories,
  listExpenses,
  listPaymentMethods,
  restoreExpense,
  type Category,
  type Expense,
  type PaymentMethod,
} from '../db'
import { budgetHeadsUp, type Budgets } from '../lib/budget'
import { checkBudgetAfterSave, type BudgetAlert } from '../lib/budgetCheck'
import { monthLabel, monthOf, todayISO, yesterdayISO } from '../lib/dates'
import { tapFeedback } from '../lib/haptics'
import {
  filterExpenses,
  formatTotals,
  groupByDay,
  groupByMonth,
  historyCountLine,
  isGroupedSort,
  sortExpenses,
  spansMonths,
  type DayGroup,
  type HistoryJump,
  type HistorySort,
  type MoneyByCurrency,
} from '../lib/history'
import { formatMoney } from '../lib/money'
import { groupEmoji, type MethodSelection } from '../lib/paymentMeta'
import { emptyPeriodPhrase, periodBounds, type Period } from '../lib/period'
import { getPref, PREFS, setPref } from '../lib/prefs'
import { useToast } from '../lib/useToast'

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
function readSort(): HistorySort {
  const v = getPref(PREFS.historySort, 'newest')
  return SORTS.includes(v as HistorySort) ? (v as HistorySort) : 'newest'
}

function LedgerRow({
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
    <EntryRow
      emoji={emoji}
      primary={expense.note || expense.category}
      sub={sub}
      amount={formatMoney(expense.amount, expense.currency)}
      onClick={() => onEdit(expense)}
    />
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
          <LedgerRow
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

interface Props {
  jump?: HistoryJump | null
  budgets: Budgets
  /** An edit took the month past its budget. Edits pass no undo. */
  onBudgetAlert: (alert: BudgetAlert, undo?: () => void) => void
  defaultCurrency: string
}

export function HistoryScreen({ jump, budgets, onBudgetAlert, defaultCurrency }: Props) {
  const expenses = useLiveQuery(listExpenses)
  const methods = useLiveQuery(() => listPaymentMethods({ includeArchived: true }))
  const categories = useLiveQuery(() => listCategories({ includeArchived: true }))
  const [period, setPeriod] = useState<Period>(() => ({
    kind: 'month',
    month: monthOf(todayISO()),
  }))
  const [selection, setSelection] = useState<MethodSelection>({ methodIds: [], groups: [] })
  const [catFilters, setCatFilters] = useState<string[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sort, setSortState] = useState<HistorySort>(readSort)
  const [sortOpen, setSortOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<Expense | null>(null)
  const { toast, show } = useToast()

  // A jump resets the whole view to its slice: the jump's period (absent = All
  // time), no search, nothing else filtered — the ledger slice for one thing.
  // App sends a fresh object per tap, so re-tapping the same row re-applies.
  useEffect(() => {
    if (!jump) return
    setPeriod(jump.period ?? { kind: 'all' })
    setQuery('')
    setSearchOpen(false)
    setSelection({
      methodIds: jump.paymentMethodId ? [jump.paymentMethodId] : [],
      groups: [],
    })
    setCatFilters(jump.category ? [jump.category] : [])
    setSheetOpen(false)
    setSortOpen(false)
  }, [jump])

  // Focus only when the user tapped the search icon: a jump that sets a query
  // must not raise the keyboard.
  const focusSearch = useRef(false)
  useEffect(() => {
    if (searchOpen && focusSearch.current) searchRef.current?.focus()
    focusSearch.current = false
  }, [searchOpen])

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

  const bounds = useMemo(() => periodBounds(period), [period])
  const filtered = useMemo(
    () =>
      filterExpenses(expenses ?? [], {
        paymentMethodIds: effectiveMethodIds,
        categories: catFilters,
        from: bounds?.from,
        to: bounds?.to,
        query,
      }),
    [expenses, bounds, effectiveMethodIds, catFilters, query],
  )

  const totals = useMemo(() => {
    const out: MoneyByCurrency = {}
    for (const e of filtered) out[e.currency] = (out[e.currency] ?? 0) + e.amount
    return out
  }, [filtered])

  // ‹ › should reach any period that actually has data, even future-dated.
  const today = todayISO()
  const maxAnchor = expenses?.[0] && expenses[0].spentOn > today ? expenses[0].spentOn : today
  const containsToday = bounds !== null && today >= bounds.from && today <= bounds.to

  const grouped = isGroupedSort(sort)
  const sorted = useMemo(() => sortExpenses(filtered, sort), [filtered, sort])
  const byMonth = spansMonths(bounds)
  const dayGroups = useMemo(
    () => (byMonth || !grouped ? [] : groupByDay(sorted)),
    [sorted, byMonth, grouped],
  )
  const monthGroups = useMemo(
    () => (byMonth && grouped ? groupByMonth(sorted) : []),
    [sorted, byMonth, grouped],
  )

  function changeSort(next: HistorySort) {
    setSortState(next)
    setPref(PREFS.historySort, next)
  }
  function clearFilters() {
    setSelection({ methodIds: [], groups: [] })
    setCatFilters([])
  }

  // Mirrors the Add screen's added-toast, in reverse. The record is held in the
  // closure for the life of the toast, so the undo needs no database read.
  function handleDeleted(expense: Expense) {
    setEditing(null)
    show({
      message: `${emojiFor(expense.category)} ${formatMoney(expense.amount, expense.currency)} deleted`,
      onUndo: async () => {
        try {
          await restoreExpense(expense)
        } catch {
          show({ message: 'Could not restore that entry' }, 2000)
          return
        }
        void tapFeedback() // an entry landing in the ledger, same as a save
        show({ message: 'Entry restored' }, 2000)
      },
    })
  }

  // An edit can raise an old entry, or move one into this month, past a mark.
  // Restoring a deleted entry is deliberately not checked: it puts back
  // spending the month had already counted.
  async function handleSaved(before: Expense, after: Expense) {
    const alert = await checkBudgetAfterSave(after, before, budgets, todayISO())
    if (alert?.kind === 'near') show({ message: budgetHeadsUp(alert) })
    if (alert?.kind === 'over') onBudgetAlert(alert)
  }

  if (expenses === undefined) return null // first IndexedDB read, avoid a flash

  const hasAnything = expenses.length > 0
  const hasMatches = filtered.length > 0
  const activeChipCount =
    selection.groups.length + selection.methodIds.length + catFilters.length
  const searchShown = searchOpen || query !== ''
  const filtersActive = activeChipCount > 0 || query.trim() !== ''

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="head-text">
          <p className="eyebrow">History</p>
          <h1 className="sr-only">History</h1>
        </div>
        {hasAnything && (
          <div className="head-actions">
            <button
              type="button"
              className="head-btn"
              aria-label="Search"
              aria-expanded={searchShown}
              onClick={() => {
                if (searchShown && query === '') {
                  setSearchOpen(false)
                } else {
                  focusSearch.current = true
                  setSearchOpen(true)
                }
              }}
            >
              <SearchIcon />
            </button>
            <button
              type="button"
              className="head-btn"
              aria-label={activeChipCount > 0 ? `Filters, ${activeChipCount} active` : 'Filters'}
              aria-pressed={activeChipCount > 0}
              aria-haspopup="dialog"
              onClick={() => setSheetOpen(true)}
            >
              <FilterIcon />
              {activeChipCount > 0 && (
                <span className="head-btn-count money" aria-hidden="true">
                  {activeChipCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className="head-btn"
              aria-haspopup="dialog"
              aria-label={`Sort: ${sort} first`}
              onClick={() => setSortOpen(true)}
            >
              <SortIcon />
            </button>
          </div>
        )}
      </header>

      <PeriodPager
        period={period}
        onChange={setPeriod}
        today={today}
        maxAnchor={maxAnchor}
        currency={defaultCurrency}
      />

      {hasMatches && (
        <p className="history-line">
          <span className="history-count">{historyCountLine(filtered.length, sort)}</span>
          <span className="money">{formatTotals(totals)}</span>
        </p>
      )}

      {searchShown && (
        <div className="search-field">
          <SearchIcon size={18} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search notes, categories, amounts…"
            aria-label="Search entries"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="btn-text btn-text-icon"
            aria-label="Clear search"
            onClick={() => {
              setQuery('')
              setSearchOpen(false)
            }}
          >
            <CloseIcon size={18} />
          </button>
        </div>
      )}

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
                <CloseIcon size={14} />
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
                  <CloseIcon size={14} />
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
                <CloseIcon size={14} />
              </span>
            </button>
          ))}
          {activeChipCount >= 2 && (
            <button type="button" className="btn-text" onClick={clearFilters}>
              Clear all
            </button>
          )}
        </div>
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
              : `Nothing logged ${emptyPeriodPhrase(period, containsToday)}.`}
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
            <LedgerRow
              key={e.id}
              expense={e}
              emoji={emojiFor(e.category)}
              methodLabel={e.paymentMethodId ? labels.get(e.paymentMethodId) : undefined}
              date={shortDate(e.spentOn)}
              onEdit={setEditing}
            />
          ))}
        </ul>
      ) : byMonth ? (
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
      ) : period.kind === 'day' ? (
        <ul className="entries">
          {sorted.map((e) => (
            <LedgerRow
              key={e.id}
              expense={e}
              emoji={emojiFor(e.category)}
              methodLabel={e.paymentMethodId ? labels.get(e.paymentMethodId) : undefined}
              onEdit={setEditing}
            />
          ))}
        </ul>
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

      <FilterSheet
        open={sheetOpen}
        methods={filterChips}
        categories={visibleCategories}
        selection={selection}
        onSelectionChange={setSelection}
        catFilters={catFilters}
        onCatFiltersChange={setCatFilters}
        onClearAll={clearFilters}
        onClose={() => setSheetOpen(false)}
      />
      <SortSheet
        open={sortOpen}
        sort={sort}
        onSortChange={changeSort}
        onClose={() => setSortOpen(false)}
      />
      <EditSheet
        expense={editing}
        onClose={() => setEditing(null)}
        onDeleted={handleDeleted}
        onSaved={(before, after) => void handleSaved(before, after)}
      />
      <Toast state={toast} />
    </div>
  )
}

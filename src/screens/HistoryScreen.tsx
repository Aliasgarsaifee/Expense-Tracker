import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { EditSheet } from '../components/EditSheet'
import { MonthPager } from '../components/MonthPager'
import {
  listCategories,
  listExpenses,
  listPaymentMethods,
  type Category,
  type Expense,
  type PaymentMethod,
} from '../db'
import { categoryEmoji } from '../lib/categoryMeta'
import { monthLabel, monthOf, todayISO } from '../lib/dates'
import {
  filterExpenses,
  formatTotals,
  groupByDay,
  groupByMonth,
  type DayGroup,
  type MoneyByCurrency,
} from '../lib/history'
import { formatMoney } from '../lib/money'
import { groupEmoji } from '../lib/paymentMeta'

function dayLabel(iso: string): string {
  const today = todayISO()
  if (iso === today) return 'Today'
  const d = new Date(iso + 'T00:00:00')
  const sameYear = iso.slice(0, 4) === today.slice(0, 4)
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
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

export function HistoryScreen() {
  const expenses = useLiveQuery(listExpenses)
  const methods = useLiveQuery(() => listPaymentMethods({ includeArchived: true }))
  const categories = useLiveQuery(() => listCategories({ includeArchived: true }))
  const [month, setMonth] = useState<string | null>(monthOf(todayISO()))
  const [methodFilter, setMethodFilter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Expense | null>(null)

  const labels = useMemo(
    () => new Map((methods ?? []).map((m: PaymentMethod) => [m.id, m.label])),
    [methods],
  )
  const categoryEmojiByLabel = useMemo(
    () => new Map((categories ?? []).map((c: Category) => [c.label, c.emoji])),
    [categories],
  )
  const emojiFor = (category: string) =>
    categoryEmojiByLabel.get(category) ?? categoryEmoji(category)

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

  // A filtered-on method can vanish from the chip row (deleted, or an
  // archived method whose last referencing entry was removed). Drop the
  // filter so it can't dangle as an invisible active filter.
  if (
    expenses !== undefined &&
    methods !== undefined &&
    methodFilter !== null &&
    !filterChips.some((m: PaymentMethod) => m.id === methodFilter)
  ) {
    setMethodFilter(null)
  }

  const filtered = useMemo(
    () =>
      filterExpenses(expenses ?? [], {
        month,
        paymentMethodId: methodFilter,
        query,
      }),
    [expenses, month, methodFilter, query],
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

  if (expenses === undefined) return null // first IndexedDB read, avoid a flash

  const hasAnything = expenses.length > 0
  const hasMatches = filtered.length > 0
  const filtersActive = methodFilter !== null || query.trim() !== ''

  return (
    <div className="screen">
      <header className="screen-head">
        <p className="eyebrow">History</p>
        <h1 className="sr-only">History</h1>
      </header>

      <MonthPager month={month} onChange={setMonth} allowAll maxMonth={maxMonth} />

      {hasAnything && (
        <>
          <div className="chip-row filter-row" role="group" aria-label="Payment method filter">
            <button
              type="button"
              className="chip"
              aria-pressed={methodFilter === null}
              onClick={() => setMethodFilter(null)}
            >
              All
            </button>
            {filterChips.map((m: PaymentMethod) => (
              <button
                key={m.id}
                type="button"
                className="chip"
                aria-pressed={methodFilter === m.id}
                onClick={() => setMethodFilter(methodFilter === m.id ? null : m.id)}
              >
                <span aria-hidden="true">{groupEmoji(m.group)}</span> {m.label}
              </button>
            ))}
          </div>

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
                setMethodFilter(null)
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

      <EditSheet expense={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

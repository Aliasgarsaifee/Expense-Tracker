import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { CategoryChart } from '../components/CategoryChart'
import { MonthPager } from '../components/MonthPager'
import { db, listExpensesForMonth, listPaymentMethods, type PaymentMethod } from '../db'
import { currencySymbol } from '../lib/currencies'
import { addMonths, monthLabel, monthOf, todayISO } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { groupEmoji } from '../lib/paymentMeta'
import {
  biggestExpense,
  busiestDay,
  dailyAverage,
  splitByCurrency,
  summarize,
} from '../lib/summarize'

function shortDay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })
}

export function SummaryScreen() {
  const currentMonth = monthOf(todayISO())
  const [month, setMonth] = useState(currentMonth)
  const [chosenCurrency, setChosenCurrency] = useState('INR')

  const expenses = useLiveQuery(() => listExpensesForMonth(month), [month])
  const prevExpenses = useLiveQuery(
    () => listExpensesForMonth(addMonths(month, -1)),
    [month],
  )
  const methods = useLiveQuery(() => listPaymentMethods({ includeArchived: true }))
  // ‹ › should reach any month that actually has data, even future-dated —
  // otherwise a fat-fingered date is visible in History but unreachable here.
  const newest = useLiveQuery(() => db.expenses.orderBy('spentOn').last())
  const maxMonth = useMemo(() => {
    const newestMonth = newest ? monthOf(newest.spentOn) : currentMonth
    return newestMonth > currentMonth ? newestMonth : currentMonth
  }, [newest, currentMonth])

  const buckets = useMemo(() => splitByCurrency(expenses ?? []), [expenses])
  // Follow the data: if the picked currency vanished with a month switch,
  // fall back to the month's main bucket rather than a blank screen.
  const currency =
    buckets.find((b) => b.currency === chosenCurrency)?.currency ??
    buckets[0]?.currency ??
    'INR'

  const bucket = buckets.find((b) => b.currency === currency)
  const summary = useMemo(() => summarize(bucket?.expenses ?? []), [bucket])
  const prevTotal = useMemo(() => {
    const prev = splitByCurrency(prevExpenses ?? []).find(
      (b) => b.currency === currency,
    )
    return prev ? summarize(prev.expenses).total : null
  }, [prevExpenses, currency])

  const methodsById = useMemo(
    () => new Map((methods ?? []).map((m: PaymentMethod) => [m.id, m])),
    [methods],
  )

  const biggest = useMemo(() => biggestExpense(bucket?.expenses ?? []), [bucket])
  const busiest = useMemo(() => busiestDay(bucket?.expenses ?? []), [bucket])
  const avg = dailyAverage(summary.total, month, todayISO())

  const delta =
    prevTotal !== null && prevTotal > 0
      ? Math.round(((summary.total - prevTotal) / prevTotal) * 100)
      : null
  const prevMonthName = monthLabel(addMonths(month, -1)).split(' ')[0]

  const entryCount = summary.count

  return (
    <div className="screen">
      <header className="screen-head">
        <p className="eyebrow">Summary</p>
        <h1 className="sr-only">Summary</h1>
      </header>

      <MonthPager
        month={month}
        onChange={(m) => m && setMonth(m)}
        maxMonth={maxMonth}
      />

      {buckets.length > 1 && (
        <div className="chip-row currency-row" role="group" aria-label="Currency">
          {buckets.map((b) => (
            <button
              key={b.currency}
              type="button"
              className="chip"
              aria-pressed={b.currency === currency}
              onClick={() => setChosenCurrency(b.currency)}
            >
              <span aria-hidden="true">{currencySymbol(b.currency)}</span> {b.currency}
            </button>
          ))}
        </div>
      )}

      <section className="hero">
        <p className="eyebrow">Total spent</p>
        <p className="hero-total money">{formatMoney(summary.total, currency)}</p>
        <p className="hero-meta">
          {entryCount === 0
            ? 'nothing logged this month'
            : entryCount === 1
              ? 'across 1 entry'
              : `across ${entryCount} entries`}
        </p>
      </section>

      {entryCount > 0 && (
        <section className="stat-grid" aria-label="Month statistics">
          <div className="stat-tile">
            <p className="stat-label">Daily average</p>
            <p className="stat-value money">{formatMoney(avg, currency)}</p>
            <p className="stat-sub">
              {month === currentMonth ? 'so far this month' : 'across the month'}
            </p>
          </div>
          <div className="stat-tile">
            <p className="stat-label">vs {prevMonthName}</p>
            <p className="stat-value money">
              {delta === null
                ? '—'
                : `${delta > 0 ? '▲' : delta < 0 ? '▼' : '='} ${Math.abs(delta)}%`}
            </p>
            <p className="stat-sub">
              {delta === null
                ? 'nothing to compare'
                : `was ${formatMoney(prevTotal ?? 0, currency)}`}
            </p>
          </div>
          {biggest && (
            <div className="stat-tile">
              <p className="stat-label">Biggest spend</p>
              <p className="stat-value money">{formatMoney(biggest.amount, currency)}</p>
              <p className="stat-sub">{biggest.note || biggest.category}</p>
            </div>
          )}
          {busiest && (
            <div className="stat-tile">
              <p className="stat-label">Busiest day</p>
              <p className="stat-value money">{formatMoney(busiest.total, currency)}</p>
              <p className="stat-sub">{shortDay(busiest.date)}</p>
            </div>
          )}
        </section>
      )}

      {summary.byCategory.length > 0 && (
        <section className="chart-card">
          <h2 className="section-title">By category</h2>
          <CategoryChart data={summary.byCategory} currency={currency} />
        </section>
      )}

      {summary.byPayment.length > 0 && (
        <section className="chart-card">
          <h2 className="section-title">By payment</h2>
          <ul className="pay-list">
            {summary.byPayment.map((p) => {
              const method = p.paymentMethodId
                ? methodsById.get(p.paymentMethodId)
                : undefined
              return (
                <li key={p.paymentMethodId ?? 'none'} className="pay-row">
                  <span className="pay-emoji" aria-hidden="true">
                    {method ? groupEmoji(method.group) : '🧾'}
                  </span>
                  <span className="pay-label">{method?.label ?? 'Unrecorded'}</span>
                  <span className="leader" aria-hidden="true" />
                  <span className="pay-amount money">
                    {formatMoney(p.total, currency)}
                  </span>
                  <span className="pay-count">
                    {p.count === 1 ? '1 entry' : `${p.count} entries`}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

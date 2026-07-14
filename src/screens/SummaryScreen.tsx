import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { CategoryChart } from '../components/CategoryChart'
import { Pager } from '../components/Pager'
import { PeriodSheet } from '../components/PeriodSheet'
import { TrendChart } from '../components/TrendChart'
import {
  db,
  listExpenses,
  listExpensesBetween,
  listPaymentMethods,
  type Expense,
  type PaymentMethod,
} from '../db'
import { currencySymbol } from '../lib/currencies'
import { shortDayMonth, shortMonthYear, todayISO } from '../lib/dates'
import type { HistoryJump } from '../lib/history'
import { formatMoney } from '../lib/money'
import { groupEmoji } from '../lib/paymentMeta'
import {
  changeKind,
  comparisonLabel,
  comparisonSlice,
  daysBetween,
  elapsedDays,
  emptyPeriodPhrase,
  initialPeriod,
  periodBounds,
  periodLabel,
  shiftPeriod,
  trendUnit,
  type Period,
} from '../lib/period'
import { getPref, PREFS, setPref } from '../lib/prefs'
import {
  averagePerDay,
  biggestExpense,
  busiestDay,
  busiestMonth,
  noSpendDays,
  projectTotal,
  splitByCurrency,
  summarize,
  trendBuckets,
} from '../lib/summarize'

const GRANULARITIES = [
  { kind: 'week', label: 'Week' },
  { kind: 'month', label: 'Month' },
  { kind: 'year', label: 'Year' },
  { kind: 'all', label: 'All' },
] as const

// A month averages ≈ 30.44 days; the year/all "a month" figure is approximate
// by design, and the tile says so.
const DAYS_PER_MONTH = 30.44

// Turn the viewed period into a History slice: a month drill carries the month
// (History shows its day groups); week/year/custom carry inclusive bounds; all
// time carries neither, so the drill lands on the full ledger for that thing.
function drillBounds(p: Period): Pick<HistoryJump, 'month' | 'from' | 'to'> {
  if (p.kind === 'month') return { month: p.month }
  if (p.kind === 'all') return {}
  const b = periodBounds(p)!
  return { from: b.from, to: b.to }
}

export function SummaryScreen({
  onDrill,
  onAddNew,
}: {
  onDrill: (jump: HistoryJump) => void
  onAddNew: () => void
}) {
  const today = todayISO()
  const [period, setPeriod] = useState<Period>(() =>
    initialPeriod(getPref(PREFS.summaryPeriod, 'month'), today),
  )
  const [chosenCurrency, setChosenCurrency] = useState('INR')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetFocusCustom, setSheetFocusCustom] = useState(false)

  const expenses = useLiveQuery(() => {
    if (period.kind === 'all') return listExpenses()
    const b = periodBounds(period)!
    return listExpensesBetween(b.from, b.to)
  }, [period])
  // While the period is still running, cmp clips the previous window to the
  // same elapsed length (see comparisonSlice) so the vs-tile compares
  // like-for-like; cmp.toDate switches its sub-label to "by this point".
  // `today` must be a dep: the screen sits mounted across midnight, and the
  // clipped window has to grow with the new day — deps of [period] alone would
  // keep Dexie re-running the closure captured yesterday.
  const cmp = comparisonSlice(period, today)
  const prevExpenses = useLiveQuery(() => {
    if (!cmp) return [] as Expense[]
    return listExpensesBetween(cmp.bounds.from, cmp.bounds.to)
  }, [period, today])
  const methods = useLiveQuery(() => listPaymentMethods({ includeArchived: true }))

  // ‹ › reach any period that holds data, even a fat-fingered future date —
  // otherwise it is visible in History but unreachable here. All-time averages
  // need real bounds, so they run oldest entry → that same anchor.
  const newest = useLiveQuery(() => db.expenses.orderBy('spentOn').last())
  const oldest = useLiveQuery(() => db.expenses.orderBy('spentOn').first())
  const maxAnchor = newest && newest.spentOn > today ? newest.spentOn : today
  // Memoized so its identity is stable across renders (it feeds several memos
  // and the trend chart); keyed on the oldest *date*, not the live-query row
  // object, so a re-emit with an unchanged span doesn't churn the trend.
  const oldestDate = oldest?.spentOn
  const bounds = useMemo(
    () =>
      period.kind === 'all'
        ? oldestDate
          ? { from: oldestDate, to: maxAnchor }
          : null
        : periodBounds(period),
    [period, oldestDate, maxAnchor],
  )

  const buckets = useMemo(() => splitByCurrency(expenses ?? []), [expenses])
  // Follow the data: if the picked currency vanished with a period switch,
  // fall back to the main bucket rather than a blank screen.
  const currency =
    buckets.find((b) => b.currency === chosenCurrency)?.currency ??
    buckets[0]?.currency ??
    'INR'

  const bucket = buckets.find((b) => b.currency === currency)
  const summary = useMemo(() => summarize(bucket?.expenses ?? []), [bucket])
  // Only the previous period's total for the current currency is needed, so sum
  // in one pass rather than building a full summary we would throw away.
  const prevTotal = useMemo(() => {
    let sum = 0
    let hasAny = false
    for (const e of prevExpenses ?? []) {
      if (e.currency === currency) {
        sum += e.amount
        hasAny = true
      }
    }
    return hasAny ? sum : null
  }, [prevExpenses, currency])

  const methodsById = useMemo(
    () => new Map((methods ?? []).map((m: PaymentMethod) => [m.id, m])),
    [methods],
  )

  const biggest = useMemo(() => biggestExpense(bucket?.expenses ?? []), [bucket])

  const spanDays = bounds ? daysBetween(bounds.from, bounds.to) : 0
  const trendUnitOf = bounds ? trendUnit(bounds) : 'day'
  // "Is the day the interesting unit?" — the same threshold as the trend's day
  // grain, so the busiest tile and the chart can never disagree.
  const dayScale = bounds !== null && trendUnitOf === 'day'
  const containsToday = bounds !== null && today >= bounds.from && today <= bounds.to
  const isAggregateSpan = period.kind === 'year' || period.kind === 'all'

  const busiest = useMemo(
    () => (dayScale ? busiestDay(bucket?.expenses ?? []) : null),
    [bucket, dayScale],
  )
  const busiestM = useMemo(
    () => (dayScale ? null : busiestMonth(bucket?.expenses ?? [])),
    [bucket, dayScale],
  )

  const avg = bounds ? averagePerDay(summary.total, bounds, today) : 0
  const noSpend = bounds ? noSpendDays(bucket?.expenses ?? [], bounds, today) : 0
  const elapsed = bounds ? elapsedDays(bounds, today) : 0
  const projected = bounds ? projectTotal(summary.total, elapsed, spanDays) : 0

  const trend = useMemo(
    () => (bounds ? trendBuckets(bucket?.expenses ?? [], bounds, trendUnitOf) : []),
    [bucket, bounds, trendUnitOf],
  )

  const delta =
    prevTotal !== null && prevTotal > 0
      ? Math.round(((summary.total - prevTotal) / prevTotal) * 100)
      : null
  const cmpLabel = comparisonLabel(period)

  // shiftPeriod preserves the kind, so periodBounds is non-null for any non-all
  // period; › is capped so it can't page past the newest data (or today).
  const nextDisabled =
    period.kind === 'all' || periodBounds(shiftPeriod(period, 1))!.from > maxAnchor

  const avgSub = ((): string => {
    if (isAggregateSpan)
      return `≈ ${formatMoney(Math.round(avg * DAYS_PER_MONTH), currency)} a month`
    if (!containsToday) return `across ${spanDays} days`
    if (dayScale && noSpend > 0)
      return `so far · ${noSpend} no-spend ${noSpend === 1 ? 'day' : 'days'}`
    return 'so far'
  })()

  const emptyPhrase = emptyPeriodPhrase(period, containsToday)
  const entryCount = summary.count
  // A projection needs ≥ 2 elapsed days to mean anything, and once the period
  // has fully elapsed (a custom range ending today, a week on its Sunday) it
  // just equals the total — suppress both degenerate ends.
  const showPace =
    containsToday && period.kind !== 'all' && elapsed >= 2 && elapsed < spanDays

  // A tapped trend bucket drills to its span clipped to the viewed period; a
  // whole in-period month jumps as a month (History's monthly-pager mode, like
  // the busiest-month tile), everything else as an inclusive range.
  function bucketJump(key: string): HistoryJump {
    if (!bounds || trendUnitOf === 'day') return { from: key, to: key }
    const b = periodBounds(
      trendUnitOf === 'week'
        ? { kind: 'week', start: key }
        : trendUnitOf === 'month'
          ? { kind: 'month', month: key }
          : { kind: 'year', year: key },
    )!
    if (trendUnitOf === 'month' && b.from >= bounds.from && b.to <= bounds.to) {
      return { month: key }
    }
    return {
      from: b.from < bounds.from ? bounds.from : b.from,
      to: b.to > bounds.to ? bounds.to : b.to,
    }
  }

  // Custom ranges are never persisted (a stale range would be a trap on the
  // next launch); every other granularity restores anchored at "now".
  function applyPeriod(p: Period) {
    setPeriod(p)
    if (p.kind !== 'custom') setPref(PREFS.summaryPeriod, p.kind)
  }
  function selectKind(kind: 'week' | 'month' | 'year' | 'all') {
    applyPeriod(changeKind(period, kind, today))
  }
  function openSheet(focusCustom: boolean) {
    setSheetFocusCustom(focusCustom)
    setSheetOpen(true)
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <p className="eyebrow">Summary</p>
        <h1 className="sr-only">Summary</h1>
      </header>

      <Pager
        label={periodLabel(period, today)}
        hint="tap to jump"
        labelAriaLabel={`Showing ${periodLabel(period, today)} — tap to choose a period`}
        onLabelClick={() => openSheet(false)}
        onPrev={() => setPeriod(shiftPeriod(period, -1))}
        onNext={() => setPeriod(shiftPeriod(period, 1))}
        prevDisabled={period.kind === 'all'}
        nextDisabled={nextDisabled}
      />

      <div className="chip-row period-row" role="group" aria-label="Summary period">
        {GRANULARITIES.map((g) => (
          <button
            key={g.kind}
            type="button"
            className="chip"
            aria-pressed={period.kind === g.kind}
            onClick={() => selectKind(g.kind)}
          >
            {g.label}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          aria-pressed={period.kind === 'custom'}
          onClick={() => openSheet(true)}
        >
          Custom
        </button>
      </div>

      {buckets.length > 1 && (
        <div className="chip-row currency-row" role="group" aria-label="Currency">
          {buckets.map((b) => {
            // Symbol-less currencies fall back to their code (SAR → "SAR");
            // showing both would read doubled.
            const sym = currencySymbol(b.currency)
            return (
              <button
                key={b.currency}
                type="button"
                className="chip"
                aria-pressed={b.currency === currency}
                onClick={() => setChosenCurrency(b.currency)}
              >
                {sym !== b.currency && <span aria-hidden="true">{sym} </span>}
                {b.currency}
              </button>
            )
          })}
        </div>
      )}

      <section className="hero">
        <p className="eyebrow">Total spent</p>
        <p className="hero-total money">{formatMoney(summary.total, currency)}</p>
        <p className="hero-meta">
          {entryCount === 0
            ? `nothing logged ${emptyPhrase}`
            : entryCount === 1
              ? 'across 1 entry'
              : `across ${entryCount} entries`}
        </p>
        {/* Only offer "add" when the empty period is the one you can add into:
           the Add form defaults to today, so a CTA on a past month would lie. */}
        {entryCount === 0 && containsToday && (
          <button type="button" className="btn-text hero-add" onClick={onAddNew}>
            Add an expense
          </button>
        )}
      </section>

      {entryCount > 0 && bounds && (
        <section className="stat-grid" aria-label="Period statistics">
          <div className="stat-tile">
            <p className="stat-label">Daily average</p>
            {/* Rounded at display only: paise read as noise beside whole-₹
               tiles, but the "≈ a month" derivation keeps the precise value. */}
            <p className="stat-value money">{formatMoney(Math.round(avg), currency)}</p>
            <p className="stat-sub">{avgSub}</p>
          </div>
          {showPace && (
            <div className="stat-tile">
              <p className="stat-label">On pace for</p>
              <p className="stat-value money">{formatMoney(projected, currency)}</p>
              <p className="stat-sub">by {shortDayMonth(bounds.to)}</p>
            </div>
          )}
          {cmpLabel && (
            <div className="stat-tile">
              <p className="stat-label">{cmpLabel}</p>
              <p className="stat-value money">
                {delta === null
                  ? '—'
                  : `${delta > 0 ? '▲' : delta < 0 ? '▼' : '='} ${Math.abs(delta)}%`}
              </p>
              <p className="stat-sub">
                {delta === null
                  ? 'nothing to compare'
                  : cmp?.toDate
                    ? `${formatMoney(prevTotal ?? 0, currency)} by this point`
                    : `was ${formatMoney(prevTotal ?? 0, currency)}`}
              </p>
            </div>
          )}
          {biggest && (
            <button
              type="button"
              className="stat-tile stat-tile-btn"
              aria-label={`See the ${biggest.note || biggest.category} entry in History`}
              onClick={() => onDrill({ from: biggest.spentOn, to: biggest.spentOn })}
            >
              <p className="stat-label">Biggest spend</p>
              <p className="stat-value money">{formatMoney(biggest.amount, currency)}</p>
              <p className="stat-sub">
                {biggest.note || biggest.category}
                <span className="stat-go" aria-hidden="true">
                  ›
                </span>
              </p>
            </button>
          )}
          {busiest && (
            <button
              type="button"
              className="stat-tile stat-tile-btn"
              aria-label={`See ${shortDayMonth(busiest.date)} entries in History`}
              onClick={() => onDrill({ from: busiest.date, to: busiest.date })}
            >
              <p className="stat-label">Busiest day</p>
              <p className="stat-value money">{formatMoney(busiest.total, currency)}</p>
              <p className="stat-sub">
                {shortDayMonth(busiest.date)}
                <span className="stat-go" aria-hidden="true">
                  ›
                </span>
              </p>
            </button>
          )}
          {busiestM && (
            <button
              type="button"
              className="stat-tile stat-tile-btn"
              aria-label={`See ${shortMonthYear(busiestM.month)} entries in History`}
              onClick={() => onDrill({ month: busiestM.month })}
            >
              <p className="stat-label">Busiest month</p>
              <p className="stat-value money">{formatMoney(busiestM.total, currency)}</p>
              <p className="stat-sub">
                {shortMonthYear(busiestM.month)}
                <span className="stat-go" aria-hidden="true">
                  ›
                </span>
              </p>
            </button>
          )}
        </section>
      )}

      {trend.length >= 2 && entryCount > 0 && (
        <section className="chart-card">
          <h2 className="section-title">Over time</h2>
          <TrendChart
            buckets={trend}
            unit={trendUnitOf}
            currency={currency}
            onSelect={(key) => onDrill(bucketJump(key))}
          />
        </section>
      )}

      {summary.byCategory.length > 0 && (
        <section className="chart-card">
          <h2 className="section-title">By category</h2>
          <CategoryChart
            data={summary.byCategory}
            currency={currency}
            onSelect={(category) => onDrill({ category, ...drillBounds(period) })}
          />
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
              const inner = (
                <>
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
                </>
              )
              // The null-method "Unrecorded" row stays static: History has no
              // "no payment method" filter to drill into.
              return (
                <li key={p.paymentMethodId ?? 'none'}>
                  {p.paymentMethodId ? (
                    <button
                      type="button"
                      className="pay-row pay-row-btn"
                      aria-label={`See ${method?.label ?? 'method'} entries in History`}
                      onClick={() =>
                        onDrill({ paymentMethodId: p.paymentMethodId, ...drillBounds(period) })
                      }
                    >
                      {inner}
                      <span className="stat-go" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  ) : (
                    <div className="pay-row">{inner}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {sheetOpen && (
        <PeriodSheet
          period={period}
          maxAnchor={maxAnchor}
          focusCustom={sheetFocusCustom}
          onApply={(p) => {
            applyPeriod(p)
            setSheetOpen(false)
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  )
}

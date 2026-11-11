import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, useState } from 'react'
import { BreakdownList, type BreakdownRow } from '../components/BreakdownList'
import { BudgetCard, YearBudgetCard } from '../components/BudgetCard'
import { PeriodPager } from '../components/PeriodPager'
import { TrendChart } from '../components/TrendChart'
import { YearLedger } from '../components/YearLedger'
import {
  db,
  firstExpenseMonth,
  listCategories,
  listExpenses,
  listExpensesBetween,
  listPaymentMethods,
  type Category,
  type Expense,
  type PaymentMethod,
} from '../db'
import {
  budgetFor,
  budgetReference,
  budgetStatus,
  carriedIntoMonth,
  ledgerFor,
  ledgerReads,
  yearBudgetReference,
  type Budgets,
} from '../lib/budget'
import { currencySymbol } from '../lib/currencies'
import { shortDayMonth, shortMonthYear, todayISO } from '../lib/dates'
import {
  everydayIn,
  expectedFixed,
  fixedBadge,
  fixedLabels,
  fixedLines,
  hasFixedSpend,
  paceWithFixed,
  splitFixed,
  usualTotal,
  usualWindow,
} from '../lib/fixed'
import type { HistoryJump } from '../lib/history'
import { formatMoney } from '../lib/money'
import { groupEmoji } from '../lib/paymentMeta'
import {
  bucketBounds,
  bucketKeyOf,
  comparisonLabel,
  comparisonSlice,
  daysBetween,
  elapsedDays,
  emptyPeriodPhrase,
  initialPeriod,
  periodBounds,
  periodWindows,
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
  type CategoryTotal,
} from '../lib/summarize'

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
  budgets,
  onDrill,
  onAddNew,
  onOpenBudget,
}: {
  budgets: Budgets
  onDrill: (jump: HistoryJump) => void
  onAddNew: () => void
  onOpenBudget: (currency: string) => void
}) {
  const today = todayISO()
  const [period, setPeriod] = useState<Period>(() =>
    initialPeriod(getPref(PREFS.summaryPeriod, 'month'), today),
  )
  const [chosenCurrency, setChosenCurrency] = useState('INR')

  // One read for both windows. Two separate live queries resolved at two
  // different moments, so a month switch briefly rendered this period's total
  // against last period's comparison — the vs-tile flashed a meaningless "=
  // 0%" on the way through. periodWindows derives both from one period, and
  // the result is stamped with the period (and day) it was built for so the
  // screen can tell a loaded view from an in-flight one.
  // `today` must be a dep: the screen sits mounted across midnight, and the
  // clipped comparison window has to grow with the new day — deps of [period]
  // alone would keep Dexie re-running the closure captured yesterday.
  // The fixed-cost history and the categories ride in this read too, not in
  // live queries of their own: Dexie re-runs the whole querier when any table
  // it read changes, so toggling a category's fixed flag re-splits Summary
  // with no reload, and the split always lands in one snapshot with the
  // entries it splits. Archived categories included: their label still sits
  // on old entries, so they still decide fixedness and still need a face.
  // The year ledger's reads ride here for the same reason (see ledgerReads);
  // `budgets` is a dep because whether to make them depends on it.
  const view = useLiveQuery(async () => {
    const windows = periodWindows(period, today)
    const usual = usualWindow(period)
    const ledger = ledgerReads(period, budgets)
    const firstMonths: Record<string, string | null> = {}
    for (const c of ledger.currencies) firstMonths[c] = await firstExpenseMonth(c)
    return {
      period,
      today,
      expenses: windows.main
        ? await listExpensesBetween(windows.main.from, windows.main.to)
        : await listExpenses(),
      prevExpenses: windows.comparison
        ? await listExpensesBetween(windows.comparison.from, windows.comparison.to)
        : ([] as Expense[]),
      history: usual
        ? await listExpensesBetween(usual.from, usual.to)
        : ([] as Expense[]),
      categories: await listCategories({ includeArchived: true }),
      earlier: ledger.earlier
        ? await listExpensesBetween(ledger.earlier.from, ledger.earlier.to)
        : ([] as Expense[]),
      firstMonths,
    }
  }, [period, today, budgets])

  // useLiveQuery holds the previous result while the next one is in flight, so
  // without the stamp the old period's figures render under the new heading.
  // Identity compare: setPeriod always hands us a fresh object.
  const ready = view?.period === period && view.today === today
  const expenses = view?.expenses
  const prevExpenses = view?.prevExpenses
  const history = view?.history
  const categories = view?.categories
  const earlier = view?.earlier
  // Everything below the pager is derived from the period the loaded data
  // actually belongs to, never the one just tapped. That keeps a total, its
  // chart and its comparison describing one period at all times, and it leaves
  // every memo (the trend, and so the chart) untouched on the in-flight
  // render — the tap costs one re-render, not a rebuild of the whole chart.
  const dataPeriod = view?.period ?? period
  // While the period is still running, cmp clips the previous window to the
  // same elapsed length (see comparisonSlice) so the vs-tile compares
  // like-for-like; cmp.toDate switches its sub-label to "by this point".
  const cmp = comparisonSlice(dataPeriod, today)
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
      dataPeriod.kind === 'all'
        ? oldestDate
          ? { from: oldestDate, to: maxAnchor }
          : null
        : periodBounds(dataPeriod),
    [dataPeriod, oldestDate, maxAnchor],
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
  // Missing while a just-set budget's read is in flight: no ledger until it lands.
  const firstMonth = view?.firstMonths[currency] ?? null

  // Fixed costs (rent, bills) counted apart from everyday spending on the month
  // and the year. The month judges each fixed line against its usual — a
  // monthly idea — so lines, the usual and fixed-once pace stay month-only.
  // lib/fixed is single-currency, so the history is narrowed to the viewed
  // currency first. No split means every figure below is exactly what it was
  // before the split existed.
  const fixed = useMemo(() => fixedLabels(categories ?? []), [categories])
  const lines = useMemo(
    () =>
      dataPeriod.kind === 'month'
        ? fixedLines(
            bucket?.expenses ?? [],
            (history ?? []).filter((e) => e.currency === currency),
            fixed,
          )
        : [],
    [dataPeriod, bucket, history, currency, fixed],
  )
  const monthSplit = lines.length > 0
  const yearSplit = useMemo(
    () => dataPeriod.kind === 'year' && hasFixedSpend(bucket?.expenses ?? [], fixed),
    [dataPeriod, bucket, fixed],
  )
  const splitActive = monthSplit || yearSplit
  const split = useMemo(
    () => (splitActive ? splitFixed(bucket?.expenses ?? [], fixed) : null),
    [splitActive, bucket, fixed],
  )
  // What the tiles, the trend and the category list describe. Without the
  // split, everyday is simply everything — the very same array, so each memo
  // keyed on it below behaves exactly as before.
  const everyday = split ? split.everyday : bucket?.expenses
  const everydaySummary = useMemo(
    () => (split ? summarize(split.everyday) : summary),
    [split, summary],
  )
  const fixedSummary = useMemo(() => summarize(split?.fixed ?? []), [split])

  // Only the previous period's total for the current currency is needed, so sum
  // in one pass rather than building a full summary we would throw away. Under
  // the split it is the previous everyday, so the vs-tile compares like for like.
  const prevTotal = useMemo(() => {
    let sum = 0
    let hasAny = false
    const prev = splitActive ? splitFixed(prevExpenses ?? [], fixed).everyday : prevExpenses
    for (const e of prev ?? []) {
      if (e.currency === currency) {
        sum += e.amount
        hasAny = true
      }
    }
    return hasAny ? sum : null
  }, [prevExpenses, currency, splitActive, fixed])

  const methodsById = useMemo(
    () => new Map((methods ?? []).map((m: PaymentMethod) => [m.id, m])),
    [methods],
  )
  // 🧾 covers labels with no category record (e.g. from an edited backup),
  // the same fallback History uses.
  const categoryEmoji = useMemo(
    () => new Map((categories ?? []).map((c: Category) => [c.label, c.emoji])),
    [categories],
  )
  // A plain by-category list whose rows drill to History for that category
  // over the viewed period: everyday spending, and the year's fixed costs.
  const categoryRows = (totals: CategoryTotal[]): BreakdownRow[] =>
    totals.map((c) => ({
      key: c.category,
      emoji: categoryEmoji.get(c.category) ?? '🧾',
      label: c.category,
      total: c.total,
      count: c.count,
      selectLabel: `See ${c.category} entries in History`,
      onSelect: () => onDrill({ category: c.category, ...drillBounds(dataPeriod) }),
    }))

  const biggest = useMemo(() => biggestExpense(everyday ?? []), [everyday])

  const spanDays = bounds ? daysBetween(bounds.from, bounds.to) : 0
  const trendUnitOf = bounds ? trendUnit(bounds) : 'day'
  // "Is the day the interesting unit?" — the same threshold as the trend's day
  // grain, so the busiest tile and the chart can never disagree.
  const dayScale = bounds !== null && trendUnitOf === 'day'
  const containsToday = bounds !== null && today >= bounds.from && today <= bounds.to
  // The trend bucket that holds today — clay-marked as the still-filling
  // period so a partial bar isn't misread as a low one. Absent when the view
  // is wholly in the past (nothing is "now").
  const currentBucketKey = containsToday ? bucketKeyOf(today, trendUnitOf) : undefined
  const isAggregateSpan = dataPeriod.kind === 'year' || dataPeriod.kind === 'all'
  // One-day windows (the Day period, or a same-day custom range) can't say
  // anything a span can: the daily average equals the total and the "busiest
  // day" is the day itself. Suppress both; the vs-previous and biggest-entry
  // tiles still carry real content. Keyed on the span, not the kind, so it also
  // covers a same-day custom range (Open/Closed).
  const singleDay = bounds !== null && bounds.from === bounds.to

  const busiest = useMemo(
    () => (dayScale ? busiestDay(everyday ?? []) : null),
    [everyday, dayScale],
  )
  const busiestM = useMemo(
    () => (dayScale ? null : busiestMonth(bucket?.expenses ?? [])),
    [bucket, dayScale],
  )

  const avg = bounds ? averagePerDay(everydaySummary.total, bounds, today) : 0
  const noSpend = bounds ? noSpendDays(bucket?.expenses ?? [], bounds, today) : 0
  const elapsed = bounds ? elapsedDays(bounds, today) : 0
  // Under the split, fixed costs count once at what they are expected to come
  // to and only everyday spending is extrapolated — extrapolating the rent day
  // by day is what had the pace reading double.
  const projected = !bounds
    ? 0
    : monthSplit
      ? paceWithFixed(expectedFixed(lines), everydaySummary.total, elapsed, spanDays)
      : projectTotal(summary.total, elapsed, spanDays)

  const trend = useMemo(
    () => (bounds ? trendBuckets(everyday ?? [], bounds, trendUnitOf) : []),
    [everyday, bounds, trendUnitOf],
  )

  // The budget is a monthly line for everyday spending in one currency, for
  // the currency on screen: the month view measures its month against it, the
  // year view each of its months. Everyday is everything when nothing is
  // fixed, so neither needs a split to work.
  const budget = dataPeriod.kind === 'month' ? budgetFor(budgets, currency) : null
  const budgetNow =
    budget === null ? null : budgetStatus(everydaySummary.total, budget, elapsed, spanDays)
  const carried = useMemo(
    () =>
      budget !== null && dataPeriod.kind === 'month'
        ? carriedIntoMonth(
            everydayIn(earlier ?? [], currency, fixed),
            budget,
            dataPeriod.month,
            today,
            firstMonth,
          )
        : null,
    [budget, dataPeriod, earlier, currency, fixed, today, firstMonth],
  )
  const yearBudget = dataPeriod.kind === 'year' ? budgetFor(budgets, currency) : null
  // Empty for a year before the ledger began, which then shows no card.
  const yearLines = useMemo(
    () =>
      yearBudget !== null && dataPeriod.kind === 'year'
        ? ledgerFor(everyday ?? [], yearBudget, dataPeriod.year, today, firstMonth)
        : [],
    [yearBudget, dataPeriod, everyday, today, firstMonth],
  )
  const hasLedger = yearLines.length > 0
  // Memoized: TrendChart is memo'd, and a fresh object each render would
  // rebuild it every time this screen re-rendered.
  const reference = useMemo(
    () =>
      budget !== null && spanDays > 0
        ? budgetReference(budget, spanDays, currency)
        : yearBudget !== null && hasLedger
          ? yearBudgetReference(yearBudget, currency)
          : undefined,
    [budget, spanDays, currency, yearBudget, hasLedger],
  )

  const delta =
    prevTotal !== null && prevTotal > 0
      ? Math.round(((everydaySummary.total - prevTotal) / prevTotal) * 100)
      : null
  const usualSum = usualTotal(lines)
  const cmpLabel = comparisonLabel(period)

  // shiftPeriod preserves the kind, so periodBounds is non-null for any non-all
  // period; › is capped so it can't page past the newest data (or today).

  const avgSub = ((): string => {
    if (isAggregateSpan)
      return `≈ ${formatMoney(Math.round(avg * DAYS_PER_MONTH), currency)} a month`
    if (!containsToday) return `across ${spanDays} days`
    if (dayScale && noSpend > 0)
      return `so far · ${noSpend} no-spend ${noSpend === 1 ? 'day' : 'days'}`
    return 'so far'
  })()

  const emptyPhrase = emptyPeriodPhrase(dataPeriod, containsToday)
  const entryCount = summary.count
  // A projection needs ≥ 2 elapsed days to mean anything, and once the period
  // has fully elapsed (a custom range ending today, a week on its Sunday) it
  // just equals the total — suppress both degenerate ends.
  const showPace =
    containsToday && dataPeriod.kind !== 'all' && elapsed >= 2 && elapsed < spanDays
  // Without the split, pace is the second tile and Busiest day comes after
  // Biggest. With it the grid is always four, led by pace — or by Busiest day
  // in the same slot when there is no pace to show. The year's pace takes no
  // usual (month-only), so it projects all spending, and says so beside its
  // everyday neighbours.
  const paceTile = showPace && bounds && (
    <div className="stat-tile">
      <p className="stat-label">On pace for</p>
      <p className="stat-value money">{formatMoney(projected, currency)}</p>
      <p className={splitActive ? 'stat-sub stat-sub-wrap' : 'stat-sub'}>
        by {shortDayMonth(bounds.to)}
        {monthSplit && ' · fixed counted once'}
        {yearSplit && ' · all spending'}
      </p>
    </div>
  )
  const busiestTile = !singleDay && busiest && (
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
  )

  // A tapped trend bucket drills to its span clipped to the viewed period; a
  // whole in-period month jumps as a month (History's monthly-pager mode, like
  // the busiest-month tile), everything else as an inclusive range.
  // useCallback because TrendChart is memo'd: a fresh handler each render
  // would rebuild its ~213 nodes on every re-render regardless.
  const onBucketSelect = useCallback(
    (key: string) => {
      if (!bounds) {
        onDrill({ from: key, to: key })
        return
      }
      const b = bucketBounds(key, trendUnitOf)
      if (trendUnitOf === 'month' && b.from >= bounds.from && b.to <= bounds.to) {
        onDrill({ month: key })
        return
      }
      onDrill({
        from: b.from < bounds.from ? bounds.from : b.from,
        to: b.to > bounds.to ? bounds.to : b.to,
      })
    },
    [bounds, trendUnitOf, onDrill],
  )

  // Custom ranges are never persisted (a stale range would be a trap on the
  // next launch); every other granularity restores anchored at "now".
  function applyPeriod(p: Period) {
    setPeriod(p)
    if (p.kind !== 'custom') setPref(PREFS.summaryPeriod, p.kind)
  }

  return (
    // data-loading blanks every figure below the pager while the next period
    // is in flight (see index.css). The pager itself keeps updating: the tap
    // gets its feedback immediately, and no number is ever shown against the
    // wrong heading.
    <div className="screen" data-loading={ready ? undefined : ''} aria-busy={!ready}>
      <header className="screen-head">
        <p className="eyebrow">Summary</p>
        <h1 className="sr-only">Summary</h1>
      </header>

      <PeriodPager
        period={period}
        onChange={applyPeriod}
        today={today}
        maxAnchor={maxAnchor}
        currency={currency}
      />

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
            : splitActive
              ? `${formatMoney(fixedSummary.total, currency)} fixed · ` +
                `${formatMoney(everydaySummary.total, currency)} everyday`
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

      {budget !== null && budgetNow ? (
        <BudgetCard
          status={budgetNow}
          budget={budget}
          currency={currency}
          daysLeft={spanDays - elapsed}
          carried={carried}
          onEdit={() => onOpenBudget(currency)}
        />
      ) : (
        dataPeriod.kind === 'month' && (
          <button
            type="button"
            className="btn-text btn-text-tap budget-set"
            onClick={() => onOpenBudget(currency)}
          >
            Set a monthly budget
          </button>
        )
      )}

      {hasLedger && <YearBudgetCard lines={yearLines} currency={currency} />}

      {entryCount > 0 && bounds && (
        <section className="stat-grid" aria-label="Period statistics">
          {splitActive && (showPace ? paceTile : busiestTile)}
          {!singleDay && (
            <div className="stat-tile">
              <p className="stat-label">
                {splitActive ? 'Everyday average' : 'Daily average'}
              </p>
              {/* Rounded at display only: paise read as noise beside whole-₹
                 tiles, but the "≈ a month" derivation keeps the precise value. */}
              <p className="stat-value money">{formatMoney(Math.round(avg), currency)}</p>
              <p className="stat-sub">{avgSub}</p>
            </div>
          )}
          {!splitActive && paceTile}
          {cmpLabel && (
            <div className="stat-tile">
              <p className="stat-label">{cmpLabel}</p>
              <p className="stat-value money">
                {delta === null
                  ? '—'
                  : `${delta > 0 ? '▲' : delta < 0 ? '▼' : '='} ${Math.abs(delta)}%`}
              </p>
              <p className={splitActive ? 'stat-sub stat-sub-wrap' : 'stat-sub'}>
                {delta === null ? (
                  'nothing to compare'
                ) : (
                  <>
                    {splitActive && 'everyday · '}
                    {cmp?.toDate
                      ? `${formatMoney(prevTotal ?? 0, currency)} by this point`
                      : `was ${formatMoney(prevTotal ?? 0, currency)}`}
                  </>
                )}
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
              <p className="stat-label">
                {splitActive ? 'Biggest everyday' : 'Biggest spend'}
              </p>
              <p className="stat-value money">{formatMoney(biggest.amount, currency)}</p>
              <p className="stat-sub">
                {biggest.note || biggest.category}
                <span className="stat-go" aria-hidden="true">
                  ›
                </span>
              </p>
            </button>
          )}
          {!splitActive && busiestTile}
          {busiestM && (
            <button
              type="button"
              className="stat-tile stat-tile-btn"
              aria-label={`See ${shortMonthYear(busiestM.month)} entries in History`}
              onClick={() => onDrill({ month: busiestM.month })}
            >
              <p className="stat-label">Busiest month</p>
              <p className="stat-value money">{formatMoney(busiestM.total, currency)}</p>
              {/* Months are ranked on all spending; under the split its
                 neighbours say "everyday", so this one says what it covers. */}
              <p className={yearSplit ? 'stat-sub stat-sub-wrap' : 'stat-sub'}>
                {shortMonthYear(busiestM.month)}
                {yearSplit && ' · all spending'}
                <span className="stat-go" aria-hidden="true">
                  ›
                </span>
              </p>
            </button>
          )}
        </section>
      )}

      {trend.length >= 2 && everydaySummary.count > 0 && (
        <section className="chart-card">
          {/* Everyday only under the split: one rent bar flattened every other
             day of the month to a sliver. */}
          {splitActive ? (
            <div className="card-head">
              <h2 className="section-title">
                {trendUnitOf === 'month' ? 'Everyday, month by month' : 'Everyday, day by day'}
              </h2>
              <span className="card-note">fixed costs left out</span>
            </div>
          ) : (
            <h2 className="section-title">Over time</h2>
          )}
          <TrendChart
            buckets={trend}
            unit={trendUnitOf}
            currency={currency}
            currentKey={currentBucketKey}
            onSelect={onBucketSelect}
            reference={reference}
          />
        </section>
      )}

      {hasLedger && yearBudget !== null && (
        <YearLedger
          lines={yearLines}
          budget={yearBudget}
          currency={currency}
          today={today}
          onSelectMonth={(month) => {
            // Through applyPeriod, as the period sheet does, so the next launch
            // restores the month the owner opened rather than the year.
            applyPeriod({ kind: 'month', month })
            // The ledger sits at the foot of a long page; the month it opens
            // reads from the top, where its heading and budget card are.
            window.scrollTo(0, 0)
          }}
        />
      )}

      {monthSplit && (
        <section className="chart-card">
          <div className="card-head">
            <h2 className="section-title">Fixed costs</h2>
            {usualSum !== null && (
              <span className="card-note">
                usually {formatMoney(usualSum, currency)} a month
              </span>
            )}
          </div>
          {/* A line with no usual yet has no pill (nothing to judge it by) and
             keeps the share/count sub-line, as a share of the fixed costs. */}
          <BreakdownList
            currency={currency}
            whole={fixedSummary.total}
            rows={lines.map((l) => ({
              key: l.category,
              emoji: categoryEmoji.get(l.category) ?? '🧾',
              label: l.category,
              total: l.spent,
              count:
                fixedSummary.byCategory.find((c) => c.category === l.category)?.count ?? 0,
              badge: fixedBadge(l, currency) ?? undefined,
              selectLabel: `See ${l.category} entries in History`,
              onSelect: () => onDrill({ category: l.category, ...drillBounds(dataPeriod) }),
            }))}
          />
        </section>
      )}

      {yearSplit && (
        <section className="chart-card">
          {/* What the year's fixed costs came to, plain: pills and the usual
             judge a month against its usual, which is month-only maths. */}
          <h2 className="section-title">Fixed costs</h2>
          <BreakdownList
            currency={currency}
            whole={fixedSummary.total}
            rows={categoryRows(fixedSummary.byCategory)}
          />
        </section>
      )}

      {everydaySummary.byCategory.length > 0 && (
        <section className="chart-card">
          <h2 className="section-title">
            {splitActive ? 'Everyday by category' : 'By category'}
          </h2>
          <BreakdownList
            currency={currency}
            whole={everydaySummary.total}
            rows={categoryRows(everydaySummary.byCategory)}
          />
        </section>
      )}

      {summary.byPayment.length > 0 && (
        <section className="chart-card">
          <h2 className="section-title">By payment</h2>
          <BreakdownList
            currency={currency}
            whole={summary.total}
            rows={summary.byPayment.map((p) => {
              const method = p.paymentMethodId
                ? methodsById.get(p.paymentMethodId)
                : undefined
              return {
                key: p.paymentMethodId ?? 'none',
                emoji: method ? groupEmoji(method.group) : '🧾',
                label: method?.label ?? 'Unrecorded',
                total: p.total,
                count: p.count,
                selectLabel: `See ${method?.label ?? 'method'} entries in History`,
                // The null-method "Unrecorded" row stays static: History has no
                // "no payment method" filter to drill into.
                onSelect: p.paymentMethodId
                  ? () =>
                      onDrill({
                        paymentMethodId: p.paymentMethodId,
                        ...drillBounds(dataPeriod),
                      })
                  : undefined,
              }
            })}
          />
        </section>
      )}

    </div>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db'
import { todayISO } from '../lib/dates'
import { addDays, initialPeriod, periodBounds, type Period } from '../lib/period'
import { RangeDateField } from './RangeDateField'

// Locale month abbreviations, computed once (en-IN, matches the rest of the UI).
const MONTH_ABBR = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString('en-IN', { month: 'short' }),
)

interface Props {
  period: Period
  maxAnchor: string // last selectable day (max of today and the newest entry)
  focusCustom?: boolean // opened via the Custom chip → scroll to that section
  onApply: (p: Period) => void
  onClose: () => void
}

// Jump to any month or year, or set a custom range. Mounted only while open
// (the parent gates it), so the index scan for month dots and the custom-range
// prefill both happen fresh per open.
export function PeriodSheet({ period, maxAnchor, focusCustom, onApply, onClose }: Props) {
  const today = todayISO()
  const initial = periodBounds(period) ?? { from: addDays(today, -29), to: today }
  const [from, setFrom] = useState<string | null>(initial.from)
  const [to, setTo] = useState<string | null>(initial.to)
  const customRef = useRef<HTMLDivElement>(null)

  // Every distinct spentOn date, reduced to the set of months that hold data —
  // one index scan, cheap at personal-ledger scale.
  const dateKeys = useLiveQuery(() => db.expenses.orderBy('spentOn').uniqueKeys())

  // Scroll only after the dot query resolves: the year grid above the custom
  // section grows by one block per data year at that moment, so scrolling on
  // mount targets a layout that is about to be pushed off-screen.
  useEffect(() => {
    if (focusCustom && dateKeys) customRef.current?.scrollIntoView({ block: 'center' })
  }, [focusCustom, dateKeys])
  const monthsSet = useMemo(() => {
    const s = new Set<string>()
    for (const k of dateKeys ?? []) s.add(String(k).slice(0, 7))
    return s
  }, [dateKeys])

  const maxYear = Number(maxAnchor.slice(0, 4))
  const minYear = useMemo(() => {
    let min = maxYear
    for (const m of monthsSet) min = Math.min(min, Number(m.slice(0, 4)))
    return min
  }, [monthsSet, maxYear])
  const years = useMemo(() => {
    const out: number[] = []
    for (let y = maxYear; y >= minYear; y--) out.push(y)
    return out
  }, [maxYear, minYear])

  // The now-shortcut speaks the active granularity; all/custom fall back to the
  // month (the default granularity).
  const nowKind =
    period.kind === 'day'
      ? 'day'
      : period.kind === 'week'
        ? 'week'
        : period.kind === 'year'
          ? 'year'
          : 'month'
  const nowLabel =
    nowKind === 'day'
      ? 'Today'
      : nowKind === 'week'
        ? 'This week'
        : nowKind === 'year'
          ? 'This year'
          : 'This month'

  function applyCustom() {
    if (!from || !to) return
    const [f, t] = from > to ? [to, from] : [from, to] // reversed bounds swap
    // A single-day range is the Day period, not a custom one: one code path for
    // all one-day windows, and it persists/reopens cleanly as 'day'.
    onApply(f === t ? { kind: 'day', date: f } : { kind: 'custom', from: f, to: t })
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        className="sheet period-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a period"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-head">
          <h2 className="display">Jump to</h2>
          <button className="btn-text" type="button" onClick={onClose}>
            Done
          </button>
        </header>

        <button
          type="button"
          className="chip pm-now"
          onClick={() => onApply(initialPeriod(nowKind, today))}
        >
          {nowLabel}
        </button>

        <div className="pm-years">
          {years.map((y) => (
            <div key={y} className="pm-year-block">
              <button
                type="button"
                className="pm-year-head"
                aria-pressed={period.kind === 'year' && period.year === String(y)}
                onClick={() => onApply({ kind: 'year', year: String(y) })}
              >
                <span className="display">{y}</span>
                <span className="pm-year-hint">whole year</span>
              </button>
              <div className="pm-grid" role="group" aria-label={`Months in ${y}`}>
                {MONTH_ABBR.map((abbr, i) => {
                  const month = `${y}-${String(i + 1).padStart(2, '0')}`
                  const disabled = `${month}-01` > maxAnchor
                  const selected = period.kind === 'month' && period.month === month
                  return (
                    <button
                      key={month}
                      type="button"
                      className="chip pm-cell"
                      aria-pressed={selected}
                      aria-label={`${abbr} ${y}`}
                      disabled={disabled}
                      onClick={() => onApply({ kind: 'month', month })}
                    >
                      {abbr}
                      {monthsSet.has(month) && <span className="pm-dot" aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="field pm-custom" ref={customRef}>
          <span>Custom range</span>
          <div className="filter-dates">
            <RangeDateField label="Start" value={from} onChange={setFrom} />
            <RangeDateField label="End" value={to} onChange={setTo} />
          </div>
          <button
            type="button"
            className="btn-ghost"
            disabled={!from || !to}
            onClick={applyCustom}
          >
            <span>Apply range</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  )
}

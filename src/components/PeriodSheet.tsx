import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { listExpenses } from '../db'
import { heatLevels, type HeatBasis } from '../lib/calendarHeat'
import {
  addMonths,
  formatDateLong,
  monthGrid,
  monthLabel,
  monthName,
  monthOf,
  todayISO,
} from '../lib/dates'
import { initialPeriod, periodBounds, periodLabel, type Period } from '../lib/period'
import { getPref, PREFS, setPref } from '../lib/prefs'

// Monday-first, matching monthGrid and weekStartOf.
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const HEAT_BASES: HeatBasis[] = ['all', 'month', 'year']
function readHeatBasis(): HeatBasis {
  const v = getPref(PREFS.calendarHeatBasis, 'all')
  return HEAT_BASES.includes(v as HeatBasis) ? (v as HeatBasis) : 'all'
}
const HEAT_LABEL: Record<HeatBasis, string> = { all: 'Global', month: 'Month', year: 'Year' }

interface Props {
  period: Period
  maxAnchor: string // last selectable day (max of today and the newest entry)
  currency: string
  onApply: (p: Period) => void
  onClose: () => void
}

// One calendar to point at: granularity is a consequence of the target — a
// day cell, two day cells (a range), a month name, a year header, a shortcut.
// Mounted only while open (the parent gates it), so the day-dot scan and the
// scroll-to-viewed-month both run fresh per open.
export function PeriodSheet({ period, maxAnchor, currency, onApply, onClose }: Props) {
  const today = todayISO()
  // A day tap opens a pending selection; a second tap on another day closes
  // it into a range; any further tap restarts at that day. Apply commits;
  // the ✕ or closing the sheet discards.
  const [sel, setSel] = useState<{ a: string; b: string | null } | null>(null)

  // Persisted (PREFS.calendarHeatBasis); the sheet mounts only while open, so
  // this reads the last-chosen basis fresh on every open.
  const [basis, setBasis] = useState<HeatBasis>(readHeatBasis)

  // Full rows (not just unique keys) — heat needs amounts. One toArray at
  // personal-ledger scale, and the sheet mounts only while open.
  const rows = useLiveQuery(() => listExpenses())
  const dateSet = useMemo(() => new Set((rows ?? []).map((r) => r.spentOn)), [rows])
  const heat = useMemo(() => heatLevels(rows ?? [], currency, basis), [rows, currency, basis])

  function changeBasis(next: HeatBasis) {
    setBasis(next)
    setPref(PREFS.calendarHeatBasis, next)
  }

  const newestMonth = monthOf(maxAnchor)
  const months = useMemo(() => {
    // Newest first, down to the oldest entry (this month on a fresh install)
    // — the direction History and the old year list already scroll.
    // maxAnchor >= today by contract, so newestMonth never caps this.
    let oldest = monthOf(today)
    for (const d of dateSet) {
      const m = monthOf(d)
      if (m < oldest) oldest = m
    }
    const out: string[] = []
    for (let m = newestMonth; m >= oldest; m = addMonths(m, -1)) out.push(m)
    return out
  }, [dateSet, newestMonth, today])

  // Scroll to the viewed period's month only after the dot query resolves:
  // before that the month list is still growing and the target may not exist.
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || !rows) return
    scrolled.current = true
    const from = periodBounds(period)?.from
    const target = monthOf(from ?? maxAnchor)
    document
      .getElementById(`cal-${target < newestMonth ? target : newestMonth}`)
      ?.scrollIntoView({ block: 'center' })
  }, [rows, period, maxAnchor, newestMonth])

  // The pending selection outranks the viewed period for day-cell paint; a
  // viewed month/year reads through its header, not 30 shouting cells.
  const viewed =
    period.kind === 'day' || period.kind === 'custom' ? periodBounds(period) : null
  const pend = sel
    ? sel.b === null
      ? { from: sel.a, to: sel.a }
      : sel.b < sel.a
        ? { from: sel.b, to: sel.a }
        : { from: sel.a, to: sel.b }
    : null
  const hl = pend ?? viewed
  const pendingPeriod: Period | null = pend
    ? pend.from === pend.to
      ? { kind: 'day', date: pend.from }
      : { kind: 'custom', from: pend.from, to: pend.to }
    : null

  function tapDay(d: string) {
    setSel((s) => (s && s.b === null && d !== s.a ? { a: s.a, b: d } : { a: d, b: null }))
  }

  // initialPeriod is the one source of "anchor a granularity at now"; the
  // shortcuts borrow it rather than re-deriving this month/year by hand.
  const shortcuts: { label: string; p: Period; on: boolean }[] = [
    {
      label: 'Today',
      p: initialPeriod('day', today),
      on: period.kind === 'day' && period.date === today,
    },
    {
      label: 'This month',
      p: initialPeriod('month', today),
      on: period.kind === 'month' && period.month === monthOf(today),
    },
    {
      label: 'This year',
      p: initialPeriod('year', today),
      on: period.kind === 'year' && period.year === today.slice(0, 4),
    },
    { label: 'All time', p: initialPeriod('all', today), on: period.kind === 'all' },
  ]

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

        <div className="chip-row cal-shortcuts" role="group" aria-label="Shortcuts">
          {shortcuts.map((s) => (
            <button
              key={s.label}
              type="button"
              className="chip"
              aria-pressed={s.on}
              onClick={() => onApply(s.p)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="cal-heat-scale">
          <span className="cal-heat-label">Heat</span>
          <div className="chip-row" role="group" aria-label="Heat scale">
            {HEAT_BASES.map((b) => (
              <button
                key={b}
                type="button"
                className="chip chip-sm"
                aria-pressed={basis === b}
                onClick={() => changeBasis(b)}
              >
                {HEAT_LABEL[b]}
              </button>
            ))}
          </div>
        </div>

        <div className="cal-scroll">
          {months.map((m, i) => {
            const year = m.slice(0, 4)
            const name = monthName(m)
            const label = monthLabel(m) // "July 2026" — canonical accessible name
            return (
              <Fragment key={m}>
                {(i === 0 || months[i - 1].slice(0, 4) !== year) && (
                  <button
                    type="button"
                    className="pm-year-head"
                    aria-pressed={period.kind === 'year' && period.year === year}
                    onClick={() => onApply({ kind: 'year', year })}
                  >
                    <span className="display">{year}</span>
                    <span className="pm-year-hint">whole year</span>
                  </button>
                )}
                <div className="cal-month" id={`cal-${m}`}>
                  {/* The visible head is just "July" (the year header carries the
                     year); the accessible name keeps both so year-twins stay
                     distinguishable to a screen reader. */}
                  <button
                    type="button"
                    className="cal-month-head"
                    aria-label={label}
                    aria-pressed={period.kind === 'month' && period.month === m}
                    onClick={() => onApply({ kind: 'month', month: m })}
                  >
                    {name}
                  </button>
                  <div className="cal-weekdays" aria-hidden="true">
                    {WEEKDAYS.map((w, wi) => (
                      <span key={wi}>{w}</span>
                    ))}
                  </div>
                  <div className="cal-grid" role="group" aria-label={`Days in ${label}`}>
                    {monthGrid(m).map((d, di) => {
                      if (d === null) return <span key={`${m}-pad-${di}`} aria-hidden="true" />
                      const isEndpoint = hl !== null && (d === hl.from || d === hl.to)
                      const inRange = hl !== null && hl.from < d && d < hl.to
                      const level = heat.get(d)
                      // Selection must always dominate heat: endpoints paint via
                      // aria-pressed (solid accent); in-range via cal-in-range;
                      // heat only when the cell is neither.
                      const className = inRange
                        ? 'cal-day cal-in-range'
                        : level && !isEndpoint
                          ? `cal-day cal-heat-${level}`
                          : 'cal-day'
                      return (
                        <button
                          key={d}
                          type="button"
                          className={className}
                          aria-pressed={isEndpoint}
                          aria-label={formatDateLong(d)}
                          disabled={d > maxAnchor}
                          onClick={() => tapDay(d)}
                        >
                          {Number(d.slice(8))}
                          {dateSet.has(d) && !level && (
                            <span className="pm-dot" aria-hidden="true" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </Fragment>
            )
          })}
        </div>

        {pendingPeriod && (
          <footer className="cal-footer">
            <button
              type="button"
              className="btn-text"
              aria-label="Clear selection"
              onClick={() => setSel(null)}
            >
              ✕
            </button>
            <span className="cal-footer-label">{periodLabel(pendingPeriod, today)}</span>
            <button
              type="button"
              className="btn-ghost cal-apply"
              onClick={() => onApply(pendingPeriod)}
            >
              <span>Apply</span>
              <span aria-hidden="true">→</span>
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}

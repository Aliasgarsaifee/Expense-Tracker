import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db'
import { addMonths, formatDateLong, monthGrid, monthOf, todayISO } from '../lib/dates'
import { periodBounds, periodLabel, type Period } from '../lib/period'

// Monday-first, matching monthGrid and weekStartOf.
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// "July" — the year lives on the year header above, so month heads stay short.
function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long' })
}

interface Props {
  period: Period
  maxAnchor: string // last selectable day (max of today and the newest entry)
  onApply: (p: Period) => void
  onClose: () => void
}

// One calendar to point at: granularity is a consequence of the target — a
// day cell, two day cells (a range), a month name, a year header, a shortcut.
// Mounted only while open (the parent gates it), so the day-dot scan and the
// scroll-to-viewed-month both run fresh per open.
export function PeriodSheet({ period, maxAnchor, onApply, onClose }: Props) {
  const today = todayISO()
  // A day tap opens a pending selection; a second tap on another day closes
  // it into a range; any further tap restarts at that day. Apply commits;
  // the ✕ or closing the sheet discards.
  const [sel, setSel] = useState<{ a: string; b: string | null } | null>(null)

  // Every distinct spentOn date — dots per day, and the oldest month to
  // render. One index scan, cheap at personal-ledger scale.
  const dateKeys = useLiveQuery(() => db.expenses.orderBy('spentOn').uniqueKeys())
  const dateSet = useMemo(() => new Set((dateKeys ?? []).map(String)), [dateKeys])

  const newestMonth = monthOf(maxAnchor)
  const months = useMemo(() => {
    // Newest first, down to the oldest entry (this month on a fresh install)
    // — the direction History and the old year list already scroll.
    let oldest = monthOf(today) < newestMonth ? monthOf(today) : newestMonth
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
    if (scrolled.current || !dateKeys) return
    scrolled.current = true
    const from = periodBounds(period)?.from
    const target = monthOf(from ?? maxAnchor)
    document
      .getElementById(`cal-${target < newestMonth ? target : newestMonth}`)
      ?.scrollIntoView({ block: 'center' })
  }, [dateKeys, period, maxAnchor, newestMonth])

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

  const thisMonth = monthOf(today)
  const thisYear = today.slice(0, 4)
  const shortcuts: { label: string; p: Period; on: boolean }[] = [
    {
      label: 'Today',
      p: { kind: 'day', date: today },
      on: period.kind === 'day' && period.date === today,
    },
    {
      label: 'This month',
      p: { kind: 'month', month: thisMonth },
      on: period.kind === 'month' && period.month === thisMonth,
    },
    {
      label: 'This year',
      p: { kind: 'year', year: thisYear },
      on: period.kind === 'year' && period.year === thisYear,
    },
    { label: 'All time', p: { kind: 'all' }, on: period.kind === 'all' },
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

        <div className="cal-scroll">
          {months.map((m, i) => {
            const year = m.slice(0, 4)
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
                  <button
                    type="button"
                    className="cal-month-head"
                    aria-pressed={period.kind === 'month' && period.month === m}
                    onClick={() => onApply({ kind: 'month', month: m })}
                  >
                    {monthName(m)}
                  </button>
                  <div className="cal-weekdays" aria-hidden="true">
                    {WEEKDAYS.map((w, wi) => (
                      <span key={wi}>{w}</span>
                    ))}
                  </div>
                  <div
                    className="cal-grid"
                    role="group"
                    aria-label={`Days in ${monthName(m)} ${year}`}
                  >
                    {monthGrid(m)
                      .flat()
                      .map((d, di) =>
                        d === null ? (
                          <span key={`${m}-pad-${di}`} aria-hidden="true" />
                        ) : (
                          <button
                            key={d}
                            type="button"
                            className={
                              hl && hl.from < d && d < hl.to
                                ? 'cal-day cal-in-range'
                                : 'cal-day'
                            }
                            aria-pressed={hl !== null && (d === hl.from || d === hl.to)}
                            aria-label={formatDateLong(d)}
                            disabled={d > maxAnchor}
                            onClick={() => tapDay(d)}
                          >
                            {Number(d.slice(8))}
                            {dateSet.has(d) && <span className="pm-dot" aria-hidden="true" />}
                          </button>
                        ),
                      )}
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

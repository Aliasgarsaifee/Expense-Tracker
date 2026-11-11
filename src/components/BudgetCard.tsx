import type { CSSProperties } from 'react'
import {
  budgetBadge,
  budgetCardCopy,
  carriedLine,
  yearCardCopy,
  type BudgetStatus,
  type YearLine,
} from '../lib/budget'

interface Props {
  status: BudgetStatus
  budget: number
  currency: string
  daysLeft: number
  /** What earlier months of the year left in hand; null when none carries in. */
  carried: number | null
  onEdit: () => void
}

// The month's everyday spending against its budget. The whole card is the
// edit button: it is where the owner looks when the number surprises them.
// No aria-label — the visible words are the accessible name, so VoiceOver
// reads the pill and the figures rather than a summary that drops them.
export function BudgetCard({ status, budget, currency, daysLeft, carried, onEdit }: Props) {
  const badge = budgetBadge(status, currency)
  const copy = budgetCardCopy(status, budget, daysLeft, currency)
  const year = carriedLine(carried, currency)
  // Shares, not pixels: the bar is fluid, so CSS turns these into the fill's
  // width and the tick's offset.
  const shares = { '--used': status.usedShare, '--even': status.evenShare } as CSSProperties
  // With no days left there is no "today" in a past month, and on the last
  // day a tick at 100% only repeats the bar's end — so no tick, no label.
  const paced = daysLeft > 0

  return (
    <button type="button" className="budget-card" onClick={onEdit}>
      <span className="budget-head">
        <span className="stat-label">Everyday budget</span>
        <span className="status-pill" data-tone={badge.tone}>
          {badge.text}
        </span>
      </span>
      <span className="budget-left">
        <span className="budget-amount money">{copy.amount}</span>
        <span className="budget-of">{copy.of}</span>
      </span>
      <span className="budget-bar" style={shares} data-paced={paced ? '' : undefined}>
        <span className="budget-track" aria-hidden="true">
          <span className="budget-fill" data-tone={badge.tone} />
        </span>
        {paced && (
          <>
            <span className="budget-tick" aria-hidden="true" />
            <span className="budget-tick-label" aria-hidden="true">
              even pace today
            </span>
          </>
        )}
        <span className="sr-only">{copy.bar}</span>
      </span>
      {copy.perDay && <span className="budget-perday">{copy.perDay}</span>}
      {year && <span className="budget-carried">{year}</span>}
    </button>
  )
}

// The year's everyday spending against the same monthly budget: what the
// complete months add up to, and which of them ran over. Not a button — it has
// nothing of its own to edit; the budget is set from the month card or Settings.
export function YearBudgetCard({ lines, currency }: { lines: YearLine[]; currency: string }) {
  const copy = yearCardCopy(lines, currency)
  return (
    <section className="year-card" aria-label="Everyday against budget">
      <div className="budget-head">
        <h2 className="stat-label">Everyday against budget</h2>
        {copy.pill && (
          <span className="status-pill" data-tone={copy.pill.tone}>
            {copy.pill.text}
          </span>
        )}
      </div>
      {copy.amount && (
        <p className="budget-left">
          <span className="budget-amount money">{copy.amount}</span>
          <span className="budget-of">{copy.after}</span>
        </p>
      )}
      <p className="year-sentence">{copy.sentence}</p>
    </section>
  )
}

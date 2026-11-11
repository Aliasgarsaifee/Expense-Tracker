import type { CSSProperties } from 'react'
import { budgetBadge, budgetCardCopy, type BudgetStatus } from '../lib/budget'

interface Props {
  status: BudgetStatus
  budget: number
  currency: string
  daysLeft: number
  /** Accepted now so call sites settle; renders nothing until the year ledger lands. */
  carried: number | null
  onEdit: () => void
}

// The month's everyday spending against its budget. The whole card is the
// edit button: it is where the owner looks when the number surprises them.
// No aria-label — the visible words are the accessible name, so VoiceOver
// reads the pill and the figures rather than a summary that drops them.
export function BudgetCard({ status, budget, currency, daysLeft, onEdit }: Props) {
  const badge = budgetBadge(status, currency)
  const copy = budgetCardCopy(status, budget, daysLeft, currency)
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
    </button>
  )
}

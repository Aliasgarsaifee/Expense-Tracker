import type { Badge } from '../lib/fixed'
import { formatMoney, formatShare } from '../lib/money'
import { ChevronRightIcon } from './icons'

export interface BreakdownRow {
  key: string
  emoji: string
  label: string
  total: number
  count: number
  /** Present → a status pill in place of the share/count sub-line. */
  badge?: Badge
  /** Absent → a static row: the "Unrecorded" bucket has nothing to drill into. */
  onSelect?: () => void
  selectLabel?: string // accessible name when the row is a button
}

// One ranked slice of a period's spend — by category, by payment method. A bar
// chart was the wrong encoding here: rent is routinely 85% of a month, which
// leaves every other bar a 1–5px hairline (126:1 doesn't fit in 300px, at any
// bar length). The share percentage carries that comparison at any ratio, and
// the amount stays exact beside it.
export function BreakdownList({
  rows,
  currency,
  whole,
}: {
  rows: BreakdownRow[]
  currency: string
  /** The period total the shares are of — the caller has it summed already. */
  whole: number
}) {
  return (
    <ul className="pay-list">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="pay-emoji" aria-hidden="true">
              {r.emoji}
            </span>
            <span className="pay-text">
              <span className="pay-label">{r.label}</span>
              {r.badge ? (
                <span className="status-pill" data-tone={r.badge.tone}>
                  {r.badge.text}
                </span>
              ) : (
                <span className="pay-sub">
                  {formatShare(r.total, whole)} ·{' '}
                  {r.count === 1 ? '1 entry' : `${r.count} entries`}
                </span>
              )}
            </span>
            <span className="leader" aria-hidden="true" />
            <span className="pay-amount money">{formatMoney(r.total, currency)}</span>
          </>
        )
        return (
          <li key={r.key}>
            {r.onSelect ? (
              <button
                type="button"
                className="pay-row pay-row-btn"
                aria-label={
                  r.selectLabel && r.badge ? `${r.selectLabel}, ${r.badge.text}` : r.selectLabel
                }
                onClick={r.onSelect}
              >
                {inner}
                <span className="stat-go" aria-hidden="true">
                  <ChevronRightIcon size={14} />
                </span>
              </button>
            ) : (
              <div className="pay-row">{inner}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

import { yearLedgerCopy, type YearLine } from '../lib/budget'
import { ChevronRightIcon } from './icons'

interface Props {
  lines: YearLine[]
  budget: number
  currency: string
  today: string
  onSelectMonth: (month: string) => void
}

// The year a month at a time against the budget, newest first: what each month
// spent, how far over or under it came, and the balance the year had reached.
// Each row opens its month. The over cell is --negative, but always beside the
// word "over" — colour never carries it alone. The visible cells run together
// without separators for VoiceOver, so each row is named by its whole line.
export function YearLedger({ lines, budget, currency, today, onSelectMonth }: Props) {
  const copy = yearLedgerCopy(lines, budget, currency, today)
  return (
    <section className="chart-card">
      <div className="card-head">
        <h2 className="section-title">Month ledger</h2>
        <span className="card-note">{copy.note}</span>
      </div>
      <ul className="pay-list">
        {copy.rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              className="pay-row pay-row-btn ledger-row"
              aria-label={row.label}
              onClick={() => onSelectMonth(row.key)}
            >
              <span className="pay-text">
                <span className="pay-label">{row.month}</span>
                <span className="pay-sub">{row.spent}</span>
              </span>
              <span className="leader" aria-hidden="true" />
              <span className="ledger-figs">
                <span className="ledger-diff money" data-over={row.over ? '' : undefined}>
                  {row.diff}
                </span>
                <span className="pay-sub">{row.balance}</span>
              </span>
              <span className="ledger-go">
                <ChevronRightIcon size={16} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

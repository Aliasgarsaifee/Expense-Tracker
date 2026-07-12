import { addMonths, monthLabel, monthOf, todayISO } from '../lib/dates'

interface Props {
  month: string | null // null = all time
  onChange: (month: string | null) => void
  allowAll?: boolean // History offers the full-ledger view, Summary does not
  maxMonth?: string // arrows never page past this
}

export function MonthPager({ month, onChange, allowAll, maxMonth }: Props) {
  const current = monthOf(todayISO())

  return (
    <div className="month-switch">
      <button
        type="button"
        className="month-arrow"
        aria-label="Previous month"
        disabled={month === null}
        onClick={() => month && onChange(addMonths(month, -1))}
      >
        ‹
      </button>
      {allowAll ? (
        <button
          type="button"
          className="month-label-btn"
          aria-label={
            month === null
              ? 'Showing all time — switch to one month'
              : `Showing ${monthLabel(month)} — switch to all time`
          }
          onClick={() => onChange(month === null ? current : null)}
        >
          <span className="display">{month === null ? 'All time' : monthLabel(month)}</span>
          <span className="month-label-hint">
            {month === null ? 'tap for monthly' : 'tap for all time'}
          </span>
        </button>
      ) : (
        <h1 className="display">{month === null ? 'All time' : monthLabel(month)}</h1>
      )}
      <button
        type="button"
        className="month-arrow"
        aria-label="Next month"
        disabled={month === null || (maxMonth !== undefined && month >= maxMonth)}
        onClick={() => month && onChange(addMonths(month, 1))}
      >
        ›
      </button>
    </div>
  )
}

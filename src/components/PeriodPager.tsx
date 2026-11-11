import { useState } from 'react'
import { canStepForward, periodLabel, shiftPeriod, type Period } from '../lib/period'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'
import { PeriodSheet } from './PeriodSheet'

interface Props {
  period: Period
  onChange: (p: Period) => void
  today: string
  maxAnchor: string // last selectable day (max of today and the newest entry)
  currency: string
}

// ‹ label ›: arrows step by the period's own unit, the label opens the period
// sheet. It persists nothing and knows no screen; whoever mounts it decides
// what a change means.
export function PeriodPager({ period, onChange, today, maxAnchor, currency }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const label = periodLabel(period, today)
  return (
    <>
      <div className="month-switch">
        <button
          type="button"
          className="month-arrow"
          aria-label="Previous period"
          disabled={period.kind === 'all'}
          onClick={() => onChange(shiftPeriod(period, -1))}
        >
          <ChevronLeftIcon />
        </button>
        <button
          type="button"
          className="month-label-btn"
          aria-haspopup="dialog"
          aria-label={`Showing ${label}. Choose a period`}
          onClick={() => setSheetOpen(true)}
        >
          <span className="display">{label}</span>
          <ChevronDownIcon size={16} />
        </button>
        <button
          type="button"
          className="month-arrow"
          aria-label="Next period"
          disabled={!canStepForward(period, maxAnchor)}
          onClick={() => onChange(shiftPeriod(period, 1))}
        >
          <ChevronRightIcon />
        </button>
      </div>
      {sheetOpen && (
        <PeriodSheet
          period={period}
          maxAnchor={maxAnchor}
          currency={currency}
          onApply={(p) => {
            onChange(p)
            setSheetOpen(false)
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  )
}

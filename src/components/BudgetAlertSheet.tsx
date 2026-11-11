import { useEffect, useId, useRef, type CSSProperties } from 'react'
import { budgetAlertCopy } from '../lib/budget'
import type { BudgetAlert } from '../lib/budgetCheck'

interface Props {
  alert: BudgetAlert | null
  onClose: () => void
  onSeeEntries: () => void
  /** Only for a new entry: an edit has nothing to take back. */
  onUndo?: () => void
}

export function BudgetAlertSheet({ alert, ...body }: Props) {
  if (!alert) return null
  return <SheetBody alert={alert} {...body} />
}

// Raised by a save, not by a tap on the sheet itself, so it takes focus: the
// form behind it lets go of the keyboard and VoiceOver lands on the title.
function SheetBody({
  alert,
  onClose,
  onSeeEntries,
  onUndo,
}: Omit<Props, 'alert'> & { alert: BudgetAlert }) {
  const copy = budgetAlertCopy(alert)
  const titleId = useId()
  const sentenceId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    sheetRef.current?.focus()
  }, [])
  // Shares, not pixels, as on the Summary card: CSS sizes the two parts.
  const shares = { '--within': copy.withinShare, '--over': copy.overShare } as CSSProperties

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        ref={sheetRef}
        className="sheet alert-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={sentenceId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="alert-head">
          <span className="status-pill" data-tone="negative">
            {copy.pill}
          </span>
          <h2 className="display" id={titleId}>
            {copy.title}
          </h2>
          <p className="alert-sentence" id={sentenceId}>
            {copy.sentence}
          </p>
        </div>

        <div className="alert-figures">
          <p className="alert-spent">
            <span className="alert-amount money">{copy.spent}</span>
            <span className="budget-of">{copy.of}</span>
          </p>
          <span className="budget-bar" style={shares}>
            <span className="budget-track" data-split="" aria-hidden="true">
              <span className="budget-fill" />
              <span className="budget-over" />
            </span>
            <span className="sr-only">{copy.bar}</span>
          </span>
          <p className="alert-foot">
            <span>{copy.over}</span>
            <span>{copy.daysLeft}</span>
          </p>
          {copy.yearLine && <p className="alert-year">{copy.yearLine}</p>}
        </div>

        <div className="alert-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            Got it
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              onSeeEntries()
              onClose()
            }}
          >
            <span>See what made it up</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          {onUndo && (
            <button
              type="button"
              className="btn-text btn-text-tap"
              onClick={() => {
                onUndo()
                onClose()
              }}
            >
              Undo this entry
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

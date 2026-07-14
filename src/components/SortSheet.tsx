import type { HistorySort } from '../lib/history'

const OPTIONS: { value: HistorySort; label: string; hint: string }[] = [
  { value: 'newest', label: 'Newest first', hint: 'Most recent day on top' },
  { value: 'oldest', label: 'Oldest first', hint: 'Oldest day on top' },
  { value: 'largest', label: 'Largest first', hint: 'Biggest amount, ranked' },
  { value: 'smallest', label: 'Smallest first', hint: 'Smallest amount, ranked' },
]

interface Props {
  open: boolean
  sort: HistorySort
  onSortChange: (sort: HistorySort) => void
  onClose: () => void
}

// Single-select bottom sheet, same scaffolding as FilterSheet. Unlike the
// live-apply filters, a sort pick applies and closes — it is one choice.
export function SortSheet({ open, sort, onSortChange, onClose }: Props) {
  if (!open) return null
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        className="sheet sort-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Sort history"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-head">
          <h2 className="display">Sort</h2>
          <button className="btn-text" type="button" onClick={onClose}>
            Done
          </button>
        </header>
        <ul className="sort-options" role="radiogroup" aria-label="Sort order">
          {OPTIONS.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                className="sort-option"
                role="radio"
                aria-checked={sort === o.value}
                onClick={() => {
                  onSortChange(o.value)
                  onClose()
                }}
              >
                <span className="sort-option-text">
                  <span className="sort-option-label">{o.label}</span>
                  <span className="sort-option-hint">{o.hint}</span>
                </span>
                {sort === o.value && (
                  <span className="sort-option-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { isFixedCategory, listCategories, setCategoryFixed } from '../db'

interface Props {
  open: boolean
  onClose: () => void
}

export function BudgetSheet({ open, onClose }: Props) {
  if (!open) return null
  return <SheetBody onClose={onClose} />
}

// Changes save on tap — the live query repaints the chips and every other
// reader (Settings count, Summary split) from the same write, so there is no
// draft state to confirm or discard.
function SheetBody({ onClose }: Omit<Props, 'open'>) {
  const categories = useLiveQuery(() => listCategories())

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Fixed costs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-head">
          <h2 className="display">Fixed costs</h2>
          <button className="btn-text" type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="drawer-note">Counted once a month and kept out of everyday spending.</p>
        <div className="chip-grid" role="group" aria-label="Fixed cost categories">
          {(categories ?? []).map((c) => {
            const fixed = isFixedCategory(c)
            return (
              <button
                key={c.id}
                type="button"
                className="chip chip-tall"
                aria-pressed={fixed}
                onClick={() =>
                  setCategoryFixed(c.id, !fixed).catch((err) =>
                    console.error('could not save fixed flag', err),
                  )
                }
              >
                <span aria-hidden="true">{c.emoji}</span> {c.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

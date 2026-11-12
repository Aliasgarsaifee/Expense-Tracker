import { useLiveQuery } from 'dexie-react-hooks'
import { isFixedCategory, listCategories, setCategoryFixed } from '../db'
import { formatMoney, parseAmount } from '../lib/money'
import { useDialog } from '../lib/useDialog'
import { Dialog } from './Dialog'
import { ChevronRightIcon } from './icons'

interface Props {
  open: boolean
  onClose: () => void
  currency: string
  budget: number | null
  onBudgetChange: (amount: number | null) => void
}

export function BudgetSheet({ open, ...body }: Props) {
  if (!open) return null
  return <SheetBody {...body} />
}

// Changes save on tap — the live query repaints the chips and every other
// reader (Summary split) from the same write, and the budget goes straight
// back to App, so there is no draft state to confirm or discard.
function SheetBody({ onClose, currency, budget, onBudgetChange }: Omit<Props, 'open'>) {
  const categories = useLiveQuery(() => listCategories())
  const { dialog, close, showAlert, askPrompt } = useDialog()

  async function editBudget() {
    const text = await askPrompt({
      title: 'Monthly budget',
      label: `Everyday spending in ${currency}`,
      initialValue: budget === null ? '' : String(budget),
      inputMode: 'decimal',
    })
    if (text === null) return
    const amount = parseAmount(text)
    if (amount === null) {
      await showAlert('Enter an amount above zero')
      return
    }
    onBudgetChange(amount)
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Budget"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-head">
          <h2 className="display">Budget</h2>
          <button className="btn-text" type="button" onClick={onClose}>
            Done
          </button>
        </header>
        <p className="budget-intro">
          You get two alerts: at 80% of the budget, and when an entry takes you past it.
        </p>

        <section className="budget-section">
          <h3 className="drawer-title">Monthly budget</h3>
          <button
            type="button"
            className="budget-row"
            aria-haspopup="dialog"
            onClick={() => void editBudget()}
          >
            <span className="budget-row-text">
              <span className="budget-row-label">Everyday spending</span>
              <span className="budget-row-sub">Everything not marked fixed</span>
            </span>
            <span className="budget-row-value">
              {budget === null ? (
                <span className="budget-row-unset">Not set</span>
              ) : (
                <span className="money">{formatMoney(budget, currency)}</span>
              )}
              <ChevronRightIcon />
            </span>
          </button>
          {/* No confirm: setting it again is one tap and a number away. */}
          {budget !== null && (
            <button
              type="button"
              className="btn-text btn-text-tap btn-quiet"
              onClick={() => onBudgetChange(null)}
            >
              Remove the budget
            </button>
          )}
        </section>

        <section className="budget-section">
          <h3 className="drawer-title">Fixed costs</h3>
          <p className="drawer-note">
            Tap what you pay once a month, like rent. These stay out of the budget and the everyday
            average, and the pace counts them once.
          </p>
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
        </section>
      </div>
      <Dialog state={dialog} onClose={close} />
    </div>
  )
}

import { useRef } from 'react'
import { deleteExpense, updateExpense, type Expense } from '../db'
import { tapFeedback } from '../lib/haptics'
import { useKeyboardInset } from '../lib/useKeyboardInset'
import { ExpenseForm, type ExpenseFormValues } from './ExpenseForm'

interface Props {
  expense: Expense | null
  onClose: () => void
}

export function EditSheet({ expense, onClose }: Props) {
  if (!expense) return null
  return <SheetBody expense={expense} onClose={onClose} />
}

function SheetBody({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  useKeyboardInset(sheetRef)

  async function save(values: ExpenseFormValues) {
    try {
      await updateExpense(expense.id, {
        amount: values.amount,
        currency: values.currency,
        category: values.category,
        spentOn: values.spentOn,
        note: values.note,
        paymentMethodId: values.paymentMethodId,
      })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not save the changes.')
      return // keep the sheet open with the edited values
    }
    void tapFeedback()
    onClose()
  }

  async function remove() {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return
    try {
      await deleteExpense(expense.id)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not delete the expense.')
      return
    }
    onClose()
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Edit expense"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-head">
          <h2 className="display">Edit entry</h2>
          <button className="btn-text" type="button" onClick={onClose}>
            Cancel
          </button>
        </header>
        <ExpenseForm
          key={expense.id}
          initial={expense}
          submitLabel="Save changes"
          onSubmit={save}
        />
        <button className="btn-danger" type="button" onClick={remove}>
          Delete expense
        </button>
      </div>
    </div>
  )
}

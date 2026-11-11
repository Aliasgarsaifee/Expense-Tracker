import { useRef } from 'react'
import { deleteExpense, updateExpense, type Expense } from '../db'
import { useDialog } from '../lib/useDialog'
import { tapFeedback } from '../lib/haptics'
import { useKeyboardInset } from '../lib/useKeyboardInset'
import { Dialog } from './Dialog'
import { ExpenseForm, type ExpenseFormValues } from './ExpenseForm'

interface Props {
  expense: Expense | null
  /** The currency entries count in; the form converts a foreign amount into it. */
  home: string
  onClose: () => void
  /** Delete succeeded — the screen owns the undo toast (the sheet is gone by then). */
  onDeleted: (expense: Expense) => void
  /** Update succeeded: the entry as it was, and as it now is in the database. */
  onSaved?: (before: Expense, after: Expense) => void
}

export function EditSheet({ expense, home, onClose, onDeleted, onSaved }: Props) {
  if (!expense) return null
  return (
    <SheetBody
      expense={expense}
      home={home}
      onClose={onClose}
      onDeleted={onDeleted}
      onSaved={onSaved}
    />
  )
}

function SheetBody({
  expense,
  home,
  onClose,
  onDeleted,
  onSaved,
}: Omit<Props, 'expense'> & { expense: Expense }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  useKeyboardInset(sheetRef)
  const { dialog, close, showAlert, askConfirm } = useDialog()

  async function save(values: ExpenseFormValues) {
    const changes = {
      amount: values.amount,
      currency: values.currency,
      category: values.category,
      spentOn: values.spentOn,
      note: values.note,
      paymentMethodId: values.paymentMethodId,
      // Present even when undefined: that is what deletes a stale memo, and
      // the "after" entry below must not keep one either.
      paid: values.paid,
    }
    try {
      await updateExpense(expense.id, changes)
    } catch (err) {
      await showAlert(
        'Could not save',
        err instanceof Error ? err.message : 'Could not save the changes.',
      )
      return // keep the sheet open with the edited values
    }
    void tapFeedback()
    onClose()
    // updateExpense returns nothing, so the stored record is rebuilt from the
    // very changes it was given.
    onSaved?.(expense, { ...expense, ...changes })
  }

  async function remove() {
    // The confirm stays — this ledger is the only copy — but it can no longer
    // claim the delete is final: the screen offers Undo once the sheet closes.
    const ok = await askConfirm({
      title: 'Delete this expense?',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteExpense(expense.id)
    } catch (err) {
      await showAlert(
        'Could not delete',
        err instanceof Error ? err.message : 'Could not delete the expense.',
      )
      return
    }
    onDeleted(expense)
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
          home={home}
          submitLabel="Save changes"
          onSubmit={save}
        />
        <button className="btn-danger" type="button" onClick={remove}>
          Delete expense
        </button>
      </div>
      {/* Sibling of the sheet body, not a child of it: the dialog owns the
          whole viewport while it is up. */}
      <Dialog state={dialog} onClose={close} />
    </div>
  )
}

import { useRef, useState } from 'react'
import { ExpenseForm, type ExpenseFormValues } from '../components/ExpenseForm'
import { addExpense, CASH_METHOD_ID, db, deleteExpense } from '../db'
import { tapFeedback } from '../lib/haptics'
import { formatMoney } from '../lib/money'
import { getPref, PREFS, setPref } from '../lib/prefs'

interface Toast {
  message: string
  /** Present while the toast can still take the entry back. */
  undoId?: string
}

export function AddScreen() {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Read once at mount: the form keeps its own state from then on, so the
  // fast path stays "type amount, tap Add" with everything else remembered.
  const initial = useRef({
    currency: getPref(PREFS.defaultCurrency, 'INR'),
    category: getPref(PREFS.lastCategory, 'Food'),
    paymentMethodId: getPref(PREFS.lastPaymentMethod, CASH_METHOD_ID),
  })

  function showToast(next: Toast, ms: number) {
    clearTimeout(timer.current)
    setToast(next)
    timer.current = setTimeout(() => setToast(null), ms)
  }

  async function add(values: ExpenseFormValues) {
    let created
    try {
      created = await addExpense(values)
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Could not save the expense.',
      )
      throw err // tell the form not to clear the entered values
    }
    setPref(PREFS.lastCategory, created.category)
    if (created.paymentMethodId) {
      setPref(PREFS.lastPaymentMethod, created.paymentMethodId)
    }
    void tapFeedback()
    // The category's own emoji, custom ones included — label isn't indexed,
    // and the table is tiny, so a scan beats widening the schema for a toast.
    const emoji =
      (await db.categories.toArray()).find((c) => c.label === created.category)
        ?.emoji ?? '🧾'
    showToast(
      {
        message: `${emoji} ${formatMoney(created.amount, created.currency)} added to ${created.category}`,
        undoId: created.id,
      },
      4200, // long enough to read and still reach Undo
    )
  }

  async function undo(id: string) {
    try {
      await deleteExpense(id)
    } catch {
      return // the entry stays; History still offers delete
    }
    showToast({ message: 'Entry removed' }, 2000)
  }

  const undoId = toast?.undoId

  return (
    <div className="screen">
      <header className="screen-head">
        <p className="eyebrow">Expense Tracker</p>
        <h1 className="display">New entry</h1>
      </header>
      <ExpenseForm
        submitLabel="Add to ledger"
        onSubmit={add}
        autoReset
        initial={initial.current}
      />
      {toast && (
        <output className="toast" aria-live="polite">
          <span className="toast-text">{toast.message}</span>
          {undoId !== undefined && (
            <button
              type="button"
              className="toast-undo"
              onClick={() => void undo(undoId)}
            >
              Undo
            </button>
          )}
        </output>
      )}
    </div>
  )
}

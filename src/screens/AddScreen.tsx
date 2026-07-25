import { useRef } from 'react'
import { Dialog } from '../components/Dialog'
import { ExpenseForm, type ExpenseFormValues } from '../components/ExpenseForm'
import { Toast } from '../components/Toast'
import { addExpense, CASH_METHOD_ID, db, deleteExpense } from '../db'
import { tapFeedback } from '../lib/haptics'
import { formatMoney } from '../lib/money'
import { useDialog } from '../lib/useDialog'
import { getPref, PREFS, setPref } from '../lib/prefs'
import { useToast } from '../lib/useToast'

export function AddScreen() {
  const { toast, show } = useToast()
  const { dialog, close, showAlert } = useDialog()
  // Read once at mount: the form keeps its own state from then on, so the
  // fast path stays "type amount, tap Add" with everything else remembered.
  const initial = useRef({
    currency: getPref(PREFS.defaultCurrency, 'INR'),
    category: getPref(PREFS.lastCategory, 'Food'),
    paymentMethodId: getPref(PREFS.lastPaymentMethod, CASH_METHOD_ID),
  })

  async function add(values: ExpenseFormValues) {
    let created
    try {
      created = await addExpense(values)
    } catch (err) {
      await showAlert(
        'Could not save',
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
    show({
      message: `${emoji} ${formatMoney(created.amount, created.currency)} added to ${created.category}`,
      onUndo: () => undo(created.id),
    })
  }

  async function undo(id: string) {
    try {
      await deleteExpense(id)
    } catch {
      return // the entry stays; History still offers delete
    }
    show({ message: 'Entry removed' }, 2000)
  }

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
      <Toast state={toast} />
      <Dialog state={dialog} onClose={close} />
    </div>
  )
}

import { useRef, useState } from 'react'
import { ExpenseForm, type ExpenseFormValues } from '../components/ExpenseForm'
import { addExpense, CASH_METHOD_ID } from '../db'
import { categoryEmoji } from '../lib/categoryMeta'
import { formatMoney } from '../lib/money'
import { getPref, PREFS, setPref } from '../lib/prefs'

export function AddScreen() {
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
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
      window.alert(
        err instanceof Error ? err.message : 'Could not save the expense.',
      )
      throw err // tell the form not to clear the entered values
    }
    setPref(PREFS.lastCategory, created.category)
    if (created.paymentMethodId) {
      setPref(PREFS.lastPaymentMethod, created.paymentMethodId)
    }
    clearTimeout(timer.current)
    setToast(
      `${categoryEmoji(created.category)} ${formatMoney(created.amount, created.currency)} added to ${created.category}`,
    )
    timer.current = setTimeout(() => setToast(null), 2400)
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
      {toast && (
        <output className="toast" aria-live="polite">
          {toast}
        </output>
      )}
    </div>
  )
}

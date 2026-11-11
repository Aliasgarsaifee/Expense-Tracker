import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  CASH_METHOD_ID,
  db,
  listCategories,
  listPaymentMethods,
  methodRecency,
  type Category,
  type Expense,
  type PaymentMethod,
} from '../db'
import { currencySymbol } from '../lib/currencies'
import { todayISO } from '../lib/dates'
import { tapFeedback } from '../lib/haptics'
import { formatMoney, parseAmount } from '../lib/money'
import { logAgainChoices } from '../lib/recent'
import { AddCategorySheet } from './AddCategorySheet'
import { AddMethodSheet } from './AddMethodSheet'
import { CurrencySheet } from './CurrencySheet'
import { DateField } from './DateField'
import { EntryRow } from './EntryRow'
import { PaymentPicker } from './PaymentPicker'
import { ChevronDownIcon, AddIcon } from './icons'

export interface ExpenseFormValues {
  amount: number
  currency: string
  category: string
  spentOn: string
  note?: string
  paymentMethodId?: string
}

interface Props {
  initial?: Partial<ExpenseFormValues>
  /** A function lets the button name what it will save (Add screen). */
  submitLabel:
    | string
    | ((draft: {
        amount: number | null
        currency: string
        category: string
        spentOn: string
      }) => string)
  onSubmit: (values: ExpenseFormValues) => Promise<void> | void
  /** Add screen: clear amount + note after submit, keep category and date. */
  autoReset?: boolean
  /** Add screen: newest entries, offered below the button as "Log again". */
  recent?: Expense[]
}

export function ExpenseForm({ initial, submitLabel, onSubmit, autoReset, recent }: Props) {
  const [amountText, setAmountText] = useState(
    initial?.amount !== undefined ? String(initial.amount) : '',
  )
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR')
  const [paymentMethodId, setPaymentMethodId] = useState(initial?.paymentMethodId)
  const [category, setCategory] = useState(initial?.category ?? 'Food')
  const [spentOn, setSpentOn] = useState(initial?.spentOn ?? todayISO())
  const [note, setNote] = useState(initial?.note ?? '')
  const [pickingCurrency, setPickingCurrency] = useState(false)
  const [addingMethod, setAddingMethod] = useState(false)
  const [addingCategory, setAddingCategory] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Ref, not just state: state guards re-render too late to stop two
  // submits landing in the same event-loop task.
  const inFlight = useRef(false)
  // A method/category just created here isn't in the liveQuery yet; don't let
  // the reconcile effects stomp the selection before the query catches up.
  const justCreatedMethod = useRef<string | null>(null)
  // Edit mode arrives with a date; the Add screen fills today and may sit
  // mounted across midnight, so we refresh it on resume until hand-picked.
  const userPickedDate = useRef(initial?.spentOn !== undefined)

  useEffect(() => {
    if (userPickedDate.current) return
    const refresh = () => {
      if (document.visibilityState === 'visible' && !userPickedDate.current) {
        setSpentOn(todayISO())
      }
    }
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])

  const methods = useLiveQuery(() => listPaymentMethods(), [])
  // Recent-first ordering in the picker; falls back to an empty map until the
  // query resolves (picker then orders by createdAt, as before).
  const recency = useLiveQuery(() => methodRecency(), []) ?? new Map<string, string>()
  const categories = useLiveQuery(() => listCategories(), [])
  // An EDITED entry may point at an archived method; keep it pickable instead
  // of silently re-filing the expense. The Add screen never offers archived
  // methods — that is what archiving is for.
  const selectedArchived = useLiveQuery(
    async () =>
      !autoReset && paymentMethodId
        ? ((await db.paymentMethods.get(paymentMethodId)) ?? null)
        : null,
    [autoReset, paymentMethodId],
  )
  const pickableMethods = useMemo(() => {
    const active = methods ?? []
    if (
      selectedArchived?.archived &&
      !active.some((m: PaymentMethod) => m.id === selectedArchived.id)
    ) {
      return [...active, selectedArchived]
    }
    return active
  }, [methods, selectedArchived])

  // The remembered last-used method may have been deleted/archived since; on
  // the Add screen only, fall back to Cash so the picker always has a valid
  // selection. Never touch a locally just-created id awaiting the liveQuery.
  useEffect(() => {
    if (!autoReset || !methods || !paymentMethodId) return
    if (pickableMethods.some((m) => m.id === paymentMethodId)) {
      if (justCreatedMethod.current === paymentMethodId) justCreatedMethod.current = null
      return
    }
    if (justCreatedMethod.current === paymentMethodId) return
    setPaymentMethodId(CASH_METHOD_ID)
  }, [autoReset, methods, pickableMethods, paymentMethodId])

  // A backup import (or an archived/deleted category on an edited entry) may
  // carry a category outside the active list; keep it selectable.
  const categoryChips = useMemo(() => {
    const active = categories ?? []
    if (category && !active.some((c: Category) => c.label === category)) {
      return [
        ...active,
        { id: `__ad-hoc__${category}`, label: category, emoji: '🏷️', createdAt: '' },
      ]
    }
    return active
  }, [categories, category])

  const amount = parseAmount(amountText)

  // Only active categories and methods (not pickableMethods, which in Edit
  // mode also holds an archived one); no list until both queries have landed.
  const logAgain = useMemo(
    () =>
      recent && categories && methods
        ? logAgainChoices(
            recent,
            categories.map((c) => c.label),
            methods.map((m) => m.id),
          )
        : [],
    [recent, categories, methods],
  )

  // Fills the form's own state and saves nothing; the date is left as it is.
  function fillFrom(x: Expense) {
    setAmountText(String(x.amount))
    setCurrency(x.currency)
    setCategory(x.category)
    setNote(x.note ?? '')
    if (x.paymentMethodId) setPaymentMethodId(x.paymentMethodId)
    void tapFeedback()
    window.scrollTo(0, 0)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (amount === null || inFlight.current) return // no double-tap duplicates
    // Let go of the keyboard before saving. Submitting from a field (Done on
    // the note) keeps that field focused, and the iOS keyboard overlays the
    // bottom of the screen — exactly where the save toast sits. Its Undo and
    // the budget heads-up would live and die behind the keys.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    inFlight.current = true
    setSubmitting(true)
    const trimmed = note.trim()
    try {
      await onSubmit({
        amount,
        currency,
        category,
        spentOn,
        note: trimmed === '' ? undefined : trimmed,
        paymentMethodId,
      })
      if (autoReset) {
        setAmountText('')
        setNote('')
      }
    } catch {
      // onSubmit already alerted; keep the values so nothing is lost.
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <>
      <form className="expense-form" onSubmit={handleSubmit}>
        <div className="amount-field">
          <button
            type="button"
            className="currency-btn"
            aria-label={`Currency: ${currency}. Tap to change`}
            onClick={() => setPickingCurrency(true)}
          >
            <span className="currency-symbol money" aria-hidden="true">
              {currencySymbol(currency)}
            </span>
            <span className="currency-code" aria-hidden="true">
              {currency}
              <ChevronDownIcon size={12} />
            </span>
          </button>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            aria-label={`Amount in ${currency}`}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
          />
        </div>

        <div className="field">
          <span>Category</span>
          <div className="chip-grid" role="group" aria-label="Category">
            {categoryChips.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip"
                aria-pressed={c.label === category}
                onClick={() => setCategory(c.label)}
              >
                <span aria-hidden="true">{c.emoji}</span> {c.label}
              </button>
            ))}
            <button
              type="button"
              className="chip chip-add"
              aria-label="Add a category"
              onClick={() => setAddingCategory(true)}
            >
              <AddIcon size={18} />
            </button>
          </div>
        </div>

        <div className="detail-group">
          <PaymentPicker
            methods={pickableMethods}
            selectedId={paymentMethodId}
            recency={recency}
            onSelect={setPaymentMethodId}
            onAddNew={() => setAddingMethod(true)}
          />
          <DateField
            value={spentOn}
            onChange={(iso) => {
              userPickedDate.current = true
              setSpentOn(iso)
            }}
          />
        </div>

        {/* Last on purpose: its Done key saves, so everything that gets saved
            (category, method, date) must already be in view above the keyboard. */}
        <label className="field">
          <span>What was it?</span>
          <input
            type="text"
            placeholder="e.g. auto to office"
            maxLength={120}
            enterKeyHint="done"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <button
          className="btn-primary"
          type="submit"
          disabled={amount === null || submitting}
        >
          {typeof submitLabel === 'function'
            ? submitLabel({ amount, currency, category, spentOn })
            : submitLabel}
        </button>

        {logAgain.length > 0 && (
          <section className="log-again" aria-label="Log again">
            <p className="field-label">Log again</p>
            <ul className="entries">
              {logAgain.map((x) => {
                const primary = x.note || x.category
                const amountLabel = formatMoney(x.amount, x.currency)
                const methodLabel = methods?.find((m) => m.id === x.paymentMethodId)?.label
                return (
                  <EntryRow
                    key={x.id}
                    emoji={categories?.find((c) => c.label === x.category)?.emoji ?? '🏷️'}
                    primary={primary}
                    sub={[x.note ? x.category : null, methodLabel].filter(Boolean).join(' · ')}
                    amount={amountLabel}
                    ariaLabel={`Fill the form with ${primary}, ${amountLabel}`}
                    onClick={() => fillFrom(x)}
                  />
                )
              })}
            </ul>
          </section>
        )}
      </form>
      {/* Sheets carry their own <form>; keep them outside this one — nested
          forms are invalid HTML and the browser silently drops them. */}
      <CurrencySheet
        open={pickingCurrency}
        selected={currency}
        onSelect={setCurrency}
        onClose={() => setPickingCurrency(false)}
      />
      <AddMethodSheet
        open={addingMethod}
        onCreated={(m) => {
          justCreatedMethod.current = m.id
          setPaymentMethodId(m.id)
        }}
        onClose={() => setAddingMethod(false)}
      />
      <AddCategorySheet
        open={addingCategory}
        onCreated={(c) => setCategory(c.label)}
        onClose={() => setAddingCategory(false)}
      />
    </>
  )
}

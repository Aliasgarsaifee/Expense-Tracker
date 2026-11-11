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
  type Paid,
  type PaymentMethod,
} from '../db'
import { entryValues, paidLabel, paidOf, rateLine, seedRate } from '../lib/conversion'
import { currencySymbol } from '../lib/currencies'
import { todayISO } from '../lib/dates'
import { tapFeedback } from '../lib/haptics'
import { formatMoney, parseAmount, roundHome } from '../lib/money'
import { logAgainChoices } from '../lib/recent'
import { useDialog } from '../lib/useDialog'
import { useRate } from '../lib/useRate'
import { AddCategorySheet } from './AddCategorySheet'
import { AddMethodSheet } from './AddMethodSheet'
import { CurrencySheet } from './CurrencySheet'
import { DateField } from './DateField'
import { Dialog } from './Dialog'
import { EntryRow } from './EntryRow'
import { PaymentPicker } from './PaymentPicker'
import { ChevronDownIcon, ChevronRightIcon, AddIcon } from './icons'

export interface ExpenseFormValues {
  amount: number
  currency: string
  category: string
  spentOn: string
  note?: string
  paymentMethodId?: string
  paid?: Paid
}

interface Props {
  initial?: Partial<ExpenseFormValues>
  /** The currency entries count in; a foreign amount is converted into it. */
  home: string
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

export function ExpenseForm({ initial, home, submitLabel, onSubmit, autoReset, recent }: Props) {
  // The amount field and currency button always mean what was paid: for a
  // converted entry that is the memo, not the stored home value.
  const shownAmount = initial?.paid ? initial.paid.amount : initial?.amount
  const [amountText, setAmountText] = useState(
    shownAmount !== undefined ? String(shownAmount) : '',
  )
  const [currency, setCurrency] = useState(
    initial?.paid ? initial.paid.currency : (initial?.currency ?? 'INR'),
  )
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
  // Edit of a converted entry: the rate it was booked at, read once. It stands
  // only for the currency and day it was booked at, so it carries both, and
  // reusing it is what lets Edit open without a network request.
  const [seed] = useState(() => {
    const s = seedRate(initial, home)
    return s && { ...s, currency: initial?.paid?.currency, spentOn: initial?.spentOn }
  })
  // A home value the owner typed, kept as a rate so that correcting the amount
  // scales it. Survives a change of date or amount; a change of currency drops it.
  const [handRate, setHandRate] = useState(() => (seed?.byHand ? seed.rate : null))
  const { dialog, close, showAlert, askPrompt } = useDialog()

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

  const seedApplies =
    seed !== null && !seed.byHand && currency === seed.currency && spentOn === seed.spentOn
  const fetched = useRate(currency, home, spentOn, handRate !== null || seedApplies)
  const rate = handRate ?? (seedApplies ? seed.rate : fetched.rate)
  const byHand = handRate !== null
  const line = rateLine({ typed: amount, currency, home, rate, loading: fetched.loading, byHand })

  function chooseCurrency(code: string) {
    if (code === currency) return // re-picking the same one is not a change
    setCurrency(code)
    setHandRate(null)
  }

  async function editValue(typed: number) {
    // Prefilled with the value the line shows, which is what Save would write.
    const shown =
      rate === null ? '' : String(entryValues({ amount: typed, currency }, home, rate, byHand).amount)
    const text = await askPrompt({
      title: `Value in ${home}`,
      label: byHand
        ? "Type what your card charged, or leave empty to use the day's rate."
        : rate !== null
          ? `The day's rate gives ${formatMoney(roundHome(typed * rate), home)}. Type what your card charged.`
          : `Type what your card charged in ${home}.`,
      initialValue: shown,
      inputMode: 'decimal',
      allowEmpty: byHand,
    })
    if (text === null) return
    if (text.trim() === '') {
      setHandRate(null)
      return
    }
    const value = parseAmount(text)
    if (value === null) {
      await showAlert('Enter an amount above zero')
      return
    }
    setHandRate(value / typed)
  }

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
  // It fills what was paid, so the rate is the one for the form's date, never
  // the old entry's.
  function fillFrom(x: Expense) {
    const paid = paidOf(x)
    setAmountText(String(paid.amount))
    setCurrency(paid.currency)
    setHandRate(null)
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
      // A foreign amount with a rate saves as its home value with the memo; with
      // no rate yet it saves as typed and the background fill-in converts it.
      await onSubmit({
        ...entryValues({ amount, currency }, home, rate, byHand),
        category,
        spentOn,
        note: trimmed === '' ? undefined : trimmed,
        paymentMethodId,
      })
      if (autoReset) {
        setAmountText('')
        setNote('')
        setHandRate(null)
        // Back to the amount for the next entry. The note is the last field,
        // so typing it leaves the page panned up, and iOS keeps it there
        // after the keyboard closes.
        window.scrollTo(0, 0)
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

        {/* Home currency: nothing here at all. Foreign: what it counts as, a
            button once there is an amount to put a value on. One height in
            every state, so typing the first digit moves nothing below. */}
        {line !== null &&
          (amount !== null ? (
            <button
              type="button"
              className="rate-line"
              aria-haspopup="dialog"
              aria-label={`${line.replace(/\.$/, '')}. Change the value`}
              onClick={() => void editValue(amount)}
            >
              <span>{line}</span>
              <ChevronRightIcon size={18} />
            </button>
          ) : (
            <p className="rate-line">{line}</p>
          ))}

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
            loaded={methods !== undefined && selectedArchived !== undefined}
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
                const paid = paidLabel(x)
                return (
                  <EntryRow
                    key={x.id}
                    emoji={categories?.find((c) => c.label === x.category)?.emoji ?? '🏷️'}
                    primary={primary}
                    sub={[x.note ? x.category : null, methodLabel, paid]
                      .filter(Boolean)
                      .join(' · ')}
                    amount={amountLabel}
                    // A tap fills what was paid, so that is what it announces.
                    ariaLabel={`Fill the form with ${primary}, ${paid ?? amountLabel}`}
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
        onSelect={chooseCurrency}
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
      <Dialog state={dialog} onClose={close} />
    </>
  )
}

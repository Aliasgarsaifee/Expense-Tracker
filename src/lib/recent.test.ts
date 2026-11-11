import { describe, expect, it } from 'vitest'
import type { Expense } from '../db'
import { shortDayMonth } from './dates'
import { formatTotals } from './history'
import { formatMoney } from './money'
import { addButtonLabel, logAgainChoices, todaySoFar } from './recent'

// `in` check, not `??`: paymentMethodId: undefined must really mean "no method".
const e = (overrides: Partial<Expense> = {}): Expense => ({
  id: 'x',
  amount: 280,
  currency: 'INR',
  category: 'Food',
  spentOn: '2026-11-11',
  createdAt: '2026-11-11T08:00:00.000Z',
  ...('paymentMethodId' in overrides ? {} : { paymentMethodId: 'pm-cash' }),
  ...overrides,
})

const cats = ['Food', 'Transport']
const methods = ['pm-cash', 'pm-gpay']

describe('logAgainChoices', () => {
  it('keeps the first three distinct entries in order', () => {
    const latest = [
      e({ id: 'a', note: 'Breakfast' }),
      e({ id: 'b', note: ' breakfast ' }), // same after trim + case fold
      e({ id: 'c', note: 'Auto', category: 'Transport', amount: 90 }),
      e({ id: 'd', note: 'Breakfast', amount: 300 }), // different amount
      e({ id: 'f', note: 'Tea', amount: 20 }),
    ]
    expect(logAgainChoices(latest, cats, methods).map((x) => x.id)).toEqual(['a', 'c', 'd'])
  })
  it('treats two entries paid alike as one choice, whatever the rate did', () => {
    const a = e({ id: 'a', amount: 3076, paid: { amount: 120, currency: 'AED' } })
    const b = e({ id: 'b', amount: 3080, paid: { amount: 120, currency: 'AED' } })
    expect(logAgainChoices([a, b], cats, methods).map((x) => x.id)).toEqual(['a'])
  })
  it('treats a different method or currency as a different entry', () => {
    const latest = [
      e({ id: 'a' }),
      e({ id: 'b', paymentMethodId: 'pm-gpay' }),
      e({ id: 'c', currency: 'USD' }),
    ]
    expect(logAgainChoices(latest, cats, methods).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
  it('skips an archived or unknown category and an archived or deleted method', () => {
    const latest = [
      e({ id: 'a', category: 'Rent' }),
      e({ id: 'b', paymentMethodId: 'pm-gone' }),
      e({ id: 'c' }),
    ]
    expect(logAgainChoices(latest, cats, methods).map((x) => x.id)).toEqual(['c'])
  })
  it('offers an entry with no method recorded', () => {
    expect(
      logAgainChoices([e({ id: 'a', paymentMethodId: undefined })], cats, methods),
    ).toHaveLength(1)
  })
  it('honours the limit and an empty ledger', () => {
    expect(logAgainChoices([], cats, methods)).toEqual([])
    expect(
      logAgainChoices([e({ id: 'a' }), e({ id: 'b', amount: 1 })], cats, methods, 1),
    ).toHaveLength(1)
  })
})

describe('todaySoFar', () => {
  it('says what today adds up to, per currency', () => {
    expect(todaySoFar([], 'INR')).toBe('Nothing logged today')
    expect(todaySoFar([e({ amount: 280 }), e({ amount: 120 })], 'INR')).toBe(
      'Today so far · ₹400',
    )
    expect(todaySoFar([e({ amount: 400 }), e({ amount: 12, currency: 'USD' })], 'INR')).toBe(
      `Today so far · ${formatTotals({ INR: 400, USD: 12 }, 'INR')}`,
    )
  })
})

describe('addButtonLabel', () => {
  it('names the amount and category it will add', () => {
    expect(addButtonLabel(280, 'INR', 'Food', '2026-11-11', '2026-11-11')).toBe('Add ₹280 · Food')
  })
  it('adds the date when it is not today', () => {
    expect(addButtonLabel(280, 'INR', 'Food', '2026-11-05', '2026-11-11'))
      .toBe(`Add ₹280 · Food · ${shortDayMonth('2026-11-05')}`)
  })
  it('keeps the plain label until there is an amount', () => {
    expect(addButtonLabel(null, 'INR', 'Food', '2026-11-11', '2026-11-11')).toBe('Add to ledger')
  })
  it('formats in the entry currency', () => {
    expect(addButtonLabel(12.5, 'USD', 'Travel', '2026-11-11', '2026-11-11'))
      .toBe(`Add ${formatMoney(12.5, 'USD')} · Travel`)
  })
})

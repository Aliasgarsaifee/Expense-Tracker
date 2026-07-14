import { describe, expect, it } from 'vitest'
import { CASH_METHOD_ID, UPI_METHOD_ID, type Expense } from '../db'
import {
  filterExpenses,
  formatTotals,
  groupByDay,
  groupByMonth,
} from './history'
import { formatMoney } from './money'

let seq = 0
function exp(over: Partial<Expense> = {}): Expense {
  seq += 1
  return {
    id: `e${seq}`,
    amount: 100,
    currency: 'INR',
    category: 'Food',
    spentOn: '2026-07-12',
    createdAt: '2026-07-12T10:00:00.000Z',
    ...over,
  }
}

describe('filterExpenses', () => {
  it('returns everything when the filter has no criteria', () => {
    const rows = [exp(), exp({ spentOn: '2026-06-01' })]
    expect(filterExpenses(rows, {})).toEqual(rows)
    expect(
      filterExpenses(rows, {
        month: null,
        paymentMethodIds: null,
        categories: null,
        from: null,
        to: null,
        query: '',
      }),
    ).toEqual(rows)
    expect(filterExpenses(rows, { paymentMethodIds: [], categories: [] })).toEqual(rows)
    expect(filterExpenses(rows, { query: '   ' })).toEqual(rows)
  })

  it('keeps only expenses whose spentOn starts with the month', () => {
    const july12 = exp({ spentOn: '2026-07-12' })
    const july1 = exp({ spentOn: '2026-07-01' })
    const june30 = exp({ spentOn: '2026-06-30' })
    expect(filterExpenses([july12, july1, june30], { month: '2026-07' })).toEqual([
      july12,
      july1,
    ])
  })

  it('matches any of the given paymentMethodIds (OR within the dimension)', () => {
    const cash = exp({ paymentMethodId: CASH_METHOD_ID })
    const upi = exp({ paymentMethodId: UPI_METHOD_ID })
    const card = exp({ paymentMethodId: 'pm-card' })
    expect(
      filterExpenses([cash, upi, card], {
        paymentMethodIds: [CASH_METHOD_ID, UPI_METHOD_ID],
      }),
    ).toEqual([cash, upi])
  })

  it('never matches entries without a paymentMethodId against a method filter', () => {
    const cash = exp({ paymentMethodId: CASH_METHOD_ID })
    const none = exp()
    expect(filterExpenses([cash, none], { paymentMethodIds: [CASH_METHOD_ID] })).toEqual([
      cash,
    ])
  })

  it('matches any of the given category labels, exactly', () => {
    const food = exp({ category: 'Food' })
    const foodCourt = exp({ category: 'Food court' })
    const rent = exp({ category: 'Rent' })
    expect(filterExpenses([food, foodCourt, rent], { categories: ['Food'] })).toEqual([
      food,
    ])
    expect(
      filterExpenses([food, foodCourt, rent], { categories: ['Food', 'Rent'] }),
    ).toEqual([food, rent])
  })

  it('treats from/to as inclusive ISO date bounds', () => {
    const before = exp({ spentOn: '2026-07-01' })
    const onFrom = exp({ spentOn: '2026-07-02' })
    const inside = exp({ spentOn: '2026-07-10' })
    const onTo = exp({ spentOn: '2026-07-20' })
    const after = exp({ spentOn: '2026-07-21' })
    const rows = [before, onFrom, inside, onTo, after]
    expect(filterExpenses(rows, { from: '2026-07-02', to: '2026-07-20' })).toEqual([
      onFrom,
      inside,
      onTo,
    ])
  })

  it('supports open-ended ranges (only from, or only to)', () => {
    const june = exp({ spentOn: '2026-06-15' })
    const july = exp({ spentOn: '2026-07-15' })
    expect(filterExpenses([june, july], { from: '2026-07-01' })).toEqual([july])
    expect(filterExpenses([june, july], { to: '2026-06-30' })).toEqual([june])
  })

  it('matches nothing for an inverted range (the swap is a UI rule)', () => {
    const row = exp({ spentOn: '2026-07-10' })
    expect(filterExpenses([row], { from: '2026-07-20', to: '2026-07-01' })).toEqual([])
  })

  it('composes categories with methods, month, and query', () => {
    const hit = exp({
      spentOn: '2026-07-12',
      category: 'Food',
      paymentMethodId: CASH_METHOD_ID,
      note: 'chai',
    })
    const wrongCategory = exp({
      spentOn: '2026-07-12',
      category: 'Rent',
      paymentMethodId: CASH_METHOD_ID,
      note: 'chai',
    })
    expect(
      filterExpenses([hit, wrongCategory], {
        month: '2026-07',
        paymentMethodIds: [CASH_METHOD_ID],
        categories: ['Food'],
        query: 'chai',
      }),
    ).toEqual([hit])
  })

  it('matches the query against the note, case-insensitively', () => {
    const chai = exp({ note: 'Chai with Ravi' })
    const other = exp({ note: 'bus ticket' })
    expect(filterExpenses([chai, other], { query: 'CHAI' })).toEqual([chai])
  })

  it('matches the query against the category', () => {
    const transport = exp({ category: 'Transport' })
    const food = exp({ category: 'Food' })
    expect(filterExpenses([transport, food], { query: 'transport' })).toEqual([
      transport,
    ])
  })

  it('matches the query against the stringified amount', () => {
    const a = exp({ amount: 450.5 })
    const b = exp({ amount: 120 })
    expect(filterExpenses([a, b], { query: '450.5' })).toEqual([a])
    expect(filterExpenses([a, b], { query: '450' })).toEqual([a])
  })

  it('trims the query before matching', () => {
    const chai = exp({ note: 'chai' })
    expect(filterExpenses([chai, exp()], { query: '  chai  ' })).toEqual([chai])
  })

  it('does not crash on entries without a note', () => {
    const noteless = exp()
    delete noteless.note
    expect(filterExpenses([noteless], { query: 'zzz' })).toEqual([])
  })

  it('combines criteria with AND across dimensions', () => {
    const hit = exp({ spentOn: '2026-07-12', paymentMethodId: CASH_METHOD_ID, note: 'chai' })
    const wrongRange = exp({ spentOn: '2026-06-12', paymentMethodId: CASH_METHOD_ID, note: 'chai' })
    const wrongMethod = exp({ spentOn: '2026-07-12', paymentMethodId: UPI_METHOD_ID, note: 'chai' })
    const wrongQuery = exp({ spentOn: '2026-07-12', paymentMethodId: CASH_METHOD_ID, note: 'rent' })
    expect(
      filterExpenses([hit, wrongRange, wrongMethod, wrongQuery], {
        from: '2026-07-01',
        to: '2026-07-31',
        paymentMethodIds: [CASH_METHOD_ID],
        query: 'chai',
      }),
    ).toEqual([hit])
  })
})

describe('groupByDay', () => {
  it('returns no groups for no expenses', () => {
    expect(groupByDay([])).toEqual([])
  })

  it('groups contiguous equal dates, preserving order', () => {
    const a = exp({ spentOn: '2026-07-12', amount: 100 })
    const b = exp({ spentOn: '2026-07-12', amount: 50 })
    const c = exp({ spentOn: '2026-07-11', amount: 20 })
    expect(groupByDay([a, b, c])).toEqual([
      { date: '2026-07-12', items: [a, b], totals: { INR: 150 } },
      { date: '2026-07-11', items: [c], totals: { INR: 20 } },
    ])
  })

  it('accumulates totals per currency within a day', () => {
    const a = exp({ amount: 100, currency: 'INR' })
    const b = exp({ amount: 5, currency: 'USD' })
    const c = exp({ amount: 50, currency: 'INR' })
    expect(groupByDay([a, b, c])[0].totals).toEqual({ INR: 150, USD: 5 })
  })

  it('splits non-contiguous repeats of a date into separate groups', () => {
    const a = exp({ spentOn: '2026-07-12' })
    const b = exp({ spentOn: '2026-07-11' })
    const c = exp({ spentOn: '2026-07-12' })
    expect(groupByDay([a, b, c]).map((g) => g.date)).toEqual([
      '2026-07-12',
      '2026-07-11',
      '2026-07-12',
    ])
  })
})

describe('groupByMonth', () => {
  it('returns no sections for no expenses', () => {
    expect(groupByMonth([])).toEqual([])
  })

  it('wraps day groups into month sections with totals and counts', () => {
    const a = exp({ spentOn: '2026-07-12', amount: 100 })
    const b = exp({ spentOn: '2026-07-11', amount: 50 })
    const c = exp({ spentOn: '2026-07-11', amount: 5, currency: 'USD' })
    const d = exp({ spentOn: '2026-06-30', amount: 20 })
    expect(groupByMonth([a, b, c, d])).toEqual([
      {
        month: '2026-07',
        days: [
          { date: '2026-07-12', items: [a], totals: { INR: 100 } },
          { date: '2026-07-11', items: [b, c], totals: { INR: 50, USD: 5 } },
        ],
        totals: { INR: 150, USD: 5 },
        count: 3,
      },
      {
        month: '2026-06',
        days: [{ date: '2026-06-30', items: [d], totals: { INR: 20 } }],
        totals: { INR: 20 },
        count: 1,
      },
    ])
  })
})

describe('formatTotals', () => {
  it('formats a single currency via formatMoney', () => {
    expect(formatTotals({ INR: 1234 })).toBe('₹1,234')
    expect(formatTotals({ INR: 1234 })).toBe(formatMoney(1234, 'INR'))
  })

  it('puts the primary currency first, remaining codes sorted, joined with " + "', () => {
    expect(formatTotals({ USD: 50, INR: 1234, EUR: 3 })).toBe(
      `${formatMoney(1234, 'INR')} + ${formatMoney(3, 'EUR')} + ${formatMoney(50, 'USD')}`,
    )
  })

  it('sorts codes ascending when the primary currency is absent', () => {
    expect(formatTotals({ USD: 5, EUR: 3 })).toBe(
      `${formatMoney(3, 'EUR')} + ${formatMoney(5, 'USD')}`,
    )
  })

  it('honours a custom primary currency', () => {
    expect(formatTotals({ INR: 1, USD: 2 }, 'USD')).toBe(
      `${formatMoney(2, 'USD')} + ${formatMoney(1, 'INR')}`,
    )
  })

  it('renders an empty string for empty totals', () => {
    expect(formatTotals({})).toBe('')
  })
})

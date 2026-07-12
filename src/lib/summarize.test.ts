import { describe, expect, it } from 'vitest'
import type { Expense } from '../db'
import {
  biggestExpense,
  busiestDay,
  dailyAverage,
  splitByCurrency,
  summarize,
} from './summarize'

function expense(
  category: string,
  amount: number,
  overrides: Partial<Expense> = {},
): Expense {
  return {
    id: `${category}-${amount}-${Math.random()}`,
    amount,
    currency: 'INR',
    category,
    spentOn: '2026-07-10',
    createdAt: '2026-07-10T10:00:00.000Z',
    ...overrides,
  }
}

describe('summarize', () => {
  it('returns an all-zero summary for no expenses', () => {
    expect(summarize([])).toEqual({
      total: 0,
      count: 0,
      byCategory: [],
      byPayment: [],
    })
  })

  it('totals per category, largest first', () => {
    const result = summarize([
      expense('Food', 100),
      expense('Rent', 500),
      expense('Food', 50),
      expense('Transport', 25),
    ])

    expect(result.total).toBe(675)
    expect(result.byCategory).toEqual([
      { category: 'Rent', total: 500, count: 1 },
      { category: 'Food', total: 150, count: 2 },
      { category: 'Transport', total: 25, count: 1 },
    ])
  })

  it('breaks ties alphabetically for a stable chart order', () => {
    const result = summarize([expense('Transport', 100), expense('Food', 100)])
    expect(result.byCategory.map((c) => c.category)).toEqual(['Food', 'Transport'])
  })

  it('counts entries', () => {
    const result = summarize([
      expense('Food', 100),
      expense('Food', 50),
      expense('Rent', 500),
    ])
    expect(result.count).toBe(3)
  })

  it('totals per payment method, grouping entries without one under null', () => {
    const result = summarize([
      expense('Food', 100, { paymentMethodId: 'pm-upi' }),
      expense('Food', 40, { paymentMethodId: 'pm-upi' }),
      expense('Rent', 30),
      expense('Transport', 20),
    ])

    expect(result.byPayment).toEqual([
      { paymentMethodId: 'pm-upi', total: 140, count: 2 },
      { paymentMethodId: null, total: 50, count: 2 },
    ])
  })

  it('sorts payment methods by total descending', () => {
    const result = summarize([
      expense('Food', 10, { paymentMethodId: 'pm-cash' }),
      expense('Food', 200, { paymentMethodId: 'pm-upi' }),
      expense('Food', 90, { paymentMethodId: 'pm-card' }),
    ])
    expect(result.byPayment.map((p) => p.paymentMethodId)).toEqual([
      'pm-upi',
      'pm-card',
      'pm-cash',
    ])
  })

  it('breaks payment total ties by count descending', () => {
    const result = summarize([
      expense('Food', 100, { paymentMethodId: 'pm-single' }),
      expense('Food', 50, { paymentMethodId: 'pm-double' }),
      expense('Food', 50, { paymentMethodId: 'pm-double' }),
    ])
    expect(result.byPayment.map((p) => p.paymentMethodId)).toEqual([
      'pm-double',
      'pm-single',
    ])
  })

  it('breaks payment total and count ties by id ascending with null last', () => {
    const result = summarize([
      expense('Food', 100),
      expense('Food', 100, { paymentMethodId: 'pm-upi' }),
      expense('Food', 100, { paymentMethodId: 'pm-cash' }),
    ])
    expect(result.byPayment.map((p) => p.paymentMethodId)).toEqual([
      'pm-cash',
      'pm-upi',
      null,
    ])
  })
})

describe('splitByCurrency', () => {
  it('returns no buckets for no expenses', () => {
    expect(splitByCurrency([])).toEqual([])
  })

  it('puts INR first even when other currencies have more entries', () => {
    const inr = expense('Food', 100)
    const usd1 = expense('Food', 10, { currency: 'USD' })
    const usd2 = expense('Food', 20, { currency: 'USD' })
    const result = splitByCurrency([usd1, inr, usd2])

    expect(result.map((b) => b.currency)).toEqual(['INR', 'USD'])
  })

  it('orders other currencies by descending entry count', () => {
    const result = splitByCurrency([
      expense('Food', 1, { currency: 'EUR' }),
      expense('Food', 2, { currency: 'USD' }),
      expense('Food', 3, { currency: 'USD' }),
    ])
    expect(result.map((b) => b.currency)).toEqual(['USD', 'EUR'])
  })

  it('breaks entry-count ties by currency code ascending', () => {
    const result = splitByCurrency([
      expense('Food', 1, { currency: 'USD' }),
      expense('Food', 2, { currency: 'AED' }),
    ])
    expect(result.map((b) => b.currency)).toEqual(['AED', 'USD'])
  })

  it('preserves the relative order of expenses within each bucket', () => {
    const usd1 = expense('Food', 10, { currency: 'USD' })
    const inr1 = expense('Rent', 500)
    const usd2 = expense('Transport', 20, { currency: 'USD' })
    const inr2 = expense('Food', 50)
    const result = splitByCurrency([usd1, inr1, usd2, inr2])

    expect(result).toEqual([
      { currency: 'INR', expenses: [inr1, inr2] },
      { currency: 'USD', expenses: [usd1, usd2] },
    ])
  })
})

describe('biggestExpense', () => {
  it('returns null for no expenses', () => {
    expect(biggestExpense([])).toBeNull()
  })

  it('returns the expense with the highest amount', () => {
    const rent = expense('Rent', 500)
    const result = biggestExpense([expense('Food', 100), rent, expense('Food', 50)])
    expect(result).toBe(rent)
  })

  it('keeps the first encountered on ties', () => {
    const first = expense('Food', 100)
    const second = expense('Rent', 100)
    expect(biggestExpense([first, second])).toBe(first)
  })
})

describe('busiestDay', () => {
  it('returns null for no expenses', () => {
    expect(busiestDay([])).toBeNull()
  })

  it('returns the date with the highest total', () => {
    const result = busiestDay([
      expense('Food', 100, { spentOn: '2026-07-01' }),
      expense('Food', 60, { spentOn: '2026-07-02' }),
      expense('Food', 50, { spentOn: '2026-07-02' }),
    ])
    expect(result).toEqual({ date: '2026-07-02', total: 110 })
  })

  it('picks the most recent date on total ties', () => {
    const result = busiestDay([
      expense('Food', 100, { spentOn: '2026-07-05' }),
      expense('Food', 100, { spentOn: '2026-07-01' }),
    ])
    expect(result).toEqual({ date: '2026-07-05', total: 100 })
  })
})

describe('dailyAverage', () => {
  it('returns 0 for a zero total', () => {
    expect(dailyAverage(0, '2026-07', '2026-07-12')).toBe(0)
  })

  it('divides by the day of month so far for the current month', () => {
    expect(dailyAverage(120, '2026-07', '2026-07-12')).toBe(10)
  })

  it('divides by 1 on the first day of the current month', () => {
    expect(dailyAverage(75, '2026-07', '2026-07-01')).toBe(75)
  })

  it('divides by days in the month for a past month', () => {
    expect(dailyAverage(310, '2026-05', '2026-07-12')).toBe(10)
  })

  it('knows February has 28 days in a non-leap year', () => {
    expect(dailyAverage(280, '2026-02', '2026-07-12')).toBe(10)
  })

  it('knows February has 29 days in a leap year', () => {
    expect(dailyAverage(290, '2024-02', '2026-07-12')).toBe(10)
  })
})

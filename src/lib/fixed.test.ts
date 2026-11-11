import { describe, expect, it } from 'vitest'
import type { Category, Expense } from '../db'
import {
  expectedFixed,
  fixedBadge,
  fixedLabels,
  fixedLines,
  paceWithFixed,
  splitFixed,
  usualAmount,
  usualTotal,
  usualWindow,
  type FixedLine,
} from './fixed'

function expense(category: string, amount: number, spentOn = '2026-11-03'): Expense {
  return {
    id: `${category}-${amount}-${spentOn}`,
    amount,
    currency: 'INR',
    category,
    spentOn,
    createdAt: `${spentOn}T10:00:00.000Z`,
  }
}

function cat(id: string, label: string, extra: Partial<Category> = {}): Category {
  return { id, label, emoji: '•', createdAt: '2026-01-01T00:00:00.000Z', ...extra }
}

function line(overrides: Partial<FixedLine>): FixedLine {
  return { category: 'Rent', spent: 0, usual: null, status: 'none', gap: 0, ...overrides }
}

describe('fixedLabels / splitFixed', () => {
  it('splits by label, archived categories included, unknown labels everyday', () => {
    const labels = fixedLabels([
      cat('cat-rent', 'Rent'),
      cat('cat-utilities', 'Utilities', { archived: true }),
      cat('cat-food', 'Food'),
      cat('cat-gym', 'Gym', { fixed: true }),
    ])
    expect(labels).toEqual(new Set(['Rent', 'Utilities', 'Gym']))
    const { fixed, everyday } = splitFixed(
      [expense('Rent', 1), expense('Utilities', 2), expense('Food', 3), expense('Deleted', 4)],
      labels,
    )
    expect(fixed.map((e) => e.category)).toEqual(['Rent', 'Utilities'])
    expect(everyday.map((e) => e.category)).toEqual(['Food', 'Deleted'])
  })

  it('keeps a renamed fixed category fixed (id-derived default follows the new label)', () => {
    expect(fixedLabels([cat('cat-rent', 'Housing')])).toEqual(new Set(['Housing']))
  })
})

describe('usualAmount', () => {
  it('takes the median of up to three months', () => {
    expect(usualAmount([])).toBeNull()
    expect(usualAmount([1999])).toBe(1999)
    expect(usualAmount([1000, 3000])).toBe(2000)
    expect(usualAmount([32000, 31000, 40000])).toBe(32000)
  })
})

describe('fixedLines', () => {
  const fixed = new Set(['Rent', 'Utilities', 'Internet'])
  const history = [
    expense('Rent', 32000, '2026-10-01'),
    expense('Utilities', 1000, '2026-10-05'),
    expense('Utilities', 999, '2026-10-20'),
    expense('Food', 500, '2026-10-02'),
  ]

  it('classifies each fixed category against its usual', () => {
    const lines = fixedLines(
      [expense('Rent', 32000), expense('Utilities', 2499), expense('Food', 100)],
      history,
      fixed,
    )
    expect(lines).toEqual([
      { category: 'Rent', spent: 32000, usual: 32000, status: 'as-usual', gap: 0 },
      { category: 'Utilities', spent: 2499, usual: 1999, status: 'above', gap: 500 },
    ])
  })

  it('flags to-come, not-logged and none', () => {
    const toCome = fixedLines([expense('Utilities', 1000)], history, new Set(['Utilities']))
    expect(toCome[0]).toMatchObject({ status: 'to-come', gap: 999, usual: 1999 })
    const notLogged = fixedLines([], history, new Set(['Utilities']))
    expect(notLogged[0]).toMatchObject({ status: 'not-logged', spent: 0, gap: 1999 })
    const none = fixedLines([expense('Internet', 500)], history, fixed)
    expect(none.find((l) => l.category === 'Internet')).toMatchObject({
      status: 'none',
      usual: null,
      gap: 0,
    })
  })

  it('treats exactly 90% and 110% of usual as as-usual (no float drift)', () => {
    const h = [expense('Rent', 1000, '2026-10-01')]
    for (const spent of [900, 1100]) {
      const [l] = fixedLines([expense('Rent', spent)], h, new Set(['Rent']))
      expect(l.status).toBe('as-usual')
    }
    expect(fixedLines([expense('Rent', 899)], h, new Set(['Rent']))[0].status).toBe('to-come')
    expect(fixedLines([expense('Rent', 1101)], h, new Set(['Rent']))[0].status).toBe('above')
  })

  it('takes the usual only over history months that have an entry', () => {
    const h = [
      expense('Rent', 30000, '2026-08-01'),
      expense('Rent', 40000, '2026-10-01'),
    ]
    const [l] = fixedLines([], h, new Set(['Rent']))
    expect(l.usual).toBe(35000) // two months with entries, not three
  })

  it('sorts by the larger of spent and usual, descending', () => {
    const lines = fixedLines(
      [expense('Utilities', 5000)],
      [expense('Rent', 32000, '2026-10-01'), expense('Utilities', 100, '2026-10-01')],
      new Set(['Rent', 'Utilities']),
    )
    expect(lines.map((l) => l.category)).toEqual(['Rent', 'Utilities'])
  })
})

describe('usualWindow', () => {
  it('spans the three calendar months before a viewed month', () => {
    expect(usualWindow({ kind: 'month', month: '2026-11' })).toEqual({
      from: '2026-08-01',
      to: '2026-10-31',
    })
  })

  it('crosses a year boundary and ends on a short February', () => {
    expect(usualWindow({ kind: 'month', month: '2026-01' })).toEqual({
      from: '2025-10-01',
      to: '2025-12-31',
    })
    expect(usualWindow({ kind: 'month', month: '2026-03' })).toEqual({
      from: '2025-12-01',
      to: '2026-02-28',
    })
  })

  it('has no window outside the month view', () => {
    expect(usualWindow({ kind: 'day', date: '2026-11-11' })).toBeNull()
    expect(usualWindow({ kind: 'year', year: '2026' })).toBeNull()
    expect(usualWindow({ kind: 'all' })).toBeNull()
    expect(usualWindow({ kind: 'custom', from: '2026-11-01', to: '2026-11-11' })).toBeNull()
  })
})

describe('usualTotal', () => {
  it('sums the usuals that exist, skipping lines with none', () => {
    expect(
      usualTotal([
        line({ category: 'Rent', usual: 32000, status: 'as-usual' }),
        line({ category: 'Utilities', usual: 1999, status: 'to-come' }),
        line({ category: 'Internet', spent: 500, usual: null, status: 'none' }),
      ]),
    ).toBe(33999)
  })

  it('is null when no line has a usual, so nothing reads "usually ₹0"', () => {
    expect(usualTotal([])).toBeNull()
    expect(usualTotal([line({ spent: 500, usual: null, status: 'none' })])).toBeNull()
  })
})

describe('pace', () => {
  it('counts fixed once in the pace', () => {
    const lines = [
      line({ category: 'Rent', spent: 32000, usual: 32000, status: 'as-usual' }),
      line({ category: 'Utilities', spent: 1000, usual: 1999, status: 'to-come', gap: 999 }),
      line({ category: 'Internet', spent: 500, usual: null, status: 'none' }),
    ]
    expect(expectedFixed(lines)).toBe(34499) // max(spent, usual) each
    expect(paceWithFixed(34499, 8730, 11, 30)).toBe(58308)
  })
})

describe('fixedBadge', () => {
  it('words the badge', () => {
    expect(fixedBadge(line({ status: 'as-usual' }), 'INR')).toEqual({
      tone: 'positive',
      text: 'As usual',
    })
    expect(fixedBadge(line({ status: 'above', gap: 500 }), 'INR')).toEqual({
      tone: 'caution',
      text: '₹500 above usual',
    })
    expect(fixedBadge(line({ status: 'to-come', gap: 999 }), 'INR')).toEqual({
      tone: 'pending',
      text: '₹999 to come',
    })
    expect(fixedBadge(line({ status: 'not-logged', gap: 1999 }), 'INR')).toEqual({
      tone: 'pending',
      text: 'Not logged yet',
    })
    expect(fixedBadge(line({ status: 'none' }), 'INR')).toBeNull()
  })
})

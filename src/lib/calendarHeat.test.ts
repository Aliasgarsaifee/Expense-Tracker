import { describe, expect, it } from 'vitest'
import type { Expense } from '../db'
import { heatLevels } from './calendarHeat'

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

describe('heatLevels', () => {
  it('sums per day and puts the strongest day at the top level', () => {
    const h = heatLevels(
      [
        exp({ spentOn: '2026-07-01', amount: 100 }),
        exp({ spentOn: '2026-07-01', amount: 300 }),
        exp({ spentOn: '2026-07-02', amount: 400 }),
      ],
      'INR',
      'all',
    )
    expect(h.get('2026-07-01')).toBe(4) // 100 + 300 = 400, ties the max
    expect(h.get('2026-07-02')).toBe(4)
  })

  it('gives any spend at least level 1', () => {
    const h = heatLevels(
      [
        exp({ spentOn: '2026-07-01', amount: 10000 }),
        exp({ spentOn: '2026-07-02', amount: 1 }),
      ],
      'INR',
      'all',
    )
    expect(h.get('2026-07-01')).toBe(4)
    expect(h.get('2026-07-02')).toBe(1)
  })

  it('only counts the requested currency', () => {
    const h = heatLevels(
      [
        exp({ spentOn: '2026-07-01', amount: 100, currency: 'INR' }),
        exp({ spentOn: '2026-07-02', amount: 100, currency: 'USD' }),
      ],
      'INR',
      'all',
    )
    expect(h.get('2026-07-01')).toBe(4)
    expect(h.has('2026-07-02')).toBe(false)
  })

  it('under the global basis, a small day near a huge one stays low', () => {
    const h = heatLevels(
      [
        exp({ spentOn: '2026-07-15', amount: 1000 }),
        exp({ spentOn: '2026-06-15', amount: 200 }),
      ],
      'INR',
      'all',
    )
    expect(h.get('2026-07-15')).toBe(4)
    expect(h.get('2026-06-15')).toBe(2) // sqrt(0.2) * 4 ≈ 1.79 → ceil 2
  })

  it('normalizes within each month for the month basis', () => {
    const h = heatLevels(
      [
        exp({ spentOn: '2026-07-15', amount: 1000 }),
        exp({ spentOn: '2026-06-15', amount: 200 }),
        exp({ spentOn: '2026-06-16', amount: 50 }),
      ],
      'INR',
      'month',
    )
    expect(h.get('2026-07-15')).toBe(4) // top of July
    expect(h.get('2026-06-15')).toBe(4) // top of June, though small globally
  })

  it('normalizes within each year for the year basis', () => {
    const h = heatLevels(
      [
        exp({ spentOn: '2026-01-10', amount: 500 }),
        exp({ spentOn: '2025-01-10', amount: 100 }),
        exp({ spentOn: '2025-02-10', amount: 25 }),
      ],
      'INR',
      'year',
    )
    expect(h.get('2026-01-10')).toBe(4)
    expect(h.get('2025-01-10')).toBe(4) // top of 2025
    expect(h.get('2025-02-10')).toBe(2) // sqrt(0.25) * 4 = 2
  })

  it('returns an empty map when nothing matches', () => {
    expect(heatLevels([], 'INR', 'all').size).toBe(0)
    expect(heatLevels([exp({ currency: 'USD' })], 'INR', 'all').size).toBe(0)
  })

  it('sums only the requested currency on a mixed-currency day', () => {
    const h = heatLevels(
      [
        exp({ spentOn: '2026-07-01', amount: 100, currency: 'INR' }),
        exp({ spentOn: '2026-07-01', amount: 5000, currency: 'USD' }),
        exp({ spentOn: '2026-07-02', amount: 50, currency: 'INR' }),
      ],
      'INR',
      'all',
    )
    // The USD 5000 on day 1 is ignored: day-1 INR total = 100 (the bucket max),
    // day-2 = 50 → 50/100 = 0.5 → ceil(sqrt(0.5) * 4) = 3. If USD were wrongly
    // summed, day 1 would be 5100 and day 2 would drop to level 1.
    expect(h.get('2026-07-01')).toBe(4)
    expect(h.get('2026-07-02')).toBe(3)
  })
})

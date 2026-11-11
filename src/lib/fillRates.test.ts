import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addExpense, db } from '../db'
import { fillMissingRates } from './fillRates'

const TODAY = '2026-11-11'
const aed = (spentOn: string, amount = 120) =>
  addExpense({ amount, currency: 'AED', category: 'Food', spentOn })

beforeEach(async () => {
  await db.expenses.clear()
})

describe('fillMissingRates', () => {
  it('converts every waiting entry with one request per currency and day', async () => {
    const a = await aed('2026-11-06')
    const b = await aed('2026-11-06', 2)
    const getRate = vi.fn(async () => 25.635)
    expect(await fillMissingRates('INR', TODAY, getRate)).toBe(2)
    expect(getRate).toHaveBeenCalledTimes(1)
    expect(getRate).toHaveBeenCalledWith('AED', 'INR', '2026-11-06')
    expect((await db.expenses.get(a.id))!.amount).toBe(3076)
    expect((await db.expenses.get(b.id))!.paid).toEqual({ amount: 2, currency: 'AED' })
  })

  it('leaves an entry waiting when there is no rate, and carries on', async () => {
    const noRate = await aed('2026-11-05')
    const rated = await aed('2026-11-06')
    const getRate = vi.fn(async (_b: string, _q: string, date: string) => {
      if (date === '2026-11-05') throw new Error('boom')
      return 25.635
    })
    expect(await fillMissingRates('INR', TODAY, getRate)).toBe(1)
    expect((await db.expenses.get(noRate.id))!.currency).toBe('AED')
    expect((await db.expenses.get(rated.id))!.currency).toBe('INR')
  })

  it('leaves an entry waiting when the rate is null', async () => {
    const e = await aed('2026-11-05')
    expect(await fillMissingRates('INR', TODAY, async () => null)).toBe(0)
    expect((await db.expenses.get(e.id))!.currency).toBe('AED')
  })

  it('ignores home entries and entries dated after today', async () => {
    await addExpense({ amount: 400, category: 'Food', spentOn: '2026-11-06' })
    await aed('2026-11-20')
    const getRate = vi.fn(async () => 25.635)
    expect(await fillMissingRates('INR', TODAY, getRate)).toBe(0)
    expect(getRate).not.toHaveBeenCalled()
  })

  it('does nothing when more than 60 days are waiting', async () => {
    for (let d = 0; d < 61; d++) {
      const day = new Date(Date.UTC(2026, 7, 1 + d)).toISOString().slice(0, 10)
      await aed(day)
    }
    const getRate = vi.fn(async () => 25.635)
    expect(await fillMissingRates('INR', TODAY, getRate)).toBe(0)
    expect(getRate).not.toHaveBeenCalled()
  })

  it('never runs two passes at once', async () => {
    await aed('2026-11-06')
    const getRate = vi.fn(async () => 25.635)
    const [first, second] = await Promise.all([
      fillMissingRates('INR', TODAY, getRate),
      fillMissingRates('INR', TODAY, getRate),
    ])
    expect(first + second).toBe(1)
    expect(getRate).toHaveBeenCalledTimes(1)
  })

  it('releases the guard after a pass, so the next one runs', async () => {
    await aed('2026-11-06')
    expect(await fillMissingRates('INR', TODAY, async () => null)).toBe(0)
    expect(await fillMissingRates('INR', TODAY, async () => 25.635)).toBe(1)
  })
})

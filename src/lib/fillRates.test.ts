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

  it('works through a long backlog 60 days a pass, newest first', async () => {
    const days: string[] = []
    for (let d = 0; d < 61; d++) {
      const day = new Date(Date.UTC(2026, 7, 1 + d)).toISOString().slice(0, 10)
      days.push(day)
      await aed(day)
    }
    const getRate = vi.fn(async () => 25.635)
    expect(await fillMissingRates('INR', TODAY, getRate)).toBe(60)
    expect(getRate).toHaveBeenCalledTimes(60)
    // The oldest day is the one left for the next pass.
    const left = (await db.expenses.toArray()).filter((e) => e.currency === 'AED')
    expect(left.map((e) => e.spentOn)).toEqual([days[0]])
    expect(await fillMissingRates('INR', TODAY, getRate)).toBe(1)
  })

  it('leaves alone what was entered before the default currency last changed', async () => {
    await aed('2026-11-06')
    const getRate = vi.fn(async () => 25.635)
    expect(await fillMissingRates('INR', TODAY, getRate, { since: '2999-01-01T00:00:00.000Z' })).toBe(0)
    expect(getRate).not.toHaveBeenCalled()
    expect(await fillMissingRates('INR', TODAY, getRate, { since: '2000-01-01T00:00:00.000Z' })).toBe(1)
  })

  it('hands each conversion over as it lands, and survives a caller that throws', async () => {
    const a = await aed('2026-11-06')
    const b = await aed('2026-11-05', 2)
    const seen: [string, number, string, number][] = []
    const converted = await fillMissingRates('INR', TODAY, async () => 25.635, {
      onConverted: (before, after) => {
        seen.push([before.currency, before.amount, after.currency, after.amount])
        throw new Error('boom')
      },
    })
    expect(converted).toBe(2)
    expect(seen).toEqual([['AED', 120, 'INR', 3076], ['AED', 2, 'INR', 51.27]])
    expect((await db.expenses.get(a.id))!.currency).toBe('INR')
    expect((await db.expenses.get(b.id))!.currency).toBe('INR')
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

import { describe, expect, it } from 'vitest'
import {
  budgetBadge,
  budgetCrossing,
  budgetFor,
  budgetLevel,
  budgetStatus,
  readBudgets,
} from './budget'

describe('budget maths', () => {
  it('reads only positive finite numbers and survives junk', () => {
    expect(readBudgets({ INR: 25000, USD: 0, SAR: 'x', EUR: -5, GBP: NaN }))
      .toEqual({ INR: 25000 })
    for (const junk of [null, undefined, 'x', 42, [25000]]) {
      expect(readBudgets(junk)).toEqual({})
    }
  })

  it('looks up a currency budget, or null when missing or unusable', () => {
    expect(budgetFor({ INR: 25000 }, 'INR')).toBe(25000)
    expect(budgetFor({ INR: 25000 }, 'USD')).toBeNull()
    expect(budgetFor({ INR: 0 }, 'INR')).toBeNull()
    expect(budgetFor({ INR: Infinity }, 'INR')).toBeNull()
  })

  it('levels at 80% and at the line', () => {
    expect(budgetLevel(19999, 25000)).toBe('under')
    expect(budgetLevel(20000, 25000)).toBe('near')
    expect(budgetLevel(25000, 25000)).toBe('near')
    expect(budgetLevel(25000.01, 25000)).toBe('over')
  })

  it('reports a crossing only when the level rises', () => {
    expect(budgetCrossing(8730, 9000, 25000)).toBeNull()
    expect(budgetCrossing(19500, 20140, 25000)).toBe('near')
    expect(budgetCrossing(20140, 21000, 25000)).toBeNull()
    expect(budgetCrossing(24000, 26150, 25000)).toBe('over')
    expect(budgetCrossing(19000, 26000, 25000)).toBe('over') // skips near
    expect(budgetCrossing(26000, 27000, 25000)).toBeNull()
    expect(budgetCrossing(26000, 24000, 25000)).toBeNull() // downward
  })

  it('works out what is left and the daily allowance', () => {
    expect(budgetStatus(8730, 25000, 11, 30)).toMatchObject(
      { left: 16270, perDay: 856, level: 'under' })
    expect(budgetStatus(8730, 25000, 30, 30).perDay).toBeNull() // last day
    expect(budgetStatus(26150, 25000, 24, 30)).toMatchObject(
      { left: -1150, perDay: null, usedShare: 1, level: 'over' })
  })

  it('reports the even-pace share of the month', () => {
    expect(budgetStatus(8730, 25000, 15, 30).evenShare).toBe(0.5)
  })

  it('words the badge', () => {
    expect(budgetBadge(budgetStatus(8730, 25000, 11, 30), 'INR'))
      .toEqual({ tone: 'positive', text: 'On track' })
    expect(budgetBadge(budgetStatus(21000, 25000, 11, 30), 'INR'))
      .toEqual({ tone: 'caution', text: 'Close' })
    expect(budgetBadge(budgetStatus(26150, 25000, 24, 30), 'INR'))
      .toEqual({ tone: 'negative', text: 'Over by ₹1,150' })
  })
})

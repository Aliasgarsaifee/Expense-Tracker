import { describe, expect, it } from 'vitest'
import {
  budgetBadge,
  budgetCardCopy,
  budgetCrossing,
  budgetFor,
  budgetLevel,
  budgetReference,
  budgetStatus,
  readBudgets,
  withBudget,
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

  it('sets, changes and removes one currency without touching the rest', () => {
    const start = { INR: 25000 }
    expect(withBudget(start, 'USD', 500)).toEqual({ INR: 25000, USD: 500 })
    expect(start).toEqual({ INR: 25000 }) // a fresh map, never mutated
    expect(withBudget({ INR: 25000, USD: 500 }, 'INR', 30000))
      .toEqual({ INR: 30000, USD: 500 })
    expect(withBudget({ INR: 25000, USD: 500 }, 'INR', null)).toEqual({ USD: 500 })
    expect(withBudget({ INR: 25000 }, 'INR', 0)).toEqual({}) // read back as none anyway
  })

  it('draws the daily allowance as a chart reference', () => {
    expect(budgetReference(25000, 30, 'INR'))
      .toEqual({ value: 25000 / 30, label: '₹833 a day keeps the budget' })
    expect(budgetReference(25000, 31, 'INR').label).toBe('₹806 a day keeps the budget')
    expect(budgetReference(600, 30, 'USD').label).toBe('$20 a day keeps the budget')
  })

  it('words the card while under, with the bar said in words', () => {
    expect(budgetCardCopy(budgetStatus(8730, 25000, 11, 30), 25000, 19, 'INR')).toEqual({
      amount: '₹16,270',
      of: 'left of ₹25,000',
      perDay: '₹856 a day for the next 19 days',
      bar: '35% of the budget used; even pace today is 37%',
    })
  })

  it('words the card once over, with the real share rather than a full bar', () => {
    expect(budgetCardCopy(budgetStatus(26150, 25000, 24, 30), 25000, 6, 'INR')).toEqual({
      amount: '₹1,150',
      of: 'over ₹25,000',
      perDay: null,
      bar: '105% of the budget used; even pace today is 80%',
    })
  })

  it('says nothing per day once the month or the money has run out', () => {
    const at = (spent: number, elapsed: number, daysLeft: number) =>
      budgetCardCopy(budgetStatus(spent, 25000, elapsed, 30), 25000, daysLeft, 'INR')
    expect(at(8730, 30, 0).perDay).toBeNull() // a past month, or its last day
    expect(at(25000, 11, 19)).toMatchObject({ amount: '₹0', of: 'left of ₹25,000', perDay: null })
    expect(at(8730, 29, 1).perDay).toBe('₹16,270 for the last day')
  })

  // With no days left the card hides its even-pace tick, so the words for the
  // bar must not describe one.
  it('drops even pace from the bar once no days are left', () => {
    const done = budgetCardCopy(budgetStatus(8730, 25000, 30, 30), 25000, 0, 'INR')
    expect(done.bar).toBe('35% of the budget used')
  })
})

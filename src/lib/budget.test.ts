import { describe, expect, it } from 'vitest'
import {
  budgetAlertCopy,
  budgetBadge,
  budgetCardCopy,
  budgetCrossing,
  budgetFor,
  budgetHeadsUp,
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

describe('budget alert copy', () => {
  const crossed = {
    currency: 'INR',
    budget: 25000,
    spent: 26150,
    month: '2026-11',
    daysLeft: 6,
    entry: { amount: 4200, category: 'Food', note: 'Dinner for six' },
  }

  it('words the heads-up with the real rounded share', () => {
    expect(budgetHeadsUp({ spent: 20140, budget: 25000, currency: 'INR' }))
      .toBe('81% of ₹25,000 used this month')
    expect(budgetHeadsUp({ spent: 20000, budget: 25000, currency: 'INR' }))
      .toBe('80% of ₹25,000 used this month')
    expect(budgetHeadsUp({ spent: 25000, budget: 25000, currency: 'INR' }))
      .toBe('100% of ₹25,000 used this month') // at the line is still near
    expect(budgetHeadsUp({ spent: 450, budget: 500, currency: 'USD' }))
      .toBe('90% of $500 used this month')
  })

  it('words the crossing sheet, naming the entry by its note', () => {
    const copy = budgetAlertCopy(crossed)
    expect(copy).toMatchObject({
      pill: 'Over budget',
      title: 'Monthly budget crossed',
      sentence: 'Dinner for six, ₹4,200, took November’s everyday spending past the line you set.',
      spent: '₹26,150',
      of: 'of ₹25,000',
      over: '₹1,150 over',
      daysLeft: '6 days left in November',
      bar: '105% of the budget used',
    })
  })

  it('names the entry by its category when it has no note', () => {
    const { sentence } = budgetAlertCopy({
      ...crossed,
      entry: { amount: 4200, category: 'Food' },
    })
    expect(sentence).toBe('Food, ₹4,200, took November’s everyday spending past the line you set.')
  })

  // The bar is spent's whole length: the budget's part, then the overshoot.
  it('splits the bar at the budget', () => {
    const { withinShare, overShare } = budgetAlertCopy(crossed)
    expect(withinShare).toBeCloseTo(25000 / 26150)
    expect(overShare).toBeCloseTo(1150 / 26150)
    expect(withinShare + overShare).toBeCloseTo(1)
  })

  it('counts the days left down to the last one', () => {
    const left = (daysLeft: number) => budgetAlertCopy({ ...crossed, daysLeft }).daysLeft
    expect(left(1)).toBe('1 day left in November')
    expect(left(0)).toBe('Last day of November')
  })

  it('stays in the crossing’s own currency', () => {
    const copy = budgetAlertCopy({
      ...crossed,
      currency: 'USD',
      budget: 500,
      spent: 540,
      month: '2026-02',
      entry: { amount: 60, category: 'Food', note: 'Groceries run' },
    })
    expect(copy).toMatchObject({
      sentence: 'Groceries run, $60, took February’s everyday spending past the line you set.',
      spent: '$540',
      of: 'of $500',
      over: '$40 over',
      daysLeft: '6 days left in February',
      bar: '108% of the budget used',
    })
  })
})

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
  alertYearLine,
  carriedBefore,
  carriedInto,
  carriedIntoMonth,
  carriedLine,
  earlierThisYear,
  ledgerFor,
  ledgerReads,
  monthTotals,
  readBudgets,
  withBudget,
  yearBudgetReference,
  yearCardCopy,
  yearLedger,
  yearLedgerCopy,
  yearLineCopy,
  yearSentence,
  yearTally,
} from './budget'
import type { Expense } from '../db'

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

  // Rounding up would claim a day's figure that overshoots the budget over the month.
  it('rounds the daily label down so the figure really keeps the budget', () => {
    expect(budgetReference(25000, 28, 'INR').label).toBe('₹892 a day keeps the budget')
    expect(budgetReference(25000, 28, 'INR').value).toBe(25000 / 28)
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
    carried: 14600,
  }

  it('ties the crossing to the year under a hairline', () => {
    expect(budgetAlertCopy(crossed).yearLine).toBe(
      'Earlier months left ₹14,600 in hand, so the year is still ₹13,450 under.')
    expect(budgetAlertCopy({ ...crossed, carried: -450 }).yearLine)
      .toBe('The year is now ₹1,600 over.')
    expect(budgetAlertCopy({ ...crossed, carried: null }).yearLine).toBeNull()
  })

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

const BUDGET = 25000
const TODAY = '2026-11-11'
const spentJanToNov = [22400, 19850, 27900, 24100, 31200, 21300, 23650, 20400, 26300, 18300, 8730]
const monthKey = (year: string, i: number) => `${year}-${String(i + 1).padStart(2, '0')}`
const byMonth = (year: string, spent: number[]) =>
  new Map(spent.map((s, i) => [monthKey(year, i), s]))
const entry = (spentOn: string, amount: number): Expense => ({
  id: spentOn + amount,
  amount,
  currency: 'INR',
  category: 'Food',
  spentOn,
  createdAt: spentOn + 'T00:00:00.000Z',
})

describe('year ledger', () => {
  const lines = yearLedger(byMonth('2026', spentJanToNov), BUDGET, '2026', TODAY, null)

  it('sums everyday entries by month', () => {
    const totals = monthTotals([
      entry('2026-03-01', 100),
      entry('2026-03-31', 250),
      entry('2026-04-02', 40),
    ])
    expect([...totals]).toEqual([['2026-03', 350], ['2026-04', 40]])
  })

  it('accrues month by month', () => {
    expect(lines.slice(0, 10).map((l) => l.running)).toEqual(
      [2600, 7750, 4850, 5750, -450, 3250, 4600, 9200, 7900, 14600])
    expect(lines[10]).toMatchObject(
      { month: '2026-11', diff: 16270, running: null, partial: true })
    expect(lines).toHaveLength(11) // December is not listed yet
    expect(carriedInto(lines)).toBe(14600)
    expect(yearTally(lines)).toEqual(
      { overCount: 3, overTotal: 10400, underCount: 7, underTotal: 25000 })
  })

  it('starts at the first month the ledger was in use', () => {
    const from = yearLedger(byMonth('2026', spentJanToNov), BUDGET, '2026', TODAY, '2026-04')
    expect(from[0]).toMatchObject({ month: '2026-04', running: 900 })
    expect(from).toHaveLength(8)
    // A first month before the year does not pull the start earlier.
    expect(yearLedger(byMonth('2026', spentJanToNov), BUDGET, '2026', TODAY, '2025-06')[0].month)
      .toBe('2026-01')
  })

  it('lists all twelve months of a past year, none partial', () => {
    const past = yearLedger(byMonth('2025', spentJanToNov), BUDGET, '2025', TODAY, null)
    expect(past).toHaveLength(12)
    expect(past.some((l) => l.partial)).toBe(false)
    // A month with no spend is an under month, not a gap.
    expect(past[11]).toMatchObject({ month: '2025-12', spent: 0, diff: BUDGET, running: 14600 + 16270 + BUDGET })
  })

  it('is empty for a future year or a ledger that starts later', () => {
    expect(yearLedger(new Map(), BUDGET, '2027', TODAY, null)).toEqual([])
    expect(yearLedger(new Map(), BUDGET, '2026', TODAY, '2027-01')).toEqual([])
    expect(yearLedger(new Map(), BUDGET, '2025', TODAY, '2026-03')).toEqual([])
  })

  it('has nothing carried in January', () => {
    const jan = yearLedger(byMonth('2026', [8000]), BUDGET, '2026', '2026-01-15', null)
    expect(jan).toHaveLength(1)
    expect(carriedInto(jan)).toBeNull()
    expect(carriedInto([])).toBeNull()
    expect(yearTally(jan)).toEqual({ overCount: 0, overTotal: 0, underCount: 0, underTotal: 0 })
  })

  it('leaves a month exactly on budget out of both counts', () => {
    const even = yearLedger(byMonth('2025', [25000, 26000, 24000]), BUDGET, '2025', TODAY, null)
    expect(yearTally(even.slice(0, 3)))
      .toEqual({ overCount: 1, overTotal: 1000, underCount: 1, underTotal: 1000 })
  })

  it('says whether the others covered it', () => {
    expect(yearSentence(lines, 'INR')).toBe(
      '3 months ran over, by ₹10,400 in all. The other 7 came in ₹25,000 under and covered it.')
    const one = yearLedger(byMonth('2025', [27900, 20000, 20000]), BUDGET, '2025', TODAY, null).slice(0, 3)
    expect(yearSentence(one, 'INR')).toBe(
      '1 month ran over, by ₹2,900. The other 2 came in ₹10,000 under and covered it.')
    const oneUnder = yearLedger(byMonth('2025', [27900, 20000]), BUDGET, '2025', TODAY, null).slice(0, 2)
    expect(yearSentence(oneUnder, 'INR')).toBe(
      '1 month ran over, by ₹2,900. The other month came in ₹5,000 under and covered it.')
    expect(yearSentence(yearLedger(byMonth('2025', [20000, 21000]), BUDGET, '2025', TODAY, null).slice(0, 2), 'INR'))
      .toBe('No month has run over.')
    const short = yearLedger(byMonth('2025', [29000, 21000]), BUDGET, '2025', TODAY, null).slice(0, 2)
    expect(yearSentence(short, 'INR')).toBe(
      '1 month ran over, by ₹4,000. The other month came in ₹4,000 under and covered it.')
    const notCovered = yearLedger(byMonth('2025', [29000, 30000, 21000]), BUDGET, '2025', TODAY, null).slice(0, 3)
    expect(yearSentence(notCovered, 'INR')).toBe(
      '2 months ran over, by ₹9,000 in all. The other month came in ₹4,000 under.')
    const noUnder = yearLedger(byMonth('2025', [29000, 25000]), BUDGET, '2025', TODAY, null).slice(0, 2)
    expect(yearSentence(noUnder, 'INR')).toBe('1 month ran over, by ₹4,000.')
  })

  it('says nothing while no month is complete', () => {
    const jan = yearLedger(byMonth('2026', [8000]), BUDGET, '2026', '2026-01-15', null)
    expect(yearSentence(jan, 'INR')).toBe('')
    expect(yearSentence([], 'INR')).toBe('')
  })

  it('ties an overrun to the year', () => {
    expect(alertYearLine(14600, 1150, 'INR')).toBe(
      'Earlier months left ₹14,600 in hand, so the year is still ₹13,450 under.')
    expect(alertYearLine(500, 1150, 'INR')).toBe(
      'Earlier months left ₹500 in hand; the year is now ₹650 over.')
    expect(alertYearLine(-450, 1150, 'INR')).toBe('The year is now ₹1,600 over.')
    expect(alertYearLine(null, 1150, 'INR')).toBeNull()
  })

  // carriedInto answers "after the last complete month", which is the ledger
  // as of today; a past month needs what had been carried into it.
  it('says what was carried into a given month', () => {
    expect(carriedBefore(lines, '2026-11')).toBe(14600)
    expect(carriedBefore(lines, '2026-06')).toBe(-450)
    expect(carriedBefore(lines, '2026-10')).toBe(7900)
    expect(carriedBefore(lines, '2026-01')).toBeNull()
    // The partial month never carries: December still sees October's balance.
    expect(carriedBefore(lines, '2026-12')).toBe(14600)
    expect(carriedBefore([], '2026-11')).toBeNull()
  })
})

describe('the year, read from entries', () => {
  // One entry per month, at the brief's everyday totals.
  const janToOct = spentJanToNov.slice(0, 10).map((s, i) => entry(`${monthKey('2026', i)}-15`, s))

  it('spans 1 January to the end of the month before', () => {
    expect(earlierThisYear('2026-11')).toEqual({ from: '2026-01-01', to: '2026-10-31' })
    expect(earlierThisYear('2026-03')).toEqual({ from: '2026-01-01', to: '2026-02-28' })
    expect(earlierThisYear('2024-03')).toEqual({ from: '2024-01-01', to: '2024-02-29' })
  })

  it('reads nothing for January, which has no earlier month', () => {
    expect(earlierThisYear('2026-01')).toBeNull()
  })

  it('reads for the ledger only once a budget exists, and only what the period needs', () => {
    const nov = { kind: 'month', month: '2026-11' } as const
    const budgets = { INR: 25000, USD: 500 }
    expect(ledgerReads(nov, {})).toEqual({ earlier: null, currencies: [] })
    expect(ledgerReads(nov, budgets)).toEqual({
      earlier: { from: '2026-01-01', to: '2026-10-31' },
      currencies: ['INR', 'USD'],
    })
    // The year view's months are its own window, already read.
    expect(ledgerReads({ kind: 'year', year: '2026' }, budgets))
      .toEqual({ earlier: null, currencies: ['INR', 'USD'] })
    expect(ledgerReads({ kind: 'year', year: '2026' }, {})).toEqual({ earlier: null, currencies: [] })
    for (const p of [
      { kind: 'month', month: '2026-01' },
      { kind: 'day', date: '2026-11-11' },
      { kind: 'all' },
      { kind: 'custom', from: '2026-01-01', to: '2026-03-31' },
    ] as const) {
      expect(ledgerReads(p, budgets)).toEqual({ earlier: null, currencies: [] })
    }
  })

  it('builds the ledger from one currency’s everyday entries', () => {
    expect(ledgerFor(janToOct, BUDGET, '2026', TODAY, '2026-01'))
      .toEqual(yearLedger(monthTotals(janToOct), BUDGET, '2026', TODAY, '2026-01'))
    expect(ledgerFor(janToOct, BUDGET, '2026', TODAY, '2025-03')[9].running).toBe(14600)
  })

  // No entry in the currency at all: there is no ledger to keep, rather than
  // ten empty months read as ₹2,50,000 saved.
  it('keeps no ledger for a currency never used', () => {
    expect(ledgerFor([], BUDGET, '2026', TODAY, null)).toEqual([])
  })

  it('carries the earlier months into a month', () => {
    expect(carriedIntoMonth(janToOct, BUDGET, '2026-11', TODAY, '2026-01')).toBe(14600)
    expect(carriedIntoMonth(janToOct.slice(0, 5), BUDGET, '2026-06', TODAY, '2026-01')).toBe(-450)
    expect(carriedIntoMonth([], BUDGET, '2026-11', TODAY, '2026-11')).toBeNull() // first used now
    expect(carriedIntoMonth([], BUDGET, '2026-11', TODAY, null)).toBeNull()
    expect(carriedIntoMonth([], BUDGET, '2026-01', '2026-01-20', '2025-04')).toBeNull()
  })
})

describe('year copy', () => {
  const lines = yearLedger(byMonth('2026', spentJanToNov), BUDGET, '2026', TODAY, null)

  it('words the year card in hand', () => {
    expect(yearCardCopy(lines, 'INR')).toEqual({
      pill: { tone: 'positive', text: 'In hand' },
      amount: '₹14,600',
      after: 'in hand after 10 months',
      sentence:
        '3 months ran over, by ₹10,400 in all. The other 7 came in ₹25,000 under and covered it.',
    })
  })

  it('words the year card with a balance to make up', () => {
    const toMay = lines.slice(0, 5)
    expect(yearCardCopy(toMay, 'INR')).toEqual({
      pill: { tone: 'caution', text: 'To make up' },
      amount: '₹450',
      after: 'to make up after 5 months',
      sentence: '2 months ran over, by ₹9,100 in all. The other 3 came in ₹8,650 under.',
    })
    expect(yearCardCopy(lines.slice(0, 1), 'INR').after).toBe('in hand after 1 month')
  })

  it('says the first month is still running, with no pill or figure', () => {
    const jan = yearLedger(byMonth('2026', [8000]), BUDGET, '2026', '2026-01-15', null)
    expect(yearCardCopy(jan, 'INR')).toEqual({
      pill: null,
      amount: null,
      after: null,
      sentence: 'The first month is still running.',
    })
  })

  it('words a complete month', () => {
    expect(yearLineCopy(lines[9], 'INR', TODAY)).toEqual({
      key: '2026-10',
      month: 'October',
      spent: '₹18,300 spent',
      diff: '₹6,700 under',
      over: false,
      balance: '₹14,600 in hand',
      label: 'October: ₹18,300 spent, ₹6,700 under, ₹14,600 in hand',
    })
    expect(yearLineCopy(lines[8], 'INR', TODAY)).toMatchObject(
      { diff: '₹1,300 over', over: true, balance: '₹7,900 in hand' })
    expect(yearLineCopy(lines[4], 'INR', TODAY)).toMatchObject({
      month: 'May',
      diff: '₹6,200 over',
      over: true,
      balance: '₹450 to make up',
      label: 'May: ₹31,200 spent, ₹6,200 over, ₹450 to make up',
    })
  })

  it('words a month exactly on budget', () => {
    const even = yearLedger(byMonth('2025', [25000]), BUDGET, '2025', TODAY, null)[0]
    expect(yearLineCopy(even, 'INR', TODAY)).toMatchObject(
      { diff: 'On budget', over: false, balance: '₹0 in hand' })
  })

  it('words the month still running', () => {
    expect(yearLineCopy(lines[10], 'INR', TODAY)).toEqual({
      key: '2026-11',
      month: 'November',
      spent: '₹8,730 so far',
      diff: '₹16,270 left',
      over: false,
      balance: '19 days to go',
      label: 'November: ₹8,730 so far, ₹16,270 left, 19 days to go',
    })
    const past = { month: '2026-11', spent: 26150, diff: -1150, running: null, partial: true }
    expect(yearLineCopy(past, 'INR', TODAY)).toMatchObject(
      { spent: '₹26,150 so far', diff: '₹1,150 over', over: true })
    expect(yearLineCopy(lines[10], 'INR', '2026-11-29').balance).toBe('1 day to go')
    expect(yearLineCopy(lines[10], 'INR', '2026-11-30').balance).toBe('Last day')
  })

  it('lists the ledger newest first, against the budget', () => {
    const copy = yearLedgerCopy(lines, BUDGET, 'INR', TODAY)
    expect(copy.note).toBe('against ₹25,000')
    expect(copy.rows.map((r) => r.month)).toEqual([
      'November', 'October', 'September', 'August', 'July', 'June',
      'May', 'April', 'March', 'February', 'January',
    ])
    expect(copy.rows[0]).toEqual(yearLineCopy(lines[10], 'INR', TODAY))
  })

  it('words the line the month card carries', () => {
    expect(carriedLine(14600, 'INR')).toBe('₹14,600 in hand from earlier months this year')
    expect(carriedLine(-450, 'INR')).toBe('₹450 to make up from earlier months this year')
    expect(carriedLine(null, 'INR')).toBeNull()
  })

  it('draws the monthly budget as the year chart’s reference', () => {
    expect(yearBudgetReference(25000, 'INR')).toEqual({ value: 25000, label: 'budget ₹25,000' })
    expect(yearBudgetReference(600, 'USD').label).toBe('budget $600')
  })
})

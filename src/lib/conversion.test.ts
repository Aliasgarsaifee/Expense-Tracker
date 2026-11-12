import { describe, expect, it } from 'vitest'
import type { Expense } from '../db'
import {
  chooseRate, convertedMessage, entryValues, formatRate, paidLabel, paidOf, rateLine,
  savedMessage, seedRate, waitingPairs,
} from './conversion'
import { formatMoney } from './money'

const converted = { amount: 3076, currency: 'INR', paid: { amount: 120, currency: 'AED' } }

describe('paidOf / paidLabel', () => {
  it('is the memo when there is one, else the entry itself', () => {
    expect(paidOf(converted)).toEqual({ amount: 120, currency: 'AED' })
    expect(paidOf({ amount: 400, currency: 'INR' })).toEqual({ amount: 400, currency: 'INR' })
    expect(paidLabel(converted)).toBe(formatMoney(120, 'AED'))
    expect(paidLabel({})).toBeNull()
  })
})

describe('seedRate', () => {
  it('derives the stored rate of a converted entry in the home currency', () => {
    expect(seedRate(converted, 'INR')).toEqual({ rate: 3076 / 120, byHand: false })
    expect(seedRate({ ...converted, paid: { ...converted.paid, byHand: true } }, 'INR'))
      .toEqual({ rate: 3076 / 120, byHand: true })
  })
  it('has nothing for a home entry, a waiting one, or a changed home currency', () => {
    expect(seedRate({ amount: 400, currency: 'INR' }, 'INR')).toBeNull()
    expect(seedRate({ amount: 120, currency: 'AED' }, 'INR')).toBeNull()
    expect(seedRate(converted, 'USD')).toBeNull()
    expect(seedRate(undefined, 'INR')).toBeNull()
  })
})

describe('entryValues', () => {
  const typed = { amount: 120, currency: 'AED' }
  it('home currency: as typed, paid cleared', () => {
    const v = entryValues({ amount: 400, currency: 'INR' }, 'INR', null, false)
    expect(v).toEqual({ amount: 400, currency: 'INR', paid: undefined })
    expect('paid' in v).toBe(true) // updateExpense needs the key to delete it
  })
  it('foreign with a rate: home value plus what was paid', () => {
    expect(entryValues(typed, 'INR', 25.635, false))
      .toEqual({ amount: 3076, currency: 'INR', paid: { amount: 120, currency: 'AED' } })
  })
  it('foreign with no rate: waiting, exactly as typed', () => {
    expect(entryValues(typed, 'INR', null, false))
      .toEqual({ amount: 120, currency: 'AED', paid: undefined })
  })
  it('by hand: two decimals kept and the flag set', () => {
    expect(entryValues(typed, 'INR', 3101.45 / 120, true)).toEqual({
      amount: 3101.45, currency: 'INR', paid: { amount: 120, currency: 'AED', byHand: true },
    })
  })
  it('a value that rounds to zero stays waiting, computed or by hand', () => {
    const tiny = { amount: 0.01, currency: 'AED' }
    expect(entryValues(tiny, 'INR', 0.1, false)).toEqual({ amount: 0.01, currency: 'AED', paid: undefined })
    expect(entryValues(tiny, 'INR', 0.1, true)).toEqual({ amount: 0.01, currency: 'AED', paid: undefined })
  })
  it.each([
    [3076, 120, false], [51.27, 2, false], [3101.45, 120, true],
    [1.85, 0.07, true], [33.33, 1.3, true], [100, 3.9, false],
  ])('re-saving %d for %d paid writes the same amount back', (amount, paid, byHand) => {
    const e = { amount, currency: 'INR', paid: { amount: paid, currency: 'AED', ...(byHand ? { byHand: true as const } : {}) } }
    const seed = seedRate(e, 'INR')!
    expect(entryValues(paidOf(e), 'INR', seed.rate, seed.byHand).amount).toBe(amount)
  })
})

describe('chooseRate', () => {
  const form = {
    currency: 'AED', home: 'INR', spentOn: '2026-11-06', today: '2026-11-11',
    handRate: null, seed: null,
  }
  // Edit of an entry booked at AED on the 6th, at the day's rate.
  const stored = { rate: 3076 / 120, byHand: false, currency: 'AED', spentOn: '2026-11-06' }

  it('home currency: no rate and nothing to look up', () => {
    expect(chooseRate({ ...form, currency: 'INR' }, 25.6)).toEqual({ rate: null, lookup: false })
  })
  it('a hand rate wins and needs no lookup', () => {
    expect(chooseRate({ ...form, handRate: 25.8, seed: stored }, 25.6))
      .toEqual({ rate: 25.8, lookup: false })
  })
  it('the stored rate stands while currency and date are unchanged', () => {
    expect(chooseRate({ ...form, seed: stored }, null)).toEqual({ rate: stored.rate, lookup: false })
  })
  it('a changed currency looks the rate up', () => {
    expect(chooseRate({ ...form, currency: 'SAR', seed: stored }, 22.1))
      .toEqual({ rate: 22.1, lookup: true })
  })
  it('a changed date looks the rate up', () => {
    expect(chooseRate({ ...form, spentOn: '2026-11-07', seed: stored }, 25.7))
      .toEqual({ rate: 25.7, lookup: true })
  })
  it('a stored value typed by hand, since cleared, looks the rate up', () => {
    expect(chooseRate({ ...form, seed: { ...stored, byHand: true } }, 25.6))
      .toEqual({ rate: 25.6, lookup: true })
  })
  it('after a change of home currency there is no stored rate, so it looks up', () => {
    const seed = seedRate(converted, 'USD')
    expect(chooseRate({ ...form, home: 'USD', seed }, 0.27)).toEqual({ rate: 0.27, lookup: true })
  })
  it('a future date waits: nothing to look up and no rate', () => {
    expect(chooseRate({ ...form, spentOn: '2026-11-12' }, 25.6)).toEqual({ rate: null, lookup: false })
    expect(chooseRate({ ...form, spentOn: '2026-11-11' }, 25.6)).toEqual({ rate: 25.6, lookup: true })
  })
})

describe('formatRate / rateLine', () => {
  it('shows enough decimals to be useful', () => {
    expect(formatRate(25.64, 'AED', 'INR')).toBe('₹25.64 per AED')
    expect(formatRate(2.1762, 'THB', 'INR')).toBe('₹2.176 per THB')
    expect(formatRate(0.28327, 'LKR', 'INR')).toBe('₹0.2833 per LKR')
  })
  const base = { typed: 120, currency: 'AED', home: 'INR', rate: 25.64, loading: false, byHand: false }
  it('says nothing for the home currency', () => {
    expect(rateLine({ ...base, currency: 'INR' })).toBeNull()
  })
  it('covers every state', () => {
    expect(rateLine({ ...base, rate: null, loading: true })).toBe('Getting the rate…')
    expect(rateLine({ ...base, typed: null })).toBe('₹25.64 per AED')
    expect(rateLine(base)).toBe('Counts as ₹3,077 · ₹25.64 per AED')
    expect(rateLine({ ...base, rate: 3100 / 120, byHand: true })).toBe('Counts as ₹3,100 · your value')
    expect(rateLine({ ...base, rate: null })).toBe('No rate yet. Saves in AED, converts later.')
  })
})

describe('waitingPairs / messages', () => {
  it('is one pair per currency and day, in input order', () => {
    const e = (currency: string, spentOn: string) => ({ currency, spentOn }) as Expense
    expect(waitingPairs([e('AED', '2026-11-06'), e('AED', '2026-11-06'), e('SAR', '2026-11-06'), e('AED', '2026-11-05')]))
      .toEqual([{ base: 'AED', date: '2026-11-06' }, { base: 'SAR', date: '2026-11-06' }, { base: 'AED', date: '2026-11-05' }])
  })
  it('treats a row with no currency as INR', () => {
    expect(waitingPairs([{ spentOn: '2026-11-06' } as Expense]))
      .toEqual([{ base: 'INR', date: '2026-11-06' }])
  })
  it('counts entries in plain words', () => {
    expect(convertedMessage(14, 'INR')).toBe('14 foreign entries converted to INR')
    expect(convertedMessage(1, 'INR')).toBe('1 foreign entry converted to INR')
  })
  it('names both amounts when an entry was converted', () => {
    const full = { ...converted, id: 'x', category: 'Food', spentOn: '2026-11-06', createdAt: '' } as Expense
    expect(savedMessage('🍽', full)).toBe(`🍽 ${formatMoney(120, 'AED')} · ₹3,076 added to Food`)
    expect(savedMessage('🍽', { ...full, paid: undefined, amount: 400 })).toBe('🍽 ₹400 added to Food')
  })
})

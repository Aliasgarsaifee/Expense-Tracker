import type { Expense, Paid } from '../db'
import { formatMoney, roundHome, toMinorUnits } from './money'

// Pure rules for entries paid in a foreign currency. Type-only imports from db
// keep this module free of Dexie, so the form, the background fill-in and
// History can share it.

export interface Typed {
  amount: number
  currency: string
}

// What the person actually handed over: the memo when the entry was converted,
// else the entry itself.
export function paidOf(e: Pick<Expense, 'amount' | 'currency' | 'paid'>): Typed {
  return e.paid
    ? { amount: e.paid.amount, currency: e.paid.currency }
    : { amount: e.amount, currency: e.currency }
}

export function paidLabel(e: Pick<Expense, 'paid'>): string | null {
  return e.paid ? formatMoney(e.paid.amount, e.paid.currency) : null
}

// The rate an edit form starts from. Only a converted entry whose stored
// currency is still the home currency has one; after a home-currency change
// the old conversion no longer means anything.
export function seedRate(
  initial: { amount?: number; currency?: string; paid?: Paid } | undefined,
  home: string,
): { rate: number; byHand: boolean } | null {
  if (!initial?.paid || initial.amount === undefined || initial.currency !== home) return null
  return { rate: initial.amount / initial.paid.amount, byHand: initial.paid.byHand === true }
}

// What a save writes. `paid` is always present as a key (undefined when there
// is no memo) because updateExpense needs it to delete a stale one.
export function entryValues(
  typed: Typed, home: string, rate: number | null, byHand: boolean,
): { amount: number; currency: string; paid: Paid | undefined } {
  if (typed.currency === home || rate === null) {
    return { amount: typed.amount, currency: typed.currency, paid: undefined }
  }
  const paid: Paid = { amount: typed.amount, currency: typed.currency }
  if (byHand) paid.byHand = true
  const value = typed.amount * rate
  return { amount: byHand ? toMinorUnits(value) : roundHome(value), currency: home, paid }
}

export function formatRate(rate: number, base: string, home: string): string {
  const digits = rate >= 10 ? 2 : rate >= 1 ? 3 : 4
  let shown: string
  try {
    shown = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: home,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(rate)
  } catch {
    // Malformed codes can arrive via an imported backup; never throw.
    shown = `${home} ${rate.toFixed(digits)}`
  }
  return `${shown} per ${base}`
}

export function rateLine(a: {
  typed: number | null; currency: string; home: string
  rate: number | null; loading: boolean; byHand: boolean
}): string | null {
  if (a.currency === a.home) return null
  if (a.rate === null) {
    return a.loading ? 'Getting the rate…' : `No rate yet. Saves in ${a.currency}, converts later.`
  }
  const per = formatRate(a.rate, a.currency, a.home)
  if (a.typed === null) return per
  const value = a.typed * a.rate
  const counts = formatMoney(a.byHand ? toMinorUnits(value) : roundHome(value), a.home)
  return `Counts as ${counts} · ${a.byHand ? 'your value' : per}`
}

// One rate lookup per currency and day, in the order entries arrive. The caller
// passes only entries that are still waiting.
export function waitingPairs(entries: Expense[]): { base: string; date: string }[] {
  const seen = new Set<string>()
  const pairs: { base: string; date: string }[] = []
  for (const e of entries) {
    const base = e.currency ?? 'INR' // rows from before multi-currency have none
    const key = `${base}|${e.spentOn}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push({ base, date: e.spentOn })
  }
  return pairs
}

export function convertedMessage(count: number, home: string): string {
  return `${count} foreign ${count === 1 ? 'entry' : 'entries'} converted to ${home}`
}

export function savedMessage(emoji: string, e: Expense): string {
  const home = formatMoney(e.amount, e.currency)
  const shown = e.paid ? `${formatMoney(e.paid.amount, e.paid.currency)} · ${home}` : home
  return `${emoji} ${shown} added to ${e.category}`
}

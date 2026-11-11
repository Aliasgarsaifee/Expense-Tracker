import type { Expense } from '../db'
import { shortDayMonth } from './dates'
import { paidOf } from './conversion'
import { formatTotals, type MoneyByCurrency } from './history'
import { formatMoney } from './money'

// Newest-first entries worth offering as a one-tap refill: distinct by what
// would be typed again, and only those that could be saved today — an
// archived category or method would re-file the spend somewhere hidden.
export function logAgainChoices(
  latest: Expense[],
  activeCategories: string[],
  activeMethodIds: string[],
  limit = 3,
): Expense[] {
  const seen = new Set<string>()
  const out: Expense[] = []
  for (const x of latest) {
    if (out.length >= limit) break
    if (!activeCategories.includes(x.category)) continue
    // An absent method (pre-v2 entry) is fine; a present but inactive one is not.
    if (x.paymentMethodId && !activeMethodIds.includes(x.paymentMethodId)) continue
    // What was typed, not what it converted to: the rate moves between trips.
    const paid = paidOf(x)
    const key = JSON.stringify([
      (x.note ?? '').trim().toLowerCase(),
      x.category,
      paid.amount,
      paid.currency,
      x.paymentMethodId,
    ])
    if (seen.has(key)) continue
    seen.add(key)
    out.push(x)
  }
  return out
}

// The Add screen's eyebrow. A converted entry already counts in the home
// currency; only entries still waiting for a rate stay in their own.
export function todaySoFar(expenses: Expense[], primary: string): string {
  if (expenses.length === 0) return 'Nothing logged today'
  const totals: MoneyByCurrency = {}
  for (const x of expenses) totals[x.currency] = (totals[x.currency] ?? 0) + x.amount
  return `Today so far · ${formatTotals(totals, primary)}`
}

// The Add button names what a tap will save, so the owner never has to
// reconstruct it from fields scrolled out of view. The date only appears when
// it is not today — the common case stays short.
export function addButtonLabel(
  amount: number | null,
  currency: string,
  category: string,
  spentOn: string,
  today: string,
): string {
  if (amount === null) return 'Add to ledger'
  const parts = [`Add ${formatMoney(amount, currency)}`, category]
  if (spentOn !== today) parts.push(shortDayMonth(spentOn))
  return parts.join(' · ')
}

import type { Expense } from '../db'
import {
  bucketKeyOf,
  bucketKeysBetween,
  elapsedDays,
  type Bounds,
  type TrendUnit,
} from './period'

export interface CategoryTotal {
  category: string
  total: number
  count: number
}

export interface TrendBucket {
  key: string // 'YYYY-MM-DD' (day/week start) | 'YYYY-MM' | 'YYYY', per unit
  total: number
  count: number
}

export interface PaymentTotal {
  paymentMethodId: string | null // null groups pre-v2 entries with no method
  total: number
  count: number
}

export interface MonthSummary {
  total: number
  count: number
  byCategory: CategoryTotal[]
  byPayment: PaymentTotal[]
}

// Ascending by id, entries with no payment method last.
function comparePaymentIds(a: string | null, b: string | null): number {
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  return a.localeCompare(b)
}

// Amounts are summed as-is: callers must pass a single-currency list
// (see splitByCurrency).
export function summarize(expenses: Expense[]): MonthSummary {
  let total = 0
  const categories = new Map<string, CategoryTotal>()
  const payments = new Map<string | null, PaymentTotal>()
  for (const e of expenses) {
    total += e.amount
    const category = categories.get(e.category) ?? {
      category: e.category,
      total: 0,
      count: 0,
    }
    category.total += e.amount
    category.count += 1
    categories.set(e.category, category)
    const paymentMethodId = e.paymentMethodId ?? null
    const payment = payments.get(paymentMethodId) ?? {
      paymentMethodId,
      total: 0,
      count: 0,
    }
    payment.total += e.amount
    payment.count += 1
    payments.set(paymentMethodId, payment)
  }
  const byCategory = [...categories.values()].sort(
    (a, b) => b.total - a.total || a.category.localeCompare(b.category),
  )
  const byPayment = [...payments.values()].sort(
    (a, b) =>
      b.total - a.total ||
      b.count - a.count ||
      comparePaymentIds(a.paymentMethodId, b.paymentMethodId),
  )
  return { total, count: expenses.length, byCategory, byPayment }
}

// INR first when present, then by descending entry count, tie code asc.
export function splitByCurrency(
  expenses: Expense[],
): { currency: string; expenses: Expense[] }[] {
  const buckets = new Map<string, Expense[]>()
  for (const e of expenses) {
    const bucket = buckets.get(e.currency) ?? []
    bucket.push(e)
    buckets.set(e.currency, bucket)
  }
  return [...buckets.entries()]
    .map(([currency, list]) => ({ currency, expenses: list }))
    .sort((a, b) => {
      if (a.currency === 'INR') return -1
      if (b.currency === 'INR') return 1
      return (
        b.expenses.length - a.expenses.length ||
        a.currency.localeCompare(b.currency)
      )
    })
}

export function biggestExpense(expenses: Expense[]): Expense | null {
  let biggest: Expense | null = null
  for (const e of expenses) {
    if (biggest === null || e.amount > biggest.amount) biggest = e
  }
  return biggest
}

export function busiestDay(
  expenses: Expense[],
): { date: string; total: number } | null {
  const totals = new Map<string, number>()
  for (const e of expenses) {
    totals.set(e.spentOn, (totals.get(e.spentOn) ?? 0) + e.amount)
  }
  let busiest: { date: string; total: number } | null = null
  for (const [date, total] of totals) {
    if (
      busiest === null ||
      total > busiest.total ||
      (total === busiest.total && date > busiest.date)
    ) {
      busiest = { date, total }
    }
  }
  return busiest
}

// Spend per elapsed day over any period (elapsedDays counts from→today while
// the period is still running, the full span once it is past).
export function averagePerDay(total: number, bounds: Bounds, today: string): number {
  if (total === 0) return 0
  return total / elapsedDays(bounds, today)
}

// busiestDay's rule at month grain, for periods too long for a single day to
// be the interesting unit (a year, all time). Ties go to the later month.
export function busiestMonth(
  expenses: Expense[],
): { month: string; total: number } | null {
  const totals = new Map<string, number>()
  for (const e of expenses) {
    const month = e.spentOn.slice(0, 7)
    totals.set(month, (totals.get(month) ?? 0) + e.amount)
  }
  let busiest: { month: string; total: number } | null = null
  for (const [month, total] of totals) {
    if (
      busiest === null ||
      total > busiest.total ||
      (total === busiest.total && month > busiest.month)
    ) {
      busiest = { month, total }
    }
  }
  return busiest
}

// Straight-line projection of a still-running period: today's pace held to the
// end. Honest arithmetic, tempered by the "by <end date>" sub-label.
export function projectTotal(total: number, elapsed: number, totalDays: number): number {
  if (elapsed <= 0) return total
  return Math.round((total / elapsed) * totalDays)
}

// Elapsed days on which nothing was logged — a "restraint" counter for the
// current-period daily-average tile. Only dates within the elapsed window
// count as spend days (a future-dated entry hasn't happened yet).
export function noSpendDays(expenses: Expense[], bounds: Bounds, today: string): number {
  const effectiveTo = today < bounds.to ? today : bounds.to
  const spent = new Set<string>()
  for (const e of expenses) {
    if (e.spentOn >= bounds.from && e.spentOn <= effectiveTo) spent.add(e.spentOn)
  }
  return Math.max(0, elapsedDays(bounds, today) - spent.size)
}

// Spend-over-time series for the trend chart, zero-filled across the whole
// range (see bucketKeysBetween) so gaps read as ₹0. Amounts are summed as-is:
// callers pass a single-currency list, like summarize.
export function trendBuckets(
  expenses: Expense[],
  bounds: Bounds,
  unit: TrendUnit,
): TrendBucket[] {
  const totals = new Map<string, { total: number; count: number }>()
  for (const key of bucketKeysBetween(bounds, unit)) totals.set(key, { total: 0, count: 0 })
  for (const e of expenses) {
    const bucket = totals.get(bucketKeyOf(e.spentOn, unit))
    if (bucket) {
      bucket.total += e.amount
      bucket.count += 1
    }
  }
  return [...totals.entries()].map(([key, v]) => ({ key, total: v.total, count: v.count }))
}

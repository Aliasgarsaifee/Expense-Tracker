import type { Expense } from '../db'

export interface CategoryTotal {
  category: string
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

// For the current month averages over days elapsed, not the full month.
export function dailyAverage(
  total: number,
  month: string,
  todayIso: string,
): number {
  if (total === 0) return 0
  if (month === todayIso.slice(0, 7)) {
    return total / Number(todayIso.slice(8, 10))
  }
  const [year, monthNum] = month.split('-').map(Number)
  return total / new Date(year, monthNum, 0).getDate()
}

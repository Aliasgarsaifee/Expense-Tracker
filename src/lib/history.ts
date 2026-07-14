import type { Expense } from '../db'
import { formatMoney } from './money'

export interface MoneyByCurrency {
  [currency: string]: number
}

export interface DayGroup {
  date: string
  items: Expense[]
  totals: MoneyByCurrency
}

export interface MonthGroup {
  month: string
  days: DayGroup[]
  totals: MoneyByCurrency
  count: number
}

export interface HistoryFilter {
  month?: string | null
  paymentMethodIds?: readonly string[] | null // OR within; empty/null = all
  categories?: readonly string[] | null       // OR within; empty/null = all
  from?: string | null // inclusive ISO date bound
  to?: string | null   // inclusive ISO date bound
  query?: string
}

// A cross-screen jump into History. A settings-row tap sends just a method or
// category (→ All time); a Summary drill also sends the period as month OR
// from/to (never both, preserving History's pager-XOR-range invariant).
export interface HistoryJump {
  paymentMethodId?: string | null
  category?: string | null
  month?: string | null
  from?: string | null
  to?: string | null
}

export type HistorySort = 'newest' | 'oldest' | 'largest' | 'smallest'

// Date modes keep the day/month grouping; amount modes flatten to a ranked list.
export function isGroupedSort(sort: HistorySort): boolean {
  return sort === 'newest' || sort === 'oldest'
}

// A stable total order per mode. Amount modes rank by the raw number across
// currencies — there is no FX in this app, so a mixed-currency ranking is not
// value-accurate; acceptable because the ledger is effectively single-currency.
// Every mode breaks ties down to createdAt so the order never wobbles between
// renders. Returns a new array; never mutates the input (it is a live-query result).
export function sortExpenses(expenses: Expense[], sort: HistorySort): Expense[] {
  const byNewest = (a: Expense, b: Expense) =>
    b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt)
  const comparators: Record<HistorySort, (a: Expense, b: Expense) => number> = {
    newest: byNewest,
    oldest: (a, b) =>
      a.spentOn.localeCompare(b.spentOn) || a.createdAt.localeCompare(b.createdAt),
    largest: (a, b) => b.amount - a.amount || byNewest(a, b),
    smallest: (a, b) => a.amount - b.amount || byNewest(a, b),
  }
  return [...expenses].sort(comparators[sort])
}

// Dimensions AND together; the id/label arrays OR within their dimension.
// Date bounds compare lexicographically — ISO dates make that chronological.
export function filterExpenses(expenses: Expense[], f: HistoryFilter): Expense[] {
  const q = f.query?.trim().toLowerCase() ?? ''
  const methodIds = f.paymentMethodIds?.length ? new Set(f.paymentMethodIds) : null
  const categories = f.categories?.length ? new Set(f.categories) : null
  return expenses.filter((e) => {
    if (f.month && !e.spentOn.startsWith(`${f.month}-`)) return false
    if (methodIds && (!e.paymentMethodId || !methodIds.has(e.paymentMethodId))) return false
    if (categories && !categories.has(e.category)) return false
    if (f.from && e.spentOn < f.from) return false
    if (f.to && e.spentOn > f.to) return false
    if (q) {
      const haystacks = [e.note ?? '', e.category, String(e.amount)]
      if (!haystacks.some((h) => h.toLowerCase().includes(q))) return false
    }
    return true
  })
}

function addTotal(totals: MoneyByCurrency, currency: string, amount: number) {
  totals[currency] = (totals[currency] ?? 0) + amount
}

// listExpenses sorts by day, so equal dates are always contiguous.
export function groupByDay(expenses: Expense[]): DayGroup[] {
  const out: DayGroup[] = []
  for (const e of expenses) {
    let last = out[out.length - 1]
    if (last?.date !== e.spentOn) {
      last = { date: e.spentOn, items: [], totals: {} }
      out.push(last)
    }
    last.items.push(e)
    addTotal(last.totals, e.currency, e.amount)
  }
  return out
}

export function groupByMonth(expenses: Expense[]): MonthGroup[] {
  const out: MonthGroup[] = []
  for (const day of groupByDay(expenses)) {
    const month = day.date.slice(0, 7)
    let last = out[out.length - 1]
    if (last?.month !== month) {
      last = { month, days: [], totals: {}, count: 0 }
      out.push(last)
    }
    last.days.push(day)
    last.count += day.items.length
    for (const [currency, amount] of Object.entries(day.totals)) {
      addTotal(last.totals, currency, amount)
    }
  }
  return out
}

export function formatTotals(totals: MoneyByCurrency, primary = 'INR'): string {
  const codes = Object.keys(totals).sort(
    (a, b) =>
      Number(b === primary) - Number(a === primary) || a.localeCompare(b),
  )
  return codes.map((code) => formatMoney(totals[code], code)).join(' + ')
}

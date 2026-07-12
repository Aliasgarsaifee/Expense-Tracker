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
  paymentMethodId?: string | null
  query?: string
}

export function filterExpenses(expenses: Expense[], f: HistoryFilter): Expense[] {
  const q = f.query?.trim().toLowerCase() ?? ''
  return expenses.filter((e) => {
    if (f.month && !e.spentOn.startsWith(`${f.month}-`)) return false
    if (f.paymentMethodId && e.paymentMethodId !== f.paymentMethodId) return false
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

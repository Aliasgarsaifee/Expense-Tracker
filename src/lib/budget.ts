import type { Expense } from '../db'
import { addMonths, monthName, monthOf } from './dates'
import { formatMoney } from './money'
import type { Badge } from './fixed'

// Everything here is single-currency: callers pass amounts for one currency,
// and a budget is looked up per currency. Nothing is summed or converted.

export type Budgets = Record<string, number>
export type BudgetLevel = 'under' | 'near' | 'over'

// Spending at or past this share of the budget is "near".
export const NEAR_SHARE = 0.8

const RANK: Record<BudgetLevel, number> = { under: 0, near: 1, over: 2 }

function isAmount(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

// The stored value came from localStorage, so it can be anything (legacy,
// hand-edited, corrupt). Junk reads as "no budget"; it must never throw.
export function readBudgets(raw: unknown): Budgets {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const out: Budgets = {}
  for (const [currency, value] of Object.entries(raw)) {
    if (isAmount(value)) out[currency] = value
  }
  return out
}

export function budgetFor(budgets: Budgets, currency: string): number | null {
  const v = Object.hasOwn(budgets, currency) ? budgets[currency] : undefined
  return isAmount(v) ? v : null
}

export function budgetLevel(spent: number, budget: number): BudgetLevel {
  if (spent > budget) return 'over'
  return spent >= NEAR_SHARE * budget ? 'near' : 'under'
}

// Only a rising level is worth announcing; under → over reports 'over'.
export function budgetCrossing(
  before: number,
  after: number,
  budget: number,
): 'near' | 'over' | null {
  const level = budgetLevel(after, budget)
  if (level === 'under') return null
  return RANK[level] > RANK[budgetLevel(before, budget)] ? level : null
}

export interface BudgetStatus {
  left: number // budget − spent, may be negative
  perDay: number | null // rounded; null when no days remain or nothing is left
  usedShare: number // 0..1, clamped
  evenShare: number // elapsed / totalDays
  level: BudgetLevel
}

export function budgetStatus(
  spent: number,
  budget: number,
  elapsed: number,
  totalDays: number,
): BudgetStatus {
  const left = budget - spent
  const remaining = totalDays - elapsed
  return {
    left,
    perDay: remaining > 0 && left > 0 ? Math.round(left / remaining) : null,
    usedShare: Math.min(1, Math.max(0, spent / budget)),
    evenShare: elapsed / totalDays,
    level: budgetLevel(spent, budget),
  }
}

export function budgetBadge(status: BudgetStatus, currency: string): Badge {
  switch (status.level) {
    case 'under':
      return { tone: 'positive', text: 'On track' }
    case 'near':
      return { tone: 'caution', text: 'Close' }
    case 'over':
      return { tone: 'negative', text: `Over by ${formatMoney(-status.left, currency)}` }
  }
}

// The map with one currency's budget set, changed or removed. A fresh object,
// because App holds it in state; a non-amount removes, as readBudgets would
// drop it on the next launch anyway.
export function withBudget(
  budgets: Budgets,
  currency: string,
  amount: number | null,
): Budgets {
  const next = { ...budgets }
  if (isAmount(amount)) next[currency] = amount
  else delete next[currency]
  return next
}

// The budget spread evenly over the month, for the dashed line on the daily
// chart. The value stays exact so the line sits true; only the label rounds, down.
export function budgetReference(
  budget: number,
  totalDays: number,
  currency: string,
): { value: number; label: string } {
  const value = budget / totalDays
  // Floor, not round: a rounded-up figure times the month's days overshoots the budget.
  return { value, label: `${formatMoney(Math.floor(value), currency)} a day keeps the budget` }
}

export interface BudgetCardCopy {
  amount: string // the figure, set large: "₹16,270"
  of: string // what follows it: "left of ₹25,000" | "over ₹25,000"
  perDay: string | null
  bar: string // the bar and its even-pace tick, for VoiceOver
}

const percent = (share: number) => `${Math.round(share * 100)}%`

export function budgetCardCopy(
  status: BudgetStatus,
  budget: number,
  daysLeft: number,
  currency: string,
): BudgetCardCopy {
  const over = status.left < 0
  let perDay: string | null = null
  if (status.perDay !== null) {
    const each = formatMoney(status.perDay, currency)
    perDay =
      daysLeft === 1 ? `${each} for the last day` : `${each} a day for the next ${daysLeft} days`
  }
  // usedShare is clamped for the bar's width; the words give the real share,
  // so a month 5% over does not read as exactly spent.
  const used = `${percent((budget - status.left) / budget)} of the budget used`
  return {
    amount: formatMoney(Math.abs(status.left), currency),
    of: `${over ? 'over' : 'left of'} ${formatMoney(budget, currency)}`,
    perDay,
    // The card shows no even-pace tick once no days are left, so neither do
    // the words.
    bar: daysLeft > 0 ? `${used}; even pace today is ${percent(status.evenShare)}` : used,
  }
}

// What the words need to know about a save that moved the month's level.
// budgetCheck's BudgetAlert carries all of it; spelling it out here keeps
// budget.ts free of the database.
export interface AlertFacts {
  currency: string
  budget: number
  spent: number
  month: string // 'YYYY-MM'
  daysLeft: number // after today
  entry: { amount: number; category: string; note?: string }
}

// The second line of the save toast at 80%. The share is the real one, so a
// save that lands on 83% does not read as exactly the mark.
export function budgetHeadsUp({
  spent,
  budget,
  currency,
}: Pick<AlertFacts, 'spent' | 'budget' | 'currency'>): string {
  return `${percent(spent / budget)} of ${formatMoney(budget, currency)} used this month`
}

export interface BudgetAlertCopy {
  pill: string
  title: string
  sentence: string // names the entry that did it
  spent: string // the figure, set large
  of: string
  over: string
  daysLeft: string
  bar: string // the bar, for VoiceOver
  withinShare: number // the budget's part of the bar, 0..1
  overShare: number // the overshoot's part; the two sum to 1
}

// The sheet for the save that took the month past its budget. A fact and the
// room left in the month, nothing more: the owner set the line, and the sheet
// is there to say it was crossed, not to scold.
export function budgetAlertCopy(alert: AlertFacts): BudgetAlertCopy {
  const { currency, budget, spent, month, daysLeft, entry } = alert
  const name = monthName(month)
  return {
    pill: 'Over budget',
    title: 'Monthly budget crossed',
    sentence: `${entry.note || entry.category}, ${formatMoney(entry.amount, currency)}, took ${name}’s everyday spending past the line you set.`,
    spent: formatMoney(spent, currency),
    of: `of ${formatMoney(budget, currency)}`,
    over: `${formatMoney(spent - budget, currency)} over`,
    // daysLeft counts the days after today, so 0 means today is the last.
    daysLeft:
      daysLeft === 0
        ? `Last day of ${name}`
        : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left in ${name}`,
    bar: `${percent(spent / budget)} of the budget used`,
    withinShare: budget / spent,
    overShare: (spent - budget) / spent,
  }
}

// Callers pass one currency's everyday entries, so the totals never mix.
export function monthTotals(expenses: Expense[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const e of expenses) {
    const month = monthOf(e.spentOn)
    totals.set(month, (totals.get(month) ?? 0) + e.amount)
  }
  return totals
}

export interface YearLine {
  month: string // 'YYYY-MM'
  spent: number
  diff: number // budget − spent; positive = under
  running: number | null // Σ diff through this month; null on the partial month
  partial: boolean // the month `today` is in
}

// The year's months from the later of January and the first month the ledger
// was in use, to December for a past year or the current month otherwise. The
// current month is still being spent, so it is listed but never accrues: its
// diff would read as a saving that has not happened yet.
export function yearLedger(
  everydayByMonth: Map<string, number>,
  budget: number,
  year: string,
  today: string,
  firstMonth: string | null,
): YearLine[] {
  const thisMonth = monthOf(today)
  const jan = `${year}-01`
  const start = firstMonth !== null && firstMonth > jan ? firstMonth : jan
  const end = year < thisMonth.slice(0, 4) ? `${year}-12` : thisMonth
  const lines: YearLine[] = []
  let running = 0
  for (let month = start; month <= end && month.startsWith(year); month = addMonths(month, 1)) {
    const spent = everydayByMonth.get(month) ?? 0
    const diff = budget - spent
    const partial = month === thisMonth
    if (!partial) running += diff
    lines.push({ month, spent, diff, running: partial ? null : running, partial })
  }
  return lines
}

// What earlier months left in hand (negative: still to make up).
export function carriedInto(lines: YearLine[]): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].partial) return lines[i].running
  }
  return null
}

// Complete months only; a month exactly on budget is neither over nor under.
export function yearTally(lines: YearLine[]): {
  overCount: number
  overTotal: number
  underCount: number
  underTotal: number
} {
  const tally = { overCount: 0, overTotal: 0, underCount: 0, underTotal: 0 }
  for (const { diff, partial } of lines) {
    if (partial || diff === 0) continue
    if (diff < 0) {
      tally.overCount++
      tally.overTotal -= diff
    } else {
      tally.underCount++
      tally.underTotal += diff
    }
  }
  return tally
}

export function yearSentence(lines: YearLine[], currency: string): string {
  if (lines.every((l) => l.partial)) return ''
  const { overCount, overTotal, underCount, underTotal } = yearTally(lines)
  if (overCount === 0) return 'No month has run over.'
  const over =
    overCount === 1
      ? `1 month ran over, by ${formatMoney(overTotal, currency)}.`
      : `${overCount} months ran over, by ${formatMoney(overTotal, currency)} in all.`
  if (underCount === 0) return over
  const others = underCount === 1 ? 'The other month' : `The other ${underCount}`
  const covered = underTotal >= overTotal ? ' and covered it' : ''
  return `${over} ${others} came in ${formatMoney(underTotal, currency)} under${covered}.`
}

// The line under the budget alert that ties this month's overrun to the year.
// `over` is how far the month is past its budget; null when no month is
// complete, so there is nothing to tie it to.
export function alertYearLine(
  carried: number | null,
  over: number,
  currency: string,
): string | null {
  if (carried === null) return null
  const net = carried - over
  if (carried <= 0) return `The year is now ${formatMoney(over - carried, currency)} over.`
  const hand = `Earlier months left ${formatMoney(carried, currency)} in hand`
  return net >= 0
    ? `${hand}, so the year is still ${formatMoney(net, currency)} under.`
    : `${hand}; the year is now ${formatMoney(-net, currency)} over.`
}

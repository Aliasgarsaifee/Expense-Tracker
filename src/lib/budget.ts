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
// chart. The value stays exact so the line sits true; only the label rounds.
export function budgetReference(
  budget: number,
  totalDays: number,
  currency: string,
): { value: number; label: string } {
  const value = budget / totalDays
  return { value, label: `${formatMoney(Math.round(value), currency)} a day keeps the budget` }
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

import { firstExpenseMonth, listCategories, listExpensesBetween, type Expense } from '../db'
import { budgetCrossing, budgetFor, carriedIntoMonth, earlierThisYear, type Budgets } from './budget'
import { daysSince, monthOf } from './dates'
import { everydayIn, fixedLabels } from './fixed'
import { periodBounds } from './period'

export interface BudgetAlert {
  kind: 'near' | 'over'
  currency: string
  budget: number
  spent: number
  month: string // 'YYYY-MM'
  daysLeft: number
  entry: Expense
  // What earlier months of the year left in hand. Only the over sheet shows
  // it, so a heads-up never reads it; null then, in a first month, or when the
  // read failed.
  carried: number | null
}

// Stored amounts are clamped to minor units (parseAmount), but their float sum
// is not: 673.58 + 14.21 is 687.7900000000001, which would call a month spent
// exactly to its budget over. Every currency here is entered to 2 decimals.
const toMinorUnits = (n: number) => Math.round(n * 100) / 100

// Judges one just-persisted save, and never rejects: the entry is already
// stored, so a failed read may cost the alert but must never fail or block the
// save. Callers simply await it.
export async function checkBudgetAfterSave(
  saved: Expense,
  previous: Expense | null,
  budgets: Budgets,
  today: string,
): Promise<BudgetAlert | null> {
  try {
    return await judgeSave(saved, previous, budgets, today)
  } catch (err) {
    console.error('budget check failed', err)
    return null
  }
}

// The database already holds `saved`, so the pre-save total is derived from
// the post-save one rather than queried.
async function judgeSave(
  saved: Expense,
  previous: Expense | null,
  budgets: Budgets,
  today: string,
): Promise<BudgetAlert | null> {
  const month = monthOf(today)
  if (monthOf(saved.spentOn) !== month) return null
  const budget = budgetFor(budgets, saved.currency)
  if (budget === null) return null

  // Archived categories still make their entries fixed.
  const fixed = fixedLabels(await listCategories({ includeArchived: true }))
  const counts = (e: Expense) =>
    monthOf(e.spentOn) === month && e.currency === saved.currency && !fixed.has(e.category)
      ? e.amount
      : 0

  // Day 31 covers every month: ISO dates compare as strings and the bound is inclusive.
  const entries = await listExpensesBetween(`${month}-01`, `${month}-31`)
  const after = toMinorUnits(entries.reduce((sum, e) => sum + counts(e), 0))
  const before = toMinorUnits(after - counts(saved) + (previous ? counts(previous) : 0))

  const kind = budgetCrossing(before, after, budget)
  if (kind === null) return null

  return {
    kind,
    currency: saved.currency,
    budget,
    spent: after,
    month,
    daysLeft: daysSince(today, periodBounds({ kind: 'month', month })!.to),
    entry: saved,
    carried: kind === 'over' ? await yearCarried(month, today, saved.currency, budget, fixed) : null,
  }
}

// The year's earlier months are read only once the month is over its line,
// so they can never change which saves alert. The year line is a footnote to
// the alert: a failed read drops the line, never the alert.
async function yearCarried(
  month: string,
  today: string,
  currency: string,
  budget: number,
  fixed: Set<string>,
): Promise<number | null> {
  const earlier = earlierThisYear(month)
  if (earlier === null) return null
  try {
    const everyday = everydayIn(await listExpensesBetween(earlier.from, earlier.to), currency, fixed)
    return carriedIntoMonth(everyday, budget, month, today, await firstExpenseMonth(currency))
  } catch (err) {
    console.error('budget check: year balance unavailable', err)
    return null
  }
}

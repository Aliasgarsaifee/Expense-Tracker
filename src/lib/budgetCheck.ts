import { listCategories, listExpensesBetween, type Expense } from '../db'
import { budgetCrossing, budgetFor, type Budgets } from './budget'
import { monthOf } from './dates'
import { fixedLabels } from './fixed'

export interface BudgetAlert {
  kind: 'near' | 'over'
  currency: string
  budget: number
  spent: number
  month: string // 'YYYY-MM'
  daysLeft: number
  entry: Expense
  isNew: boolean // false when an edit did it — the sheet then offers no Undo
}

// Judges one just-persisted save. The database already holds `saved`, so the
// pre-save total is derived from the post-save one rather than queried.
export async function checkBudgetAfterSave(
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

  const [y, m] = month.split('-').map(Number)
  const entries = await listExpensesBetween(`${month}-01`, `${month}-31`)
  const after = entries.reduce((sum, e) => sum + counts(e), 0)
  const before = after - counts(saved) + (previous ? counts(previous) : 0)

  const kind = budgetCrossing(before, after, budget)
  if (kind === null) return null
  return {
    kind,
    currency: saved.currency,
    budget,
    spent: after,
    month,
    daysLeft: new Date(y, m, 0).getDate() - Number(today.slice(8, 10)),
    entry: saved,
    isNew: previous === null,
  }
}

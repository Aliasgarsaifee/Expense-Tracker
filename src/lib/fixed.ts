import { isFixedCategory, type Category, type Expense } from '../db'
import { monthOf } from './dates'
import { formatMoney } from './money'
import { projectTotal } from './summarize'

// Everything here is single-currency: amounts are summed as-is, so callers
// split by currency first (see splitByCurrency) and call once per currency.

export type FixedStatus = 'none' | 'not-logged' | 'to-come' | 'as-usual' | 'above'
export type Tone = 'positive' | 'caution' | 'pending' | 'negative'
export interface Badge {
  tone: Tone
  text: string
}
export interface FixedLine {
  category: string // label, the foreign key expenses carry
  spent: number
  usual: number | null // null: no history month has an entry
  status: FixedStatus
  // |usual − spent| for to-come, above and not-logged; 0 for as-usual and none.
  gap: number
}

// Expenses reference categories by label, so the split works on labels.
// Archived and renamed categories stay fixed because the caller passes every
// category and fixedness is read only through isFixedCategory.
export function fixedLabels(categories: Category[]): Set<string> {
  return new Set(categories.filter(isFixedCategory).map((c) => c.label))
}

// A label with no category record (deleted/unknown) is everyday.
export function splitFixed(
  expenses: Expense[],
  fixed: Set<string>,
): { fixed: Expense[]; everyday: Expense[] } {
  const out: { fixed: Expense[]; everyday: Expense[] } = { fixed: [], everyday: [] }
  for (const e of expenses) (fixed.has(e.category) ? out.fixed : out.everyday).push(e)
  return out
}

// Median: one odd month (a back-paid deposit) shouldn't skew "usual".
export function usualAmount(monthTotals: number[]): number | null {
  if (monthTotals.length === 0) return null
  const sorted = [...monthTotals].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function totalsByLabel(expenses: Expense[], fixed: Set<string>): Map<string, number> {
  const totals = new Map<string, number>()
  for (const e of expenses) {
    if (fixed.has(e.category)) totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount)
  }
  return totals
}

// Compared as spent*10 vs usual*9 / *11 so the inclusive 90%/110% bounds don't
// depend on binary float luck (1.1 * 1000 === 1100.0000000000002).
function classify(spent: number, usual: number | null): FixedStatus {
  if (usual === null) return 'none'
  if (spent === 0) return 'not-logged'
  if (spent * 10 < usual * 9) return 'to-come'
  if (spent * 10 > usual * 11) return 'above'
  return 'as-usual'
}

// `history` is the three calendar months before the viewed one. A month in
// which a label has no entry is skipped, not counted as zero.
export function fixedLines(
  thisMonth: Expense[],
  history: Expense[],
  fixed: Set<string>,
): FixedLine[] {
  const spentNow = totalsByLabel(thisMonth, fixed)
  const perMonth = new Map<string, number[]>()
  const byMonth = new Map<string, Expense[]>()
  for (const e of history) {
    const month = monthOf(e.spentOn)
    byMonth.set(month, [...(byMonth.get(month) ?? []), e])
  }
  for (const monthExpenses of byMonth.values()) {
    for (const [label, total] of totalsByLabel(monthExpenses, fixed)) {
      perMonth.set(label, [...(perMonth.get(label) ?? []), total])
    }
  }
  const labels = new Set([...spentNow.keys(), ...perMonth.keys()])
  const lines = [...labels].map((category): FixedLine => {
    const spent = spentNow.get(category) ?? 0
    const usual = usualAmount(perMonth.get(category) ?? [])
    const status = classify(spent, usual)
    const gap =
      usual !== null && status !== 'as-usual' ? Math.abs(usual - spent) : 0
    return { category, spent, usual, status, gap }
  })
  return lines.sort(
    (a, b) =>
      Math.max(b.spent, b.usual ?? 0) - Math.max(a.spent, a.usual ?? 0) ||
      a.category.localeCompare(b.category),
  )
}

// What fixed costs will total by month end: what's paid, or the usual if not
// yet (or fully) paid.
export function expectedFixed(lines: FixedLine[]): number {
  return lines.reduce((sum, l) => sum + Math.max(l.spent, l.usual ?? 0), 0)
}

// Fixed counts once; only everyday spending is extrapolated per day.
export function paceWithFixed(
  expected: number,
  everydaySpent: number,
  elapsed: number,
  totalDays: number,
): number {
  return expected + projectTotal(everydaySpent, elapsed, totalDays)
}

export function fixedBadge(line: FixedLine, currency: string): Badge | null {
  switch (line.status) {
    case 'as-usual':
      return { tone: 'positive', text: 'As usual' }
    case 'above':
      return { tone: 'caution', text: `${formatMoney(line.gap, currency)} above usual` }
    case 'to-come':
      return { tone: 'pending', text: `${formatMoney(line.gap, currency)} to come` }
    case 'not-logged':
      return { tone: 'pending', text: 'Not logged yet' }
    case 'none':
      return null
  }
}

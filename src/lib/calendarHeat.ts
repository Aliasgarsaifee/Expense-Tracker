import type { Expense } from '../db'

export type HeatBasis = 'all' | 'month' | 'year'

const LEVELS = 4
const GAMMA = 0.5 // sqrt curve, so a mid day still shows

// The normalization bucket a day belongs to: one global bucket, its month, or
// its year. Global lets heavy periods read as heavy across the whole scroll;
// Month/Year restore local contrast when one outlier day would otherwise flatten
// everything — the configurable basis is the outlier fix.
function bucketKey(iso: string, basis: HeatBasis): string {
  if (basis === 'month') return iso.slice(0, 7)
  if (basis === 'year') return iso.slice(0, 4)
  return 'all'
}

// Per-day spend-heat level (1..LEVELS) for `currency`, keyed by ISO date; days
// with no spend in that currency are omitted. Only `currency` contributes —
// there is no FX in this app, so mixing currencies into one scale is meaningless.
// Level scales the day's total against the strongest day in its bucket on a sqrt
// curve; any spend lands at least level 1.
export function heatLevels(
  expenses: Expense[],
  currency: string,
  basis: HeatBasis,
): Map<string, number> {
  const dayTotals = new Map<string, number>()
  for (const e of expenses) {
    if (e.currency !== currency) continue
    dayTotals.set(e.spentOn, (dayTotals.get(e.spentOn) ?? 0) + e.amount)
  }

  const bucketMax = new Map<string, number>()
  for (const [day, total] of dayTotals) {
    const key = bucketKey(day, basis)
    if (total > (bucketMax.get(key) ?? 0)) bucketMax.set(key, total)
  }

  const levels = new Map<string, number>()
  for (const [day, total] of dayTotals) {
    if (total <= 0) continue
    const max = bucketMax.get(bucketKey(day, basis)) ?? total
    const frac = max > 0 ? total / max : 1
    const level = Math.min(LEVELS, Math.max(1, Math.ceil(frac ** GAMMA * LEVELS)))
    levels.set(day, level)
  }
  return levels
}

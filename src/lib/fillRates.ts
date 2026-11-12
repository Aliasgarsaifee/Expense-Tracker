import { convertExpense, listWaiting, type Expense } from '../db'
import { waitingPairs } from './conversion'
import { fetchRate } from './rates'

// A long offline stretch can leave months waiting, and one request per day
// would then hammer the service on every resume. A pass asks for this many
// days at most, newest first; what it converts shortens the list, so the rest
// follow on later passes instead of never.
export const PAIR_CAP = 60

export type GetRate = (base: string, quote: string, date: string) => Promise<number | null>

export interface FillOptions {
  /** When the default currency last changed; older entries are left alone
   *  (see listWaiting). */
  since?: string
  /** Called after each conversion, before the next one, with the entry as it
   *  was and as it is now stored. Awaited, so a caller reading totals sees
   *  them one conversion at a time. */
  onConverted?: (before: Expense, after: Expense) => void | Promise<void>
}

// Resume, online and a fresh save can all ask at once; the second asker has
// nothing to add because the first pass already covers every waiting entry.
let running = false

// Converts what it can and returns how many entries it converted. Never
// rejects: this is a best-effort background pass, not something to surface.
export async function fillMissingRates(
  home: string,
  today: string,
  getRate: GetRate = fetchRate,
  { since, onConverted }: FillOptions = {},
): Promise<number> {
  if (running) return 0
  running = true
  try {
    const waiting = await listWaiting(home, today, since)
    const pairs = waitingPairs(waiting).slice(0, PAIR_CAP)
    if (pairs.length === 0) return 0

    let converted = 0
    for (const pair of pairs) {
      const { base, date } = pair
      let rate: number | null
      try {
        rate = await getRate(base, home, date)
      } catch {
        continue
      }
      if (rate === null) continue
      for (const e of waiting) {
        if ((e.currency ?? 'INR') !== base || e.spentOn !== date) continue
        // The list is a snapshot; convertExpense re-checks the pair against
        // the row as it is now, since the owner may have edited it meanwhile.
        const after = await convertExpense(e.id, rate, home, pair)
        if (!after) continue
        converted++
        try {
          await onConverted?.(e, after)
        } catch (err) {
          // The entry is converted either way; the caller's follow-up is not
          // worth stopping the pass for.
          console.error('after a conversion', err)
        }
      }
    }
    return converted
  } catch (err) {
    console.error('rate fill-in failed', err)
    return 0
  } finally {
    running = false
  }
}

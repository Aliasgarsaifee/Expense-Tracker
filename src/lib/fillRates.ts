import { convertExpense, listWaiting } from '../db'
import { waitingPairs } from './conversion'
import { fetchRate } from './rates'

// A long offline stretch can leave months waiting; one request per day would
// then hammer the service on every resume, so past this many pairs the pass
// does nothing and the entries simply stay in their own currency.
export const PAIR_CAP = 60

export type GetRate = (base: string, quote: string, date: string) => Promise<number | null>

// Resume, online and a fresh save can all ask at once; the second asker has
// nothing to add because the first pass already covers every waiting entry.
let running = false

// Converts what it can and returns how many entries it converted. Never
// rejects: this is a best-effort background pass, not something to surface.
export async function fillMissingRates(
  home: string,
  today: string,
  getRate: GetRate = fetchRate,
): Promise<number> {
  if (running) return 0
  running = true
  try {
    const waiting = await listWaiting(home, today)
    const pairs = waitingPairs(waiting)
    if (pairs.length === 0 || pairs.length > PAIR_CAP) return 0

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
        if (await convertExpense(e.id, rate, home, pair)) converted++
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

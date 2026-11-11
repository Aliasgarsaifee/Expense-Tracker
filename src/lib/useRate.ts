import { useEffect, useState } from 'react'
import { fetchRate } from './rates'

// The day's rate for the form's currency and date. Only the last answer is
// kept, tagged with the lookup it answers: `loading` is then derived rather
// than set, so it is true on the very render the pair or date changes, and a
// late answer for an earlier lookup can never be shown against a newer one.
export function useRate(
  base: string,
  quote: string,
  date: string,
  skip: boolean,
): { rate: number | null; loading: boolean } {
  const wanted = skip || base === quote ? null : `${base}|${quote}|${date}`
  const [answer, setAnswer] = useState<{ key: string; rate: number | null } | null>(null)

  useEffect(() => {
    if (wanted === null) return
    let cancelled = false
    // fetchRate never throws: a failure is a null rate, shown as "No rate yet".
    void fetchRate(base, quote, date).then((rate) => {
      if (!cancelled) setAnswer({ key: wanted, rate })
    })
    return () => {
      cancelled = true
    }
  }, [wanted, base, quote, date])

  if (wanted === null) return { rate: null, loading: false }
  if (answer?.key !== wanted) return { rate: null, loading: true }
  return { rate: answer.rate, loading: false }
}

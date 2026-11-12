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
  // A lookup that failed is asked again when the connection or the app comes
  // back: nothing else would ever re-run it for the same currency and day, and
  // the form would sit on "No rate yet" with the network long since returned.
  // A rate already held comes straight from fetchRate's cache, so asking again
  // when nothing failed costs no request.
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible') setAttempt((n) => n + 1)
    }
    window.addEventListener('online', again)
    document.addEventListener('visibilitychange', again)
    return () => {
      window.removeEventListener('online', again)
      document.removeEventListener('visibilitychange', again)
    }
  }, [])

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
  }, [wanted, base, quote, date, attempt])

  if (wanted === null) return { rate: null, loading: false }
  if (answer?.key !== wanted) return { rate: null, loading: true }
  return { rate: answer.rate, loading: false }
}

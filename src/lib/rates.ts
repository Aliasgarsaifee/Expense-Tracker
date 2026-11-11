// The app's only network request (docs/adr/0002). Best-effort by design: it
// carries two currency codes and a date (no amount, no note, no identifier),
// never throws, never blocks a save or a render, and persists nothing. Without
// it the app behaves exactly as it does offline; the only thing the network
// can add is a number.

export interface RateDeps {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const TIMEOUT_MS = 4000

// Successes only: a failed lookup must be retried next time, not remembered.
const cache = new Map<string, number>()
// Callers asking for the same day at once share one request.
const inFlight = new Map<string, Promise<number | null>>()

export function rateUrl(base: string, quote: string, date: string): string {
  return `https://api.frankfurter.dev/v2/rates?base=${base}&quotes=${quote}&date=${date}`
}

export function parseRate(body: unknown, base: string, quote: string): number | null {
  if (!Array.isArray(body)) return null
  const row: unknown = body[0]
  if (typeof row !== 'object' || row === null) return null
  const { base: b, quote: q, rate } = row as Record<string, unknown>
  if (b !== base || q !== quote) return null
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null
}

async function request(
  base: string,
  quote: string,
  date: string,
  { fetchImpl = fetch, timeoutMs = TIMEOUT_MS }: RateDeps,
): Promise<number | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(rateUrl(base, quote, date), {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    if (!res.ok) return null
    return parseRate(await res.json(), base, quote)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function fetchRate(
  base: string,
  quote: string,
  date: string,
  deps: RateDeps = {},
): Promise<number | null> {
  const key = `${base}|${quote}|${date}`
  const known = cache.get(key)
  if (known !== undefined) return Promise.resolve(known)
  const pending = inFlight.get(key)
  if (pending) return pending
  const started = request(base, quote, date, deps).then((rate) => {
    if (rate !== null) cache.set(key, rate)
    return rate
  }).finally(() => inFlight.delete(key))
  inFlight.set(key, started)
  return started
}

export function clearRateCache(): void {
  cache.clear()
  inFlight.clear()
}

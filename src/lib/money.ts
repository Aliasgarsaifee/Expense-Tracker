// Building an Intl.NumberFormat is the expensive half of formatting (locale
// resolution); .format() is cheap. Summary renders 20+ amounts at once, so
// each currency is built once and kept. Keyed on precision too — one currency
// needs both a whole and a 2-decimal formatter, and sharing them would drop
// the paise. A null entry remembers a malformed code so it isn't re-thrown on
// every row. The key space is bounded by the currency list, so it never grows
// beyond a handful of entries in practice.
const formatters = new Map<string, Intl.NumberFormat | null>()

function formatterFor(currency: string, digits: number): Intl.NumberFormat | null {
  const key = `${currency}|${digits}`
  const cached = formatters.get(key)
  if (cached !== undefined) return cached
  let made: Intl.NumberFormat | null = null
  try {
    made = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  } catch {
    // Malformed codes can arrive via an imported backup; never throw.
    made = null
  }
  formatters.set(key, made)
  return made
}

// Whole amounts show clean (₹450); fractions only when present (₹450.50).
export function formatMoney(amount: number, currency = 'INR'): string {
  const digits = Number.isInteger(amount) ? 0 : 2
  const formatter = formatterFor(currency, digits)
  return formatter
    ? formatter.format(amount)
    : `${currency} ${amount.toFixed(digits)}`
}

// A slice of a total, as a percentage. Carries the comparison a bar chart
// can't: one dominant category (rent is routinely 85% of a month) flattens
// every other bar to a hairline, but the percentages stay readable and ordered.
// Hence one decimal below 10% — whole percents would collapse a 3.8/3.6 long
// tail into a row of identical "4%".
export function formatShare(part: number, whole: number): string {
  if (!(whole > 0)) return '0%'
  const pct = (part / whole) * 100
  // Anything real must read as more than nothing, however small the slice.
  if (pct > 0 && pct < 0.05) return '<0.1%'
  // Tier off the rounded value, or 9.96% prints as "10.0%".
  const oneDp = Math.round(pct * 10) / 10
  return oneDp >= 10 || oneDp === 0 ? `${Math.round(pct)}%` : `${oneDp}%`
}

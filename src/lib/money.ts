// Whole amounts show clean (₹450); fractions only when present (₹450.50).
export function formatMoney(amount: number, currency = 'INR'): string {
  const digits = Number.isInteger(amount) ? 0 : 2
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount)
  } catch {
    // Malformed codes can arrive via an imported backup; never throw.
    return `${currency} ${amount.toFixed(digits)}`
  }
}

export function formatINR(amount: number): string {
  return formatMoney(amount, 'INR')
}

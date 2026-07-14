export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7)
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  })
}

// "12 July 2026" — the human-readable form used on the Add/Edit date field.
export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// "12 Jul" — day + short month, no year. The compact form used on Summary
// tiles and the day-grain trend axis/tooltip.
export function shortDayMonth(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })
}

// "Jul 2026" — short month + year, from a 'YYYY-MM' key.
export function shortMonthYear(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  })
}

// Local calendar date — toISOString() would shift dates near midnight IST.
export function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayISO(): string {
  return localISO(new Date())
}

export function yesterdayISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1) // setDate rolls months/years back correctly
  return localISO(d)
}

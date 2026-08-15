// Constructing an Intl.DateTimeFormat runs locale resolution; .format() is
// cheap by comparison (measured ~25µs vs ~1µs). Every labeller below used to
// build one per call, and the trend axis labels each of a month's 31 ticks on
// every re-render — so each option set is built once, here.
const LOCALE = 'en-IN'
const DAY_MONTH_YEAR = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const DAY_MONTH = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })
const MONTH_YEAR_LONG = new Intl.DateTimeFormat(LOCALE, {
  month: 'long',
  year: 'numeric',
})
const MONTH_YEAR_SHORT = new Intl.DateTimeFormat(LOCALE, {
  month: 'short',
  year: 'numeric',
})
const MONTH_LONG = new Intl.DateTimeFormat(LOCALE, { month: 'long' })
const MONTH_NARROW = new Intl.DateTimeFormat(LOCALE, { month: 'narrow' })
const WEEKDAY_NARROW = new Intl.DateTimeFormat(LOCALE, { weekday: 'narrow' })

// 'YYYY-MM' → a local Date on the 1st; 'YYYY-MM-DD' → that local day. Local,
// not UTC, for the same reason localISO exists: a UTC parse shifts the day.
function dateOfMonth(month: string): Date {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

function dateOfDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7)
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

export function monthLabel(month: string): string {
  return MONTH_YEAR_LONG.format(dateOfMonth(month))
}

// "July" — the bare long month name; monthLabel is the with-year sibling.
export function monthName(month: string): string {
  return MONTH_LONG.format(dateOfMonth(month))
}

// "12 July 2026" — the human-readable form used on the Add/Edit date field.
export function formatDateLong(iso: string): string {
  return DAY_MONTH_YEAR.format(dateOfDay(iso))
}

// "12 Jul" — day + short month, no year. The compact form used on Summary
// tiles and the day-grain trend axis/tooltip.
export function shortDayMonth(iso: string): string {
  return DAY_MONTH.format(dateOfDay(iso))
}

// "Jul 2026" — short month + year, from a 'YYYY-MM' key.
export function shortMonthYear(month: string): string {
  return MONTH_YEAR_SHORT.format(dateOfMonth(month))
}

// "J" / "M" — single-letter initials for the trend axis, which labels every
// tick and so needs the cheapest possible per-tick call.
export function narrowMonth(month: string): string {
  return MONTH_NARROW.format(dateOfMonth(month))
}

export function narrowWeekday(iso: string): string {
  return WEEKDAY_NARROW.format(dateOfDay(iso))
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

// Cells of a 'YYYY-MM' month for a 7-column Monday-first grid: leading nulls
// align the 1st to its weekday (Monday matches weekStartOf in lib/period);
// the tail stays ragged — a CSS grid row just ends short.
export function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate() // day 0 of the next month
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7 // Sun=0…Sat=6 → Mon=0…Sun=6
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`)
  }
  return cells
}

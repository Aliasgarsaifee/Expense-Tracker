import { addMonths, localISO, monthLabel, monthName, monthOf } from './dates'

// The unit a Summary view aggregates over. A day is the finest grain: a single
// day still aggregates (total, by-category, by-payment, vs the previous day),
// which History's day *list* does not show. Span-only tiles (daily average,
// busiest day) collapse for a one-day window via a single-day rule in the
// screen, not a per-kind branch.
export type Period =
  | { kind: 'day'; date: string } // ISO date
  | { kind: 'month'; month: string } // 'YYYY-MM'
  | { kind: 'year'; year: string } // 'YYYY'
  | { kind: 'all' }
  | { kind: 'custom'; from: string; to: string } // inclusive ISO bounds

export interface Bounds {
  from: string
  to: string
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, delta: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + delta) // setDate rolls months/years correctly
  return localISO(d)
}

// Monday of the week containing iso. getDay() is Sun=0…Sat=6; (day + 6) % 7 is
// the count of days back to Monday (Monday→0, Sunday→6).
export function weekStartOf(iso: string): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return localISO(d)
}

// Inclusive day count: same date → 1, a full July → 31.
export function daysBetween(from: string, to: string): number {
  const ms = parseISO(to).getTime() - parseISO(from).getTime()
  return Math.round(ms / 86_400_000) + 1
}

export function periodBounds(p: Period): Bounds | null {
  switch (p.kind) {
    case 'day':
      return { from: p.date, to: p.date }
    case 'month': {
      const [y, m] = p.month.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate() // day 0 of next month
      return { from: `${p.month}-01`, to: `${p.month}-${String(lastDay).padStart(2, '0')}` }
    }
    case 'year':
      return { from: `${p.year}-01-01`, to: `${p.year}-12-31` }
    case 'custom':
      return { from: p.from, to: p.to }
    case 'all':
      return null
  }
}

// Days elapsed for averaging: the whole span for a period wholly in the past or
// future, from→today (inclusive) while it is still running.
export function elapsedDays(b: Bounds, today: string): number {
  if (today < b.from || today > b.to) return daysBetween(b.from, b.to)
  return daysBetween(b.from, today)
}

export function shiftPeriod(p: Period, dir: 1 | -1): Period {
  switch (p.kind) {
    case 'day':
      return { kind: 'day', date: addDays(p.date, dir) }
    case 'month':
      return { kind: 'month', month: addMonths(p.month, dir) }
    case 'year':
      return { kind: 'year', year: String(Number(p.year) + dir) }
    case 'custom': {
      // Step by the window's own length so consecutive shifts tile the calendar
      // without gaps or overlaps.
      const len = daysBetween(p.from, p.to)
      return {
        kind: 'custom',
        from: addDays(p.from, dir * len),
        to: addDays(p.to, dir * len),
      }
    }
    case 'all':
      return p
  }
}

// "12 Jun 2026" / "12 Jun" (year suppressed when it is redundant with a range).
function shortDay(iso: string, withYear: boolean): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

// A single day reads as one date; a same-year range carries the year once at
// the end; a cross-year range spells both ends fully.
function rangeLabel(from: string, to: string): string {
  if (from === to) return shortDay(from, true)
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${shortDay(from, !sameYear)} – ${shortDay(to, true)}`
}

export function periodLabel(p: Period, today: string): string {
  switch (p.kind) {
    case 'day':
      if (p.date === today) return 'Today'
      if (p.date === addDays(today, -1)) return 'Yesterday'
      return shortDay(p.date, true)
    case 'month':
      return monthLabel(p.month)
    case 'year':
      return p.year
    case 'all':
      return 'All time'
    case 'custom':
      return rangeLabel(p.from, p.to)
  }
}

// The hero's "nothing logged …" tail, adapting to the period. "this/that"
// tracks whether the period is the current one (contains today).
export function emptyPeriodPhrase(p: Period, containsToday: boolean): string {
  switch (p.kind) {
    case 'day':
      return containsToday ? 'today' : 'that day'
    case 'month':
      return containsToday ? 'this month' : 'that month'
    case 'year':
      return `in ${p.year}`
    case 'custom':
      return 'in this range'
    case 'all':
      return 'yet'
  }
}

// The tile sub-label for the vs-previous comparison; null when there is no
// meaningful previous period (all time).
export function comparisonLabel(p: Period): string | null {
  switch (p.kind) {
    case 'day':
      return `vs ${shortDay(addDays(p.date, -1), false)}`
    case 'month':
      return `vs ${monthName(addMonths(p.month, -1))}`
    case 'year':
      return `vs ${Number(p.year) - 1}`
    case 'custom':
      return `vs prior ${daysBetween(p.from, p.to)} days`
    case 'all':
      return null
  }
}

// The window the vs-tile compares against. While a period is still running,
// a full-previous comparison always reads inflated ("▲448%" mid-month), so
// the previous window is clipped to the same elapsed length and flagged
// toDate — the tile then says "₹X by this point" instead of "was ₹X". A
// completed (or not-yet-started) period compares full-vs-full. The clip never
// runs past the previous period's own end (a 30-day March head against a
// 28-day February compares all of February).
export function comparisonSlice(
  p: Period,
  today: string,
): { bounds: Bounds; toDate: boolean } | null {
  if (p.kind === 'all') return null
  const b = periodBounds(p)!
  const prev = periodBounds(shiftPeriod(p, -1))!
  const elapsed = elapsedDays(b, today)
  if (elapsed >= daysBetween(b.from, b.to)) return { bounds: prev, toDate: false }
  const clipTo = addDays(prev.from, elapsed - 1)
  return {
    bounds: { from: prev.from, to: clipTo < prev.to ? clipTo : prev.to },
    toDate: true,
  }
}

// Restore a persisted granularity anchored at "now". A stale custom range is
// never persisted — and 'week' (a granularity removed after v1.3.0) may still
// be stored on older installs — so both land on this month.
export function initialPeriod(kind: string, today: string): Period {
  switch (kind) {
    case 'day':
      return { kind: 'day', date: today }
    case 'year':
      return { kind: 'year', year: today.slice(0, 4) }
    case 'all':
      return { kind: 'all' }
    default:
      return { kind: 'month', month: monthOf(today) }
  }
}

// Trend-chart bucket grain, widening with the span so bar counts stay legible:
// ≤ 6 weeks per day, ≤ 26 weeks per week, ≤ ~2 years per month, longer per
// year. Weeks bridge the gap where days are too many and months too few (a
// two-month custom range as 2 slabs).
export type TrendUnit = 'day' | 'week' | 'month' | 'year'

export function trendUnit(b: Bounds): TrendUnit {
  const days = daysBetween(b.from, b.to)
  if (days <= 42) return 'day'
  if (days <= 182) return 'week'
  if (days <= 731) return 'month'
  return 'year'
}

// The bucket an ISO date belongs to at a given grain: full date, its Monday,
// 'YYYY-MM', or 'YYYY'. Must agree with bucketKeysBetween's key format.
export function bucketKeyOf(iso: string, unit: TrendUnit): string {
  switch (unit) {
    case 'day':
      return iso
    case 'week':
      return weekStartOf(iso)
    case 'month':
      return iso.slice(0, 7)
    case 'year':
      return iso.slice(0, 4)
  }
}

// The span a bucket key covers — bucketKeyOf's inverse. Must agree with
// bucketKeysBetween's stride (a week bucket is its Monday + 6 days).
export function bucketBounds(key: string, unit: TrendUnit): Bounds {
  switch (unit) {
    case 'day':
      return { from: key, to: key }
    case 'week':
      return { from: key, to: addDays(key, 6) }
    case 'month':
      return periodBounds({ kind: 'month', month: key })!
    case 'year':
      return { from: `${key}-01-01`, to: `${key}-12-31` }
  }
}

// Every bucket key in [from, to] in order, so a trend can zero-fill: empty
// buckets must render as ₹0, never vanish and misread as "no data here". The
// first week key may precede `from` (its Monday), matching bucketKeyOf.
export function bucketKeysBetween(b: Bounds, unit: TrendUnit): string[] {
  const keys: string[] = []
  if (unit === 'day') {
    for (let d = b.from; d <= b.to; d = addDays(d, 1)) keys.push(d)
  } else if (unit === 'week') {
    for (let w = weekStartOf(b.from); w <= b.to; w = addDays(w, 7)) keys.push(w)
  } else if (unit === 'month') {
    for (let m = b.from.slice(0, 7); m <= b.to.slice(0, 7); m = addMonths(m, 1)) keys.push(m)
  } else {
    for (let y = Number(b.from.slice(0, 4)); y <= Number(b.to.slice(0, 4)); y++) {
      keys.push(String(y))
    }
  }
  return keys
}

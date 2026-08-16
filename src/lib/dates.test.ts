import { describe, expect, it } from 'vitest'
import {
  addMonths,
  daysSince,
  formatDateLong,
  monthGrid,
  monthLabel,
  monthName,
  monthOf,
  narrowMonth,
  narrowWeekday,
  shortDayMonth,
  shortMonthYear,
  todayISO,
  yesterdayISO,
} from './dates'

describe('monthOf', () => {
  it('extracts the YYYY-MM month from an ISO date', () => {
    expect(monthOf('2026-07-12')).toBe('2026-07')
  })
})

describe('addMonths', () => {
  it('moves forward within a year', () => {
    expect(addMonths('2026-07', 1)).toBe('2026-08')
  })

  it('wraps across year boundaries in both directions', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })
})

describe('monthLabel', () => {
  it('renders a human month name and year', () => {
    expect(monthLabel('2026-07')).toBe('July 2026')
  })
})

describe('monthName', () => {
  it('renders the bare long month name', () => {
    expect(monthName('2026-07')).toBe('July')
  })
})

describe('todayISO', () => {
  it('returns a local YYYY-MM-DD date', () => {
    const today = todayISO()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // Must be the LOCAL date: composing from local date parts must agree.
    const now = new Date()
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(today).toBe(local)
  })
})

describe('monthGrid', () => {
  it('lays out July 2026 Monday-first (the 1st is a Wednesday)', () => {
    const cells = monthGrid('2026-07')
    expect(cells.slice(0, 3)).toEqual([null, null, '2026-07-01'])
    expect(cells).toHaveLength(33) // 2 leading blanks + 31 days, ragged tail
    expect(cells.at(-1)).toBe('2026-07-31')
  })

  it('starts flush when the 1st is a Monday (June 2026)', () => {
    const cells = monthGrid('2026-06')
    expect(cells[0]).toBe('2026-06-01')
    expect(cells).toHaveLength(30)
  })

  it('covers leap February 2024 (the 1st is a Thursday, 29 days)', () => {
    const cells = monthGrid('2024-02')
    expect(cells.slice(0, 4)).toEqual([null, null, null, '2024-02-01'])
    expect(cells.at(-1)).toBe('2024-02-29')
  })
})

// The trend axis calls these once per tick with interval={0} — 31 times for a
// month — so they live here behind a cached formatter rather than building an
// Intl object per bar.
describe('narrowMonth', () => {
  it('renders the single-letter month initial', () => {
    expect(narrowMonth('2026-01')).toBe('J')
    expect(narrowMonth('2026-07')).toBe('J')
    expect(narrowMonth('2026-09')).toBe('S')
    expect(narrowMonth('2026-12')).toBe('D')
  })

  it('reads the month from the key, ignoring the year', () => {
    expect(narrowMonth('1999-03')).toBe(narrowMonth('2026-03'))
  })
})

describe('narrowWeekday', () => {
  it('renders the single-letter weekday', () => {
    // 2026-07-13 is a Monday.
    expect(narrowWeekday('2026-07-13')).toBe('M')
    expect(narrowWeekday('2026-07-15')).toBe('W')
    expect(narrowWeekday('2026-07-19')).toBe('S') // Sunday
  })
})

// The five labellers share one locale but five different option sets, and each
// caches its formatter (the trend axis calls these once per tick). Interleaved
// on one date, so a cache keyed on locale alone would show up as the wrong
// shape rather than a missing one.
describe('date labellers under repeated interleaved use', () => {
  it('keeps each option set on its own formatter', () => {
    for (let i = 0; i < 3; i++) {
      expect(formatDateLong('2026-07-12')).toBe('12 July 2026')
      expect(shortDayMonth('2026-07-12')).toBe('12 Jul')
      expect(shortMonthYear('2026-07')).toBe('Jul 2026')
      expect(monthLabel('2026-07')).toBe('July 2026')
      expect(monthName('2026-07')).toBe('July')
    }
  })

  it('formats different dates through the same cached formatter', () => {
    expect(shortDayMonth('2026-01-01')).toBe('1 Jan')
    expect(shortDayMonth('2024-02-29')).toBe('29 Feb')
    expect(shortDayMonth('2026-12-31')).toBe('31 Dec')
  })
})

describe('yesterdayISO', () => {
  it('returns the local calendar day before today', () => {
    const y = yesterdayISO()
    expect(y).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // Compose the expected value from local date parts, like todayISO does.
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(y).toBe(local)
    expect(y < todayISO()).toBe(true)
  })
})

describe('daysSince', () => {
  it('is zero for the same day', () => {
    expect(daysSince('2026-08-16', '2026-08-16')).toBe(0)
  })

  it('counts whole days forward', () => {
    expect(daysSince('2026-08-09', '2026-08-16')).toBe(7)
  })

  it('counts across a month boundary', () => {
    expect(daysSince('2026-07-30', '2026-08-02')).toBe(3)
  })

  it('counts across a year boundary', () => {
    expect(daysSince('2025-12-30', '2026-01-02')).toBe(3)
  })

  it('is negative when the second day precedes the first', () => {
    expect(daysSince('2026-08-16', '2026-08-14')).toBe(-2)
  })
})

// IST (this machine's zone) has no DST, so proving the Math.round claim above
// needs a zone that does. process.env.TZ is saved/restored per-test in
// try/finally rather than beforeEach/afterEach so the mutation is confined to
// exactly one `it` and cannot leak into the rest of this file even if a
// future edit adds more tests to this describe block.
//
// tsconfig.app.json's `types` is `["vite/client"]` only — this file runs
// under Node via vitest, but the app itself is browser-only, so `process`
// isn't ambiently typed here. A narrow local declaration avoids widening the
// project-wide config for one test's sake.
declare const process: { env: Record<string, string | undefined> }

describe('daysSince across a DST boundary', () => {
  it('counts one whole day over the spring-forward transition, where the day is 23 hours', () => {
    const originalTZ = process.env.TZ
    try {
      // 2026-03-08: America/New_York clocks jump 2am -> 3am, so this
      // calendar day is only 23 hours. Math.floor would read that as 0 whole
      // days elapsed instead of 1 — this is the case the rounding guards.
      process.env.TZ = 'America/New_York'
      expect(daysSince('2026-03-08', '2026-03-09')).toBe(1)
    } finally {
      if (originalTZ === undefined) delete process.env.TZ
      else process.env.TZ = originalTZ
    }
  })
})

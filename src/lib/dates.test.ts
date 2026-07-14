import { describe, expect, it } from 'vitest'
import {
  addMonths,
  monthGrid,
  monthLabel,
  monthName,
  monthOf,
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

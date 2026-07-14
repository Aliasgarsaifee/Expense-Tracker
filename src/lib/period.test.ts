import { describe, expect, it } from 'vitest'
import {
  bucketKeyOf,
  bucketKeysBetween,
  changeKind,
  comparisonLabel,
  comparisonSlice,
  daysBetween,
  elapsedDays,
  emptyPeriodPhrase,
  initialPeriod,
  periodBounds,
  periodLabel,
  shiftPeriod,
  trendUnit,
  weekStartOf,
} from './period'

// 2026-07-13 is a Monday; "today" 2026-07-14 is a Tuesday.
const TODAY = '2026-07-14'

describe('weekStartOf', () => {
  it('pulls a Tuesday back to Monday and keeps a Monday', () => {
    expect(weekStartOf('2026-07-14')).toBe('2026-07-13')
    expect(weekStartOf('2026-07-13')).toBe('2026-07-13')
  })
  it('pulls a Sunday back six days, not forward', () => {
    expect(weekStartOf('2026-07-19')).toBe('2026-07-13')
  })
})

describe('periodBounds', () => {
  it('covers leap February', () => {
    expect(periodBounds({ kind: 'month', month: '2024-02' })).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    })
  })
  it('covers a 30-day month', () => {
    expect(periodBounds({ kind: 'month', month: '2026-06' })).toEqual({
      from: '2026-06-01',
      to: '2026-06-30',
    })
  })
  it('spans a week across a month edge', () => {
    expect(periodBounds({ kind: 'week', start: '2026-06-29' })).toEqual({
      from: '2026-06-29',
      to: '2026-07-05',
    })
  })
  it('spans a whole year', () => {
    expect(periodBounds({ kind: 'year', year: '2026' })).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    })
  })
  it('passes custom bounds through', () => {
    expect(periodBounds({ kind: 'custom', from: '2026-03-04', to: '2026-05-06' })).toEqual({
      from: '2026-03-04',
      to: '2026-05-06',
    })
  })
  it('is a single day for a day period', () => {
    expect(periodBounds({ kind: 'day', date: '2026-07-10' })).toEqual({
      from: '2026-07-10',
      to: '2026-07-10',
    })
  })
  it('is null for all time', () => {
    expect(periodBounds({ kind: 'all' })).toBeNull()
  })
})

describe('shiftPeriod', () => {
  it('steps a month, wrapping December into the next year', () => {
    expect(shiftPeriod({ kind: 'month', month: '2026-12' }, 1)).toEqual({
      kind: 'month',
      month: '2027-01',
    })
    expect(shiftPeriod({ kind: 'month', month: '2026-01' }, -1)).toEqual({
      kind: 'month',
      month: '2025-12',
    })
  })
  it('steps a week across a year edge', () => {
    expect(shiftPeriod({ kind: 'week', start: '2025-12-29' }, 1)).toEqual({
      kind: 'week',
      start: '2026-01-05',
    })
  })
  it('steps a year', () => {
    expect(shiftPeriod({ kind: 'year', year: '2026' }, -1)).toEqual({
      kind: 'year',
      year: '2025',
    })
  })
  it('steps a custom window by its own length, staying adjacent', () => {
    expect(
      shiftPeriod({ kind: 'custom', from: '2026-07-01', to: '2026-07-10' }, -1),
    ).toEqual({ kind: 'custom', from: '2026-06-21', to: '2026-06-30' })
  })
  it('leaves all time unchanged', () => {
    expect(shiftPeriod({ kind: 'all' }, 1)).toEqual({ kind: 'all' })
  })
  it('steps a day, rolling across a month edge', () => {
    expect(shiftPeriod({ kind: 'day', date: '2026-07-14' }, 1)).toEqual({
      kind: 'day',
      date: '2026-07-15',
    })
    expect(shiftPeriod({ kind: 'day', date: '2026-07-31' }, 1)).toEqual({
      kind: 'day',
      date: '2026-08-01',
    })
    expect(shiftPeriod({ kind: 'day', date: '2026-07-01' }, -1)).toEqual({
      kind: 'day',
      date: '2026-06-30',
    })
  })
})

describe('periodLabel', () => {
  it('names the current and previous weeks', () => {
    expect(periodLabel({ kind: 'week', start: '2026-07-13' }, TODAY)).toBe('This week')
    expect(periodLabel({ kind: 'week', start: '2026-07-06' }, TODAY)).toBe('Last week')
  })
  it('ranges an older cross-month week, year once at the end', () => {
    expect(periodLabel({ kind: 'week', start: '2026-06-29' }, TODAY)).toBe(
      '29 Jun – 5 Jul 2026',
    )
  })
  it('names a month and a year plainly', () => {
    expect(periodLabel({ kind: 'month', month: '2026-07' }, TODAY)).toBe('July 2026')
    expect(periodLabel({ kind: 'year', year: '2025' }, TODAY)).toBe('2025')
    expect(periodLabel({ kind: 'all' }, TODAY)).toBe('All time')
  })
  it('labels a single-day custom range as one date', () => {
    expect(periodLabel({ kind: 'custom', from: '2026-06-12', to: '2026-06-12' }, TODAY)).toBe(
      '12 Jun 2026',
    )
  })
  it('spells both ends of a cross-year custom range', () => {
    expect(
      periodLabel({ kind: 'custom', from: '2025-12-29', to: '2026-01-04' }, TODAY),
    ).toBe('29 Dec 2025 – 4 Jan 2026')
  })
  it('names a day Today, Yesterday, or a full date', () => {
    expect(periodLabel({ kind: 'day', date: '2026-07-14' }, TODAY)).toBe('Today')
    expect(periodLabel({ kind: 'day', date: '2026-07-13' }, TODAY)).toBe('Yesterday')
    expect(periodLabel({ kind: 'day', date: '2026-06-10' }, TODAY)).toBe('10 Jun 2026')
  })
})

describe('emptyPeriodPhrase', () => {
  it('says this/that for the current vs a past week or month', () => {
    expect(emptyPeriodPhrase({ kind: 'week', start: '2026-07-13' }, true)).toBe('this week')
    expect(emptyPeriodPhrase({ kind: 'week', start: '2026-07-13' }, false)).toBe('that week')
    expect(emptyPeriodPhrase({ kind: 'month', month: '2026-07' }, true)).toBe('this month')
    expect(emptyPeriodPhrase({ kind: 'month', month: '2026-07' }, false)).toBe('that month')
  })
  it('names the year, range, or all time', () => {
    expect(emptyPeriodPhrase({ kind: 'year', year: '2026' }, true)).toBe('in 2026')
    expect(emptyPeriodPhrase({ kind: 'custom', from: '2026-01-01', to: '2026-02-01' }, false)).toBe(
      'in this range',
    )
    expect(emptyPeriodPhrase({ kind: 'all' }, true)).toBe('yet')
  })
  it('says today for the current day, that day for another', () => {
    expect(emptyPeriodPhrase({ kind: 'day', date: '2026-07-14' }, true)).toBe('today')
    expect(emptyPeriodPhrase({ kind: 'day', date: '2026-06-10' }, false)).toBe('that day')
  })
})

describe('comparisonLabel', () => {
  it('speaks the previous period per kind', () => {
    expect(comparisonLabel({ kind: 'week', start: '2026-07-13' })).toBe('vs last week')
    expect(comparisonLabel({ kind: 'month', month: '2026-07' })).toBe('vs June')
    expect(comparisonLabel({ kind: 'year', year: '2026' })).toBe('vs 2025')
    expect(comparisonLabel({ kind: 'custom', from: '2026-07-01', to: '2026-07-10' })).toBe(
      'vs prior 10 days',
    )
    expect(comparisonLabel({ kind: 'all' })).toBeNull()
  })
  it('names the previous day for a day period', () => {
    expect(comparisonLabel({ kind: 'day', date: '2026-07-10' })).toBe('vs 9 Jul')
  })
})

describe('comparisonSlice', () => {
  it('clips the previous window to the same elapsed length while running', () => {
    // July viewed on the 14th → June 1–14, flagged as a to-date comparison.
    expect(comparisonSlice({ kind: 'month', month: '2026-07' }, TODAY)).toEqual({
      bounds: { from: '2026-06-01', to: '2026-06-14' },
      toDate: true,
    })
    // This week on its Tuesday → last week's Monday–Tuesday.
    expect(comparisonSlice({ kind: 'week', start: '2026-07-13' }, TODAY)).toEqual({
      bounds: { from: '2026-07-06', to: '2026-07-07' },
      toDate: true,
    })
    // 2026 has elapsed 195 days → the first 195 days of 2025.
    expect(comparisonSlice({ kind: 'year', year: '2026' }, TODAY)).toEqual({
      bounds: { from: '2025-01-01', to: '2025-07-14' },
      toDate: true,
    })
    // A running custom window compares its elapsed head against the prior window.
    expect(
      comparisonSlice({ kind: 'custom', from: '2026-07-10', to: '2026-07-20' }, TODAY),
    ).toEqual({
      bounds: { from: '2026-06-29', to: '2026-07-03' },
      toDate: true,
    })
  })
  it('never clips past the previous period end (short February)', () => {
    expect(comparisonSlice({ kind: 'month', month: '2026-03' }, '2026-03-30')).toEqual({
      bounds: { from: '2026-02-01', to: '2026-02-28' },
      toDate: true,
    })
  })
  it('compares completed periods in full', () => {
    expect(comparisonSlice({ kind: 'month', month: '2026-06' }, TODAY)).toEqual({
      bounds: { from: '2026-05-01', to: '2026-05-31' },
      toDate: false,
    })
    // A custom range ending today has fully elapsed — full window, not to-date.
    expect(
      comparisonSlice({ kind: 'custom', from: '2026-07-01', to: '2026-07-14' }, TODAY),
    ).toEqual({
      bounds: { from: '2026-06-17', to: '2026-06-30' },
      toDate: false,
    })
    // Fully-past periods keep their calendar shape (leap February).
    expect(comparisonSlice({ kind: 'month', month: '2024-03' }, TODAY)).toEqual({
      bounds: { from: '2024-02-01', to: '2024-02-29' },
      toDate: false,
    })
  })
  it('has nothing to compare for all time', () => {
    expect(comparisonSlice({ kind: 'all' }, TODAY)).toBeNull()
  })
  it('compares a day against the whole previous day', () => {
    // Today so far vs all of yesterday — a full (not to-date) one-day window.
    expect(comparisonSlice({ kind: 'day', date: '2026-07-14' }, TODAY)).toEqual({
      bounds: { from: '2026-07-13', to: '2026-07-13' },
      toDate: false,
    })
    // A past day compares against the calendar day before it.
    expect(comparisonSlice({ kind: 'day', date: '2026-07-10' }, TODAY)).toEqual({
      bounds: { from: '2026-07-09', to: '2026-07-09' },
      toDate: false,
    })
  })
})

describe('daysBetween / elapsedDays', () => {
  it('counts inclusively', () => {
    expect(daysBetween('2026-07-01', '2026-07-31')).toBe(31)
    expect(daysBetween('2026-07-10', '2026-07-10')).toBe(1)
  })
  it('elapses to today inside a current period, full length past or future', () => {
    expect(elapsedDays({ from: '2026-07-01', to: '2026-07-31' }, TODAY)).toBe(14)
    expect(elapsedDays({ from: '2026-06-01', to: '2026-06-30' }, TODAY)).toBe(30)
    expect(elapsedDays({ from: '2026-08-01', to: '2026-08-31' }, TODAY)).toBe(31)
  })
})

describe('initialPeriod / changeKind', () => {
  it('restores persisted kinds anchored at today, falling back to month', () => {
    expect(initialPeriod('week', TODAY)).toEqual({ kind: 'week', start: '2026-07-13' })
    expect(initialPeriod('year', TODAY)).toEqual({ kind: 'year', year: '2026' })
    expect(initialPeriod('all', TODAY)).toEqual({ kind: 'all' })
    expect(initialPeriod('custom', TODAY)).toEqual({ kind: 'month', month: '2026-07' })
    expect(initialPeriod('month', TODAY)).toEqual({ kind: 'month', month: '2026-07' })
    expect(initialPeriod('day', TODAY)).toEqual({ kind: 'day', date: '2026-07-14' })
  })
  it('re-anchors on today when the period contains it, else on the period start', () => {
    expect(changeKind({ kind: 'month', month: '2026-07' }, 'week', TODAY)).toEqual({
      kind: 'week',
      start: '2026-07-13',
    })
    expect(changeKind({ kind: 'month', month: '2024-03' }, 'year', TODAY)).toEqual({
      kind: 'year',
      year: '2024',
    })
    expect(changeKind({ kind: 'year', year: '2026' }, 'all', TODAY)).toEqual({ kind: 'all' })
  })
  it('re-anchors to a day: today if in view, else the period start', () => {
    expect(changeKind({ kind: 'month', month: '2026-07' }, 'day', TODAY)).toEqual({
      kind: 'day',
      date: '2026-07-14',
    })
    expect(changeKind({ kind: 'month', month: '2024-03' }, 'day', TODAY)).toEqual({
      kind: 'day',
      date: '2024-03-01',
    })
    expect(changeKind({ kind: 'all' }, 'day', TODAY)).toEqual({
      kind: 'day',
      date: '2026-07-14',
    })
  })
})

describe('trendUnit', () => {
  it('buckets by day to 42 days, week to 182, month to 731, then year', () => {
    expect(trendUnit({ from: '2026-07-01', to: '2026-07-31' })).toBe('day')
    expect(trendUnit({ from: '2026-06-01', to: '2026-07-12' })).toBe('day') // 42 days
    expect(trendUnit({ from: '2026-06-01', to: '2026-07-13' })).toBe('week') // 43 days
    expect(trendUnit({ from: '2026-01-14', to: '2026-07-14' })).toBe('week') // 182 days
    expect(trendUnit({ from: '2026-01-13', to: '2026-07-14' })).toBe('month') // 183 days
    expect(trendUnit({ from: '2025-01-01', to: '2027-01-01' })).toBe('month') // 731 days
    expect(trendUnit({ from: '2025-01-01', to: '2027-01-02' })).toBe('year') // 732 days
  })
})

describe('bucketKeyOf', () => {
  it('projects a date to its day, week-start, month, or year key', () => {
    expect(bucketKeyOf('2026-07-02', 'day')).toBe('2026-07-02')
    expect(bucketKeyOf('2026-07-02', 'week')).toBe('2026-06-29') // Thursday → its Monday
    expect(bucketKeyOf('2026-07-13', 'week')).toBe('2026-07-13') // Monday keeps itself
    expect(bucketKeyOf('2026-07-02', 'month')).toBe('2026-07')
    expect(bucketKeyOf('2026-07-02', 'year')).toBe('2026')
  })
})

describe('bucketKeysBetween', () => {
  it('lists every day inclusively', () => {
    expect(bucketKeysBetween({ from: '2026-07-01', to: '2026-07-03' }, 'day')).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ])
  })
  it('lists week starts covering the range, first key clamped to a Monday', () => {
    expect(bucketKeysBetween({ from: '2026-07-01', to: '2026-07-14' }, 'week')).toEqual([
      '2026-06-29',
      '2026-07-06',
      '2026-07-13',
    ])
  })
  it('lists every month across a range', () => {
    expect(bucketKeysBetween({ from: '2026-01-15', to: '2026-03-02' }, 'month')).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ])
  })
  it('lists every year across a range', () => {
    expect(bucketKeysBetween({ from: '2025-06-01', to: '2027-02-01' }, 'year')).toEqual([
      '2025',
      '2026',
      '2027',
    ])
  })
})

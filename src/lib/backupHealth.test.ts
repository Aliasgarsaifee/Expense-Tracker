import { describe, expect, it } from 'vitest'
import { assessBackupHealth, snapshotLine } from './backupHealth'

const NOW = '2026-08-16T10:00:00.000Z'

describe('assessBackupHealth', () => {
  it('is not stale when nothing is unbacked', () => {
    expect(
      assessBackupHealth({ unbackedCount: 0, oldestUnbackedAt: null, now: NOW }),
    ).toEqual({ unbackedCount: 0, atRiskDays: null, stale: false })
  })

  it('is not stale while the oldest unbacked entry is under the threshold', () => {
    const health = assessBackupHealth({
      unbackedCount: 12,
      oldestUnbackedAt: '2026-08-13T09:00:00.000Z',
      now: NOW,
    })
    expect(health.atRiskDays).toBe(3)
    expect(health.stale).toBe(false)
  })

  it('is stale exactly at the threshold', () => {
    const health = assessBackupHealth({
      unbackedCount: 1,
      oldestUnbackedAt: '2026-08-09T09:00:00.000Z',
      now: NOW,
    })
    expect(health.atRiskDays).toBe(7)
    expect(health.stale).toBe(true)
  })

  // The rule that makes this different from "days since last export": data
  // added moments ago has not been at risk for long, however old the export is.
  it('stays quiet for a fresh entry even if the last export was ancient', () => {
    const health = assessBackupHealth({
      unbackedCount: 1,
      oldestUnbackedAt: '2026-08-16T09:00:00.000Z',
      now: NOW,
    })
    expect(health.atRiskDays).toBe(0)
    expect(health.stale).toBe(false)
  })

  it('treats never-exported with old entries as stale, with no special case', () => {
    const health = assessBackupHealth({
      unbackedCount: 431,
      oldestUnbackedAt: '2023-01-04T09:00:00.000Z',
      now: NOW,
    })
    expect(health.unbackedCount).toBe(431)
    expect(health.stale).toBe(true)
  })

  it('honours a custom threshold', () => {
    const health = assessBackupHealth({
      unbackedCount: 3,
      oldestUnbackedAt: '2026-08-14T09:00:00.000Z',
      now: NOW,
      staleAfterDays: 2,
    })
    expect(health.stale).toBe(true)
  })

  it('reports nothing at risk when the count and the timestamp disagree', () => {
    expect(
      assessBackupHealth({ unbackedCount: 5, oldestUnbackedAt: null, now: NOW }),
    ).toEqual({ unbackedCount: 0, atRiskDays: null, stale: false })
  })

  // The mirror of the test above: a non-null, old timestamp paired with a
  // zero count must still short-circuit to the zero-state — the count is the
  // authority on whether anything is unbacked, not the timestamp's presence.
  it('reports nothing at risk when the count is zero, even with a real timestamp', () => {
    expect(
      assessBackupHealth({
        unbackedCount: 0,
        oldestUnbackedAt: '2023-01-04T09:00:00.000Z',
        now: NOW,
      }),
    ).toEqual({ unbackedCount: 0, atRiskDays: null, stale: false })
  })
})

describe('snapshotLine', () => {
  it('says so when there has been none', () => {
    expect(snapshotLine('')).toBe('no snapshot yet')
  })

  it('writes the date the way the rest of the app does', () => {
    expect(snapshotLine('2026-11-12')).toBe('last snapshot 12 Nov 2026')
  })

  // The value comes from localStorage; a date formatter throws on junk, and
  // that would take the whole Settings drawer down with it.
  it('shows a stored value it cannot read as a date as it is', () => {
    expect(snapshotLine('garbage')).toBe('last snapshot garbage')
    expect(snapshotLine('2026-13-45')).toBe('last snapshot 2026-13-45')
  })

  // getPref hands back whatever JSON the key holds, so a hand-edited pref can
  // be a number, null or an object where a string was written.
  it('treats a stored value that is not text as no snapshot', () => {
    for (const junk of [null, 20261112, {}, ['2026-11-12']]) {
      expect(snapshotLine(junk)).toBe('no snapshot yet')
    }
  })
})

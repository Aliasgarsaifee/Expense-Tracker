import { daysSince, localISO, shortDayMonthYear } from './dates'

// A week of unsaved entries is the point where losing the phone stops being
// an inconvenience. Exported so tests and callers share one number.
export const STALE_AFTER_DAYS = 7

export interface BackupHealth {
  unbackedCount: number
  // Days the oldest unbacked entry has gone unsaved; null when nothing is.
  atRiskDays: number | null
  stale: boolean
}

// Staleness is measured from the oldest entry no export has captured, not
// from the export date. Exported a month ago and added the first new entry
// this morning? Nothing has been at risk for a month — it has been at risk
// for hours, and the nudge should stay quiet. The same rule absorbs the
// never-exported case with no branch: every entry is unbacked, so the clock
// starts at the oldest one.
//
// Blind spot: unbackedSince ranges over createdAt, and updateExpense
// deliberately preserves it, so edits and deletions are invisible to this
// rule — a stretch of pure corrections and deletions with no new entries
// produces no nudge, even though those changes exist in no backup. Properly
// closing that needs an updatedAt field, i.e. a Dexie version(5) migration;
// deliberately out of scope for now.
export function assessBackupHealth({
  unbackedCount,
  oldestUnbackedAt,
  now,
  staleAfterDays = STALE_AFTER_DAYS,
}: {
  unbackedCount: number
  oldestUnbackedAt: string | null
  now: string
  staleAfterDays?: number
}): BackupHealth {
  // The two inputs should always agree (one is zero/null iff the other is).
  // If a caller ever passes them out of sync, answering "nothing to report"
  // is the right call — fail quiet rather than warn on input that shouldn't
  // be possible, and never surface the caller's count with no date behind it.
  if (unbackedCount === 0 || oldestUnbackedAt === null) {
    return { unbackedCount: 0, atRiskDays: null, stale: false }
  }
  // createdAt is a UTC instant but the shown count must mean calendar days as
  // the owner experiences them, so both sides land on a local date first.
  const atRiskDays = daysSince(
    localISO(new Date(oldestUnbackedAt)),
    localISO(new Date(now)),
  )
  return { unbackedCount, atRiskDays, stale: atRiskDays >= staleAfterDays }
}

// The line under the daily-snapshot switch. autoBackup stores the day as a
// local 'YYYY-MM-DD'; anything else came from a hand-edited or corrupt pref.
// Text that is not a day is shown as it is, and a value that is not text at
// all (getPref hands back whatever JSON the key holds, hence `unknown`) reads
// as no snapshot — a date formatter throws on junk, and that would take the
// whole Settings drawer down with it.
export function snapshotLine(lastSnapshot: unknown): string {
  if (typeof lastSnapshot !== 'string' || lastSnapshot === '') return 'no snapshot yet'
  const [, m, d] = lastSnapshot.split('-').map(Number)
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(lastSnapshot) && m >= 1 && m <= 12 && d >= 1 && d <= 31
  return `last snapshot ${isDay ? shortDayMonthYear(lastSnapshot) : lastSnapshot}`
}

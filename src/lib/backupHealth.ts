import { daysSince, localISO } from './dates'

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

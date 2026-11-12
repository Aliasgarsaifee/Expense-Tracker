// A payment method or category that entries still use cannot be deleted
// (db.ts refuses, so history never points at nothing). The row already knows
// how many entries use it, so it says so before asking "Delete?" rather than
// after, and offers the thing that does work.
export interface InUseNotice {
  title: string
  message: string
  /** False when it is archived already: there is nothing left to offer. */
  offerArchive: boolean
}

export function inUseNotice(label: string, used: number, archived: boolean): InUseNotice | null {
  if (used === 0) return null
  const uses = used === 1 ? '1 entry uses it' : `${used} entries use it`
  if (archived) {
    return {
      title: `“${label}” can’t be deleted`,
      message: `${uses}. It is already archived, so it no longer shows on the Add screen.`,
      offerArchive: false,
    }
  }
  return {
    title: `Archive “${label}” instead?`,
    message: `${uses}, so it can’t be deleted. Archiving takes it off the Add screen and keeps those entries.`,
    offerArchive: true,
  }
}

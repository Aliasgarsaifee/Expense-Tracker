import { describe, expect, it } from 'vitest'
import { inUseNotice } from './inUse'

describe('inUseNotice', () => {
  it('has nothing to say about something no entry uses', () => {
    expect(inUseNotice('GPay', 0, false)).toBeNull()
    expect(inUseNotice('GPay', 0, true)).toBeNull()
  })

  it('offers to archive what entries still use', () => {
    expect(inUseNotice('GPay', 8, false)).toEqual({
      title: 'Archive “GPay” instead?',
      message:
        '8 entries use it, so it can’t be deleted. Archiving takes it off the Add screen and keeps those entries.',
      offerArchive: true,
    })
  })

  it('counts a single entry in the singular', () => {
    expect(inUseNotice('Travel', 1, false)?.message).toBe(
      '1 entry uses it, so it can’t be deleted. Archiving takes it off the Add screen and keeps those entries.',
    )
  })

  it('only explains when it is archived already', () => {
    expect(inUseNotice('GPay', 8, true)).toEqual({
      title: '“GPay” can’t be deleted',
      message:
        '8 entries use it. It is already archived, so it no longer shows on the Add screen.',
      offerArchive: false,
    })
  })
})

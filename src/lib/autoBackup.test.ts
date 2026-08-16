import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { exportTextFile } from './exportFile'

// Typed against the real signature so a typo'd outcome string (e.g.
// 'canceled') fails to type-check instead of silently skipping the branch
// it was meant to exercise — that discriminator is load-bearing for the
// cancelled-share tests below.
const share = vi.hoisted(() => vi.fn<typeof exportTextFile>())
const isNative = vi.hoisted(() => vi.fn(() => false))

vi.mock('./exportFile', () => ({ exportTextFile: share }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: isNative },
}))
// autoBackup imports the Filesystem plugin at module scope for the native
// path. Nothing here exercises it, but the import itself must not blow up
// under Node.
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Documents: 'DOCUMENTS', Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: { writeFile: vi.fn(), readdir: vi.fn(), deleteFile: vi.fn() },
}))

import { addExpense, db } from '../db'
import { writePreImportSnapshot } from './autoBackup'

beforeEach(async () => {
  share.mockReset()
  // Mirrors exportTextFile's real contract (a resolved call means delivery);
  // tests that need cancellation/failure override this per-call below.
  share.mockResolvedValue('saved')
  isNative.mockReturnValue(false)
  await db.expenses.clear()
})

describe('writePreImportSnapshot off-native', () => {
  it('hands the current ledger to the share sheet before an import', async () => {
    await addExpense({ amount: 250, category: 'Food', spentOn: '2026-08-16' })

    await writePreImportSnapshot()

    expect(share).toHaveBeenCalledTimes(1)
    const [filename, json, mime] = share.mock.calls[0]
    expect(filename).toMatch(/^pre-import-\d{4}-\d{2}-\d{2}\.json$/)
    expect(mime).toBe('application/json')
    expect(JSON.parse(json).expenses).toHaveLength(1)
  })

  it('writes nothing when there is no ledger to protect', async () => {
    await writePreImportSnapshot()
    expect(share).not.toHaveBeenCalled()
  })

  // A declined safety copy still lets the already-confirmed import proceed:
  // writePreImportSnapshot ignores the outcome entirely, so a cancelled
  // share must resolve exactly like a saved one, not reject or hang.
  it('resolves even when the share sheet is cancelled', async () => {
    await addExpense({ amount: 250, category: 'Food', spentOn: '2026-08-16' })
    share.mockResolvedValueOnce('cancelled')

    await expect(writePreImportSnapshot()).resolves.toBeUndefined()
  })

  // Pins the contract: a failed copy propagates, and SettingsDrawer's own
  // try/catch is what keeps it from aborting the import the owner confirmed.
  it('propagates a failed copy so the caller can log it', async () => {
    await addExpense({ amount: 250, category: 'Food', spentOn: '2026-08-16' })
    share.mockRejectedValueOnce(new Error('share failed'))

    await expect(writePreImportSnapshot()).rejects.toThrow('share failed')
  })
})

import { Capacitor } from '@capacitor/core'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { listCategories, listExpenses, listPaymentMethods, unbackedSince } from '../db'
import { runAutoBackupIfDue, writePreImportSnapshot } from '../lib/autoBackup'
import { backupToJson, expensesToCsv, importBackup, parseBackupJson } from '../lib/backup'
import { assessBackupHealth } from '../lib/backupHealth'
import { todayISO } from '../lib/dates'
import { exportTextFile } from '../lib/exportFile'
import { getPref, PREFS, setPref } from '../lib/prefs'

interface Props {
  showAlert: (title: string, message?: string) => Promise<void>
  askConfirm: (opts: {
    title: string
    message: string
    confirmLabel: string
  }) => Promise<boolean>
  // Fired after a successful JSON export so an ancestor can re-read the pref;
  // localStorage is not reactive, so nothing else would notice.
  onExported?: () => void
}

export function BackupSection({ showAlert, askConfirm, onExported }: Props) {
  // runAutoBackupIfDue is a no-op off-native, and a switch that does nothing
  // is worse than no switch.
  const native = Capacitor.isNativePlatform()
  const [exporting, setExporting] = useState(false)
  const [autoBackup, setAutoBackup] = useState(() => getPref(PREFS.autoBackup, true))
  const [lastSnapshot, setLastSnapshot] = useState(() =>
    getPref(PREFS.lastAutoBackup, ''),
  )
  const [lastExport, setLastExport] = useState(() => getPref(PREFS.lastExport, ''))
  const fileInput = useRef<HTMLInputElement>(null)

  const unbacked = useLiveQuery(
    () => unbackedSince(lastExport === '' ? null : lastExport),
    [lastExport],
  )
  const health = assessBackupHealth({
    unbackedCount: unbacked?.count ?? 0,
    oldestUnbackedAt: unbacked?.oldestAt ?? null,
    now: new Date().toISOString(),
  })

  // A failed backup must never be silent, and a double-tap must not race
  // the share sheet ("Can't share while sharing is in progress").
  async function runExport(build: () => Promise<void>) {
    if (exporting) return
    setExporting(true)
    try {
      await build()
    } catch (err) {
      await showAlert('Export failed', err instanceof Error ? err.message : undefined)
    } finally {
      setExporting(false)
    }
  }

  function exportCsv() {
    void runExport(async () => {
      const all = await listExpenses()
      const labels = new Map(
        (await listPaymentMethods({ includeArchived: true })).map((m) => [m.id, m.label]),
      )
      await exportTextFile(
        `expenses-${todayISO()}.csv`,
        expensesToCsv(all, labels),
        'text/csv',
      )
    })
  }

  function exportJson() {
    void runExport(async () => {
      // Stamped BEFORE the ledger is read, never after. unbackedSince uses an
      // exclusive `.above(cursor)`, so an entry created while the export is in
      // flight — the share sheet can sit open for seconds — must fall after
      // this cursor to still count as unbacked. Over-reporting costs one
      // spurious nudge; under-reporting silently marks an entry safe when no
      // file contains it.
      const stampedAt = new Date().toISOString()
      const outcome = await exportTextFile(
        `expense-backup-${todayISO()}.json`,
        backupToJson({
          expenses: await listExpenses(),
          paymentMethods: await listPaymentMethods({ includeArchived: true }),
          categories: await listCategories({ includeArchived: true }),
        }),
        'application/json',
      )
      // A dismissed share sheet saves nothing, so it must not clear the
      // warning — that is the same false reassurance CSV is barred from.
      if (outcome === 'cancelled') return
      // Only a JSON export counts: it is the only artefact importBackup can
      // read back, and only reached here, after the write actually succeeded.
      setPref(PREFS.lastExport, stampedAt)
      setLastExport(getPref(PREFS.lastExport, ''))
      onExported?.()
    })
  }

  async function importJson(file: File) {
    // Read the file before any dialog. This ordering originally worked around
    // a native-dialog hazard (on iOS the change event fires while the document
    // picker is still dismissing, and a system alert presented mid-transition
    // could be dropped, hanging the JS call). The dialogs are in-app React now,
    // so that specific trap is gone — but the delay below is kept until the
    // import has actually been re-run on the phone. This is the flow that
    // carries years of entries; it is the wrong one to deregress on a guess.
    let text: string
    try {
      text = await file.text()
    } catch (err) {
      await showAlert(
        'Could not read the file',
        err instanceof Error ? err.message : undefined,
      )
      return
    }
    await new Promise((r) => setTimeout(r, 350)) // let the picker finish dismissing
    try {
      const data = parseBackupJson(text)
      const total =
        data.expenses.length + data.paymentMethods.length + data.categories.length
      if (total === 0) {
        await showAlert(
          'Nothing to import',
          'That backup holds no entries, payment methods, or categories.',
        )
        return
      }
      const ok = await askConfirm({
        title: 'Import this backup?',
        message: `${data.expenses.length} expenses, ${data.paymentMethods.length} payment methods, and ${data.categories.length} categories. Entries with matching ids will be overwritten.`,
        confirmLabel: 'Import',
      })
      if (!ok) return
      // Safety copy of the current ledger next to the daily snapshots. The
      // import itself is a user-confirmed merge, so a failed copy only logs.
      try {
        await writePreImportSnapshot()
      } catch (err) {
        console.error('pre-import snapshot failed', err)
      }
      const counts = await importBackup(data)
      await showAlert(
        'Import complete',
        `Merged ${counts.expenses} expenses, ${counts.paymentMethods} payment methods, and ${counts.categories} categories.`,
      )
    } catch (err) {
      await showAlert('Import failed', err instanceof Error ? err.message : undefined)
    }
  }

  function toggleAutoBackup() {
    const next = !autoBackup
    setAutoBackup(next)
    setPref(PREFS.autoBackup, next)
    if (next) {
      void runAutoBackupIfDue()
        .then(() => setLastSnapshot(getPref(PREFS.lastAutoBackup, '')))
        .catch((err) => {
          void showAlert('Snapshot failed', err instanceof Error ? err.message : undefined)
        })
    }
  }

  return (
    <section className="drawer-section">
      <h3 className="drawer-title">Backup</h3>
      <p className="drawer-note">
        {native
          ? 'No cloud, no account — if the phone goes, the ledger goes with it. Daily snapshots land in Files → On My iPhone → Expense Tracker. For an iCloud copy, export JSON and pick “Save to Files → iCloud Drive”.'
          : 'No cloud, no account — if the phone goes, the ledger goes with it. Nothing is backed up automatically here: export JSON and pick “Save to Files → iCloud Drive” to keep a copy that survives this device.'}
      </p>
      {health.stale && (
        <div className="backup-warning" role="status">
          <p>
            {health.unbackedCount === 1
              ? '1 entry isn’t in any backup'
              : `${health.unbackedCount} entries aren’t in any backup`}
            {' — the oldest is '}
            {health.atRiskDays === 1 ? '1 day' : `${health.atRiskDays} days`} old.
          </p>
          <button type="button" className="btn-ghost" disabled={exporting} onClick={exportJson}>
            <span>Save backup</span>
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}
      {native && (
        <label className="switch-row">
          <span className="switch-text">
            <span>Daily snapshot on launch</span>
            <span className="switch-sub">
              {lastSnapshot ? `last snapshot ${lastSnapshot}` : 'no snapshot yet'}
            </span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={autoBackup}
            onChange={toggleAutoBackup}
          />
        </label>
      )}
      <div className="backup-actions">
        <button
          type="button"
          className="btn-ghost"
          disabled={exporting}
          onClick={exportCsv}
        >
          <span>Export CSV · spreadsheet archive</span>
          <span aria-hidden="true">↗</span>
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={exporting}
          onClick={exportJson}
        >
          <span>Export JSON · full backup</span>
          <span aria-hidden="true">↗</span>
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => fileInput.current?.click()}
        >
          <span>Import JSON backup</span>
          <span aria-hidden="true">↓</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void importJson(file)
          }}
        />
      </div>
    </section>
  )
}

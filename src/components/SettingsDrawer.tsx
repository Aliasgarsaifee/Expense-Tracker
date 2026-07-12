import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState } from 'react'
import {
  CASH_METHOD_ID,
  deleteCategory,
  deletePaymentMethod,
  isBuiltinCategoryId,
  listCategories,
  listExpenses,
  listPaymentMethods,
  renameCategory,
  renamePaymentMethod,
  setCategoryArchived,
  setPaymentMethodArchived,
  UPI_METHOD_ID,
  type Category,
  type PaymentMethod,
} from '../db'
import { runAutoBackupIfDue } from '../lib/autoBackup'
import { backupToJson, expensesToCsv, importBackup, parseBackupJson } from '../lib/backup'
import { currencySymbol } from '../lib/currencies'
import { todayISO } from '../lib/dates'
import { exportTextFile } from '../lib/exportFile'
import { groupEmoji } from '../lib/paymentMeta'
import { getPref, PREFS, setPref } from '../lib/prefs'
import { AddCategorySheet } from './AddCategorySheet'
import { AddMethodSheet } from './AddMethodSheet'
import { CurrencySheet } from './CurrencySheet'

interface Props {
  open: boolean
  onClose: () => void
  onDefaultCurrencyChange?: (code: string) => void
}

export function SettingsDrawer({ open, onClose, onDefaultCurrencyChange }: Props) {
  if (!open) return null
  return <DrawerBody onClose={onClose} onDefaultCurrencyChange={onDefaultCurrencyChange} />
}

// Mounted fresh on every open so prefs are re-read from storage.
function DrawerBody({
  onClose,
  onDefaultCurrencyChange,
}: {
  onClose: () => void
  onDefaultCurrencyChange?: (code: string) => void
}) {
  const methods = useLiveQuery(() => listPaymentMethods({ includeArchived: true }))
  const categories = useLiveQuery(() => listCategories({ includeArchived: true }))
  const expenses = useLiveQuery(listExpenses)
  const [addingMethod, setAddingMethod] = useState(false)
  const [addingCategory, setAddingCategory] = useState(false)
  const [pickingCurrency, setPickingCurrency] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [autoBackup, setAutoBackup] = useState(() => getPref(PREFS.autoBackup, true))
  const [lastSnapshot, setLastSnapshot] = useState(() =>
    getPref(PREFS.lastAutoBackup, ''),
  )
  const [defaultCurrency, setDefaultCurrency] = useState(() =>
    getPref(PREFS.defaultCurrency, 'INR'),
  )
  const fileInput = useRef<HTMLInputElement>(null)

  const methodUsage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of expenses ?? []) {
      if (e.paymentMethodId) {
        counts.set(e.paymentMethodId, (counts.get(e.paymentMethodId) ?? 0) + 1)
      }
    }
    return counts
  }, [expenses])

  const categoryUsage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of expenses ?? []) {
      counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
    }
    return counts
  }, [expenses])

  async function renameMethod(method: PaymentMethod) {
    const label = window.prompt('Rename payment method', method.label)
    if (label === null) return
    try {
      await renamePaymentMethod(method.id, label)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not rename it.')
    }
  }

  async function toggleMethodArchived(method: PaymentMethod) {
    try {
      await setPaymentMethodArchived(method.id, !method.archived)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not update it.')
    }
  }

  async function removeMethod(method: PaymentMethod) {
    if (!window.confirm(`Delete "${method.label}"?`)) return
    try {
      await deletePaymentMethod(method.id)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not delete it.')
    }
  }

  async function renameCat(category: Category) {
    const label = window.prompt('Rename category', category.label)
    if (label === null) return
    try {
      await renameCategory(category.id, label)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not rename it.')
    }
  }

  async function toggleCatArchived(category: Category) {
    try {
      await setCategoryArchived(category.id, !category.archived)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not update it.')
    }
  }

  async function removeCat(category: Category) {
    if (!window.confirm(`Delete "${category.label}"?`)) return
    try {
      await deleteCategory(category.id)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not delete it.')
    }
  }

  // A failed backup must never be silent, and a double-tap must not race
  // the share sheet ("Can't share while sharing is in progress").
  async function runExport(build: () => Promise<void>) {
    if (exporting) return
    setExporting(true)
    try {
      await build()
    } catch (err) {
      window.alert(
        err instanceof Error ? `Export failed: ${err.message}` : 'Export failed.',
      )
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
      await exportTextFile(
        `expense-backup-${todayISO()}.json`,
        backupToJson({
          expenses: await listExpenses(),
          paymentMethods: await listPaymentMethods({ includeArchived: true }),
          categories: await listCategories({ includeArchived: true }),
        }),
        'application/json',
      )
    })
  }

  async function importJson(file: File) {
    // Read the file before any dialog: on iOS the change event fires while
    // the document picker is still dismissing, and a native confirm/alert
    // presented mid-transition can be dropped and hang the JS call.
    let text: string
    try {
      text = await file.text()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not read the file.')
      return
    }
    await new Promise((r) => setTimeout(r, 350)) // let the picker finish dismissing
    try {
      const data = parseBackupJson(text)
      const total =
        data.expenses.length + data.paymentMethods.length + data.categories.length
      if (total === 0) {
        window.alert('That backup contains nothing to import.')
        return
      }
      const ok = window.confirm(
        `Import ${data.expenses.length} expenses, ${data.paymentMethods.length} payment methods, and ${data.categories.length} categories? Entries with matching ids will be overwritten.`,
      )
      if (!ok) return
      const counts = await importBackup(data)
      window.alert(
        `Imported ${counts.expenses} expenses, ${counts.paymentMethods} payment methods, and ${counts.categories} categories.`,
      )
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  function toggleAutoBackup() {
    const next = !autoBackup
    setAutoBackup(next)
    setPref(PREFS.autoBackup, next)
    if (next) {
      void runAutoBackupIfDue()
        .then(() => setLastSnapshot(getPref(PREFS.lastAutoBackup, '')))
        .catch((err) =>
          window.alert(
            err instanceof Error ? `Snapshot failed: ${err.message}` : 'Snapshot failed.',
          ),
        )
    }
  }

  const entryCount = expenses?.length ?? 0

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <h2 className="display">Settings</h2>
          <button
            className="btn-text"
            type="button"
            aria-label="Close settings"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <section className="drawer-section">
          <h3 className="drawer-title">Payment methods</h3>
          <ul className="method-list">
            {(methods ?? []).map((m) => {
              const count = methodUsage.get(m.id) ?? 0
              const sub = [
                m.group,
                count > 0 ? (count === 1 ? '1 entry' : `${count} entries`) : null,
                m.archived ? 'archived' : null,
              ]
                .filter(Boolean)
                .join(' · ')
              const builtIn = m.id === CASH_METHOD_ID || m.id === UPI_METHOD_ID
              return (
                <li key={m.id} className={m.archived ? 'method-row archived' : 'method-row'}>
                  <span className="method-emoji" aria-hidden="true">
                    {groupEmoji(m.group)}
                  </span>
                  <span className="method-text">
                    <span className="method-label">{m.label}</span>
                    {sub && <span className="method-sub">{sub}</span>}
                  </span>
                  <span className="method-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Rename ${m.label}`}
                      onClick={() => void renameMethod(m)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={m.archived ? `Restore ${m.label}` : `Archive ${m.label}`}
                      onClick={() => void toggleMethodArchived(m)}
                    >
                      {m.archived ? '↩' : '⤓'}
                    </button>
                    {!builtIn && (
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label={`Delete ${m.label}`}
                        onClick={() => void removeMethod(m)}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          <button type="button" className="btn-ghost" onClick={() => setAddingMethod(true)}>
            <span>Add card or method</span>
            <span aria-hidden="true">+</span>
          </button>
        </section>

        <section className="drawer-section">
          <h3 className="drawer-title">Categories</h3>
          <ul className="method-list">
            {(categories ?? []).map((c) => {
              const count = categoryUsage.get(c.label) ?? 0
              const builtIn = isBuiltinCategoryId(c.id)
              const sub = [
                count > 0 ? (count === 1 ? '1 entry' : `${count} entries`) : null,
                c.archived ? 'archived' : null,
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <li key={c.id} className={c.archived ? 'method-row archived' : 'method-row'}>
                  <span className="method-emoji" aria-hidden="true">
                    {c.emoji}
                  </span>
                  <span className="method-text">
                    <span className="method-label">{c.label}</span>
                    {sub && <span className="method-sub">{sub}</span>}
                  </span>
                  <span className="method-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Rename ${c.label}`}
                      onClick={() => void renameCat(c)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={c.archived ? `Restore ${c.label}` : `Archive ${c.label}`}
                      onClick={() => void toggleCatArchived(c)}
                    >
                      {c.archived ? '↩' : '⤓'}
                    </button>
                    {!builtIn && (
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label={`Delete ${c.label}`}
                        onClick={() => void removeCat(c)}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          <button type="button" className="btn-ghost" onClick={() => setAddingCategory(true)}>
            <span>Add category</span>
            <span aria-hidden="true">+</span>
          </button>
        </section>

        <section className="drawer-section">
          <h3 className="drawer-title">Preferences</h3>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setPickingCurrency(true)}
          >
            <span>Default currency</span>
            <span className="money">
              {currencySymbol(defaultCurrency)} {defaultCurrency}
            </span>
          </button>
        </section>

        <section className="drawer-section">
          <h3 className="drawer-title">Backup</h3>
          <p className="drawer-note">
            No cloud, no account — if the phone goes, the ledger goes with it. Daily
            snapshots land in Files → On My iPhone → Expense Tracker. For an iCloud
            copy, export JSON and pick “Save to Files → iCloud Drive”.
          </p>
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

        <section className="drawer-section">
          <h3 className="drawer-title">About</h3>
          <p className="drawer-note">
            {entryCount === 1 ? '1 entry' : `${entryCount} entries`} on record. Data
            lives only on this phone — in the app’s own database — and never leaves
            it unless you export.
          </p>
        </section>

        <AddMethodSheet
          open={addingMethod}
          onCreated={() => {}}
          onClose={() => setAddingMethod(false)}
        />
        <AddCategorySheet
          open={addingCategory}
          onCreated={() => {}}
          onClose={() => setAddingCategory(false)}
        />
        <CurrencySheet
          open={pickingCurrency}
          selected={defaultCurrency}
          onSelect={(code) => {
            setDefaultCurrency(code)
            setPref(PREFS.defaultCurrency, code)
            onDefaultCurrencyChange?.(code)
          }}
          onClose={() => setPickingCurrency(false)}
        />
      </aside>
    </div>
  )
}

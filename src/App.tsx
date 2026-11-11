import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { BudgetAlertSheet } from './components/BudgetAlertSheet'
import { BudgetSheet } from './components/BudgetSheet'
import { ChartIcon, MenuIcon, PlusIcon, ReceiptIcon } from './components/icons'
import { SettingsDrawer } from './components/SettingsDrawer'
import { unbackedSince } from './db'
import { runAutoBackupIfDue } from './lib/autoBackup'
import { assessBackupHealth } from './lib/backupHealth'
import { budgetFor, readBudgets, withBudget } from './lib/budget'
import type { BudgetAlert } from './lib/budgetCheck'
import { warnFeedback } from './lib/haptics'
import type { HistoryJump } from './lib/history'
import { getPref, PREFS, setPref } from './lib/prefs'
import { AddScreen } from './screens/AddScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SummaryScreen } from './screens/SummaryScreen'

const TABS = [
  { id: 'add', label: 'Add', Icon: PlusIcon },
  { id: 'history', label: 'History', Icon: ReceiptIcon },
  { id: 'summary', label: 'Summary', Icon: ChartIcon },
] as const

type Tab = (typeof TABS)[number]['id']

// All three screens stay mounted: tab switches never drop a half-typed
// entry, and live queries keep the hidden screens current.
export default function App() {
  const [tab, setTab] = useState<Tab>('add')
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Whose budget the sheet is editing, and whether it is open at all: Summary
  // opens it for the currency on screen, Settings for the default one.
  const [budgetSheetFor, setBudgetSheetFor] = useState<string | null>(null)
  const [historyJump, setHistoryJump] = useState<HistoryJump | null>(null)

  // A settings row was tapped: close the drawer, land on History, filter to
  // it. A fresh object per tap means re-tapping the same row re-applies even
  // if the user changed filters in between (identity is the event).
  // The handler itself is stable (setState functions are): Summary passes it
  // into a memoized chart, which would otherwise rebuild whenever this
  // component re-rendered for an unrelated reason.
  const jumpToHistory = useCallback((jump: HistoryJump) => {
    setHistoryJump({ ...jump })
    setTab('history')
    setSettingsOpen(false)
  }, [])
  // Remounting AddScreen on this key re-reads the default-currency pref, so a
  // change in Settings takes effect immediately (not just next cold start).
  const [defaultCurrency, setDefaultCurrency] = useState(() =>
    getPref(PREFS.defaultCurrency, 'INR'),
  )

  // Prefs are not reactive, so the budgets live here like the default
  // currency, and the sheet reports every change back. setPref is best-effort:
  // if storage refuses, the change still holds for this session.
  const [budgets, setBudgets] = useState(() =>
    readBudgets(getPref(PREFS.monthlyBudgets, {})),
  )
  function saveBudget(currency: string, amount: number | null) {
    const next = withBudget(budgets, currency, amount)
    setPref(PREFS.monthlyBudgets, next)
    setBudgets(next)
  }
  const sheetCurrency = budgetSheetFor ?? defaultCurrency

  // A new entry on Add or an edit on History can take the month past its
  // budget, so the sheet lives here, above both. `undo` comes only with a new
  // entry. The warning tick belongs to the sheet appearing, whichever save
  // raised it.
  const [budgetAlert, setBudgetAlert] = useState<{
    alert: BudgetAlert
    undo?: () => void
  } | null>(null)
  function raiseBudgetAlert(alert: BudgetAlert, undo?: () => void) {
    setBudgetAlert({ alert, undo })
    void warnFeedback()
  }

  // Prefs are not reactive, so the last-export timestamp lives here and the
  // drawer reports back when an export succeeds.
  const [lastExport, setLastExport] = useState(() => getPref(PREFS.lastExport, ''))
  // Staleness is a function of elapsed time, not of data changing, so resuming
  // after days away has to re-run the check — nothing else would trigger it on
  // the PWA, where runAutoBackupIfDue is a no-op.
  const [resumeTick, setResumeTick] = useState(0)
  const unbacked = useLiveQuery(
    () => unbackedSince(lastExport === '' ? null : lastExport),
    [lastExport, resumeTick],
  )
  const backupStale = assessBackupHealth({
    unbackedCount: unbacked?.count ?? 0,
    oldestUnbackedAt: unbacked?.oldestAt ?? null,
    now: new Date().toISOString(),
  }).stale

  useEffect(() => {
    // Fire-and-forget: a failed snapshot only shows up as a stale
    // "last snapshot" date in Settings, never as a launch blocker. Runs on
    // foreground too (visibilitychange fires in WKWebView on app resume): on
    // native that catches a snapshot a cold-start-only check would miss; on
    // the PWA the snapshot call is a no-op, and this is what bumps
    // resumeTick so the staleness check re-runs instead.
    const run = () =>
      runAutoBackupIfDue().catch((err) => console.error('auto-backup failed', err))
    run()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        run()
        setResumeTick((tick) => tick + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return (
    <div className="app">
      <button
        type="button"
        className={backupStale ? 'menu-btn is-stale' : 'menu-btn'}
        aria-label={backupStale ? 'Open settings — backup overdue' : 'Open settings'}
        onClick={() => setSettingsOpen(true)}
      >
        <MenuIcon />
      </button>
      <main>
        <section hidden={tab !== 'add'}>
          <AddScreen
            key={defaultCurrency}
            budgets={budgets}
            onBudgetAlert={raiseBudgetAlert}
          />
        </section>
        <section hidden={tab !== 'history'}>
          <HistoryScreen
            jump={historyJump}
            budgets={budgets}
            onBudgetAlert={raiseBudgetAlert}
          />
        </section>
        <section hidden={tab !== 'summary'}>
          <SummaryScreen
            budgets={budgets}
            onDrill={jumpToHistory}
            onAddNew={() => setTab('add')}
            onOpenBudget={(currency) => setBudgetSheetFor(currency)}
          />
        </section>
      </main>
      <nav className="tabbar" aria-label="Screens">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onDefaultCurrencyChange={setDefaultCurrency}
        onJumpToHistory={jumpToHistory}
        budget={budgetFor(budgets, defaultCurrency)}
        // Close the drawer first: a sheet sits under the drawer's z-index.
        onOpenBudget={() => {
          setSettingsOpen(false)
          setBudgetSheetFor(defaultCurrency)
        }}
        onExported={() => setLastExport(getPref(PREFS.lastExport, ''))}
      />
      <BudgetSheet
        open={budgetSheetFor !== null}
        onClose={() => setBudgetSheetFor(null)}
        currency={sheetCurrency}
        budget={budgetFor(budgets, sheetCurrency)}
        onBudgetChange={(amount) => saveBudget(sheetCurrency, amount)}
      />
      <BudgetAlertSheet
        alert={budgetAlert?.alert ?? null}
        onClose={() => setBudgetAlert(null)}
        onSeeEntries={() => budgetAlert && jumpToHistory({ month: budgetAlert.alert.month })}
        onUndo={budgetAlert?.undo}
      />
    </div>
  )
}

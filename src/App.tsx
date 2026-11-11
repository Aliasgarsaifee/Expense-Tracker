import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BudgetAlertSheet } from './components/BudgetAlertSheet'
import { BudgetSheet } from './components/BudgetSheet'
import { ChartIcon, MenuIcon, PlusIcon, ReceiptIcon } from './components/icons'
import { SettingsDrawer } from './components/SettingsDrawer'
import { Toast } from './components/Toast'
import { listWaiting, unbackedSince } from './db'
import { runAutoBackupIfDue } from './lib/autoBackup'
import { assessBackupHealth } from './lib/backupHealth'
import { budgetFor, readBudgets, withBudget } from './lib/budget'
import type { BudgetAlert } from './lib/budgetCheck'
import { convertedMessage } from './lib/conversion'
import { fillMissingRates } from './lib/fillRates'
import { warnFeedback } from './lib/haptics'
import type { HistoryJump } from './lib/history'
import { getPref, PREFS, setPref } from './lib/prefs'
import { useToast } from './lib/useToast'
import { useToday } from './lib/useToday'
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

  // The window is the one scroll container for three mounted screens, so a
  // screen's position is parked here when it is left. It is saved at the
  // moment of the tap, never from a scroll listener or an effect: hiding a
  // section shrinks the document and the browser clamps scrollY before either
  // runs.
  const scrollByTab = useRef<Record<Tab, number>>({ add: 0, history: 0, summary: 0 })
  // switchTo and jumpToHistory must stay referentially stable, so they read
  // the tab on screen from here instead of closing over it.
  const tabRef = useRef(tab)
  useLayoutEffect(() => {
    tabRef.current = tab
    window.scrollTo(0, scrollByTab.current[tab])
  }, [tab])

  // Every change of screen goes through here, so the rule is written once:
  // park where the leaving screen was, then show the next — from its top when
  // the arrival is a fresh start rather than a return. Add is never parked:
  // it is where an entry starts, so it always opens on the amount.
  const switchTo = useCallback((next: Tab, fromTop = false) => {
    const from = tabRef.current
    if (from !== 'add') scrollByTab.current[from] = window.scrollY
    if (fromTop) scrollByTab.current[next] = 0
    setTab(next)
  }, [])

  function selectTab(next: Tab) {
    // Tapping the tab you are already on is the way back to its top.
    if (next === tab) window.scrollTo({ top: 0, behavior: 'smooth' })
    else switchTo(next)
  }

  // A settings row was tapped: close the drawer, land on History, filter to
  // it. A fresh object per tap means re-tapping the same row re-applies even
  // if the user changed filters in between (identity is the event).
  // The handler itself is stable (setState functions are): Summary passes it
  // into a memoized chart, which would otherwise rebuild whenever this
  // component re-rendered for an unrelated reason.
  const jumpToHistory = useCallback(
    (jump: HistoryJump) => {
      setHistoryJump({ ...jump })
      // A jump lands on a fresh filter, so start at its top, not where
      // History was left.
      if (tabRef.current === 'history') window.scrollTo(0, 0)
      else switchTo('history', true)
      setSettingsOpen(false)
    },
    [switchTo],
  )
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
    // Coming back online is when a rate fetch that failed can succeed, so it
    // re-runs the fill-in below the same way a resume does.
    const onOnline = () => setResumeTick((tick) => tick + 1)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  // Foreign entries still waiting for their home value. The count, not the
  // rows, so the effect below re-runs only when it changes.
  const today = useToday()
  const waiting = useLiveQuery(
    () => listWaiting(defaultCurrency, today).then((rows) => rows.length),
    [defaultCurrency, today],
  )
  const { toast, show } = useToast()
  // The effect below must not re-run just because `show` is a new function on
  // every render, so it reads the latest one through a ref.
  const showRef = useRef(show)
  showRef.current = show
  // Cannot loop: a pass that converts nothing changes no dependency, and one
  // that converts something lowers `waiting` (to zero, or to the entries that
  // still have no rate, which then wait for the next resume or online event).
  useEffect(() => {
    if (!waiting) return
    // No cancel flag: each conversion lowers `waiting` and so supersedes this
    // effect mid-pass, while the pass itself (guarded against overlap) is the
    // one that knows the count. A finished pass always says so.
    void fillMissingRates(defaultCurrency, today).then((n) => {
      if (n > 0) showRef.current({ message: convertedMessage(n, defaultCurrency) })
    })
  }, [waiting, defaultCurrency, today, resumeTick])

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
            defaultCurrency={defaultCurrency}
            onBudgetAlert={raiseBudgetAlert}
          />
        </section>
        <section hidden={tab !== 'summary'}>
          <SummaryScreen
            budgets={budgets}
            onDrill={jumpToHistory}
            onAddNew={() => switchTo('add')}
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
            onClick={() => selectTab(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <Toast state={toast} raised />
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
        onSeeEntries={() =>
          budgetAlert &&
          jumpToHistory({ period: { kind: 'month', month: budgetAlert.alert.month } })
        }
        onUndo={budgetAlert?.undo}
      />
    </div>
  )
}

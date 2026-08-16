import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { SettingsDrawer } from './components/SettingsDrawer'
import { unbackedSince } from './db'
import { runAutoBackupIfDue } from './lib/autoBackup'
import { assessBackupHealth } from './lib/backupHealth'
import type { HistoryJump } from './lib/history'
import { getPref, PREFS } from './lib/prefs'
import { AddScreen } from './screens/AddScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SummaryScreen } from './screens/SummaryScreen'

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 8.4v7.2M8.4 12h7.2" />
    </svg>
  )
}

function ReceiptIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 3.5h11v16.4l-2.2-1.5-2.1 1.5-1.2-.9-1.2.9-2.1-1.5-2.2 1.5z" />
      <path d="M9.4 8h5.2M9.4 11.2h5.2M9.4 14.4h3" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M5.5 19.5v-6M12 19.5V4.5M18.5 19.5v-10" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M4.5 7h15M4.5 12h11.5M4.5 17h15" />
    </svg>
  )
}

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
          <AddScreen key={defaultCurrency} />
        </section>
        <section hidden={tab !== 'history'}>
          <HistoryScreen jump={historyJump} />
        </section>
        <section hidden={tab !== 'summary'}>
          <SummaryScreen onDrill={jumpToHistory} onAddNew={() => setTab('add')} />
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
        onExported={() => setLastExport(getPref(PREFS.lastExport, ''))}
      />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { SettingsDrawer } from './components/SettingsDrawer'
import { runAutoBackupIfDue } from './lib/autoBackup'
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
  // Remounting AddScreen on this key re-reads the default-currency pref, so a
  // change in Settings takes effect immediately (not just next cold start).
  const [defaultCurrency, setDefaultCurrency] = useState(() =>
    getPref(PREFS.defaultCurrency, 'INR'),
  )

  useEffect(() => {
    // Fire-and-forget: a failed snapshot only shows up as a stale
    // "last snapshot" date in Settings, never as a launch blocker. Also runs
    // on foreground (visibilitychange fires in WKWebView on app resume), so
    // the daily snapshot isn't limited to cold starts.
    const run = () =>
      runAutoBackupIfDue().catch((err) => console.error('auto-backup failed', err))
    run()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return (
    <div className="app">
      <button
        type="button"
        className="menu-btn"
        aria-label="Open settings"
        onClick={() => setSettingsOpen(true)}
      >
        <MenuIcon />
      </button>
      <main>
        <section hidden={tab !== 'add'}>
          <AddScreen key={defaultCurrency} />
        </section>
        <section hidden={tab !== 'history'}>
          <HistoryScreen />
        </section>
        <section hidden={tab !== 'summary'}>
          <SummaryScreen />
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
      />
    </div>
  )
}

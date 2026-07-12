import { Component, type ReactNode } from 'react'
import { listCategories, listExpenses, listPaymentMethods } from '../db'
import { backupToJson } from '../lib/backup'
import { todayISO } from '../lib/dates'
import { exportTextFile } from '../lib/exportFile'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Last line of defence: a render-time crash must never look like lost data.
// The fallback offers the same JSON export Settings has, straight off Dexie,
// which survives whatever broke the React tree.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  async exportBackup() {
    try {
      await exportTextFile(
        `expense-backup-${todayISO()}.json`,
        backupToJson({
          expenses: await listExpenses(),
          paymentMethods: await listPaymentMethods({ includeArchived: true }),
          categories: await listCategories({ includeArchived: true }),
        }),
        'application/json',
      )
    } catch (err) {
      window.alert(
        err instanceof Error ? `Export failed: ${err.message}` : 'Export failed.',
      )
    }
  }

  render() {
    if (this.state.error === null) return this.props.children
    return (
      <div className="app">
        <main>
          <div className="screen">
            <div className="empty" role="alert">
              <p className="empty-mark display" aria-hidden="true">
                ✕
              </p>
              <p className="empty-title">Something went wrong</p>
              <p className="empty-sub">
                Your entries are safe in the on-device database. Export a
                backup, then reload.
              </p>
              <p className="error-detail">{this.state.error.message}</p>
              <div className="error-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void this.exportBackup()}
                >
                  Export JSON backup
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => window.location.reload()}
                >
                  Reload app
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }
}

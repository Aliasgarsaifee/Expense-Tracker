import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import {
  CASH_METHOD_ID,
  deleteCategory,
  deletePaymentMethod,
  isBuiltinCategoryId,
  listCategories,
  listExpenses,
  listPaymentMethods,
  PAYMENT_GROUPS,
  renameCategory,
  renameGroup,
  renamePaymentMethod,
  setCategoryArchived,
  setPaymentMethodArchived,
  type Category,
  type PaymentMethod,
} from '../db'
import { currencySymbol } from '../lib/currencies'
import type { HistoryJump } from '../lib/history'
import { bucketize, groupEmoji } from '../lib/paymentMeta'
import { getPref, PREFS, setPref } from '../lib/prefs'
import { useDialog } from '../lib/useDialog'
import { AddCategorySheet } from './AddCategorySheet'
import { AddMethodSheet } from './AddMethodSheet'
import { BackupSection } from './BackupSection'
import { CurrencySheet } from './CurrencySheet'
import { Dialog } from './Dialog'

interface Props {
  open: boolean
  onClose: () => void
  onDefaultCurrencyChange?: (code: string) => void
  onJumpToHistory: (jump: HistoryJump) => void
  onExported?: () => void
}

export function SettingsDrawer({ open, ...body }: Props) {
  if (!open) return null
  return <DrawerBody {...body} />
}

// Header row of a collapsible section. The rename pencil (custom method
// groups only) sits beside the toggle, not inside it — buttons cannot nest.
function GroupToggle({
  emoji,
  label,
  count,
  expanded,
  onToggle,
  onRename,
}: {
  emoji: string
  label: string
  count: number
  expanded: boolean
  onToggle: () => void
  onRename?: () => void
}) {
  return (
    <div className="group-head">
      <button
        type="button"
        className="group-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="method-emoji" aria-hidden="true">
          {emoji}
        </span>
        <span className="group-label">{label}</span>
        <span className="group-count">{count}</span>
        <span className="group-caret" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {onRename && (
        <button
          type="button"
          className="icon-btn"
          aria-label={`Rename the ${label} group`}
          onClick={onRename}
        >
          ✎
        </button>
      )}
    </div>
  )
}

// One row of the settings tree: the label area jumps to History, the icon
// cluster edits. Method and category rows share this shape exactly; methods
// skip the emoji because their group header already carries it.
function ItemRow({
  emoji,
  label,
  count,
  archived,
  builtIn,
  onView,
  onRename,
  onToggleArchived,
  onDelete,
}: {
  emoji?: string
  label: string
  count: number
  archived: boolean
  builtIn: boolean
  onView: () => void
  onRename: () => void
  onToggleArchived: () => void
  onDelete: () => void
}) {
  const sub = [
    count > 0 ? (count === 1 ? '1 entry' : `${count} entries`) : null,
    archived ? 'archived' : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className={archived ? 'method-row archived' : 'method-row'}>
      {emoji && (
        <span className="method-emoji" aria-hidden="true">
          {emoji}
        </span>
      )}
      <button
        type="button"
        className="method-view"
        aria-label={`View ${label} in History`}
        onClick={onView}
      >
        <span className="method-label">{label}</span>
        {sub && <span className="method-sub">{sub}</span>}
      </button>
      <span className="method-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label={`Rename ${label}`}
          onClick={onRename}
        >
          ✎
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={archived ? `Restore ${label}` : `Archive ${label}`}
          onClick={onToggleArchived}
        >
          {archived ? '↩' : '⤓'}
        </button>
        {!builtIn && (
          <button
            type="button"
            className="icon-btn danger"
            aria-label={`Delete ${label}`}
            onClick={onDelete}
          >
            ✕
          </button>
        )}
      </span>
    </li>
  )
}

// Mounted fresh on every open so prefs are re-read from storage and the
// group tree starts collapsed.
function DrawerBody({
  onClose,
  onDefaultCurrencyChange,
  onJumpToHistory,
  onExported,
}: Omit<Props, 'open'>) {
  const methods = useLiveQuery(() => listPaymentMethods({ includeArchived: true }))
  const categories = useLiveQuery(() => listCategories({ includeArchived: true }))
  const expenses = useLiveQuery(listExpenses)
  const [addingMethod, setAddingMethod] = useState(false)
  const [addingCategory, setAddingCategory] = useState(false)
  // Collapsed by default: post-import the flat list ran ~21 methods deep and
  // buried Preferences/Backup. The drawer body remounts per open, so every
  // visit starts folded.
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set())
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [pickingCurrency, setPickingCurrency] = useState(false)
  const { dialog, close, showAlert, askConfirm, askPrompt } = useDialog()
  const [defaultCurrency, setDefaultCurrency] = useState(() =>
    getPref(PREFS.defaultCurrency, 'INR'),
  )

  const methodBuckets = useMemo(() => bucketize(methods ?? []), [methods])

  function toggleGroup(group: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

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
    const label = await askPrompt({
      title: 'Rename payment method',
      label: 'Name',
      initialValue: method.label,
    })
    if (label === null) return
    try {
      await renamePaymentMethod(method.id, label)
    } catch (err) {
      await showAlert('Could not rename', err instanceof Error ? err.message : undefined)
    }
  }

  async function renameGroupPrompt(group: string) {
    const name = await askPrompt({
      title: 'Rename group',
      label: 'Group name',
      initialValue: group,
    })
    if (name === null) return
    try {
      await renameGroup(group, name)
      // Keep the renamed group expanded if it was: the open-set is keyed by
      // name, and losing the expansion mid-edit reads as the group vanishing.
      setOpenGroups((prev) => {
        if (!prev.has(group)) return prev
        const next = new Set(prev)
        next.delete(group)
        next.add(name.trim())
        return next
      })
    } catch (err) {
      await showAlert('Could not rename', err instanceof Error ? err.message : undefined)
    }
  }

  async function toggleMethodArchived(method: PaymentMethod) {
    try {
      await setPaymentMethodArchived(method.id, !method.archived)
    } catch (err) {
      await showAlert('Could not update', err instanceof Error ? err.message : undefined)
    }
  }

  async function removeMethod(method: PaymentMethod) {
    const ok = await askConfirm({
      title: `Delete "${method.label}"?`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await deletePaymentMethod(method.id)
    } catch (err) {
      await showAlert('Could not delete', err instanceof Error ? err.message : undefined)
    }
  }

  async function renameCat(category: Category) {
    const label = await askPrompt({
      title: 'Rename category',
      label: 'Name',
      initialValue: category.label,
    })
    if (label === null) return
    try {
      await renameCategory(category.id, label)
    } catch (err) {
      await showAlert('Could not rename', err instanceof Error ? err.message : undefined)
    }
  }

  async function toggleCatArchived(category: Category) {
    try {
      await setCategoryArchived(category.id, !category.archived)
    } catch (err) {
      await showAlert('Could not update', err instanceof Error ? err.message : undefined)
    }
  }

  async function removeCat(category: Category) {
    const ok = await askConfirm({
      title: `Delete "${category.label}"?`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteCategory(category.id)
    } catch (err) {
      await showAlert('Could not delete', err instanceof Error ? err.message : undefined)
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
            {methodBuckets.map(({ group, members }) => {
              const expanded = openGroups.has(group)
              const builtInGroup = (PAYMENT_GROUPS as readonly string[]).includes(group)
              return (
                <li key={group}>
                  <GroupToggle
                    emoji={groupEmoji(group)}
                    label={group}
                    count={members.length}
                    expanded={expanded}
                    onToggle={() => toggleGroup(group)}
                    onRename={
                      builtInGroup ? undefined : () => void renameGroupPrompt(group)
                    }
                  />
                  {expanded && (
                    <ul className="method-list group-members">
                      {members.map((m) => (
                        <ItemRow
                          key={m.id}
                          label={m.label}
                          count={methodUsage.get(m.id) ?? 0}
                          archived={!!m.archived}
                          builtIn={m.id === CASH_METHOD_ID}
                          onView={() => onJumpToHistory({ paymentMethodId: m.id })}
                          onRename={() => void renameMethod(m)}
                          onToggleArchived={() => void toggleMethodArchived(m)}
                          onDelete={() => void removeMethod(m)}
                        />
                      ))}
                    </ul>
                  )}
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
          <GroupToggle
            emoji="🏷️"
            label="All categories"
            count={(categories ?? []).length}
            expanded={categoriesOpen}
            onToggle={() => setCategoriesOpen((v) => !v)}
          />
          {categoriesOpen && (
            <ul className="method-list group-members">
              {(categories ?? []).map((c) => (
                <ItemRow
                  key={c.id}
                  emoji={c.emoji}
                  label={c.label}
                  count={categoryUsage.get(c.label) ?? 0}
                  archived={!!c.archived}
                  builtIn={isBuiltinCategoryId(c.id)}
                  onView={() => onJumpToHistory({ category: c.label })}
                  onRename={() => void renameCat(c)}
                  onToggleArchived={() => void toggleCatArchived(c)}
                  onDelete={() => void removeCat(c)}
                />
              ))}
            </ul>
          )}
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

        <BackupSection showAlert={showAlert} askConfirm={askConfirm} onExported={onExported} />

        <section className="drawer-section">
          <h3 className="drawer-title">About</h3>
          <p className="drawer-note">
            {entryCount === 1 ? '1 entry' : `${entryCount} entries`} on record. Data
            lives only on this phone — in the app’s own database — and never leaves
            it unless you export.
          </p>
          <p className="drawer-note">v{__APP_VERSION__}</p>
        </section>

        <AddMethodSheet
          open={addingMethod}
          // Expand the new method's group: a row born folded away reads as a
          // failed add.
          onCreated={(m) => setOpenGroups((prev) => new Set(prev).add(m.group))}
          onClose={() => setAddingMethod(false)}
        />
        <AddCategorySheet
          open={addingCategory}
          onCreated={() => setCategoriesOpen(true)}
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
      <Dialog state={dialog} onClose={close} />
    </div>
  )
}

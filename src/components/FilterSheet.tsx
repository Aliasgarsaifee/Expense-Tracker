import type { Category, PaymentMethod } from '../db'
import {
  bucketize,
  groupEmoji,
  toggleGroup,
  toggleMethod,
  type MethodSelection,
} from '../lib/paymentMeta'
import { RangeDateField } from './RangeDateField'

interface Props {
  open: boolean
  methods: PaymentMethod[]
  categories: Category[]
  selection: MethodSelection
  onSelectionChange: (sel: MethodSelection) => void
  catFilters: string[]
  onCatFiltersChange: (labels: string[]) => void
  from: string | null
  to: string | null
  onRangeChange: (from: string | null, to: string | null) => void
  onClearAll: () => void
  onClose: () => void
}

// Fully controlled: HistoryScreen owns every filter value. Everything applies
// live — the list updates behind the sheet — so Done only dismisses.
export function FilterSheet({
  open,
  methods,
  categories,
  selection,
  onSelectionChange,
  catFilters,
  onCatFiltersChange,
  from,
  to,
  onRangeChange,
  onClearAll,
  onClose,
}: Props) {
  if (!open) return null
  const buckets = bucketize(methods)
  const anyActive =
    selection.methodIds.length > 0 ||
    selection.groups.length > 0 ||
    catFilters.length > 0 ||
    from !== null ||
    to !== null

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        className="sheet filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Filter history"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-head">
          <h2 className="display">Filters</h2>
          <button className="btn-text" type="button" onClick={onClose}>
            Done
          </button>
        </header>

        <div className="field">
          <span>Paid with</span>
          <div className="filter-groups">
            {buckets.map(({ group, members }) => (
              <div key={group} className="chip-grid" role="group" aria-label={group}>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={selection.groups.includes(group)}
                  onClick={() =>
                    onSelectionChange(
                      toggleGroup(selection, group, members.map((m) => m.id)),
                    )
                  }
                >
                  <span aria-hidden="true">{groupEmoji(group)}</span> {group} ·{' '}
                  {members.length}
                </button>
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="chip"
                    aria-pressed={
                      selection.methodIds.includes(m.id) ||
                      selection.groups.includes(m.group)
                    }
                    onClick={() =>
                      onSelectionChange(
                        toggleMethod(selection, m, members.map((x) => x.id)),
                      )
                    }
                  >
                    {m.label}
                    {m.archived && <span className="chip-tag">archived</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Categories</span>
          <div className="chip-grid" role="group" aria-label="Category filter">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip"
                aria-pressed={catFilters.includes(c.label)}
                onClick={() =>
                  onCatFiltersChange(
                    catFilters.includes(c.label)
                      ? catFilters.filter((l) => l !== c.label)
                      : [...catFilters, c.label],
                  )
                }
              >
                <span aria-hidden="true">{c.emoji}</span> {c.label}
                {c.archived && <span className="chip-tag">archived</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Between</span>
          <div className="filter-dates">
            <RangeDateField label="Start" value={from} onChange={(v) => onRangeChange(v, to)} />
            <RangeDateField label="End" value={to} onChange={(v) => onRangeChange(from, v)} />
          </div>
        </div>

        <button type="button" className="btn-ghost" disabled={!anyActive} onClick={onClearAll}>
          <span>Clear all filters</span>
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  )
}

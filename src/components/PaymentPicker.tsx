import { useEffect, useMemo, useRef, useState } from 'react'
import type { PaymentMethod } from '../db'
import { bucketize, filterByLabel, groupEmoji, orderByRecency } from '../lib/paymentMeta'
import { useKeyboardInset } from '../lib/useKeyboardInset'

interface Props {
  methods: PaymentMethod[]
  selectedId?: string
  recency: Map<string, string>
  onSelect: (id: string) => void
  onAddNew: (presetGroup?: string) => void
}

// Above this many methods in one group, that group's sheet shows a search field.
const SEARCH_THRESHOLD = 5

// The "Paid with" control: one chip per payment group. A group with a single
// method toggles it directly; a group with several opens a dropdown sheet so
// the row never sprawls as cards pile up. Within a group, methods are ordered
// most-recently-used first; a long group's sheet also gains a search field
// (the app's standard search-in-sheet pattern, see CurrencySheet).
export function PaymentPicker({ methods, selectedId, recency, onSelect, onAddNew }: Props) {
  const buckets = useMemo(
    () =>
      bucketize(methods).map((b) => ({
        ...b,
        members: orderByRecency(b.members, recency),
      })),
    [methods, recency],
  )
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  // A stale query would greet the next open with a filtered list.
  useEffect(() => {
    setQuery('')
  }, [openGroup])

  // A new query re-ranks the list; reset scroll so the top matches show.
  useEffect(() => {
    listRef.current?.scrollTo(0, 0)
  }, [query])

  useKeyboardInset(sheetRef, openGroup !== null)

  const active = openGroup ? buckets.find((b) => b.group === openGroup) : null
  const searchable = !!active && active.members.length > SEARCH_THRESHOLD
  const visible = active ? filterByLabel(active.members, query) : []

  return (
    <>
      <div className="chip-row" role="group" aria-label="Payment method">
        {buckets.map(({ group, members }) => {
          const selected = members.find((m) => m.id === selectedId)
          const multi = members.length > 1
          if (!multi) {
            const m = members[0]
            return (
              <button
                key={group}
                type="button"
                className="chip"
                aria-pressed={m.id === selectedId}
                onClick={() => onSelect(m.id)}
              >
                <span aria-hidden="true">{groupEmoji(group)}</span> {m.label}
                {m.archived && <span className="chip-tag">archived</span>}
              </button>
            )
          }
          return (
            <button
              key={group}
              type="button"
              className="chip chip-group"
              aria-pressed={!!selected}
              aria-haspopup="dialog"
              onClick={() => setOpenGroup(group)}
            >
              <span aria-hidden="true">{groupEmoji(group)}</span>{' '}
              {selected ? selected.label : group}
              <span className="chip-caret" aria-hidden="true">
                ▾
              </span>
            </button>
          )
        })}
        <button
          type="button"
          className="chip chip-add"
          aria-label="Add a payment method"
          onClick={() => onAddNew()}
        >
          +
        </button>
      </div>

      {active && (
        <div className="sheet-scrim" onClick={() => setOpenGroup(null)}>
          <div
            ref={sheetRef}
            className={searchable ? 'sheet sheet-search' : 'sheet'}
            role="dialog"
            aria-modal="true"
            aria-label={`Choose ${active.group}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-handle" aria-hidden="true" />
            <header className="sheet-head">
              <h2 className="display">
                <span aria-hidden="true">{groupEmoji(active.group)}</span> {active.group}
              </h2>
              <button className="btn-text" type="button" onClick={() => setOpenGroup(null)}>
                Cancel
              </button>
            </header>
            {searchable && (
              // label, not div: a tap anywhere on the field focuses the input
              <label className="search-field">
                <span aria-hidden="true">🔎</span>
                <input
                  type="search"
                  placeholder={`Search ${active.members.length} ${active.group.toLowerCase()}s…`}
                  aria-label={`Search ${active.group}`}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query !== '' && (
                  <button type="button" className="btn-text" onClick={() => setQuery('')}>
                    Clear
                  </button>
                )}
              </label>
            )}
            <ul className="pick-list" ref={listRef}>
              {visible.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="pick-row"
                    aria-pressed={m.id === selectedId}
                    onClick={() => {
                      onSelect(m.id)
                      setOpenGroup(null)
                    }}
                  >
                    <span className="pick-text">
                      <span className="pick-primary">{m.label}</span>
                      {m.archived && <span className="pick-sub">archived</span>}
                    </span>
                    {m.id === selectedId && (
                      <span className="pick-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {visible.length === 0 && (
                <li className="pick-none">Nothing matches “{query.trim()}”</li>
              )}
            </ul>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                const g = active.group
                setOpenGroup(null)
                onAddNew(g)
              }}
            >
              <span>Add another {active.group.toLowerCase()}</span>
              <span aria-hidden="true">+</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

import { useMemo, useState } from 'react'
import type { PaymentMethod } from '../db'
import { bucketize, groupEmoji } from '../lib/paymentMeta'

interface Props {
  methods: PaymentMethod[]
  selectedId?: string
  onSelect: (id: string) => void
  onAddNew: (presetGroup?: string) => void
}

// The "Paid with" control: one chip per payment group. A group with a single
// method toggles it directly; a group with several opens a dropdown sheet so
// the row never sprawls as cards pile up.
export function PaymentPicker({ methods, selectedId, onSelect, onAddNew }: Props) {
  const buckets = useMemo(() => bucketize(methods), [methods])
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  const active = openGroup ? buckets.find((b) => b.group === openGroup) : null

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
            className="sheet"
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
              <button
                className="btn-text"
                type="button"
                onClick={() => setOpenGroup(null)}
              >
                Cancel
              </button>
            </header>
            <ul className="pick-list">
              {active.members.map((m) => (
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

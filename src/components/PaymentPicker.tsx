import { useEffect, useMemo, useRef, useState } from 'react'
import type { PaymentMethod } from '../db'
import { PICKER_SECTION_THRESHOLD, groupEmoji, pickerSections } from '../lib/paymentMeta'
import { useKeyboardInset } from '../lib/useKeyboardInset'
import { CheckIcon, ChevronRightIcon, AddIcon, SearchIcon } from './icons'

interface Props {
  methods: PaymentMethod[]
  selectedId?: string
  recency: Map<string, string>
  onSelect: (id: string) => void
  onAddNew: () => void
}

// Under Recent and in an untitled run the group is the sub-line; under a type
// heading only the archived tag remains.
function subLine(title: string, m: PaymentMethod): string {
  const parts = title === '' || title === 'Recent' ? [m.group] : []
  if (m.archived) parts.push('archived')
  return parts.join(' · ')
}

// The "Paid with" row of the details group: it shows the current method and
// opens one sheet listing every method. A long list gains a search field (the
// app's standard search-in-sheet pattern, see CurrencySheet) and is sectioned:
// the last-used few, then every method under its type in a fixed A–Z order.
export function PaymentPicker({ methods, selectedId, recency, onSelect, onAddNew }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const sections = useMemo(
    () => pickerSections(methods, recency, query),
    [methods, recency, query],
  )
  const listRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  // A stale query would greet the next open with a filtered list.
  useEffect(() => {
    setQuery('')
  }, [open])

  // A new query re-ranks the list; reset scroll so the top matches show.
  useEffect(() => {
    listRef.current?.scrollTo(0, 0)
  }, [query])

  useKeyboardInset(sheetRef, open)

  const selected = methods.find((m) => m.id === selectedId)
  const searchable = methods.length > PICKER_SECTION_THRESHOLD

  return (
    <>
      <button
        type="button"
        className="detail-row"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="detail-label">Paid with</span>
        {selected ? (
          <span className="detail-value">
            <span aria-hidden="true">{groupEmoji(selected.group)}</span> {selected.label}
            {selected.archived && <span className="chip-tag">archived</span>}
          </span>
        ) : (
          // Empty while a chosen method's liveQuery is still resolving: only
          // an entry with no method at all reads "Not recorded".
          <span className="detail-value detail-empty">
            {selectedId ? '' : 'Not recorded'}
          </span>
        )}
        <ChevronRightIcon size={18} />
      </button>

      {open && (
        <div className="sheet-scrim" onClick={() => setOpen(false)}>
          <div
            ref={sheetRef}
            className={searchable ? 'sheet sheet-search' : 'sheet'}
            role="dialog"
            aria-modal="true"
            aria-label="Paid with"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-handle" aria-hidden="true" />
            <header className="sheet-head">
              <h2 className="display">Paid with</h2>
              <button className="btn-text" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </header>
            {searchable && (
              // label, not div: a tap anywhere on the field focuses the input
              <label className="search-field">
                <SearchIcon size={18} />
                <input
                  type="search"
                  placeholder="Search payment methods…"
                  aria-label="Search payment methods"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  // This sheet renders inside the entry form, where Enter in
                  // a field would otherwise submit the expense.
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault()
                  }}
                />
                {query !== '' && (
                  <button type="button" className="btn-text" onClick={() => setQuery('')}>
                    Clear
                  </button>
                )}
              </label>
            )}
            <div className="pick-list" ref={listRef}>
              {sections.map((section) => (
                <div key={section.title}>
                  {section.title !== '' && <h3 className="pick-section">{section.title}</h3>}
                  <ul aria-label={section.title || 'Payment methods'}>
                    {section.methods.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          className="pick-row"
                          aria-pressed={m.id === selectedId}
                          onClick={() => {
                            onSelect(m.id)
                            setOpen(false)
                          }}
                        >
                          <span className="pick-text">
                            <span className="pick-primary">
                              <span aria-hidden="true">{groupEmoji(m.group)}</span> {m.label}
                            </span>
                            {/* Under a type heading the group would only repeat it. */}
                            {subLine(section.title, m) !== '' && (
                              <span className="pick-sub">{subLine(section.title, m)}</span>
                            )}
                          </span>
                          {m.id === selectedId && (
                            <span className="pick-check" aria-hidden="true">
                              <CheckIcon size={18} />
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {sections.length === 0 && (
                <p className="pick-none">Nothing matches “{query.trim()}”</p>
              )}
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setOpen(false)
                onAddNew()
              }}
            >
              <span>Add a payment method</span>
              <AddIcon size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

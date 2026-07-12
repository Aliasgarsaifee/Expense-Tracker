import { useEffect, useRef, useState } from 'react'
import { CURRENCIES, filterCurrencies } from '../lib/currencies'
import { useKeyboardInset } from '../lib/useKeyboardInset'

interface Props {
  open: boolean
  selected: string
  onSelect: (code: string) => void
  onClose: () => void
}

export function CurrencySheet({ open, selected, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  // The component stays mounted while closed; a stale query would greet the
  // next open with a filtered list.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  // A new query re-ranks the list; without this the browser keeps the old
  // scroll offset and the best matches sit off-screen above the viewport.
  useEffect(() => {
    listRef.current?.scrollTo(0, 0)
  }, [query])

  useKeyboardInset(sheetRef, open)

  if (!open) return null

  const matches = filterCurrencies(query)

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        ref={sheetRef}
        className="sheet sheet-search"
        role="dialog"
        aria-modal="true"
        aria-label="Choose currency"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-head">
          <h2 className="display">Currency</h2>
          <button className="btn-text" type="button" onClick={onClose}>
            Cancel
          </button>
        </header>
        {/* label, not div: a tap anywhere on the field focuses the input */}
        <label className="search-field">
          <span aria-hidden="true">🔎</span>
          <input
            type="search"
            placeholder={`Search ${CURRENCIES.length} currencies…`}
            aria-label="Search currencies"
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
        <ul className="pick-list" ref={listRef}>
          {matches.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                className="pick-row"
                aria-pressed={c.code === selected}
                aria-label={`${c.code} — ${c.name}`}
                onClick={() => {
                  onSelect(c.code)
                  onClose()
                }}
              >
                <span className="pick-symbol money" aria-hidden="true">
                  {c.symbol}
                </span>
                <span className="pick-text">
                  <span className="pick-primary">{c.code}</span>
                  <span className="pick-sub">{c.name}</span>
                </span>
                {c.code === selected && (
                  <span className="pick-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="pick-none">Nothing matches “{query.trim()}”</li>
          )}
        </ul>
      </div>
    </div>
  )
}

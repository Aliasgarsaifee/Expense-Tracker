interface Props {
  emoji: string
  primary: string
  sub: string
  amount: string
  onClick: () => void
  ariaLabel?: string
}

// One ledger line: mark, text, dotted leader, amount. History and the Add
// screen's "Log again" list share it, so it knows nothing about either.
export function EntryRow({ emoji, primary, sub, amount, onClick, ariaLabel }: Props) {
  return (
    <li>
      <button type="button" className="entry" aria-label={ariaLabel} onClick={onClick}>
        <span className="entry-emoji" aria-hidden="true">
          {emoji}
        </span>
        <span className="entry-text">
          <span className="entry-primary">{primary}</span>
          {sub && <span className="entry-sub">{sub}</span>}
        </span>
        <span className="leader" aria-hidden="true" />
        <span className="entry-amount money">{amount}</span>
      </button>
    </li>
  )
}

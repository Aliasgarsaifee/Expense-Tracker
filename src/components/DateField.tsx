import { formatDateLong, todayISO } from '../lib/dates'

interface Props {
  value: string
  onChange: (iso: string) => void
}

// Shows the friendly "12 July 2026" while a real (transparent) date input
// sits on top, so tapping still opens the native iOS date wheel. The native
// control's own text is hidden; only our formatted label shows through.
export function DateField({ value, onChange }: Props) {
  const isToday = value === todayISO()
  return (
    <div className="date-field">
      <span className="date-display">
        {formatDateLong(value)}
        {isToday && <span className="date-today"> · Today</span>}
      </span>
      <span className="date-caret" aria-hidden="true">
        📅
      </span>
      <input
        type="date"
        required
        aria-label="Date"
        value={value}
        max="9999-12-31"
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value)
        }}
      />
    </div>
  )
}

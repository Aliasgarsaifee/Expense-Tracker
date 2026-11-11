import { dateRowLabel, todayISO } from '../lib/dates'
import { ChevronRightIcon } from './icons'

interface Props {
  value: string
  onChange: (iso: string) => void
}

// A row of the details group showing the friendly "12 July 2026" while a real
// (transparent) date input covers the whole row, so tapping anywhere still
// opens the native iOS date wheel. The native control's own text is hidden.
export function DateField({ value, onChange }: Props) {
  return (
    <label className="detail-row detail-date">
      <span className="detail-label">Date</span>
      <span className="detail-value">{dateRowLabel(value, todayISO())}</span>
      <ChevronRightIcon size={18} />
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
    </label>
  )
}

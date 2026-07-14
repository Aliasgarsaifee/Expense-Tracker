import { formatDateLong } from '../lib/dates'

// Optional-bound date field: empty means "no bound"; a set value is clearable.
// The ✕ needs its own stacking because the transparent native input covers the
// whole field to keep the iOS wheel. Shared by the History filter and the
// Summary period sheet.
export function RangeDateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (iso: string | null) => void
}) {
  return (
    <div className="date-field">
      <span className={value ? 'date-display' : 'date-display date-empty'}>
        {value ? formatDateLong(value) : label}
      </span>
      {value ? (
        <button
          type="button"
          className="btn-text date-clear"
          aria-label={`Clear ${label.toLowerCase()} date`}
          onClick={() => onChange(null)}
        >
          ✕
        </button>
      ) : (
        <span className="date-caret" aria-hidden="true">
          📅
        </span>
      )}
      <input
        type="date"
        aria-label={`${label} date`}
        value={value ?? ''}
        max="9999-12-31"
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  )
}

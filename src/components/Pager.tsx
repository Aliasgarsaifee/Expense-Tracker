interface Props {
  label: string
  hint?: string // shown under a clickable label
  labelAriaLabel?: string // accessible name when the label is a button
  onPrev: () => void
  onNext: () => void
  prevDisabled?: boolean
  nextDisabled?: boolean
  onLabelClick?: () => void // absent → the label is a static heading
}

// Dumb chrome: ‹ label ›. The label is a heading unless onLabelClick makes it
// a button (History toggles all-time; Summary opens the period sheet). All the
// stepping/toggling logic lives at the call site, so one pager serves both.
export function Pager({
  label,
  hint,
  labelAriaLabel,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  onLabelClick,
}: Props) {
  return (
    <div className="month-switch">
      <button
        type="button"
        className="month-arrow"
        aria-label="Previous period"
        disabled={prevDisabled}
        onClick={onPrev}
      >
        ‹
      </button>
      {onLabelClick ? (
        <button
          type="button"
          className="month-label-btn"
          aria-label={labelAriaLabel}
          onClick={onLabelClick}
        >
          <span className="display">{label}</span>
          {hint && <span className="month-label-hint">{hint}</span>}
        </button>
      ) : (
        <h1 className="display">{label}</h1>
      )}
      <button
        type="button"
        className="month-arrow"
        aria-label="Next period"
        disabled={nextDisabled}
        onClick={onNext}
      >
        ›
      </button>
    </div>
  )
}

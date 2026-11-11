import type { ShownToast } from '../lib/useToast'

// `.toast` is position: fixed, so this renders identically from any screen.
// It sits at z-index 30, below every sheet scrim (40). Mostly a toast is shown
// after its sheet has closed; the one sheet that opens over a live toast is
// the budget alert, which covers it on purpose and offers its own Undo.
// `raised` lifts the app-level notice above where screen toasts sit, so it can
// never cover a save toast's Undo.
export function Toast({ state, raised }: { state: ShownToast | null; raised?: boolean }) {
  if (!state) return null
  const { message, detail, onUndo, leaving } = state
  return (
    <output
      className={raised ? 'toast toast-raised' : 'toast'}
      aria-live="polite"
      data-detail={detail ? '' : undefined}
      data-leaving={leaving ? '' : undefined}
    >
      <span className="toast-lines">
        <span className="toast-text">{message}</span>
        {detail && <span className="toast-detail">{detail}</span>}
      </span>
      {onUndo && (
        // While the toast leaves, this stays a live button that does nothing:
        // it is what a late tap lands on, instead of the row underneath. Not
        // `disabled` — iOS steers a tap on a dead control to the nearest live
        // one, which would be that row.
        <button
          type="button"
          className="toast-undo"
          aria-disabled={leaving || undefined}
          onClick={() => {
            if (!leaving) void onUndo()
          }}
        >
          Undo
        </button>
      )}
    </output>
  )
}

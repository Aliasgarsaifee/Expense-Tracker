import type { ToastState } from '../lib/useToast'

// `.toast` is position: fixed, so this renders identically from any screen.
// It sits at z-index 30, below every sheet scrim (40). Mostly a toast is shown
// after its sheet has closed; the one sheet that opens over a live toast is
// the budget alert, which covers it on purpose and offers its own Undo.
export function Toast({ state }: { state: ToastState | null }) {
  if (!state) return null
  const { message, detail, onUndo } = state
  return (
    <output className="toast" aria-live="polite" data-detail={detail ? '' : undefined}>
      <span className="toast-lines">
        <span className="toast-text">{message}</span>
        {detail && <span className="toast-detail">{detail}</span>}
      </span>
      {onUndo && (
        <button type="button" className="toast-undo" onClick={() => void onUndo()}>
          Undo
        </button>
      )}
    </output>
  )
}

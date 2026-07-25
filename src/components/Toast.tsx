import type { ToastState } from '../lib/useToast'

// `.toast` is position: fixed, so this renders identically from any screen.
// It sits at z-index 30, below every sheet scrim (40) — a toast can only be
// shown after its sheet has closed.
export function Toast({ state }: { state: ToastState | null }) {
  if (!state) return null
  const { message, onUndo } = state
  return (
    <output className="toast" aria-live="polite">
      <span className="toast-text">{message}</span>
      {onUndo && (
        <button type="button" className="toast-undo" onClick={() => void onUndo()}>
          Undo
        </button>
      )}
    </output>
  )
}

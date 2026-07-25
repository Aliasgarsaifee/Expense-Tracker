import { useEffect, useId, useRef, useState } from 'react'
import type { DialogState } from '../lib/useDialog'
import { useKeyboardInset } from '../lib/useKeyboardInset'

interface Props {
  state: DialogState | null
  onClose: (result: boolean | string | null) => void
}

// Bottom sheet rather than a centred alert box: it is the vocabulary the rest
// of the app already speaks, and it puts the buttons under the thumb. Sits at
// z-index 60, above both the sheet scrim (40) and the drawer (50), since every
// caller is inside one of those.
export function Dialog({ state, onClose }: Props) {
  if (!state) return null
  return <DialogBody state={state} onClose={onClose} />
}

function DialogBody({ state, onClose }: { state: DialogState; onClose: Props['onClose'] }) {
  const [value, setValue] = useState(state.field?.initialValue ?? '')
  const sheetRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const messageId = useId()
  useKeyboardInset(sheetRef, state.kind === 'prompt')

  // A prompt exists only to take this one value, so it opens focused with the
  // caret at the end of the existing text. Not pre-selected: both select() and
  // setSelectionRange() were measured being overridden by the caret placement
  // focus() itself queues, and a frame-timing hack is not worth a nicety.
  // Whether iOS raises the keyboard for a programmatic focus is device-only —
  // one for the smoke test.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const dismiss = () => onClose(state.kind === 'confirm' ? false : null)
  const accept = () => onClose(state.kind === 'prompt' ? value : true)
  // A prompt with nothing in it has nothing to submit; db.ts would reject the
  // empty label anyway, and a dialog is the wrong place to learn that.
  const blocked = state.kind === 'prompt' && value.trim() === ''

  // No dep array on purpose: `dismiss` closes over this render's state, and
  // re-binding one listener is cheaper than reasoning about a stale one. Esc is
  // a dev-server nicety — the phone dismisses by tapping the scrim.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    // stopPropagation on the scrim too: a dialog is often mounted inside
    // another sheet's scrim, and a dismiss tap must not also close its host.
    <div
      className="sheet-scrim dialog-scrim"
      onClick={(e) => {
        e.stopPropagation()
        dismiss()
      }}
    >
      <div
        className="sheet dialog"
        ref={sheetRef}
        // alertdialog, not dialog: each one interrupts to ask something.
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={state.message ? messageId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <h2 className="display dialog-title" id={titleId}>
          {state.title}
        </h2>
        {state.message && (
          <p className="dialog-message" id={messageId}>
            {state.message}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!blocked) accept()
          }}
        >
          {state.field && (
            <label className="field dialog-field">
              <span>{state.field.label}</span>
              <input
                ref={inputRef}
                type="text"
                enterKeyHint="done"
                value={value}
                placeholder={state.field.placeholder}
                maxLength={state.field.maxLength}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
          )}
          <div className="dialog-actions">
            {/* An alert has nothing to decline. */}
            {state.kind !== 'alert' && (
              <button type="button" className="btn-ghost dialog-cancel" onClick={dismiss}>
                Cancel
              </button>
            )}
            {/* Destructive confirms reuse .btn-danger — the same outlined red
                the Delete button in EditSheet already wears, so this adds no
                new colour pair to validate. */}
            <button
              type="submit"
              className={state.destructive ? 'btn-danger' : 'btn-primary'}
              disabled={blocked}
            >
              {state.confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  /** Paints the confirm button as destructive. Deletes only. */
  destructive?: boolean
}

export interface PromptOptions {
  title: string
  label: string
  initialValue?: string
  placeholder?: string
  confirmLabel?: string
  maxLength?: number
}

export interface DialogState {
  kind: 'alert' | 'confirm' | 'prompt'
  title: string
  message?: string
  confirmLabel: string
  destructive: boolean
  field?: {
    label: string
    initialValue: string
    placeholder?: string
    maxLength?: number
  }
  settle: (result: boolean | string | null) => void
}

// A dismissed dialog resolves to whatever the window.* function it replaces
// would have returned, so call sites keep their original shape.
const dismissedValue = (kind: DialogState['kind']) => (kind === 'confirm' ? false : null)

// In-app alert/confirm/prompt. The native ones render on the phone as iOS
// system alerts titled "localhost" — at precisely the moments that carry the
// most weight: deleting the only copy of an entry, renaming a card that
// history points at.
//
// Promise-based so the conversion is a rewording, not a restructuring:
// `if (!window.confirm(msg)) return` becomes `if (!(await askConfirm(...)))
// return`. One dialog at a time, like useToast's one toast — they are modal
// by nature, and every caller awaits before it could open another.
export function useDialog() {
  const [dialog, setDialog] = useState<DialogState | null>(null)
  // Mirrors `dialog` purely for the unmount cleanup, which must not
  // re-subscribe every time one opens.
  const live = useRef<DialogState | null>(null)
  useEffect(() => {
    live.current = dialog
  }, [dialog])

  function open(next: Omit<DialogState, 'settle'>) {
    return new Promise<boolean | string | null>((settle) => {
      setDialog({ ...next, settle })
    })
  }

  function showAlert(title: string, message?: string): Promise<null> {
    return open({
      kind: 'alert',
      title,
      message,
      confirmLabel: 'OK',
      destructive: false,
    }) as Promise<null>
  }

  function askConfirm(o: ConfirmOptions): Promise<boolean> {
    return open({
      kind: 'confirm',
      title: o.title,
      message: o.message,
      confirmLabel: o.confirmLabel ?? 'OK',
      destructive: o.destructive ?? false,
    }) as Promise<boolean>
  }

  function askPrompt(o: PromptOptions): Promise<string | null> {
    return open({
      kind: 'prompt',
      title: o.title,
      confirmLabel: o.confirmLabel ?? 'Save',
      destructive: false,
      field: {
        label: o.label,
        initialValue: o.initialValue ?? '',
        placeholder: o.placeholder,
        maxLength: o.maxLength,
      },
    }) as Promise<string | null>
  }

  // Settles the open dialog and clears it. `dialog` comes from this render's
  // closure, so it is always the one on screen.
  function close(result: boolean | string | null) {
    dialog?.settle(result)
    setDialog(null)
  }

  useEffect(
    () => () => {
      // A host can unmount mid-dialog. Settle rather than leak: an awaiting
      // caller must never be left hanging on a promise nothing will resolve.
      if (live.current) live.current.settle(dismissedValue(live.current.kind))
    },
    [],
  )

  return { dialog, close, showAlert, askConfirm, askPrompt }
}

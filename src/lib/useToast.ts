import { useEffect, useRef, useState } from 'react'

export interface ToastState {
  message: string
  /** Present while the toast can still reverse what it announced. */
  onUndo?: () => void | Promise<void>
}

// The undoable case; the plain follow-up confirmations pass something shorter.
const DEFAULT_MS = 4200

// One toast per screen. Holds a callback rather than a record id, so it is
// indifferent to whether Undo deletes something just added or restores
// something just deleted.
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  function show(next: ToastState, ms: number = DEFAULT_MS) {
    clearTimeout(timer.current)
    setToast(next)
    timer.current = setTimeout(() => setToast(null), ms)
  }

  // A screen can unmount mid-toast; a live timer would then setState on a
  // dead component. Nothing depends on `show`'s identity, so it stays a plain
  // function rather than a useCallback.
  useEffect(() => () => clearTimeout(timer.current), [])

  return { toast, show }
}

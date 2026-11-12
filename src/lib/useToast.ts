import { useEffect, useRef, useState } from 'react'

export interface ToastState {
  message: string
  /** A second, quieter line under the message (the budget heads-up). */
  detail?: string
  /** Present while the toast can still reverse what it announced. */
  onUndo?: () => void | Promise<void>
}

/** A toast as it stands on screen: what was asked for, plus where it is in its life. */
export interface ShownToast extends ToastState {
  /** Its time is up: it fades in place, and Undo no longer does anything. */
  leaving: boolean
}

// The undoable case; the plain follow-up confirmations pass something shorter.
const DEFAULT_MS = 4200

// A toast whose time is up holds its place this long, faded and inert, before
// it is removed. Undo floats over whatever the screen shows there — on Add, a
// Log again row — so a tap already on its way when the toast ran out used to
// land on that row and refill the form. Long enough for a finger in flight,
// too short to get in the way of a deliberate tap on the row.
const LINGER_MS = 500

// One toast per screen. Holds a callback rather than a record id, so it is
// indifferent to whether Undo deletes something just added or restores
// something just deleted.
export function useToast() {
  const [toast, setToast] = useState<ShownToast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  function show(next: ToastState, ms: number = DEFAULT_MS) {
    clearTimeout(timer.current)
    setToast({ ...next, leaving: false })
    timer.current = setTimeout(() => {
      setToast((shown) => shown && { ...shown, leaving: true })
      timer.current = setTimeout(() => setToast(null), LINGER_MS)
    }, ms)
  }

  // A screen can unmount mid-toast; a live timer would then setState on a
  // dead component. Nothing depends on `show`'s identity, so it stays a plain
  // function rather than a useCallback.
  useEffect(() => () => clearTimeout(timer.current), [])

  return { toast, show }
}

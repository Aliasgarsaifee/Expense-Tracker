import { useEffect, type RefObject } from 'react'

// On iOS the software keyboard overlays the WKWebView without shrinking the
// layout viewport (or dvh), hiding the bottom of bottom-anchored sheets.
// Track the occluded height via visualViewport and expose it as --kb on the
// sheet element; the sheet pads by it so its scrollport ends above the keys.
export function useKeyboardInset(
  ref: RefObject<HTMLElement | null>,
  active = true,
): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return
    const update = () => {
      const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      ref.current?.style.setProperty('--kb', `${hidden}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [ref, active])
}

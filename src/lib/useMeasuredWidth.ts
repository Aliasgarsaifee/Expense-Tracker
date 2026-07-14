import { useEffect, useRef, useState, type RefObject } from 'react'

// Measure a wrapper's width by hand instead of recharts' ResponsiveContainer:
// charts mount inside a [hidden] section (all tabs stay mounted), where
// ResponsiveContainer reads 0×0 and shows nothing until its ResizeObserver
// fires — and some embedded WebViews never deliver observer callbacks at all.
// Measuring after every render needs no observer: the tab switch that unhides
// the screen always re-renders it, and that render sees the box.
//
// Shared by every Summary chart, so the workaround lives in exactly one place.
export function useMeasuredWidth<
  T extends HTMLElement = HTMLDivElement,
>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  // No dep array on purpose: the unhide is driven by the parent's tab state,
  // which this hook can't list as a dependency. Once measured we bail before
  // touching offsetWidth, so later renders don't force a layout reflow — the
  // observer below handles genuine resizes.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (width > 0) return
    const w = ref.current?.offsetWidth ?? 0
    if (w > 0) setWidth(w)
  })

  // Live resizes (rotation, split view) on engines with working observers.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.offsetWidth
      if (w > 0) setWidth(w)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  return [ref, width]
}

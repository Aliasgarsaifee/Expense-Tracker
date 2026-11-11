import { useEffect, useState } from 'react'
import { todayISO } from './dates'

// The screens stay mounted across midnight, so "today" is re-read whenever the
// app comes back to the foreground rather than frozen at mount.
export function useToday(): string {
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setToday(todayISO())
    }
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])
  return today
}

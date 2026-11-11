import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

// One soft tick when an entry lands in the ledger. No-op in a browser, and
// best-effort on the phone — feedback must never break a save.
export async function tapFeedback(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    // Haptics unavailable (simulator, old hardware) — silently skip.
  }
}

// The month just went past its budget. iOS's own warning pattern, so it reads
// as different from the save's tick that comes just before it. Same guard and
// same silence as tapFeedback.
export async function warnFeedback(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await Haptics.notification({ type: NotificationType.Warning })
  } catch {
    // Haptics unavailable (simulator, old hardware) — silently skip.
  }
}

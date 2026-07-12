import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

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

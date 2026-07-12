// Tiny persisted UI preferences (last-used picker values etc.).
// Deliberately outside the Dexie db so backups never carry them.
export const PREFS = {
  lastPaymentMethod: 'lastPaymentMethodId',
  lastCategory: 'lastCategory',
  defaultCurrency: 'defaultCurrency',
  autoBackup: 'autoBackupEnabled',
  lastAutoBackup: 'lastAutoBackupDate',
} as const

const PREFIX = 'et-pref:'

// Covers plain Node (tests) and browsers where touching localStorage throws.
const memory = new Map<string, string>()

function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function getPref<T>(key: string, fallback: T): T {
  const fullKey = PREFIX + key
  let raw: string | null
  const store = storage()
  if (store) {
    try {
      raw = store.getItem(fullKey)
    } catch {
      return fallback
    }
  } else {
    raw = memory.get(fullKey) ?? null
  }
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function setPref(key: string, value: unknown): void {
  try {
    const raw = JSON.stringify(value)
    if (raw === undefined) return
    const store = storage()
    if (store) store.setItem(PREFIX + key, raw)
    else memory.set(PREFIX + key, raw)
  } catch {
    // Best-effort persistence (private mode, quota); never break the UI.
  }
}

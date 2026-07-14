import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type PrefsModule = typeof import('./prefs')

// Node 22+ defines a localStorage getter on globalThis; stash it so each
// suite controls exactly what storage the module sees.
const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

function restoreLocalStorage() {
  delete (globalThis as Record<string, unknown>).localStorage
  if (originalDescriptor) {
    Object.defineProperty(globalThis, 'localStorage', originalDescriptor)
  }
}

async function freshPrefs(): Promise<PrefsModule> {
  vi.resetModules()
  return await import('./prefs')
}

describe('prefs without localStorage (in-module Map fallback)', () => {
  let prefs: PrefsModule

  beforeEach(async () => {
    delete (globalThis as Record<string, unknown>).localStorage
    prefs = await freshPrefs()
  })

  afterEach(restoreLocalStorage)

  it('exposes the PREFS key constants', () => {
    expect(prefs.PREFS).toEqual({
      lastPaymentMethod: 'lastPaymentMethodId',
      lastCategory: 'lastCategory',
      defaultCurrency: 'defaultCurrency',
      autoBackup: 'autoBackupEnabled',
      lastAutoBackup: 'lastAutoBackupDate',
      summaryPeriod: 'summaryPeriodKind',
      historySort: 'historySort',
    })
  })

  it('roundtrips a string', () => {
    prefs.setPref(prefs.PREFS.lastCategory, 'Food')
    expect(prefs.getPref(prefs.PREFS.lastCategory, 'Other')).toBe('Food')
  })

  it('returns the fallback for keys never set', () => {
    expect(prefs.getPref(prefs.PREFS.defaultCurrency, 'INR')).toBe('INR')
    expect(prefs.getPref(prefs.PREFS.autoBackup, false)).toBe(false)
  })

  it('roundtrips non-string values with their types intact', () => {
    prefs.setPref('num', 42)
    prefs.setPref('flag', true)
    prefs.setPref('obj', { a: 1 })
    expect(prefs.getPref('num', 0)).toBe(42)
    expect(prefs.getPref('flag', false)).toBe(true)
    expect(prefs.getPref('obj', {})).toEqual({ a: 1 })
  })

  it('setPref never throws, even for unserializable values', () => {
    expect(() => prefs.setPref('weird', 123n)).not.toThrow()
    expect(prefs.getPref('weird', 'fallback')).toBe('fallback')
  })

  it('keeps fallback state in the module, so a fresh import starts clean', async () => {
    prefs.setPref('ephemeral', 'gone')
    const again = await freshPrefs()
    expect(again.getPref('ephemeral', 'clean')).toBe('clean')
  })
})

describe('prefs with a fake localStorage', () => {
  let store: Record<string, string>
  let fake: {
    getItem: (key: string) => string | null
    setItem: (key: string, value: string) => void
  }
  let prefs: PrefsModule

  beforeEach(async () => {
    store = {}
    fake = {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => {
        store[key] = String(value)
      },
    }
    Object.defineProperty(globalThis, 'localStorage', {
      value: fake,
      configurable: true,
      writable: true,
    })
    prefs = await freshPrefs()
  })

  afterEach(restoreLocalStorage)

  it('roundtrips through the storage under the et-pref: prefix as JSON', () => {
    prefs.setPref(prefs.PREFS.defaultCurrency, 'USD')
    expect(store['et-pref:defaultCurrency']).toBe('"USD"')
    expect(prefs.getPref(prefs.PREFS.defaultCurrency, 'INR')).toBe('USD')
  })

  it('reads values written by an earlier session', () => {
    store['et-pref:lastCategory'] = JSON.stringify('Transport')
    expect(prefs.getPref(prefs.PREFS.lastCategory, 'Other')).toBe('Transport')
  })

  it('returns the fallback for corrupted JSON', () => {
    store['et-pref:defaultCurrency'] = '{not json'
    expect(prefs.getPref(prefs.PREFS.defaultCurrency, 'INR')).toBe('INR')
  })

  it('returns the fallback when getItem throws', () => {
    fake.getItem = () => {
      throw new Error('denied')
    }
    expect(prefs.getPref(prefs.PREFS.lastCategory, 'Other')).toBe('Other')
  })

  it('setPref swallows setItem failures (private mode / quota)', () => {
    fake.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    expect(() => prefs.setPref(prefs.PREFS.lastCategory, 'Food')).not.toThrow()
  })
})

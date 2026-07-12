import { describe, expect, it } from 'vitest'
import { CURRENCIES, currencySymbol, filterCurrencies, PINNED_CODES } from './currencies'

describe('CURRENCIES', () => {
  it('puts INR first so it can be the default pick', () => {
    expect(CURRENCIES[0]?.code).toBe('INR')
  })

  it('starts with the pinned common block, in order', () => {
    expect(CURRENCIES.slice(0, PINNED_CODES.length).map((c) => c.code)).toEqual([
      'INR',
      'USD',
      'EUR',
      'GBP',
      'AED',
      'SGD',
      'AUD',
      'CAD',
      'JPY',
      'CNY',
      'THB',
      'MYR',
      'LKR',
      'CHF',
    ])
  })

  it('covers the whole active ISO 4217 world, not just a shortlist', () => {
    expect(CURRENCIES.length).toBeGreaterThanOrEqual(150)
    const codes = new Set(CURRENCIES.map((c) => c.code))
    for (const expected of [
      'NPR', 'PKR', 'BDT', 'KRW', 'ZAR', 'BRL', 'MXN', 'EGP', 'IDR', 'VND',
      'SAR', 'KWD', 'QAR', 'BHD', 'OMR', 'RUB', 'TRY', 'PLN', 'SEK', 'NOK',
      'DKK', 'NZD', 'HKD', 'TWD', 'PHP', 'KES', 'NGN', 'ILS', 'CZK', 'HUF',
    ]) {
      expect(codes.has(expected), `missing ${expected}`).toBe(true)
    }
  })

  it('excludes special-purpose and retired codes', () => {
    const codes = new Set(CURRENCIES.map((c) => c.code))
    // ANG: replaced by XCG on 2025-03-31
    for (const dead of ['XDR', 'XSU', 'XUA', 'XTS', 'XXX', 'XAU', 'XAG', 'SLL', 'HRK', 'CUC', 'ZWL', 'ANG']) {
      expect(codes.has(dead), `${dead} should be excluded`).toBe(false)
    }
  })

  it('disambiguates dollar symbols the way formatted amounts print them', () => {
    // A bare $ on the currency chip while History says HK$ would read as USD.
    expect(currencySymbol('HKD')).toBe('HK$')
    expect(currencySymbol('TWD')).toBe('NT$')
    expect(currencySymbol('MXN')).toBe('MX$')
    expect(currencySymbol('NZD')).toBe('NZ$')
    expect(currencySymbol('CAD')).toBe('CA$')
    expect(currencySymbol('XCD')).toBe('EC$')
    // U+20C0 som sign is tofu on older iOS — fall back to the code
    expect(currencySymbol('KGS')).toBe('KGS')
  })

  it('sorts everything after the pinned block alphabetically by code', () => {
    const rest = CURRENCIES.slice(PINNED_CODES.length).map((c) => c.code)
    expect(rest).toEqual([...rest].sort())
    // pinned codes never repeat in the tail
    const pinned = new Set<string>(PINNED_CODES)
    expect(rest.some((code) => pinned.has(code))).toBe(false)
  })

  it('has no duplicate codes', () => {
    const codes = CURRENCIES.map((c) => c.code)
    expect(codes.length).toBeGreaterThan(0)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('gives every currency a non-empty symbol and name', () => {
    expect(CURRENCIES.length).toBeGreaterThan(0)
    for (const c of CURRENCIES) {
      expect(c.symbol).not.toBe('')
      expect(c.name).not.toBe('')
    }
  })
})

describe('currencySymbol', () => {
  it('returns the symbol for known codes', () => {
    expect(currencySymbol('INR')).toBe('₹')
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol('LKR')).toBe('Rs')
    expect(currencySymbol('KRW')).toBe('₩')
    expect(currencySymbol('VND')).toBe('₫')
  })

  it('falls back to the code itself for unknown codes', () => {
    expect(currencySymbol('ZZZ')).toBe('ZZZ')
  })
})

describe('filterCurrencies', () => {
  it('returns the full list for an empty or blank query', () => {
    expect(filterCurrencies('')).toEqual(CURRENCIES)
    expect(filterCurrencies('   ')).toEqual(CURRENCIES)
  })

  it('matches by code, case-insensitively', () => {
    const codes = filterCurrencies('inr').map((c) => c.code)
    expect(codes).toContain('INR')
  })

  it('matches by name', () => {
    const codes = filterCurrencies('rupee').map((c) => c.code)
    for (const rupee of ['INR', 'LKR', 'NPR', 'PKR', 'MUR', 'SCR']) {
      expect(codes, `expected ${rupee} for "rupee"`).toContain(rupee)
    }
    expect(codes).not.toContain('USD')
  })

  it('matches by symbol', () => {
    expect(filterCurrencies('₹').map((c) => c.code)).toContain('INR')
  })

  it('ranks code-prefix matches before name matches', () => {
    // "ca" is the CAD prefix but also appears inside e.g. "Nicaraguan Córdoba"
    expect(filterCurrencies('ca')[0]?.code).toBe('CAD')
  })

  it('ignores accents so plain keyboard input finds accented names', () => {
    expect(filterCurrencies('colon').map((c) => c.code)).toEqual(
      expect.arrayContaining(['CRC', 'SVC']),
    )
    expect(filterCurrencies('cordoba').map((c) => c.code)).toContain('NIO')
    expect(filterCurrencies('sao tome').map((c) => c.code)).toContain('STN')
    const krona = filterCurrencies('krona').map((c) => c.code)
    expect(krona).toContain('ISK')
    expect(krona).toContain('SEK')
    // ʻokina in Paʻanga: both spellings should work
    expect(filterCurrencies('paanga').map((c) => c.code)).toContain('TOP')
    expect(filterCurrencies("pa'anga").map((c) => c.code)).toContain('TOP')
    // accented input still works too
    expect(filterCurrencies('colón').map((c) => c.code)).toContain('CRC')
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterCurrencies('zzzz')).toEqual([])
  })
})

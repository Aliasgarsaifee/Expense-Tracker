import { describe, expect, it } from 'vitest'
import { formatMoney } from './money'

describe('formatMoney', () => {
  it('defaults to INR and formats whole rupees without decimals', () => {
    expect(formatMoney(450)).toBe('₹450')
  })

  it('formats fractional amounts with two decimals', () => {
    expect(formatMoney(0.5)).toBe('₹0.50')
  })

  it('uses Indian digit grouping', () => {
    expect(formatMoney(123456.5, 'INR')).toBe('₹1,23,456.50')
    expect(formatMoney(10000000)).toBe('₹1,00,00,000')
  })

  it('formats whole USD without decimals, keeping lakh grouping', () => {
    expect(formatMoney(1000, 'USD')).toBe('$1,000')
    expect(formatMoney(123456, 'USD')).toBe('$1,23,456')
  })

  it('formats fractional EUR with two decimals', () => {
    expect(formatMoney(99.99, 'EUR')).toBe('€99.99')
    expect(formatMoney(123456.78, 'EUR')).toBe('€1,23,456.78')
  })

  it('formats GBP with the pound symbol', () => {
    expect(formatMoney(250, 'GBP')).toBe('£250')
  })

  it('formats whole JPY without decimals', () => {
    expect(formatMoney(5000, 'JPY')).toBe('JP¥5,000')
  })

  // ZZZ is well-formed per ISO 4217 syntax, so ICU accepts it rather than
  // throwing, joining code and number with a non-breaking space.
  it('renders unassigned codes like ZZZ prefixed with the code', () => {
    expect(formatMoney(10, 'ZZZ')).toBe('ZZZ\u{a0}10')
  })

  it('falls back instead of throwing on malformed codes', () => {
    expect(() => formatMoney(99.99, 'BTC!')).not.toThrow()
    expect(formatMoney(99.99, 'BTC!')).toBe('BTC! 99.99')
    expect(formatMoney(123456, 'BTC!')).toBe('BTC! 123456')
  })
})

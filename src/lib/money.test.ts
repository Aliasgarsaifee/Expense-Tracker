import { describe, expect, it } from 'vitest'
import { formatMoney, formatShare } from './money'

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

describe('formatShare', () => {
  it('drops the decimal at and above 10%, where it is noise', () => {
    expect(formatShare(85, 100)).toBe('85%')
    expect(formatShare(1, 1)).toBe('100%')
    expect(formatShare(10, 100)).toBe('10%')
  })

  // The whole point of the tier: a rent-dominated month leaves everything else
  // under 10%, and whole percents would collapse 3.8 and 3.6 into one "4%".
  it('keeps one decimal below 10% so a long tail stays ordered', () => {
    expect(formatShare(7518.21, 200262.77)).toBe('3.8%')
    expect(formatShare(7140.71, 200262.77)).toBe('3.6%')
    expect(formatShare(1350.67, 200262.77)).toBe('0.7%')
  })

  it('picks the tier from the rounded value, not the raw one', () => {
    expect(formatShare(9.96, 100)).toBe('10%') // not "10.0%"
    expect(formatShare(99.96, 100)).toBe('100%')
    expect(formatShare(9.94, 100)).toBe('9.9%')
  })

  it('never reports a real amount as nothing', () => {
    expect(formatShare(0.04, 100)).toBe('<0.1%')
    expect(formatShare(1, 10_000_000)).toBe('<0.1%')
    expect(formatShare(0.06, 100)).toBe('0.1%')
  })

  it('reports a true zero as 0%', () => {
    expect(formatShare(0, 100)).toBe('0%')
  })

  // An empty bucket can't divide; callers render the list from the same data,
  // so this is belt-and-braces against a NaN reaching the screen.
  it('does not divide by zero', () => {
    expect(formatShare(0, 0)).toBe('0%')
    expect(formatShare(5, 0)).toBe('0%')
  })
})

import { describe, expect, it } from 'vitest'
import type { PaymentMethod } from '../db'
import {
  bucketize,
  filterByLabel,
  groupChoices,
  groupEmoji,
  orderByRecency,
  toggleGroup,
  toggleMethod,
} from './paymentMeta'

const pm = (id: string, group: string): PaymentMethod => ({
  id,
  label: id,
  group,
  createdAt: '2026-07-01T00:00:00.000Z',
})

describe('bucketize', () => {
  it('groups contiguous methods and keeps the incoming group order', () => {
    const buckets = bucketize([pm('cash', 'Cash'), pm('gpay', 'UPI'), pm('sbi', 'UPI')])
    expect(buckets.map((b) => b.group)).toEqual(['Cash', 'UPI'])
    expect(buckets[1].members.map((m) => m.id)).toEqual(['gpay', 'sbi'])
  })

  it('returns one single-member bucket per lone method', () => {
    const buckets = bucketize([pm('cash', 'Cash')])
    expect(buckets).toEqual([{ group: 'Cash', members: [pm('cash', 'Cash')] }])
  })

  it('returns no buckets for no methods', () => {
    expect(bucketize([])).toEqual([])
  })

  it('groups non-contiguous members of a group into one bucket', () => {
    const buckets = bucketize([pm('gpay', 'UPI'), pm('cash', 'Cash'), pm('sbi', 'UPI')])
    expect(buckets.map((b) => b.group)).toEqual(['UPI', 'Cash'])
    expect(buckets[0].members.map((m) => m.id)).toEqual(['gpay', 'sbi'])
  })
})

describe('groupEmoji', () => {
  it('falls back to the generic mark for custom groups', () => {
    expect(groupEmoji('Wallet')).toBe('👛')
  })
})

describe('groupChoices', () => {
  it('always offers the built-in groups in rank order', () => {
    expect(groupChoices([])).toEqual(['Cash', 'UPI', 'Credit card', 'Debit card'])
  })

  it('appends custom groups alphabetically, deduplicated', () => {
    const choices = groupChoices([
      pm('a', 'Wallet'),
      pm('b', 'Netbanking'),
      pm('c', 'Wallet'),
      pm('d', 'UPI'),
    ])
    expect(choices).toEqual([
      'Cash',
      'UPI',
      'Credit card',
      'Debit card',
      'Netbanking',
      'Wallet',
    ])
  })

  it('includes a group whose only method is archived', () => {
    const choices = groupChoices([{ ...pm('a', 'Wallet'), archived: true }])
    expect(choices).toContain('Wallet')
  })
})

describe('toggleGroup', () => {
  it('selects a group and absorbs its individually-picked members', () => {
    const sel = { methodIds: ['hdfc', 'cash'], groups: [] }
    expect(toggleGroup(sel, 'Credit card', ['hdfc', 'icici'])).toEqual({
      methodIds: ['cash'],
      groups: ['Credit card'],
    })
  })

  it('deselects a selected group, leaving other picks alone', () => {
    const sel = { methodIds: ['cash'], groups: ['Credit card', 'UPI'] }
    expect(toggleGroup(sel, 'Credit card', ['hdfc', 'icici'])).toEqual({
      methodIds: ['cash'],
      groups: ['UPI'],
    })
  })
})

describe('toggleMethod', () => {
  it('adds an unselected method', () => {
    const sel = { methodIds: [], groups: [] }
    expect(
      toggleMethod(sel, { id: 'hdfc', group: 'Credit card' }, ['hdfc', 'icici']),
    ).toEqual({ methodIds: ['hdfc'], groups: [] })
  })

  it('removes an individually selected method', () => {
    const sel = { methodIds: ['hdfc', 'cash'], groups: [] }
    expect(
      toggleMethod(sel, { id: 'hdfc', group: 'Credit card' }, ['hdfc', 'icici']),
    ).toEqual({ methodIds: ['cash'], groups: [] })
  })

  it('demotes a selected group to its other members when one is toggled off', () => {
    const sel = { methodIds: ['cash'], groups: ['Credit card'] }
    expect(
      toggleMethod(sel, { id: 'hdfc', group: 'Credit card' }, ['hdfc', 'icici', 'bob']),
    ).toEqual({ methodIds: ['cash', 'icici', 'bob'], groups: [] })
  })

  it('demoting a single-member group deselects it entirely', () => {
    const sel = { methodIds: [], groups: ['Cash'] }
    expect(toggleMethod(sel, { id: 'cash', group: 'Cash' }, ['cash'])).toEqual({
      methodIds: [],
      groups: [],
    })
  })
})

describe('orderByRecency', () => {
  it('puts more-recently-used methods first', () => {
    const members = [pm('a', 'Credit card'), pm('b', 'Credit card'), pm('c', 'Credit card')]
    const recency = new Map([
      ['a', '2026-07-10T00:00:00.000Z'],
      ['b', '2026-07-12T00:00:00.000Z'],
      ['c', '2026-07-11T00:00:00.000Z'],
    ])
    expect(orderByRecency(members, recency).map((m) => m.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts never-used methods after used ones, keeping their input order', () => {
    const members = [pm('a', 'Credit card'), pm('b', 'Credit card'), pm('c', 'Credit card')]
    const recency = new Map([['b', '2026-07-12T00:00:00.000Z']])
    expect(orderByRecency(members, recency).map((m) => m.id)).toEqual(['b', 'a', 'c'])
  })

  it('keeps input order when nothing has been used', () => {
    const members = [pm('a', 'Credit card'), pm('b', 'Credit card')]
    expect(orderByRecency(members, new Map()).map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('breaks a recency tie by input order', () => {
    const members = [pm('a', 'Credit card'), pm('b', 'Credit card')]
    const recency = new Map([
      ['a', '2026-07-12T00:00:00.000Z'],
      ['b', '2026-07-12T00:00:00.000Z'],
    ])
    expect(orderByRecency(members, recency).map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('does not mutate the input array', () => {
    const members = [pm('a', 'Credit card'), pm('b', 'Credit card')]
    const before = members.map((m) => m.id)
    orderByRecency(members, new Map([['b', '2026-07-12T00:00:00.000Z']]))
    expect(members.map((m) => m.id)).toEqual(before)
  })
})

describe('filterByLabel', () => {
  const cards = [
    { ...pm('a', 'Credit card'), label: 'HDFC Regalia' },
    { ...pm('b', 'Credit card'), label: 'Amazon ICICI' },
  ]

  it('matches a case-insensitive substring of the label', () => {
    expect(filterByLabel(cards, 'reg').map((m) => m.id)).toEqual(['a'])
    expect(filterByLabel(cards, 'ICIC').map((m) => m.id)).toEqual(['b'])
  })

  it('trims the query and returns all members when it is blank', () => {
    expect(filterByLabel(cards, '   ')).toEqual(cards)
    expect(filterByLabel(cards, '')).toEqual(cards)
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterByLabel(cards, 'zzz')).toEqual([])
  })

  it('trims surrounding whitespace on a non-blank query', () => {
    expect(filterByLabel(cards, '  reg  ').map((m) => m.id)).toEqual(['a'])
  })

  it('does not mutate the input array', () => {
    const before = cards.map((m) => m.id)
    filterByLabel(cards, 'amazon')
    expect(cards.map((m) => m.id)).toEqual(before)
  })
})

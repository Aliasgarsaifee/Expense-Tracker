import { describe, expect, it } from 'vitest'
import type { PaymentMethod } from '../db'
import {
  bucketize,
  groupChoices,
  groupEmoji,
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

import { beforeEach, describe, expect, it } from 'vitest'
import {
  addExpense,
  CASH_METHOD_ID,
  db,
  DEFAULT_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
  listExpenses,
  type Category,
  type Expense,
  type PaymentMethod,
} from '../db'
import {
  backupToJson,
  expensesToCsv,
  importBackup,
  parseBackupJson,
  type BackupData,
} from './backup'

const e1: Expense = {
  id: 'a1',
  amount: 249.5,
  currency: 'INR',
  category: 'Food',
  spentOn: '2026-07-12',
  note: 'lunch, "extra" naan',
  paymentMethodId: CASH_METHOD_ID,
  createdAt: '2026-07-12T10:00:00.000Z',
}

const e2: Expense = {
  id: 'b2',
  amount: 1200,
  currency: 'INR',
  category: 'Rent',
  spentOn: '2026-07-01',
  createdAt: '2026-07-01T09:00:00.000Z',
}

const pmCard: PaymentMethod = {
  id: 'pm-hdfc',
  label: 'HDFC Credit',
  group: 'Credit card',
  archived: true,
  createdAt: '2026-07-02T08:00:00.000Z',
}

const catPets: Category = {
  id: 'cat-x1',
  label: 'Pets',
  emoji: '🐕',
  createdAt: '2026-07-03T08:00:00.000Z',
}

const labels = new Map([[CASH_METHOD_ID, 'Cash']])

const v3Json = (
  expenses: unknown[],
  paymentMethods: unknown = [],
  categories: unknown = [],
) =>
  JSON.stringify({
    app: 'expense-tracker',
    version: 3,
    exportedAt: '2026-07-12T12:00:00.000Z',
    expenses,
    paymentMethods,
    categories,
  })

const v2Json = (expenses: unknown[], paymentMethods: unknown = []) =>
  JSON.stringify({
    app: 'expense-tracker',
    version: 2,
    exportedAt: '2026-07-12T12:00:00.000Z',
    expenses,
    paymentMethods,
  })

describe('expensesToCsv', () => {
  it('renders a BOM, a header, and CRLF rows with method labels resolved', () => {
    expect(expensesToCsv([e1, e2], labels)).toBe(
      '﻿' +
        'spentOn,amount,currency,category,paymentMethod,note,id,createdAt\r\n' +
        '2026-07-12,249.5,INR,Food,Cash,"lunch, ""extra"" naan",a1,2026-07-12T10:00:00.000Z\r\n' +
        '2026-07-01,1200,INR,Rent,,,b2,2026-07-01T09:00:00.000Z\r\n',
    )
  })

  it('leaves paymentMethod empty when the id has no label', () => {
    const csv = expensesToCsv([{ ...e2, paymentMethodId: 'pm-gone' }], labels)
    expect(csv.split('\r\n')[1]).toBe(
      '2026-07-01,1200,INR,Rent,,,b2,2026-07-01T09:00:00.000Z',
    )
  })

  it('renders a foreign currency as-is', () => {
    const csv = expensesToCsv([{ ...e2, currency: 'USD' }], labels)
    expect(csv.split('\r\n')[1]).toBe(
      '2026-07-01,1200,USD,Rent,,,b2,2026-07-01T09:00:00.000Z',
    )
  })

  it('quotes fields containing newlines', () => {
    const csv = expensesToCsv([{ ...e2, note: 'line1\nline2' }], labels)
    expect(csv).toContain('"line1\nline2"')
  })

  // A leading =, +, - or @ would otherwise execute as a formula when the
  // CSV opens in Excel/Numbers/Sheets.
  it('neutralises spreadsheet formula injection in text fields', () => {
    const csv = expensesToCsv([{ ...e2, note: '=SUM(A1:A9)' }], labels)
    expect(csv.split('\r\n')[1]).toContain("'=SUM(A1:A9)")
    const plus = expensesToCsv([{ ...e2, category: '+Rent' }], labels)
    expect(plus.split('\r\n')[1]).toContain("'+Rent")
  })
})

describe('backupToJson / parseBackupJson', () => {
  it('round-trips expenses, methods, and categories through the v3 envelope', () => {
    const data: BackupData = {
      expenses: [e1, e2],
      paymentMethods: [DEFAULT_PAYMENT_METHODS[0], pmCard],
      categories: [DEFAULT_CATEGORIES[0], catPets],
    }
    const json = backupToJson(data, '2026-07-12T12:00:00.000Z')
    expect(JSON.parse(json)).toMatchObject({
      app: 'expense-tracker',
      version: 3,
      exportedAt: '2026-07-12T12:00:00.000Z',
    })
    expect(parseBackupJson(json)).toEqual(data)
  })

  it('defaults exportedAt to now', () => {
    const parsed = JSON.parse(
      backupToJson({ expenses: [], paymentMethods: [], categories: [] }),
    )
    expect(typeof parsed.exportedAt).toBe('string')
    expect(parsed.exportedAt).not.toBe('')
  })

  it('accepts a v1 envelope, filling INR and empty methods and categories', () => {
    const { currency: _c, ...legacy } = e2
    const json = JSON.stringify({
      app: 'expense-tracker',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      expenses: [legacy],
    })
    expect(parseBackupJson(json)).toEqual({
      expenses: [{ ...legacy, currency: 'INR' }],
      paymentMethods: [],
      categories: [],
    })
  })

  it('accepts a bare array of expenses', () => {
    expect(parseBackupJson(JSON.stringify([e2]))).toEqual({
      expenses: [e2],
      paymentMethods: [],
      categories: [],
    })
  })

  it('maps v2 methods (kind + cardType) onto groups', () => {
    const json = v2Json(
      [],
      [
        { id: 'pm-cash', label: 'Cash', kind: 'cash', createdAt: 't1' },
        { id: 'pm-upi', label: 'UPI', kind: 'upi', createdAt: 't2' },
        { id: 'c1', label: 'HDFC', kind: 'card', cardType: 'credit', createdAt: 't3' },
        { id: 'c2', label: 'SBI', kind: 'card', cardType: 'debit', archived: true, createdAt: 't4' },
      ],
    )
    expect(parseBackupJson(json).paymentMethods).toEqual([
      { id: 'pm-cash', label: 'Cash', group: 'Cash', createdAt: 't1' },
      { id: 'pm-upi', label: 'UPI', group: 'UPI', createdAt: 't2' },
      { id: 'c1', label: 'HDFC', group: 'Credit card', createdAt: 't3' },
      { id: 'c2', label: 'SBI', group: 'Debit card', archived: true, createdAt: 't4' },
    ])
  })

  it('strips unknown expense keys and keeps optional fields absent', () => {
    const {
      expenses: [parsed],
    } = parseBackupJson(JSON.stringify([{ ...e2, foo: 'bar' }]))
    expect(parsed).toEqual(e2)
    expect('foo' in parsed).toBe(false)
    expect('note' in parsed).toBe(false)
    expect('paymentMethodId' in parsed).toBe(false)
  })

  it.each([
    ['not json at all', 'this is not json', /invalid backup: not valid json/i],
    ['an object with no expenses array', '{"hello":"world"}', /invalid backup: no expenses array/i],
    ['an empty id', JSON.stringify([{ ...e2, id: '' }]), /invalid backup: record 1 is missing an id/i],
    ['a non-positive amount', JSON.stringify([{ ...e2, amount: -3 }]), /invalid backup: record 1 has an invalid amount/i],
    ['a non-numeric amount', JSON.stringify([{ ...e2, amount: '12' }]), /invalid backup: record 1 has an invalid amount/i],
    ['a malformed spentOn', JSON.stringify([{ ...e2, spentOn: '12/07/2026' }]), /invalid backup: record 1 has an invalid spentOn/i],
    ['an empty currency', JSON.stringify([{ ...e2, currency: '' }]), /invalid backup: record 1 has an invalid currency/i],
    ['an empty paymentMethodId', JSON.stringify([{ ...e2, paymentMethodId: '' }]), /invalid backup: record 1 has an invalid paymentMethodId/i],
  ])('rejects %s', (_label, input, pattern) => {
    expect(() => parseBackupJson(input)).toThrow(pattern)
  })

  it('names the offending record when one entry is invalid', () => {
    const input = JSON.stringify([e2, { ...e1, amount: 0 }])
    expect(() => parseBackupJson(input)).toThrow(/invalid backup: record 2/i)
  })
})

describe('parseBackupJson payment methods', () => {
  it('strips unknown method keys and keeps optional fields absent', () => {
    const cash = DEFAULT_PAYMENT_METHODS[0]
    const {
      paymentMethods: [parsed],
    } = parseBackupJson(v3Json([], [{ ...cash, foo: 'bar' }]))
    expect(parsed).toEqual(cash)
    expect('foo' in parsed).toBe(false)
    expect('archived' in parsed).toBe(false)
  })

  it.each([
    ['a non-array paymentMethods field', v3Json([], 'nope'), /invalid backup: paymentmethods is not an array/i],
    ['a non-object method', v3Json([], ['x']), /invalid backup: payment method 1 is not an object/i],
    ['a method with an empty id', v3Json([], [{ ...pmCard, id: '' }]), /invalid backup: payment method 1 is missing an id/i],
    ['a method with an empty label', v3Json([], [{ ...pmCard, label: '' }]), /invalid backup: payment method 1 has an invalid label/i],
    ['a method with an empty group', v3Json([], [{ ...pmCard, group: '' }]), /invalid backup: payment method 1 has an invalid group/i],
    ['a method with neither group nor kind', v3Json([], [{ id: 'x', label: 'X', createdAt: 't' }]), /invalid backup: payment method 1 has an invalid group/i],
    ['a v2 method with an unknown kind', v2Json([], [{ id: 'x', label: 'X', kind: 'bank', createdAt: 't' }]), /invalid backup: payment method 1 has an invalid group/i],
    ['a method with a non-boolean archived', v3Json([], [{ ...pmCard, archived: 'yes' }]), /invalid backup: payment method 1 has an invalid archived/i],
    ['a method with an empty createdAt', v3Json([], [{ ...pmCard, createdAt: '' }]), /invalid backup: payment method 1 has an invalid createdat/i],
  ])('rejects %s', (_label, input, pattern) => {
    expect(() => parseBackupJson(input)).toThrow(pattern)
  })
})

describe('parseBackupJson categories', () => {
  it('parses categories and strips unknown keys', () => {
    const {
      categories: [parsed],
    } = parseBackupJson(v3Json([], [], [{ ...catPets, foo: 'bar' }]))
    expect(parsed).toEqual(catPets)
    expect('foo' in parsed).toBe(false)
  })

  it.each([
    ['a non-array categories field', v3Json([], [], 'nope'), /invalid backup: categories is not an array/i],
    ['a category with an empty id', v3Json([], [], [{ ...catPets, id: '' }]), /invalid backup: category 1 is missing an id/i],
    ['a category with an empty label', v3Json([], [], [{ ...catPets, label: '' }]), /invalid backup: category 1 has an invalid label/i],
    ['a category with an empty emoji', v3Json([], [], [{ ...catPets, emoji: '' }]), /invalid backup: category 1 has an invalid emoji/i],
    ['a category with a non-boolean archived', v3Json([], [], [{ ...catPets, archived: 1 }]), /invalid backup: category 1 has an invalid archived/i],
    ['a category with an empty createdAt', v3Json([], [], [{ ...catPets, createdAt: '' }]), /invalid backup: category 1 has an invalid createdat/i],
  ])('rejects %s', (_label, input, pattern) => {
    expect(() => parseBackupJson(input)).toThrow(pattern)
  })
})

describe('importBackup', () => {
  beforeEach(async () => {
    await db.expenses.clear()
    await db.paymentMethods.clear()
    await db.paymentMethods.bulkAdd(DEFAULT_PAYMENT_METHODS)
    await db.categories.clear()
    await db.categories.bulkAdd(DEFAULT_CATEGORIES)
  })

  it('upserts all three tables by id and returns counts', async () => {
    const existing = await addExpense({
      amount: 50,
      category: 'Food',
      spentOn: '2026-07-05',
    })

    const counts = await importBackup({
      expenses: [{ ...e1 }, { ...existing, amount: 75 }],
      paymentMethods: [pmCard, { ...DEFAULT_PAYMENT_METHODS[0], label: 'Wallet Cash' }],
      categories: [catPets],
    })

    expect(counts).toEqual({ expenses: 2, paymentMethods: 2, categories: 1 })

    const all = await listExpenses()
    expect(all).toHaveLength(2)
    expect(all.find((e) => e.id === existing.id)?.amount).toBe(75)
    expect(all.find((e) => e.id === e1.id)?.note).toBe(e1.note)

    const methods = await db.paymentMethods.toArray()
    expect(methods).toHaveLength(3) // relabelled Cash, UPI, imported card
    expect(methods.find((m) => m.id === CASH_METHOD_ID)?.label).toBe('Wallet Cash')
    expect(await db.categories.count()).toBe(9)
  })

  it('never duplicates when the same backup is imported twice', async () => {
    const data: BackupData = {
      expenses: [e1, e2],
      paymentMethods: [pmCard],
      categories: [catPets],
    }
    await importBackup(data)
    await importBackup(data)

    expect(await db.expenses.count()).toBe(2)
    expect(await db.paymentMethods.count()).toBe(3)
    expect(await db.categories.count()).toBe(9)
  })

  it('merges an incoming method with a new id onto an existing same-label method', async () => {
    // The old install's "HDFC Credit" has a different uuid than the one the
    // user re-created after a reinstall — importing must not duplicate it.
    const local = await db.paymentMethods.add({
      id: 'local-hdfc',
      label: 'hdfc credit',
      group: 'Credit card',
      createdAt: '2026-07-10T00:00:00.000Z',
    })

    const counts = await importBackup({
      expenses: [{ ...e1, paymentMethodId: 'pm-hdfc' }],
      paymentMethods: [pmCard], // id pm-hdfc, label "HDFC Credit"
      categories: [],
    })

    expect(counts.paymentMethods).toBe(1)
    const methods = await db.paymentMethods.toArray()
    expect(methods.map((m) => m.id)).not.toContain('pm-hdfc')
    expect(methods.filter((m) => m.label.toLowerCase() === 'hdfc credit')).toHaveLength(1)
    // ...and the imported expense now points at the surviving local method.
    const [imported] = await listExpenses()
    expect(imported.paymentMethodId).toBe(local)
  })

  it('merges an incoming category with a new id onto an existing same-label category', async () => {
    await db.categories.add({
      id: 'local-pets',
      label: 'pets',
      emoji: '🐈',
      createdAt: '2026-07-10T00:00:00.000Z',
    })

    await importBackup({
      expenses: [],
      paymentMethods: [],
      categories: [catPets], // id cat-x1, label "Pets"
    })

    const cats = await db.categories.toArray()
    expect(cats.map((c) => c.id)).not.toContain('cat-x1')
    expect(cats.filter((c) => c.label.toLowerCase() === 'pets')).toHaveLength(1)
  })

  it('returns zero counts for an empty backup', async () => {
    expect(
      await importBackup({ expenses: [], paymentMethods: [], categories: [] }),
    ).toEqual({ expenses: 0, paymentMethods: 0, categories: 0 })
  })
})

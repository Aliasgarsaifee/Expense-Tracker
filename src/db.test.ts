import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  addCategory,
  addExpense,
  addPaymentMethod,
  CASH_METHOD_ID,
  createDb,
  db,
  DEFAULT_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
  deleteCategory,
  deleteExpense,
  deletePaymentMethod,
  listCategories,
  listExpenses,
  listExpensesForMonth,
  listPaymentMethods,
  renameCategory,
  renamePaymentMethod,
  setCategoryArchived,
  setPaymentMethodArchived,
  UPI_METHOD_ID,
  updateExpense,
} from './db'

// Adds are timestamped with the wall clock; a short pause guarantees
// distinct createdAt values so ordering assertions are deterministic.
const tick = () => new Promise((r) => setTimeout(r, 5))

beforeEach(async () => {
  await db.expenses.clear()
  await db.paymentMethods.clear()
  await db.paymentMethods.bulkAdd(DEFAULT_PAYMENT_METHODS)
  await db.categories.clear()
  await db.categories.bulkAdd(DEFAULT_CATEGORIES)
})

describe('addExpense', () => {
  it('stores the expense and fills in id and createdAt', async () => {
    const created = await addExpense({
      amount: 250,
      category: 'Food',
      spentOn: '2026-07-12',
      note: 'lunch',
    })

    expect(created.id).toBeTruthy()
    expect(created.createdAt).toBeTruthy()
    expect(created).toMatchObject({
      amount: 250,
      category: 'Food',
      spentOn: '2026-07-12',
      note: 'lunch',
    })

    const all = await listExpenses()
    expect(all).toEqual([created])
  })

  it('generates a unique id per expense', async () => {
    const a = await addExpense({ amount: 1, category: 'Food', spentOn: '2026-07-12' })
    const b = await addExpense({ amount: 2, category: 'Food', spentOn: '2026-07-12' })
    expect(a.id).not.toBe(b.id)
  })

  it('rejects a zero, negative, or non-finite amount', async () => {
    for (const amount of [0, -5, NaN, Infinity]) {
      await expect(
        addExpense({ amount, category: 'Food', spentOn: '2026-07-12' }),
      ).rejects.toThrow()
    }
    expect(await listExpenses()).toEqual([])
  })

  it('defaults currency to INR when not given', async () => {
    const created = await addExpense({ amount: 90, category: 'Food', spentOn: '2026-07-12' })
    expect(created.currency).toBe('INR')
  })

  it('stores an explicit currency and paymentMethodId', async () => {
    const created = await addExpense({
      amount: 25,
      currency: 'USD',
      category: 'Food',
      spentOn: '2026-07-12',
      paymentMethodId: CASH_METHOD_ID,
    })
    expect(created.currency).toBe('USD')
    expect(created.paymentMethodId).toBe(CASH_METHOD_ID)
  })
})

describe('listExpenses', () => {
  it('returns newest spend date first, most recently added first within a day', async () => {
    const a = await addExpense({ amount: 1, category: 'Food', spentOn: '2026-07-10' })
    await tick()
    const b = await addExpense({ amount: 2, category: 'Transport', spentOn: '2026-07-10' })
    await tick()
    const c = await addExpense({ amount: 3, category: 'Rent', spentOn: '2026-07-11' })

    const all = await listExpenses()
    expect(all.map((e) => e.id)).toEqual([c.id, b.id, a.id])
  })
})

describe('updateExpense', () => {
  it('changes only the given fields', async () => {
    const created = await addExpense({
      amount: 100,
      category: 'Shopping',
      spentOn: '2026-07-01',
      note: 'socks',
    })

    await updateExpense(created.id, { amount: 120, note: 'socks + laces' })

    const [stored] = await listExpenses()
    expect(stored).toEqual({
      ...created,
      amount: 120,
      note: 'socks + laces',
    })
  })

  it('is a no-op for an unknown id', async () => {
    const created = await addExpense({ amount: 9, category: 'Food', spentOn: '2026-07-02' })
    await updateExpense('no-such-id', { amount: 999 })
    expect(await listExpenses()).toEqual([created])
  })
})

describe('deleteExpense', () => {
  it('removes the expense', async () => {
    const a = await addExpense({ amount: 1, category: 'Food', spentOn: '2026-07-10' })
    const b = await addExpense({ amount: 2, category: 'Food', spentOn: '2026-07-11' })

    await deleteExpense(a.id)

    expect((await listExpenses()).map((e) => e.id)).toEqual([b.id])
  })

  it('is a no-op for an unknown id', async () => {
    await addExpense({ amount: 1, category: 'Food', spentOn: '2026-07-10' })
    await deleteExpense('no-such-id')
    expect(await listExpenses()).toHaveLength(1)
  })
})

describe('listExpensesForMonth', () => {
  it('returns only expenses inside the month, newest first', async () => {
    await addExpense({ amount: 1, category: 'Food', spentOn: '2026-06-30' })
    const july1 = await addExpense({ amount: 2, category: 'Food', spentOn: '2026-07-01' })
    const july31 = await addExpense({ amount: 3, category: 'Rent', spentOn: '2026-07-31' })
    await addExpense({ amount: 4, category: 'Food', spentOn: '2026-08-01' })

    const july = await listExpensesForMonth('2026-07')
    expect(july.map((e) => e.id)).toEqual([july31.id, july1.id])
  })
})

describe('seeding', () => {
  it('seeds Cash, UPI, and the 8 categories on a fresh database', async () => {
    const name = `SeedTest-${crypto.randomUUID()}`
    const fresh = createDb(name)
    try {
      const methods = await fresh.paymentMethods.toArray()
      expect(methods.map((m) => m.id).sort()).toEqual(
        [CASH_METHOD_ID, UPI_METHOD_ID].sort(),
      )
      expect(methods.find((m) => m.id === CASH_METHOD_ID)?.group).toBe('Cash')
      const categories = await fresh.categories.toArray()
      expect(categories).toHaveLength(8)
      expect(categories.map((c) => c.label)).toContain('Food')
    } finally {
      fresh.close()
      await Dexie.delete(name)
    }
  })
})

describe('migrations', () => {
  it('upgrades v1 data: INR backfill, method seeds with groups, category seeds', async () => {
    const name = `MigrationV1-${crypto.randomUUID()}`
    const legacy = new Dexie(name)
    legacy.version(1).stores({ expenses: 'id, spentOn, category, createdAt' })
    await legacy.table('expenses').add({
      id: 'old-1',
      amount: 450,
      category: 'Food',
      spentOn: '2026-06-20',
      note: 'pre-upgrade dinner',
      createdAt: '2026-06-20T13:00:00.000Z',
    })
    legacy.close()

    const upgraded = createDb(name)
    try {
      const rows = await upgraded.expenses.toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0].currency).toBe('INR')
      const methods = await upgraded.paymentMethods.toArray()
      expect(methods.map((m) => m.group).sort()).toEqual(['Cash', 'UPI'])
      expect(await upgraded.categories.count()).toBe(8)
    } finally {
      upgraded.close()
      await Dexie.delete(name)
    }
  })

  it('upgrades v2 methods: kind and cardType become a group', async () => {
    const name = `MigrationV2-${crypto.randomUUID()}`
    const legacy = new Dexie(name)
    legacy.version(1).stores({ expenses: 'id, spentOn, category, createdAt' })
    legacy.version(2).stores({
      expenses: 'id, spentOn, category, createdAt, paymentMethodId',
      paymentMethods: 'id, createdAt',
    })
    await legacy.table('paymentMethods').bulkAdd([
      { id: 'pm-cash', label: 'Cash', kind: 'cash', createdAt: '1970-01-01T00:00:00.000Z' },
      { id: 'pm-upi', label: 'UPI', kind: 'upi', createdAt: '1970-01-01T00:00:01.000Z' },
      { id: 'c1', label: 'HDFC Credit', kind: 'card', cardType: 'credit', createdAt: '2026-07-01T00:00:00.000Z' },
      { id: 'c2', label: 'SBI Debit', kind: 'card', cardType: 'debit', createdAt: '2026-07-02T00:00:00.000Z' },
    ])
    legacy.close()

    const upgraded = createDb(name)
    try {
      const byId = new Map((await upgraded.paymentMethods.toArray()).map((m) => [m.id, m]))
      expect(byId.get('pm-cash')?.group).toBe('Cash')
      expect(byId.get('pm-upi')?.group).toBe('UPI')
      expect(byId.get('c1')?.group).toBe('Credit card')
      expect(byId.get('c2')?.group).toBe('Debit card')
      const raw = byId.get('c1') as unknown as Record<string, unknown>
      expect('kind' in raw).toBe(false)
      expect('cardType' in raw).toBe(false)
      expect(await upgraded.categories.count()).toBe(8)
    } finally {
      upgraded.close()
      await Dexie.delete(name)
    }
  })
})

describe('addPaymentMethod', () => {
  it('stores a method in a built-in group and fills in id and createdAt', async () => {
    const created = await addPaymentMethod({ label: 'HDFC Credit', group: 'Credit card' })
    expect(created.id).toBeTruthy()
    expect(created.createdAt).toBeTruthy()
    expect(created).toMatchObject({ label: 'HDFC Credit', group: 'Credit card' })
    const all = await listPaymentMethods()
    expect(all.find((m) => m.id === created.id)).toBeTruthy()
  })

  it('accepts a custom group and trims both fields', async () => {
    const created = await addPaymentMethod({ label: ' Paytm ', group: ' Wallet ' })
    expect(created.label).toBe('Paytm')
    expect(created.group).toBe('Wallet')
  })

  it('rejects an empty label or group', async () => {
    await expect(addPaymentMethod({ label: '  ', group: 'Cash' })).rejects.toThrow(/label/i)
    await expect(addPaymentMethod({ label: 'GPay', group: '  ' })).rejects.toThrow(/group/i)
  })

  it('rejects a duplicate label, case-insensitively', async () => {
    await addPaymentMethod({ label: 'Amex', group: 'Credit card' })
    await expect(addPaymentMethod({ label: 'amex', group: 'Credit card' })).rejects.toThrow(
      /already/i,
    )
  })
})

describe('listPaymentMethods', () => {
  it('orders built-in groups first (Cash, UPI, Credit card, Debit card), then custom groups', async () => {
    const wallet = await addPaymentMethod({ label: 'Paytm', group: 'Wallet' })
    await tick()
    const credit = await addPaymentMethod({ label: 'HDFC Credit', group: 'Credit card' })
    await tick()
    const debit = await addPaymentMethod({ label: 'SBI Debit', group: 'Debit card' })
    const all = await listPaymentMethods()
    expect(all.map((m) => m.id)).toEqual([
      CASH_METHOD_ID,
      UPI_METHOD_ID,
      credit.id,
      debit.id,
      wallet.id,
    ])
  })

  it('orders within a group by creation time', async () => {
    const first = await addPaymentMethod({ label: 'HDFC Credit', group: 'Credit card' })
    await tick()
    const second = await addPaymentMethod({ label: 'Amex', group: 'Credit card' })
    const credit = (await listPaymentMethods()).filter((m) => m.group === 'Credit card')
    expect(credit.map((m) => m.id)).toEqual([first.id, second.id])
  })

  it('hides archived methods unless asked for them', async () => {
    const card = await addPaymentMethod({ label: 'Old Card', group: 'Debit card' })
    await setPaymentMethodArchived(card.id, true)
    expect((await listPaymentMethods()).map((m) => m.id)).not.toContain(card.id)
    expect(
      (await listPaymentMethods({ includeArchived: true })).map((m) => m.id),
    ).toContain(card.id)
  })
})

describe('renamePaymentMethod', () => {
  it('changes the label and rejects an empty one', async () => {
    const card = await addPaymentMethod({ label: 'HDFC', group: 'Credit card' })
    await renamePaymentMethod(card.id, 'HDFC Regalia')
    expect(
      (await listPaymentMethods()).find((m) => m.id === card.id)?.label,
    ).toBe('HDFC Regalia')
    await expect(renamePaymentMethod(card.id, '  ')).rejects.toThrow(/label/i)
  })
})

describe('deletePaymentMethod', () => {
  it('removes an unused custom method', async () => {
    const card = await addPaymentMethod({ label: 'Unused Card', group: 'Debit card' })
    await deletePaymentMethod(card.id)
    expect(
      (await listPaymentMethods({ includeArchived: true })).map((m) => m.id),
    ).not.toContain(card.id)
  })

  it('refuses when expenses still reference the method', async () => {
    const card = await addPaymentMethod({ label: 'Busy Card', group: 'Credit card' })
    await addExpense({
      amount: 100,
      category: 'Food',
      spentOn: '2026-07-12',
      paymentMethodId: card.id,
    })
    await expect(deletePaymentMethod(card.id)).rejects.toThrow(/entr/i)
  })

  it('refuses to delete the built-in Cash and UPI methods', async () => {
    await expect(deletePaymentMethod(CASH_METHOD_ID)).rejects.toThrow(/built-in/i)
    await expect(deletePaymentMethod(UPI_METHOD_ID)).rejects.toThrow(/built-in/i)
  })
})

describe('categories', () => {
  it('lists the seeded categories in their fixed order', async () => {
    const all = await listCategories()
    expect(all.map((c) => c.label)).toEqual([
      'Food',
      'Transport',
      'Groceries',
      'Rent',
      'Utilities',
      'Health',
      'Shopping',
      'Other',
    ])
  })

  it('adds a custom category with a default emoji, trimmed and unique', async () => {
    const created = await addCategory({ label: ' Pets ' })
    expect(created.label).toBe('Pets')
    expect(created.emoji).toBeTruthy()
    expect((await listCategories()).map((c) => c.label)).toContain('Pets')
    await expect(addCategory({ label: 'pets' })).rejects.toThrow(/already/i)
    await expect(addCategory({ label: '  ' })).rejects.toThrow(/label/i)
  })

  it('stores a custom emoji when given', async () => {
    const created = await addCategory({ label: 'Travel', emoji: '✈️' })
    expect(created.emoji).toBe('✈️')
  })

  it('appends custom categories after the seeded ones', async () => {
    const created = await addCategory({ label: 'Pets' })
    const all = await listCategories()
    expect(all[all.length - 1].id).toBe(created.id)
  })

  it('hides archived categories unless asked for them', async () => {
    const created = await addCategory({ label: 'Pets' })
    await setCategoryArchived(created.id, true)
    expect((await listCategories()).map((c) => c.id)).not.toContain(created.id)
    expect(
      (await listCategories({ includeArchived: true })).map((c) => c.id),
    ).toContain(created.id)
  })

  it('renaming a category also relabels the expenses that use it', async () => {
    const created = await addCategory({ label: 'Pets' })
    const e = await addExpense({ amount: 500, category: 'Pets', spentOn: '2026-07-12' })
    const untouched = await addExpense({ amount: 90, category: 'Food', spentOn: '2026-07-12' })

    await renameCategory(created.id, 'Pet care')

    const all = await listExpenses()
    expect(all.find((x) => x.id === e.id)?.category).toBe('Pet care')
    expect(all.find((x) => x.id === untouched.id)?.category).toBe('Food')
    expect((await listCategories()).find((c) => c.id === created.id)?.label).toBe('Pet care')
  })

  it('rejects renaming to an existing label or an empty one', async () => {
    const created = await addCategory({ label: 'Pets' })
    await expect(renameCategory(created.id, 'food')).rejects.toThrow(/already/i)
    await expect(renameCategory(created.id, ' ')).rejects.toThrow(/label/i)
  })

  it('deletes an unused custom category but refuses used or built-in ones', async () => {
    const unused = await addCategory({ label: 'Pets' })
    await deleteCategory(unused.id)
    expect(
      (await listCategories({ includeArchived: true })).map((c) => c.id),
    ).not.toContain(unused.id)

    const used = await addCategory({ label: 'Travel' })
    await addExpense({ amount: 100, category: 'Travel', spentOn: '2026-07-12' })
    await expect(deleteCategory(used.id)).rejects.toThrow(/entr/i)

    const food = (await listCategories()).find((c) => c.label === 'Food')!
    await expect(deleteCategory(food.id)).rejects.toThrow(/built-in/i)
  })
})

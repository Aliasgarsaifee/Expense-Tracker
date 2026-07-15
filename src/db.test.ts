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
  listExpensesBetween,
  listPaymentMethods,
  methodRecency,
  PAYMENT_GROUPS,
  renameCategory,
  renameGroup,
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

  it('rejects a zero, negative, or non-finite amount like addExpense does', async () => {
    const created = await addExpense({ amount: 50, category: 'Food', spentOn: '2026-07-03' })
    await expect(updateExpense(created.id, { amount: 0 })).rejects.toThrow(/positive/)
    await expect(updateExpense(created.id, { amount: -5 })).rejects.toThrow(/positive/)
    await expect(updateExpense(created.id, { amount: NaN })).rejects.toThrow(/positive/)
    const [stored] = await listExpenses()
    expect(stored.amount).toBe(50)
  })

  it('still updates other fields when no amount is given', async () => {
    const created = await addExpense({ amount: 50, category: 'Food', spentOn: '2026-07-03' })
    await updateExpense(created.id, { note: 'chai' })
    const [stored] = await listExpenses()
    expect(stored.note).toBe('chai')
    expect(stored.amount).toBe(50)
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

describe('listExpensesBetween', () => {
  it('includes both bounds and sorts newest first', async () => {
    await addExpense({ amount: 1, category: 'Food', spentOn: '2026-06-30' })
    const jul1 = await addExpense({ amount: 2, category: 'Food', spentOn: '2026-07-01' })
    const jul5 = await addExpense({ amount: 3, category: 'Rent', spentOn: '2026-07-05' })
    await addExpense({ amount: 4, category: 'Food', spentOn: '2026-07-06' })

    const rows = await listExpensesBetween('2026-07-01', '2026-07-05')
    expect(rows.map((e) => e.id)).toEqual([jul5.id, jul1.id])
  })

  it('treats a full-month range as the month view', async () => {
    await addExpense({ amount: 1, category: 'Food', spentOn: '2026-06-30' })
    const jul1 = await addExpense({ amount: 2, category: 'Food', spentOn: '2026-07-01' })
    const jul31 = await addExpense({ amount: 3, category: 'Rent', spentOn: '2026-07-31' })
    await addExpense({ amount: 4, category: 'Food', spentOn: '2026-08-01' })

    const july = await listExpensesBetween('2026-07-01', '2026-07-31')
    expect(july.map((e) => e.id)).toEqual([jul31.id, jul1.id])
  })
})

describe('seeding', () => {
  it('seeds Cash alone plus the 8 categories on a fresh database — UPI is a group, not a method', async () => {
    const name = `SeedTest-${crypto.randomUUID()}`
    const fresh = createDb(name)
    try {
      const methods = await fresh.paymentMethods.toArray()
      expect(methods.map((m) => m.id)).toEqual([CASH_METHOD_ID])
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
      // v2 seeded the generic UPI method; v4 folds it away again (unused).
      const methods = await upgraded.paymentMethods.toArray()
      expect(methods.map((m) => m.group)).toEqual(['Cash'])
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
      // Renamed by the owner back in v2: no longer the untouched seed, so v4
      // must keep it even though nothing references it.
      { id: 'pm-upi', label: 'My UPI', kind: 'upi', createdAt: '1970-01-01T00:00:01.000Z' },
      { id: 'c1', label: 'HDFC Credit', kind: 'card', cardType: 'credit', createdAt: '2026-07-01T00:00:00.000Z' },
      { id: 'c2', label: 'SBI Debit', kind: 'card', cardType: 'debit', createdAt: '2026-07-02T00:00:00.000Z' },
    ])
    legacy.close()

    const upgraded = createDb(name)
    try {
      const byId = new Map((await upgraded.paymentMethods.toArray()).map((m) => [m.id, m]))
      expect(byId.get('pm-cash')?.group).toBe('Cash')
      expect(byId.get('pm-upi')?.group).toBe('UPI')
      expect(byId.get('pm-upi')?.archived).toBeFalsy()
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

  // v3-shaped database, the version every phone in the wild is on today.
  function buildV3Db(name: string): Dexie {
    const legacy = new Dexie(name)
    legacy.version(1).stores({ expenses: 'id, spentOn, category, createdAt' })
    legacy.version(2).stores({
      expenses: 'id, spentOn, category, createdAt, paymentMethodId',
      paymentMethods: 'id, createdAt',
    })
    legacy.version(3).stores({
      expenses: 'id, spentOn, category, createdAt, paymentMethodId',
      paymentMethods: 'id, createdAt',
      categories: 'id, createdAt',
    })
    return legacy
  }

  const seededCash = {
    id: 'pm-cash',
    label: 'Cash',
    group: 'Cash',
    createdAt: '1970-01-01T00:00:00.000Z',
  }
  const seededUpi = {
    id: 'pm-upi',
    label: 'UPI',
    group: 'UPI',
    createdAt: '1970-01-01T00:00:01.000Z',
  }

  it('v4 deletes the untouched generic UPI method when no entry references it', async () => {
    const name = `MigrationV4Unused-${crypto.randomUUID()}`
    const legacy = buildV3Db(name)
    await legacy.table('paymentMethods').bulkAdd([
      seededCash,
      seededUpi,
      { id: 'm-sbi', label: 'SBI', group: 'UPI', createdAt: '2026-07-12T00:00:00.000Z' },
    ])
    await legacy.table('expenses').add({
      id: 'e1',
      amount: 120,
      currency: 'INR',
      category: 'Food',
      spentOn: '2026-07-12',
      createdAt: '2026-07-12T09:00:00.000Z',
      paymentMethodId: 'm-sbi',
    })
    legacy.close()

    const upgraded = createDb(name)
    try {
      const ids = (await upgraded.paymentMethods.toArray()).map((m) => m.id).sort()
      expect(ids).toEqual(['m-sbi', 'pm-cash'])
      expect(await upgraded.expenses.count()).toBe(1)
    } finally {
      upgraded.close()
      await Dexie.delete(name)
    }
  })

  it('v4 archives (never deletes) the generic UPI method while entries reference it', async () => {
    const name = `MigrationV4Used-${crypto.randomUUID()}`
    const legacy = buildV3Db(name)
    await legacy.table('paymentMethods').bulkAdd([seededCash, seededUpi])
    await legacy.table('expenses').add({
      id: 'e1',
      amount: 75,
      currency: 'INR',
      category: 'Transport',
      spentOn: '2026-07-13',
      createdAt: '2026-07-13T09:00:00.000Z',
      paymentMethodId: 'pm-upi',
    })
    legacy.close()

    const upgraded = createDb(name)
    try {
      const upi = await upgraded.paymentMethods.get('pm-upi')
      expect(upi).toMatchObject({ label: 'UPI', group: 'UPI', archived: true })
      const entry = await upgraded.expenses.get('e1')
      expect(entry?.paymentMethodId).toBe('pm-upi')
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
    await tick()
    const upi = await addPaymentMethod({ label: 'GPay', group: 'UPI' })
    const all = await listPaymentMethods()
    expect(all.map((m) => m.id)).toEqual([
      CASH_METHOD_ID,
      upi.id,
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

describe('renameGroup', () => {
  it('re-buckets every method in the group and leaves other groups untouched', async () => {
    const gpay = await addPaymentMethod({ label: 'GPay', group: 'Wallet' })
    const paytm = await addPaymentMethod({ label: 'Paytm', group: 'Wallet' })
    const card = await addPaymentMethod({ label: 'HDFC', group: 'Credit card' })

    await renameGroup('Wallet', 'Wallets')

    const byId = new Map((await listPaymentMethods()).map((m) => [m.id, m]))
    expect(byId.get(gpay.id)?.group).toBe('Wallets')
    expect(byId.get(paytm.id)?.group).toBe('Wallets')
    expect(byId.get(card.id)?.group).toBe('Credit card')
  })

  it('trims the new name and rejects an empty one', async () => {
    const gpay = await addPaymentMethod({ label: 'GPay', group: 'Wallet' })
    await renameGroup('Wallet', '  Wallets  ')
    expect(
      (await listPaymentMethods()).find((m) => m.id === gpay.id)?.group,
    ).toBe('Wallets')
    await expect(renameGroup('Wallets', '   ')).rejects.toThrow(/group/i)
  })

  it('refuses to rename the built-in groups', async () => {
    for (const g of PAYMENT_GROUPS) {
      await expect(renameGroup(g, 'Anything')).rejects.toThrow(/built-in/i)
    }
  })

  it('merges into an existing group when renamed to its name', async () => {
    const gpay = await addPaymentMethod({ label: 'GPay', group: 'Wallet' })
    const sbi = await addPaymentMethod({ label: 'SBI', group: 'UPI' })

    await renameGroup('Wallet', 'UPI')

    const methods = await listPaymentMethods()
    expect(methods.find((m) => m.id === gpay.id)?.group).toBe('UPI')
    expect(methods.find((m) => m.id === sbi.id)?.group).toBe('UPI')
  })

  it('is a no-op when the name is unchanged', async () => {
    const gpay = await addPaymentMethod({ label: 'GPay', group: 'Wallet' })
    await renameGroup('Wallet', 'Wallet')
    expect(
      (await listPaymentMethods()).find((m) => m.id === gpay.id)?.group,
    ).toBe('Wallet')
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

  it('refuses to delete built-in Cash, but a UPI method resurrected by an old backup is an ordinary method', async () => {
    await expect(deletePaymentMethod(CASH_METHOD_ID)).rejects.toThrow(/built-in/i)
    // An import of a pre-v4 backup can bring pm-upi back; unreferenced, it
    // must be deletable like any other method now.
    await db.paymentMethods.add({
      id: UPI_METHOD_ID,
      label: 'UPI',
      group: 'UPI',
      createdAt: '1970-01-01T00:00:01.000Z',
    })
    await deletePaymentMethod(UPI_METHOD_ID)
    expect(
      (await listPaymentMethods({ includeArchived: true })).map((m) => m.id),
    ).not.toContain(UPI_METHOD_ID)
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

describe('methodRecency', () => {
  it('maps each method to its most recent expense createdAt, order-independent', async () => {
    // Explicit ids so Dexie's primary-key iteration order is deterministic and
    // deliberately does NOT match createdAt order: for c1 the true-max createdAt
    // (e2) sits in the MIDDLE of ascending-id order, so neither first-write-wins
    // nor last-write-wins lands on it — only a real max comparison does. e2 is
    // also backdated (earliest spentOn) so an impl keyed off spentOn fails too.
    await db.expenses.bulkAdd([
      { id: 'e1', amount: 1, currency: 'INR', category: 'Food', spentOn: '2026-07-20', createdAt: '2026-07-10T00:00:02.000Z', paymentMethodId: 'c1' },
      { id: 'e2', amount: 2, currency: 'INR', category: 'Food', spentOn: '2026-07-01', createdAt: '2026-07-10T00:00:03.000Z', paymentMethodId: 'c1' },
      { id: 'e3', amount: 3, currency: 'INR', category: 'Food', spentOn: '2026-07-15', createdAt: '2026-07-10T00:00:01.000Z', paymentMethodId: 'c1' },
      { id: 'e4', amount: 4, currency: 'INR', category: 'Food', spentOn: '2026-07-05', createdAt: '2026-07-09T00:00:00.000Z', paymentMethodId: 'c2' },
    ])

    const recency = await methodRecency()
    // e2 wins for c1: max createdAt, despite its mid id-order and earliest spentOn.
    expect(recency.get('c1')).toBe('2026-07-10T00:00:03.000Z')
    expect(recency.get('c2')).toBe('2026-07-09T00:00:00.000Z')
  })

  it('omits methods that have no expenses', async () => {
    await addExpense({ amount: 1, category: 'Food', spentOn: '2026-07-10', paymentMethodId: 'c1' })
    const recency = await methodRecency()
    expect(recency.has('c2')).toBe(false)
  })

  it('skips expenses that have no paymentMethodId', async () => {
    await addExpense({ amount: 1, category: 'Food', spentOn: '2026-07-10' })
    expect((await methodRecency()).size).toBe(0)
  })

  it('returns an empty map for an empty ledger', async () => {
    expect((await methodRecency()).size).toBe(0)
  })
})

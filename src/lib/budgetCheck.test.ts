import { beforeEach, describe, expect, it } from 'vitest'
import {
  addCategory,
  addExpense,
  db,
  DEFAULT_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
  setCategoryFixed,
  updateExpense,
  type Expense,
} from '../db'
import { checkBudgetAfterSave } from './budgetCheck'

const TODAY = '2026-11-24'
const BUDGETS = { INR: 25000 }

// Everyday spending already in November, split across two entries.
async function seedEveryday(total: number) {
  await addExpense({ amount: total - 1000, category: 'Food', spentOn: '2026-11-03' })
  await addExpense({ amount: 1000, category: 'Transport', spentOn: '2026-11-10' })
}

async function save(
  input: { amount: number; category?: string; spentOn?: string; currency?: string },
  today = TODAY,
  budgets: Record<string, number> = BUDGETS,
) {
  const saved = await addExpense({
    category: 'Food',
    spentOn: '2026-11-24',
    ...input,
  })
  return checkBudgetAfterSave(saved, null, budgets, today)
}

// Persists the edit first (the check runs after the save), then judges it.
async function edit(
  previous: Expense,
  changes: { amount?: number; category?: string },
  budgets: Record<string, number> = BUDGETS,
) {
  await updateExpense(previous.id, changes)
  const saved = (await db.expenses.get(previous.id))!
  return checkBudgetAfterSave(saved, previous, budgets, TODAY)
}

describe('checkBudgetAfterSave', () => {
  beforeEach(async () => {
    await db.expenses.clear()
    await db.paymentMethods.clear()
    await db.paymentMethods.bulkAdd(DEFAULT_PAYMENT_METHODS)
    await db.categories.clear()
    await db.categories.bulkAdd(DEFAULT_CATEGORIES)
  })

  it('alerts over when a new entry crosses the line', async () => {
    await seedEveryday(24000)
    const alert = await save({ amount: 2150 })
    expect(alert).toMatchObject({
      kind: 'over',
      currency: 'INR',
      budget: 25000,
      spent: 26150,
      month: '2026-11',
      daysLeft: 6,
      isNew: true,
    })
    expect(alert!.entry.amount).toBe(2150)
  })

  it('alerts near at 80%', async () => {
    await seedEveryday(19500)
    expect(await save({ amount: 640 })).toMatchObject({ kind: 'near', spent: 20140 })
  })

  it('says nothing for a fixed category', async () => {
    await seedEveryday(24000)
    expect(await save({ amount: 32000, category: 'Rent' })).toBeNull()
  })

  it('ignores a custom category marked fixed', async () => {
    await seedEveryday(24000)
    const gym = await addCategory({ label: 'Gym' })
    await setCategoryFixed(gym.id, true)
    expect(await save({ amount: 2150, category: 'Gym' })).toBeNull()
  })

  it('ignores an archived fixed category', async () => {
    await seedEveryday(24000)
    const gym = await addCategory({ label: 'Gym' })
    await setCategoryFixed(gym.id, true)
    await db.categories.update(gym.id, { archived: true })
    expect(await save({ amount: 2150, category: 'Gym' })).toBeNull()
  })

  it('says nothing for an entry dated in another month', async () => {
    await seedEveryday(24000)
    expect(await save({ amount: 2150, spentOn: '2026-10-30' })).toBeNull()
    expect(await save({ amount: 2150, spentOn: '2026-12-01' })).toBeNull()
  })

  it('judges against the month `today` is in', async () => {
    await seedEveryday(24000)
    expect(await save({ amount: 2150, spentOn: '2026-11-24' }, '2026-12-01')).toBeNull()
  })

  it('keeps currencies apart', async () => {
    await seedEveryday(24000)
    expect(await save({ amount: 5000, currency: 'USD' })).toBeNull()
  })

  it('does not count another currency toward the budget', async () => {
    await seedEveryday(19000)
    await addExpense({ amount: 700, currency: 'USD', category: 'Food', spentOn: '2026-11-05' })
    // INR alone: 19,500 is under 80%. Counting the 700 USD would tip it to near.
    expect(await save({ amount: 500 })).toBeNull()
  })

  it('says nothing without a budget for that currency', async () => {
    await seedEveryday(24000)
    expect(await save({ amount: 2150 }, TODAY, {})).toBeNull()
    expect(await save({ amount: 2150 }, TODAY, { USD: 100 })).toBeNull()
  })

  it('alerts when an edit raises the month past the line', async () => {
    await addExpense({ amount: 23000, category: 'Transport', spentOn: '2026-11-03' })
    const previous = await addExpense({ amount: 1000, category: 'Food', spentOn: '2026-11-20' })
    expect(await edit(previous, { amount: 3150 })).toMatchObject({
      kind: 'over',
      spent: 26150,
      isNew: false,
    })
  })

  it('says nothing when an edit lowers or re-files the entry', async () => {
    await addExpense({ amount: 23000, category: 'Transport', spentOn: '2026-11-03' })
    const previous = await addExpense({ amount: 3000, category: 'Food', spentOn: '2026-11-20' })
    expect(await edit(previous, { amount: 1000 })).toBeNull()

    const over = await addExpense({ amount: 3000, category: 'Food', spentOn: '2026-11-21' })
    expect(await edit(over, { category: 'Rent' })).toBeNull()
  })
})

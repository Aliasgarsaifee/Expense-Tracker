import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as dbModule from '../db'
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
  changes: { amount?: number; category?: string; spentOn?: string; currency?: string },
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
    // Nothing is fixed out of the box; these tests need one fixed cost.
    await setCategoryFixed('cat-rent', true)
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
    })
  })

  it('alerts when an edit moves an entry from last month into this one', async () => {
    await seedEveryday(24000)
    const previous = await addExpense({ amount: 2150, category: 'Food', spentOn: '2026-10-20' })
    expect(await edit(previous, { spentOn: '2026-11-20' })).toMatchObject({
      kind: 'over',
      spent: 26150,
    })
  })

  it('alerts when an edit changes an entry into the budgeted currency', async () => {
    await seedEveryday(24000)
    const previous = await addExpense({
      amount: 2150,
      currency: 'USD',
      category: 'Food',
      spentOn: '2026-11-20',
    })
    expect(await edit(previous, { currency: 'INR' })).toMatchObject({
      kind: 'over',
      currency: 'INR',
      spent: 26150,
    })
  })

  it('alerts when an edit re-files a fixed cost as everyday', async () => {
    await seedEveryday(24000)
    const previous = await addExpense({ amount: 2150, category: 'Rent', spentOn: '2026-11-20' })
    expect(await edit(previous, { category: 'Food' })).toMatchObject({
      kind: 'over',
      spent: 26150,
    })
  })

  // In binary floating point 673.58 + 14.21 is 687.7900000000001.
  it('does not call a month over when its paise sum exactly to the budget', async () => {
    await addExpense({ amount: 673.58, category: 'Food', spentOn: '2026-11-03' })
    expect(await save({ amount: 14.21 }, TODAY, { INR: 687.79 })).toBeNull()
  })

  // Characterisation: follows from the stored shape (a converted entry is a
  // home-currency entry), pinned so a trip keeps counting against the rupee budget.
  it('judges a converted entry in the home currency', async () => {
    await seedEveryday(24000)
    const saved = await addExpense({
      amount: 3076,
      currency: 'INR',
      category: 'Food',
      spentOn: '2026-11-24',
      paid: { amount: 120, currency: 'AED' },
    })
    expect((await checkBudgetAfterSave(saved, null, BUDGETS, TODAY))?.kind).toBe('over')
  })

  it('leaves an entry still waiting for a rate out of the home budget', async () => {
    await seedEveryday(24000)
    expect(await save({ amount: 5000, currency: 'AED' })).toBeNull()
  })

  it('says nothing when an edit lowers or re-files the entry', async () => {
    await addExpense({ amount: 23000, category: 'Transport', spentOn: '2026-11-03' })
    const previous = await addExpense({ amount: 3000, category: 'Food', spentOn: '2026-11-20' })
    expect(await edit(previous, { amount: 1000 })).toBeNull()

    const over = await addExpense({ amount: 3000, category: 'Food', spentOn: '2026-11-21' })
    expect(await edit(over, { category: 'Rent' })).toBeNull()
  })
})

// January to October at the year ledger's everyday totals, one entry a month.
const EARLIER = [22400, 19850, 27900, 24100, 31200, 21300, 23650, 20400, 26300, 18300]
async function seedEarlierMonths(totals = EARLIER, currency = 'INR') {
  for (const [i, amount] of totals.entries()) {
    const month = String(i + 1).padStart(2, '0')
    await addExpense({ amount, currency, category: 'Food', spentOn: `2026-${month}-15` })
  }
}

describe('checkBudgetAfterSave, against the year', () => {
  beforeEach(async () => {
    await db.expenses.clear()
    await db.categories.clear()
    await db.categories.bulkAdd(DEFAULT_CATEGORIES)
    await setCategoryFixed('cat-rent', true)
  })

  it('carries what the earlier months left in hand', async () => {
    await seedEarlierMonths()
    await seedEveryday(24000)
    expect(await save({ amount: 2150 })).toMatchObject({ kind: 'over', carried: 14600 })
  })

  it('carries nothing when the currency was first used this month', async () => {
    await seedEveryday(24000)
    expect(await save({ amount: 2150 })).toMatchObject({ kind: 'over', carried: null })
  })

  it('carries nothing in January, whatever last year did', async () => {
    await addExpense({ amount: 10000, category: 'Food', spentOn: '2025-12-10' })
    await addExpense({ amount: 24000, category: 'Food', spentOn: '2026-01-05' })
    const alert = await save({ amount: 2150, spentOn: '2026-01-20' }, '2026-01-20')
    expect(alert).toMatchObject({ kind: 'over', carried: null })
  })

  it('leaves fixed costs and other currencies out of the carried balance', async () => {
    await seedEarlierMonths()
    await addExpense({ amount: 32000, category: 'Rent', spentOn: '2026-03-01' })
    await addExpense({ amount: 5000, currency: 'USD', category: 'Food', spentOn: '2026-04-02' })
    await seedEveryday(24000)
    expect(await save({ amount: 2150 })).toMatchObject({ carried: 14600 })
  })

  // Counting from January would credit USD with eight unused months: 4,100.
  it('starts a second currency’s year at its own first entry', async () => {
    await seedEarlierMonths()
    await addExpense({ amount: 600, currency: 'USD', category: 'Food', spentOn: '2026-09-03' })
    await addExpense({ amount: 300, currency: 'USD', category: 'Food', spentOn: '2026-10-03' })
    await addExpense({ amount: 450, currency: 'USD', category: 'Food', spentOn: '2026-11-03' })
    const alert = await save({ amount: 100, currency: 'USD' }, TODAY, { INR: 25000, USD: 500 })
    expect(alert).toMatchObject({ kind: 'over', currency: 'USD', carried: 100 })
  })

  it('decides whether to alert on the month alone', async () => {
    await seedEarlierMonths(EARLIER.map(() => 40000))
    await seedEveryday(10000)
    expect(await save({ amount: 500 })).toBeNull()
  })
})

// The save is already stored when the check runs, so a failed read may cost
// the alert at most, and the year line must never cost the alert itself.
describe('checkBudgetAfterSave, when a read fails', () => {
  beforeEach(async () => {
    await db.expenses.clear()
    await db.categories.clear()
    await db.categories.bulkAdd(DEFAULT_CATEGORIES)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('still alerts when the currency’s first month cannot be read', async () => {
    await seedEarlierMonths()
    await seedEveryday(24000)
    vi.spyOn(dbModule, 'firstExpenseMonth').mockRejectedValue(new Error('read failed'))
    expect(await save({ amount: 2150 })).toMatchObject({
      kind: 'over',
      spent: 26150,
      carried: null,
    })
    expect(console.error).toHaveBeenCalled()
  })

  it('still alerts when the earlier months cannot be read', async () => {
    await seedEarlierMonths()
    await seedEveryday(24000)
    const read = dbModule.listExpensesBetween
    vi.spyOn(dbModule, 'listExpensesBetween').mockImplementation((from, to) =>
      from === '2026-01-01' ? Promise.reject(new Error('read failed')) : read(from, to),
    )
    expect(await save({ amount: 2150 })).toMatchObject({
      kind: 'over',
      spent: 26150,
      carried: null,
    })
    expect(console.error).toHaveBeenCalled()
  })

  it('resolves null, never rejects, when the month cannot be read', async () => {
    await seedEveryday(24000)
    vi.spyOn(dbModule, 'listExpensesBetween').mockRejectedValue(new Error('read failed'))
    await expect(save({ amount: 2150 })).resolves.toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  // The heads-up never shows the year line, so it must not pay for the read.
  it('reads nothing of the year for a heads-up', async () => {
    await seedEarlierMonths()
    await seedEveryday(19500)
    const first = vi.spyOn(dbModule, 'firstExpenseMonth')
    const between = vi.spyOn(dbModule, 'listExpensesBetween')
    expect(await save({ amount: 640 })).toMatchObject({ kind: 'near', carried: null })
    expect(first).not.toHaveBeenCalled()
    expect(between).toHaveBeenCalledTimes(1)
  })
})

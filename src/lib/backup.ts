import { db, type Category, type Expense, type PaymentMethod } from '../db'

export interface BackupData {
  expenses: Expense[]
  paymentMethods: PaymentMethod[]
  categories: Category[]
}

// Spreadsheet-friendly column order: what/when first, bookkeeping ids last.
const CSV_HEADER = 'spentOn,amount,currency,category,paymentMethod,note,id,createdAt'

function csvField(value: string | number | undefined): string {
  if (value === undefined) return ''
  let s = String(value)
  // A leading =, +, - or @ executes as a formula when the CSV opens in a
  // spreadsheet; a leading apostrophe renders it as inert text instead.
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export function expensesToCsv(
  expenses: Expense[],
  methodLabels: Map<string, string>,
): string {
  const rows = [
    CSV_HEADER,
    ...expenses.map((e) =>
      [
        e.spentOn,
        e.amount,
        e.currency,
        e.category,
        e.paymentMethodId === undefined
          ? ''
          : (methodLabels.get(e.paymentMethodId) ?? ''),
        e.note,
        e.id,
        e.createdAt,
      ]
        .map(csvField)
        .join(','),
    ),
  ]
  // BOM so Excel detects UTF-8 (notes may hold ₹, Hindi, emoji...).
  return '﻿' + rows.map((row) => row + '\r\n').join('')
}

export function backupToJson(
  data: BackupData,
  exportedAt: string = new Date().toISOString(),
): string {
  return JSON.stringify(
    {
      app: 'expense-tracker',
      version: 3,
      exportedAt,
      expenses: data.expenses,
      paymentMethods: data.paymentMethods,
      categories: data.categories,
    },
    null,
    2,
  )
}

function invalid(detail: string): Error {
  return new Error(`Invalid backup: ${detail}`)
}

function parseRecord(raw: unknown, position: number): Expense {
  if (typeof raw !== 'object' || raw === null) {
    throw invalid(`record ${position} is not an object`)
  }
  const { id, amount, currency, category, spentOn, note, paymentMethodId, createdAt } =
    raw as Record<string, unknown>
  if (typeof id !== 'string' || id === '') {
    throw invalid(`record ${position} is missing an id`)
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw invalid(`record ${position} has an invalid amount`)
  }
  if (currency !== undefined && (typeof currency !== 'string' || currency === '')) {
    throw invalid(`record ${position} has an invalid currency`)
  }
  if (typeof category !== 'string' || category === '') {
    throw invalid(`record ${position} has an invalid category`)
  }
  if (typeof spentOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) {
    throw invalid(`record ${position} has an invalid spentOn date (expected YYYY-MM-DD)`)
  }
  if (typeof createdAt !== 'string' || createdAt === '') {
    throw invalid(`record ${position} has an invalid createdAt`)
  }
  if (note !== undefined && typeof note !== 'string') {
    throw invalid(`record ${position} has an invalid note`)
  }
  if (
    paymentMethodId !== undefined &&
    (typeof paymentMethodId !== 'string' || paymentMethodId === '')
  ) {
    throw invalid(`record ${position} has an invalid paymentMethodId`)
  }
  // Pre-v2 backups predate multi-currency; they were always rupees.
  const expense: Expense = {
    id,
    amount,
    currency: currency ?? 'INR',
    category,
    spentOn,
    createdAt,
  }
  if (note !== undefined) expense.note = note
  if (paymentMethodId !== undefined) expense.paymentMethodId = paymentMethodId
  return expense
}

// A v2 backup carried kind ('cash'|'upi'|'card') + optional cardType; fold
// both into the display group v3 works with. Returns undefined if neither a
// v3 group nor a recognisable v2 kind is present.
function groupFromRaw(raw: Record<string, unknown>): string | undefined {
  const { group, kind, cardType } = raw
  if (typeof group === 'string' && group !== '') return group
  if (kind === 'cash') return 'Cash'
  if (kind === 'upi') return 'UPI'
  if (kind === 'card') return cardType === 'debit' ? 'Debit card' : 'Credit card'
  return undefined
}

function parseMethod(raw: unknown, position: number): PaymentMethod {
  if (typeof raw !== 'object' || raw === null) {
    throw invalid(`payment method ${position} is not an object`)
  }
  const record = raw as Record<string, unknown>
  const { id, label, archived, createdAt } = record
  if (typeof id !== 'string' || id === '') {
    throw invalid(`payment method ${position} is missing an id`)
  }
  if (typeof label !== 'string' || label === '') {
    throw invalid(`payment method ${position} has an invalid label`)
  }
  const group = groupFromRaw(record)
  if (group === undefined) {
    throw invalid(`payment method ${position} has an invalid group`)
  }
  if (archived !== undefined && typeof archived !== 'boolean') {
    throw invalid(`payment method ${position} has an invalid archived flag`)
  }
  if (typeof createdAt !== 'string' || createdAt === '') {
    throw invalid(`payment method ${position} has an invalid createdAt`)
  }
  const method: PaymentMethod = { id, label, group, createdAt }
  if (archived !== undefined) method.archived = archived
  return method
}

function parseCategory(raw: unknown, position: number): Category {
  if (typeof raw !== 'object' || raw === null) {
    throw invalid(`category ${position} is not an object`)
  }
  const { id, label, emoji, archived, createdAt } = raw as Record<string, unknown>
  if (typeof id !== 'string' || id === '') {
    throw invalid(`category ${position} is missing an id`)
  }
  if (typeof label !== 'string' || label === '') {
    throw invalid(`category ${position} has an invalid label`)
  }
  if (typeof emoji !== 'string' || emoji === '') {
    throw invalid(`category ${position} has an invalid emoji`)
  }
  if (archived !== undefined && typeof archived !== 'boolean') {
    throw invalid(`category ${position} has an invalid archived flag`)
  }
  if (typeof createdAt !== 'string' || createdAt === '') {
    throw invalid(`category ${position} has an invalid createdAt`)
  }
  const category: Category = { id, label, emoji, createdAt }
  if (archived !== undefined) category.archived = archived
  return category
}

function arrayField(
  data: Record<string, unknown>,
  key: string,
): unknown[] {
  const raw = data[key]
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw invalid(`${key} is not an array`)
  return raw
}

// Accepts the v3 envelope produced by backupToJson, older v1/v2 envelopes, or
// a bare expense array (e.g. a hand-edited backup). Throws on anything
// malformed.
export function parseBackupJson(text: string): BackupData {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw invalid('not valid JSON')
  }
  let expenseList: unknown[]
  let methodList: unknown[] = []
  let categoryList: unknown[] = []
  if (Array.isArray(data)) {
    expenseList = data
  } else if (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { expenses?: unknown }).expenses)
  ) {
    const obj = data as Record<string, unknown>
    expenseList = obj.expenses as unknown[]
    methodList = arrayField(obj, 'paymentMethods')
    categoryList = arrayField(obj, 'categories')
  } else {
    throw invalid('no expenses array found')
  }
  return {
    expenses: expenseList.map((raw, i) => parseRecord(raw, i + 1)),
    paymentMethods: methodList.map((raw, i) => parseMethod(raw, i + 1)),
    categories: categoryList.map((raw, i) => parseCategory(raw, i + 1)),
  }
}

// Build a map from an incoming record's id to a surviving local id whenever
// the incoming record's id is new but its label already exists locally. This
// keeps a restore-onto-a-reinstall from duplicating the same-named card or
// category (label uniqueness is the app's invariant; import must honour it).
function labelRemap<T extends { id: string; label: string }>(
  incoming: T[],
  existing: T[],
): Map<string, string> {
  const localIds = new Set(existing.map((r) => r.id))
  const byLabel = new Map(existing.map((r) => [r.label.toLowerCase(), r.id]))
  const remap = new Map<string, string>()
  for (const r of incoming) {
    if (localIds.has(r.id)) continue // same id: plain upsert wins
    const local = byLabel.get(r.label.toLowerCase())
    if (local) remap.set(r.id, local)
  }
  return remap
}

// Upsert by id: re-importing a backup never duplicates, edits win by id.
// Methods and categories land first so imported expenses never reference a
// missing one. Same-label records from a different install are merged, and
// expenses pointing at a merged method are rewritten to the survivor.
export async function importBackup(
  data: BackupData,
): Promise<{ expenses: number; paymentMethods: number; categories: number }> {
  return db.transaction('rw', db.expenses, db.paymentMethods, db.categories, async () => {
    const methodRemap = labelRemap(
      data.paymentMethods,
      await db.paymentMethods.toArray(),
    )
    const categoryRemap = labelRemap(data.categories, await db.categories.toArray())
    const localCategoryLabels = new Map(
      (await db.categories.toArray()).map((c) => [c.id, c.label]),
    )

    const methods = data.paymentMethods.filter((m) => !methodRemap.has(m.id))
    const categories = data.categories.filter((c) => !categoryRemap.has(c.id))

    // Category labels are what expenses store, so a merged category may mean
    // an incoming expense's category string should follow the survivor.
    const incomingCategoryLabel = new Map(data.categories.map((c) => [c.id, c.label]))
    const relabel = new Map<string, string>()
    for (const [fromId, toId] of categoryRemap) {
      const from = incomingCategoryLabel.get(fromId)
      const to = localCategoryLabels.get(toId)
      if (from !== undefined && to !== undefined && from !== to) relabel.set(from, to)
    }

    const expenses = data.expenses.map((e) => {
      const remapped =
        e.paymentMethodId && methodRemap.has(e.paymentMethodId)
          ? { ...e, paymentMethodId: methodRemap.get(e.paymentMethodId) }
          : e
      const label = relabel.get(remapped.category)
      return label ? { ...remapped, category: label } : remapped
    })

    await db.paymentMethods.bulkPut(methods)
    await db.categories.bulkPut(categories)
    await db.expenses.bulkPut(expenses)
    return {
      expenses: data.expenses.length,
      paymentMethods: data.paymentMethods.length,
      categories: data.categories.length,
    }
  })
}

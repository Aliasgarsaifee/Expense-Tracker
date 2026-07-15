import Dexie, { type EntityTable } from 'dexie'

export interface Expense {
  id: string // uuid
  amount: number // in `currency` units
  currency: string // ISO 4217 code, e.g. "INR"
  category: string // category label (matches categories.label)
  spentOn: string // ISO date, e.g. "2026-07-12"
  note?: string
  paymentMethodId?: string // references paymentMethods; absent on pre-v2 entries
  createdAt: string // ISO timestamp
}

export interface PaymentMethod {
  id: string
  label: string // "Cash", "GPay", "HDFC Credit"...
  group: string // "Cash" | "UPI" | "Credit card" | "Debit card" | custom
  archived?: boolean // hidden from pickers, kept for old entries
  createdAt: string // ISO timestamp
}

export interface Category {
  id: string
  label: string
  emoji: string
  archived?: boolean
  createdAt: string
}

// The four groups the picker always understands; users may add their own.
export const PAYMENT_GROUPS = ['Cash', 'UPI', 'Credit card', 'Debit card'] as const

// Stable ids so backups from different installs merge instead of duplicating.
export const CASH_METHOD_ID = 'pm-cash'
// Was a seeded generic method until v4 folded it away — UPI is a group, not
// an instrument. The id lives on in pre-v4 backups (import may resurrect it)
// and in the v2 seed below; never reuse it for anything else.
export const UPI_METHOD_ID = 'pm-upi'

// Fresh installs seed Cash alone: every other group starts empty and fills
// with the owner's real instruments (GPay, HDFC Regalia...), so no group
// carries a redundant generic entry the way UPI once did.
export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: CASH_METHOD_ID,
    label: 'Cash',
    group: 'Cash',
    createdAt: '1970-01-01T00:00:00.000Z',
  },
]

// Frozen copy of what the v2 upgrade seeded, generic UPI included. Devices
// arriving from v1 must replay that history exactly (append-only versions,
// so this list must never track later edits to DEFAULT_PAYMENT_METHODS);
// v4 then folds the generic away for them like it does for everyone else.
const V2_SEED_PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: CASH_METHOD_ID,
    label: 'Cash',
    group: 'Cash',
    createdAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: UPI_METHOD_ID,
    label: 'UPI',
    group: 'UPI',
    createdAt: '1970-01-01T00:00:01.000Z',
  },
]

// Epoch-stepped createdAt keeps the seeded order stable in listCategories.
export const DEFAULT_CATEGORIES: Category[] = [
  ['cat-food', 'Food', '🍛'],
  ['cat-transport', 'Transport', '🛺'],
  ['cat-groceries', 'Groceries', '🥬'],
  ['cat-rent', 'Rent', '🏠'],
  ['cat-utilities', 'Utilities', '💡'],
  ['cat-health', 'Health', '🩺'],
  ['cat-shopping', 'Shopping', '🛍️'],
  ['cat-other', 'Other', '🗂️'],
].map(([id, label, emoji], i) => ({
  id,
  label,
  emoji,
  createdAt: `1970-01-01T00:00:0${i}.000Z`,
}))

const BUILTIN_CATEGORY_IDS = new Set(DEFAULT_CATEGORIES.map((c) => c.id))

export function isBuiltinCategoryId(id: string): boolean {
  return BUILTIN_CATEGORY_IDS.has(id)
}

export type NewExpense = Omit<Expense, 'id' | 'createdAt' | 'currency'> & {
  currency?: string
}

export type NewPaymentMethod = { label: string; group: string }

export type NewCategory = { label: string; emoji?: string }

type ExpenseDb = Dexie & {
  expenses: EntityTable<Expense, 'id'>
  paymentMethods: EntityTable<PaymentMethod, 'id'>
  categories: EntityTable<Category, 'id'>
}

export function createDb(name = 'ExpenseTrackerDB'): ExpenseDb {
  const database = new Dexie(name) as ExpenseDb
  database.version(1).stores({
    expenses: 'id, spentOn, category, createdAt',
  })
  database
    .version(2)
    .stores({
      expenses: 'id, spentOn, category, createdAt, paymentMethodId',
      paymentMethods: 'id, createdAt',
    })
    .upgrade(async (tx) => {
      await tx
        .table('expenses')
        .toCollection()
        .modify((e: Expense) => {
          if (!e.currency) e.currency = 'INR'
        })
      await tx.table('paymentMethods').bulkAdd(V2_SEED_PAYMENT_METHODS)
    })
  database
    .version(3)
    .stores({
      expenses: 'id, spentOn, category, createdAt, paymentMethodId',
      paymentMethods: 'id, createdAt',
      categories: 'id, createdAt',
    })
    .upgrade(async (tx) => {
      // v2 methods carried kind ('cash'|'upi'|'card') + cardType; fold both
      // into the display group the picker works with.
      await tx
        .table('paymentMethods')
        .toCollection()
        .modify((m: PaymentMethod & { kind?: string; cardType?: string }) => {
          if (!m.group) {
            m.group =
              m.kind === 'card'
                ? m.cardType === 'debit'
                  ? 'Debit card'
                  : 'Credit card'
                : m.kind === 'upi'
                  ? 'UPI'
                  : 'Cash'
          }
          delete m.kind
          delete m.cardType
        })
      await tx.table('categories').bulkAdd(DEFAULT_CATEGORIES)
    })
  database
    .version(4)
    .stores({
      expenses: 'id, spentOn, category, createdAt, paymentMethodId',
      paymentMethods: 'id, createdAt',
      categories: 'id, createdAt',
    })
    .upgrade(async (tx) => {
      // UPI is a group, not an instrument: the seeded generic "UPI" method
      // only crowded the picker next to real UPI apps. Fold it away — delete
      // when nothing references it, archive (never delete) when history does.
      // A renamed or already-archived one is the owner's own method: leave it.
      const upi = (await tx.table('paymentMethods').get(UPI_METHOD_ID)) as
        | PaymentMethod
        | undefined
      if (!upi || upi.label !== 'UPI' || upi.archived) return
      const used = await tx
        .table('expenses')
        .where('paymentMethodId')
        .equals(UPI_METHOD_ID)
        .count()
      if (used === 0) await tx.table('paymentMethods').delete(UPI_METHOD_ID)
      else await tx.table('paymentMethods').update(UPI_METHOD_ID, { archived: true })
    })
  // Fresh installs skip upgrade(); seed the defaults here instead.
  database.on('populate', (tx) => {
    void tx.table('paymentMethods').bulkAdd(DEFAULT_PAYMENT_METHODS)
    void tx.table('categories').bulkAdd(DEFAULT_CATEGORIES)
  })
  return database
}

export const db = createDb()

// Newest spend date first; within a day, most recently added first.
// Both fields are ISO strings, so lexicographic order is chronological.
function sortNewestFirst(expenses: Expense[]): Expense[] {
  return expenses.sort(
    (a, b) =>
      b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt),
  )
}

export async function addExpense(input: NewExpense): Promise<Expense> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Amount must be a positive number')
  }
  const expense: Expense = {
    ...input,
    currency: input.currency ?? 'INR',
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  await db.expenses.add(expense)
  return expense
}

export async function listExpenses(): Promise<Expense[]> {
  return sortNewestFirst(await db.expenses.toArray())
}

// Inclusive on both bounds. Reads the existing spentOn index — no schema
// change — so arbitrary Summary periods are just a range query. A one-month
// range ('YYYY-MM-01' → last day) is the month view.
export async function listExpensesBetween(from: string, to: string): Promise<Expense[]> {
  const rows = await db.expenses.where('spentOn').between(from, to, true, true).toArray()
  return sortNewestFirst(rows)
}

export async function updateExpense(
  id: string,
  changes: Partial<NewExpense>,
): Promise<void> {
  if (
    changes.amount !== undefined &&
    (!Number.isFinite(changes.amount) || changes.amount <= 0)
  ) {
    throw new Error('Amount must be a positive number')
  }
  await db.expenses.update(id, changes)
}

export async function deleteExpense(id: string): Promise<void> {
  await db.expenses.delete(id)
}

const BUILTIN_GROUP_RANK: Record<string, number> = {
  Cash: 0,
  UPI: 1,
  'Credit card': 2,
  'Debit card': 3,
}

function groupRank(group: string): number {
  return BUILTIN_GROUP_RANK[group] ?? PAYMENT_GROUPS.length
}

export async function listPaymentMethods(opts?: {
  includeArchived?: boolean
}): Promise<PaymentMethod[]> {
  const all = await db.paymentMethods.toArray()
  const visible = opts?.includeArchived ? all : all.filter((m) => !m.archived)
  return visible.sort(
    (a, b) =>
      groupRank(a.group) - groupRank(b.group) ||
      a.group.localeCompare(b.group) ||
      a.createdAt.localeCompare(b.createdAt),
  )
}

export async function addPaymentMethod(
  input: NewPaymentMethod,
): Promise<PaymentMethod> {
  const label = input.label.trim()
  const group = input.group.trim()
  if (label === '') throw new Error('The label cannot be empty')
  if (group === '') throw new Error('The group cannot be empty')
  const clash = (await db.paymentMethods.toArray()).find(
    (m) => m.label.toLowerCase() === label.toLowerCase(),
  )
  if (clash) throw new Error(`"${clash.label}" already exists`)
  const method: PaymentMethod = {
    label,
    group,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  await db.paymentMethods.add(method)
  return method
}

export async function renamePaymentMethod(id: string, label: string): Promise<void> {
  const trimmed = label.trim()
  if (trimmed === '') throw new Error('The label cannot be empty')
  await db.paymentMethods.update(id, { label: trimmed })
}

// Groups are just strings on methods (expenses never store one), so a group
// rename is a single bulk re-bucket — no cascade exists by construction.
// Renaming onto an existing name merges the two buckets, which is the useful
// behavior and never loses data. The built-in names stay fixed: they are the
// picker's vocabulary (rank, emoji, add-chips), and renaming one would leave
// the vocabulary offering the old name next to the new bucket.
export async function renameGroup(from: string, to: string): Promise<void> {
  const trimmed = to.trim()
  if (trimmed === '') throw new Error('The group cannot be empty')
  if ((PAYMENT_GROUPS as readonly string[]).includes(from)) {
    throw new Error(`${from} is a built-in group and cannot be renamed`)
  }
  if (trimmed === from) return
  await db.paymentMethods
    .filter((m) => m.group === from)
    .modify((m) => {
      m.group = trimmed
    })
}

export async function setPaymentMethodArchived(
  id: string,
  archived: boolean,
): Promise<void> {
  await db.paymentMethods.update(id, { archived })
}

export async function deletePaymentMethod(id: string): Promise<void> {
  if (id === CASH_METHOD_ID) {
    throw new Error('Cash is built-in and cannot be deleted')
  }
  const used = await db.expenses.where('paymentMethodId').equals(id).count()
  if (used > 0) {
    throw new Error(
      `${used === 1 ? '1 entry uses' : `${used} entries use`} this method — archive it instead`,
    )
  }
  await db.paymentMethods.delete(id)
}

// method id → the most recent expense `createdAt` for that method (ISO string).
// Feeds the picker's recent-first ordering. Methods with no expenses are
// absent; entries with no paymentMethodId (pre-v2) are skipped. Read-time
// aggregation over existing rows — no schema change.
export async function methodRecency(): Promise<Map<string, string>> {
  const recency = new Map<string, string>()
  for (const e of await db.expenses.toArray()) {
    const id = e.paymentMethodId
    if (!id) continue
    const prev = recency.get(id)
    if (!prev || e.createdAt > prev) recency.set(id, e.createdAt)
  }
  return recency
}

export async function listCategories(opts?: {
  includeArchived?: boolean
}): Promise<Category[]> {
  const all = await db.categories.toArray()
  const visible = opts?.includeArchived ? all : all.filter((c) => !c.archived)
  return visible.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

async function assertCategoryLabelFree(label: string, exceptId?: string) {
  const clash = (await db.categories.toArray()).find(
    (c) => c.id !== exceptId && c.label.toLowerCase() === label.toLowerCase(),
  )
  if (clash) throw new Error(`"${clash.label}" already exists`)
}

export async function addCategory(input: NewCategory): Promise<Category> {
  const label = input.label.trim()
  if (label === '') throw new Error('The label cannot be empty')
  await assertCategoryLabelFree(label)
  const category: Category = {
    label,
    emoji: input.emoji?.trim() || '🏷️',
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  await db.categories.add(category)
  return category
}

// Expenses store the category LABEL, so a rename must relabel history too —
// otherwise old entries silently detach into a phantom category.
export async function renameCategory(id: string, label: string): Promise<void> {
  const trimmed = label.trim()
  if (trimmed === '') throw new Error('The label cannot be empty')
  await assertCategoryLabelFree(trimmed, id)
  await db.transaction('rw', db.categories, db.expenses, async () => {
    const current = await db.categories.get(id)
    if (!current || current.label === trimmed) return
    await db.categories.update(id, { label: trimmed })
    await db.expenses
      .where('category')
      .equals(current.label)
      .modify((e) => {
        e.category = trimmed
      })
  })
}

export async function setCategoryArchived(
  id: string,
  archived: boolean,
): Promise<void> {
  await db.categories.update(id, { archived })
}

export async function deleteCategory(id: string): Promise<void> {
  if (BUILTIN_CATEGORY_IDS.has(id)) {
    throw new Error('This category is built-in and cannot be deleted')
  }
  const category = await db.categories.get(id)
  if (!category) return
  const used = await db.expenses.where('category').equals(category.label).count()
  if (used > 0) {
    throw new Error(
      `${used === 1 ? '1 entry uses' : `${used} entries use`} this category — archive it instead`,
    )
  }
  await db.categories.delete(id)
}

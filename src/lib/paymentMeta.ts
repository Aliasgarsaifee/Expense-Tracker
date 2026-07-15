import { PAYMENT_GROUPS, type PaymentMethod } from '../db'

// Emoji per payment group. Built-in groups get their own mark; anything
// custom (Wallet, Netbanking...) falls back to a generic one.
const GROUP_EMOJI: Record<string, string> = {
  Cash: '💵',
  UPI: '📲',
  'Credit card': '💳',
  'Debit card': '🏦',
}

export function groupEmoji(group: string): string {
  return GROUP_EMOJI[group] ?? '👛'
}

export interface GroupBucket {
  group: string
  members: PaymentMethod[]
}

// What the add-method sheet offers: the built-in vocabulary first (fixed
// rank order), then every group that actually exists on a method — archived
// ones included, since the settings tree shows those too. A custom group
// with no remaining methods drops out on its own.
export function groupChoices(methods: PaymentMethod[]): string[] {
  const builtIn = PAYMENT_GROUPS as readonly string[]
  const customs = [...new Set(methods.map((m) => m.group))]
    .filter((g) => !builtIn.includes(g))
    .sort((a, b) => a.localeCompare(b))
  return [...builtIn, ...customs]
}

// Buckets appear in first-seen group order, so rank-sorted input (what
// listPaymentMethods returns) yields rank-sorted buckets — but grouping is
// correct for any input order.
export function bucketize(methods: PaymentMethod[]): GroupBucket[] {
  const byGroup = new Map<string, GroupBucket>()
  const out: GroupBucket[] = []
  for (const m of methods) {
    let bucket = byGroup.get(m.group)
    if (!bucket) {
      bucket = { group: m.group, members: [] }
      byGroup.set(m.group, bucket)
      out.push(bucket)
    }
    bucket.members.push(m)
  }
  return out
}

// Most-recently-used first, by the `recency` map (method id → last-used ISO
// timestamp). Methods absent from the map (never used) sort after every used
// one and keep their incoming order among themselves — callers pass
// listPaymentMethods output, so that means createdAt order. Non-mutating;
// relies on Array.prototype.sort being stable (ES2019+, WKWebView included).
export function orderByRecency(
  members: PaymentMethod[],
  recency: Map<string, string>,
): PaymentMethod[] {
  return [...members].sort((a, b) => {
    const ra = recency.get(a.id)
    const rb = recency.get(b.id)
    if (ra && rb) return rb.localeCompare(ra)
    if (ra) return -1
    if (rb) return 1
    return 0
  })
}

// Case-insensitive substring match on label; a blank/whitespace query returns
// every member unchanged. Non-mutating.
export function filterByLabel(
  members: PaymentMethod[],
  query: string,
): PaymentMethod[] {
  const q = query.trim().toLowerCase()
  if (q === '') return members
  return members.filter((m) => m.label.toLowerCase().includes(q))
}

// ——— History method-filter selection ———

// What the History filter sheet manipulates: whole groups plus individual
// methods. Invariant: a group and any of its members are never both stored —
// a selected group covers its members implicitly, future ones included.
export interface MethodSelection {
  methodIds: string[]
  groups: string[]
}

// Selecting a group absorbs its individually-picked members; deselecting
// just removes the group.
export function toggleGroup(
  sel: MethodSelection,
  group: string,
  memberIds: string[],
): MethodSelection {
  if (sel.groups.includes(group)) {
    return { methodIds: sel.methodIds, groups: sel.groups.filter((g) => g !== group) }
  }
  return {
    methodIds: sel.methodIds.filter((id) => !memberIds.includes(id)),
    groups: [...sel.groups, group],
  }
}

// Toggling a member of a selected group demotes the group to "everyone
// else"; otherwise it is a plain add/remove of that one method.
export function toggleMethod(
  sel: MethodSelection,
  method: { id: string; group: string },
  groupMemberIds: string[],
): MethodSelection {
  if (sel.groups.includes(method.group)) {
    return {
      groups: sel.groups.filter((g) => g !== method.group),
      methodIds: [...sel.methodIds, ...groupMemberIds.filter((id) => id !== method.id)],
    }
  }
  return sel.methodIds.includes(method.id)
    ? { groups: sel.groups, methodIds: sel.methodIds.filter((id) => id !== method.id) }
    : { groups: sel.groups, methodIds: [...sel.methodIds, method.id] }
}

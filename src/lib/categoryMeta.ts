const EMOJI: Record<string, string> = {
  Food: '🍛',
  Transport: '🛺',
  Groceries: '🥬',
  Rent: '🏠',
  Utilities: '💡',
  Health: '🩺',
  Shopping: '🛍️',
  Other: '🗂️',
}

// Fallback covers categories arriving via an imported backup.
export function categoryEmoji(category: string): string {
  return EMOJI[category] ?? '🧾'
}

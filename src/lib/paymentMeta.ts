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

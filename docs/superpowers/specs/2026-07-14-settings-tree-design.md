# Settings tree + tap-to-filter — design

Owner-approved direction (recorded 2026-07-14, restated by owner today):
methods grouped under collapsible group headers in the settings drawer,
categories section collapsible the same way, tapping a row jumps to the
History tab with a removable filter applied. No router — App-level state.

## Why now

Post-import the drawer lists ~21 payment methods flat; scanning past them to
reach Preferences/Backup is a chore. The group field already exists on every
method; the drawer just doesn't use it.

## Decisions

1. **Grouping** — reuse the `group`-rank order `listPaymentMethods` already
   returns; bucket contiguously (same helper shape as PaymentPicker's
   `bucketize`, extracted to `src/lib/paymentMeta.ts` so both use one copy).
   Each group renders a toggle header: `{emoji} {group} · {n}` where n =
   member count (archived members included — they live inside the group).
2. **Collapsed by default** — plain `useState` per drawer mount. The drawer
   body remounts on every open, so every open starts collapsed. No prefs key,
   nothing persisted.
3. **Categories** — one collapsible header for the whole section
   (`Categories · n`); categories have no groups and don't need invented ones.
4. **Tap-to-filter** — the row's label area becomes a button ("View in
   History"); the rename/archive/delete icon buttons stay as siblings.
   Tapping: closes the drawer, switches App's tab to History, and applies a
   filter — method rows set the existing method filter, category rows set a
   new category filter. Month resets to All time and the search query clears,
   so the jump always lands on the full slice of what was tapped. An archived
   method with zero entries still jumps; History's existing dangling-filter
   guard simply drops the filter (its settings row already reads "0 entries").
5. **Category filter in History** — `filterExpenses` gains an optional
   `category` (exact label match, like the method filter; AND-composes with
   month/method/query). Active category filter renders as one dismissible
   chip (`{emoji} {label} ✕`) next to the method chip row; ✕ clears it. The
   method filter keeps its existing pressed-chip row — no second indicator.
   "Clear filters" in the empty state clears the category too.
6. **Cross-screen event, not shared state** — App owns
   `historyJump: { filter: { paymentMethodId?, category? } } | null`, created
   fresh per tap; HistoryScreen applies it in an effect keyed on the object
   identity, then continues to own its local filter state. History stays
   self-contained; App stays a coordinator; nothing re-renders on keystrokes
   in hidden screens.

## Not doing (YAGNI)

- No persistence of expanded/collapsed state.
- No archived-subsection inside groups; archived rows stay inline, dimmed, as
  today.
- No Summary-screen entry points; History is the one filtered destination.
- No animation on expand/collapse in v1 (instant show/hide; the drawer itself
  already animates).

## Blast radius

UI + one pure function. No Dexie schema, no PREFS key, no backup shape, no
CSV, no Info.plist. Cross-screen: App.tsx (new state + props), HistoryScreen
(new prop + category filter), SettingsDrawer (tree + tap), paymentMeta
(bucketize moves in), history.ts (category in filter). All three screens stay
mounted — the jump must work while History is hidden.

## Tests

- `history.test.ts`: category filter alone, AND with method/month/query,
  no-category passthrough.
- `paymentMeta.test.ts` (new): bucketize keeps group-rank order, groups
  contiguous members, single-member groups.
- Screens have no unit tests (repo rule); the drawer tree, jump, chip, and
  both themes are verified in the dev server at 375px.

## Verification

Dev server: expand/collapse each group, tap a method row → History shows only
its entries (All time), tap a category row → dismissible chip + filtered
list, ✕ restores, both themes at 375px, WCAG AA on any new hue (reusing
existing tokens only, so no new pairs to validate).

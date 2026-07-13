---
name: pocket-ledger-design
description: The app's design system — warm paper/ink/ledger-green tokens, Fraunces + Atkinson type rules, the chips/sheets/toast vocabulary, WCAG AA contrast in BOTH themes, and the 375px light+dark verification loop. Use for ANY visual or UI change — new component, screen, color, font, spacing, chart styling, or "make it look better / something looks off" — even when the user doesn't mention design.
---

# Pocket-ledger design system

The look is a pocket ledger: warm paper stock, ink that soaked in,
ledger-green for money-positive moments. Calm, dense, legible. Flat inked
surfaces separated by hairline `--line` borders under a faint paper-grain
overlay — **no gradients, no glassmorphism, no floating shadowed cards**. If
a new element wouldn't look at home printed in a well-made notebook, it
doesn't belong.

## Color: tokens only, contrast always

- Every color comes from a custom property in `src/index.css` — never
  hard-code a hex in a component or JSX. A new color means a new token
  defined in **both** `:root` and the `prefers-color-scheme: dark` block.
- Any hue used as text must hold **≥ 4.5:1 (WCAG AA)** against its background
  in **both themes**. Check it before committing:

  ```bash
  node .claude/skills/pocket-ledger-design/scripts/contrast.mjs '#0A7A50' '#F5F0E6'
  ```

- The validated pairs live in the header comment of index.css — that comment
  is the design system's changelog. Update it when a hue changes, or the next
  person inherits stale guarantees.
- `--danger` is for destructive/irreversible only; `--accent` marks the
  primary action and money-positive accents. Resist new semantic colors —
  two is the budget.

## Type

- `.display` — Fraunces Variable, `font-variation-settings: 'SOFT' 60,
  'WONK' 1`. Headings and big friendly numbers with personality.
- `.money` — Fraunces with `tabular-nums` (`SOFT 30, WONK 0`). **Every
  amount on screen uses `.money`** so digits align down columns; the wonk is
  turned off because ₹ figures are data, not decoration.
- Body — Atkinson Hyperlegible, 16px base, line-height 1.45.
- Never add a font. They ship in the bundle (`main.tsx` imports) so the app
  renders identically offline; a new family is a bundle-size and ADR
  decision, not a styling choice.

## Interaction vocabulary (reuse before inventing)

- **Chips** — pick-one choices (categories, payment groups).
- **Bottom sheets** — pickers and sub-forms; sheets holding inputs call
  `useKeyboardInset(ref)` and pad by `var(--kb, 0px)`.
- **Toast with Undo** — post-save confirmation, paired with `tapFeedback()`.
- **Bottom tabs** — the only navigation; the settings drawer handles
  management chores.

If a feature seems to need a new pattern, first try to express it in these
four. A fifth pattern is a design decision to raise, not a default.

## Layout & platform feel

- Single column, `max-width: 560px`, centered.
- Touch targets ≥ 44px (existing rows use 44–48px `min-height`).
- Pressed feedback via `:active` (tap-highlight is globally disabled — an
  element without an `:active` treatment feels dead on the phone). Keep
  transitions in the established range: ~0.06s transform, ~0.12s color.
- Inputs ≥ 16px font-size, or iOS zooms the viewport on focus.
- Anything pinned to a screen edge pads by `env(safe-area-inset-*)`.
- Charts: follow the `dataviz` skill; series colors come from tokens, and
  currencies are never mixed into one series (`splitByCurrency` exists for
  this).

## The verification loop (before any UI change is "done")

1. Dev server up (`npm run dev` / launch config `expense-tracker`).
2. Viewport ~375×812.
3. Exercise the changed flow in **light**, then **dark** (both are
   first-class; every regression so far has hidden in the theme not being
   looked at).
4. If a form/sheet changed: check with the keyboard open.
5. Screenshot both themes as proof of the change.

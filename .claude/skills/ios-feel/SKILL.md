---
name: ios-feel
description: Native-feel checklist for this Capacitor WKWebView app — safe-area insets, keyboard occlusion via --kb, 44px touch targets, :active pressed states, iOS zoom-on-focus prevention, haptic moments, share-sheet quirks, native/web adapter guards. Use when building or changing any interactive UI, when something "feels janky / web-like / laggy on the phone", and as a review pass before installing on the iPhone.
---

# iOS feel

A WKWebView betrays its web-ness through small defaults: dead-feeling taps,
keyboards covering inputs, content under the notch. The repo already counters
each one — new UI must use the same mechanisms, or the app feels like a
website exactly where the user touches it most.

## The checklist

**Touch**
- Targets ≥ 44px (`min-height: 44px`/`48px` on rows and buttons — match).
- Every tappable element has an `:active` treatment. Tap-highlight is
  globally disabled (`-webkit-tap-highlight-color: transparent`), so
  `:active` is the *only* pressed feedback — omit it and the tap feels dead.
  Keep the established timing: ~0.06s transform, ~0.12s color.
- Nothing may depend on hover or `title` tooltips; there is no cursor.

**Keyboard**
- The iOS keyboard overlays the layout viewport without shrinking it —
  `dvh`/`vh` do **not** account for it. Bottom-anchored sheets holding inputs
  call `useKeyboardInset(ref)` and pad their scrollport by `var(--kb, 0px)`
  (see the sheet padding in index.css).
- Inputs use `font-size: 16px` or larger, otherwise iOS zooms the page on
  focus and never quite zooms back.

**Edges**
- Anything pinned to a screen edge pads by `env(safe-area-inset-*)` — the
  tab bar, sheets, the menu button, and the toast all do; copy their pattern
  or the home-indicator/notch will overlap it on device.

**Feedback**
- `tapFeedback()` (Light impact) marks meaningful moments — an entry landing
  in the ledger. Use it sparingly; a haptic on every tap cheapens it. It is
  best-effort by design: never `await` it in a way that can block or fail a
  save.

**Native/web seams**
- Every Capacitor call sits behind a `Capacitor.isNativePlatform()` guard
  with a web story: exportFile falls back to a Blob download; haptics and
  autoBackup silently no-op. New native features follow the same shape so the
  dev server stays fully usable.
- The share sheet **rejects when the user dismisses it** — match
  exportFile's `/cancel/i` handling; a cancel is not an error and must not
  surface as one.

**Scrolling & sheets**
- Sheets scroll internally; avoid nesting scrollable regions inside them
  (scroll traps feel broken with rubber-banding).
- Screens stay mounted (`hidden` attribute) — scroll position and half-typed
  input persist across tab switches; don't "fix" that with remounts.

## What only the device can prove

Haptics, the real share sheet, Files-app visibility, actual keyboard
behavior, safe areas on real hardware. Fold these into the on-device smoke
test in `ship-to-iphone` rather than assuming the browser preview told the
whole story.

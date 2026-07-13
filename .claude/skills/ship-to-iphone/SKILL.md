---
name: ship-to-iphone
description: Checklist for installing a build on the physical iPhone, the on-device smoke test, and the free-Apple-ID 7-day re-sign ritual. Use when the user says install, ship, deploy, sync, "put it on my phone", "re-sign", or reports the app suddenly won't open on the device — and after substantive changes that need to reach the phone.
---

# Ship to iPhone

The app is signed with a free Apple ID, so installs come from Xcode on this
Mac and the signature expires after ~7 days. This checklist exists because
half the steps are outside the repo (Xcode, the phone) and easy to fumble.

## Preflight (in the repo)

- [ ] `npm test && npm run lint && npm run build` — all green.
- [ ] Meaningful release? Bump `version` in package.json — it surfaces in
      Settings → About via `__APP_VERSION__` (vite.config.ts) and is how the
      owner tells builds apart on the phone.
- [ ] UI changed? The `pocket-ledger-design` verification loop already ran at
      375px in both themes.

## Build → sync → open

```bash
npm run build && npx cap sync ios && npx cap open ios
```

`cap sync` copies `dist/` into `ios/App/App/public` and refreshes Capacitor
plugins — skipping it ships the *previous* web build, which looks exactly
like "my change didn't work".

## In Xcode

1. Project **App** → Signing & Capabilities → Team = the personal Apple ID.
   (First open resolves Swift packages — give it a moment; SPM mode, no Pods.)
2. Select the plugged-in iPhone as the run target, press **Run** (▶).
3. First install on a device only: the phone blocks the app until
   **Settings → General → VPN & Device Management → trust** the developer
   certificate.

## On-device smoke test

These are the paths a browser cannot verify — walk them after every install:

- [ ] Add an expense → haptic tick fires, toast with **Undo** appears, Undo works.
- [ ] Settings → Export JSON → the iOS share sheet opens (not a download).
- [ ] Files app → On My iPhone → Expense Tracker → `Backups/` is visible and
      today's `auto-backup-*.json` appears after a fresh launch.
- [ ] Open the Add form → keyboard does not cover the inputs (the `--kb`
      inset is doing its job).
- [ ] Settings → About shows the new version number.

## The 7-day re-sign ritual

- **Symptom:** roughly a week after install the app stops opening (or iOS
  shows an "untrusted developer" style block). This is the free-account
  signature expiring — **data is untouched**; IndexedDB and the Backups
  folder survive.
- **Fix:** plug in the iPhone, open the project (`npx cap open ios`), press
  Run. No rebuild of the web bundle is needed unless code changed.
- The $99/year Apple Developer Program extends signing to a year; that is the
  only reason to pay.

## Troubleshooting

- `xcodebuild`/CLI errors about tools → full Xcode must be selected:
  `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
- Stale UI on the phone → `npm run build && npx cap sync ios` was skipped;
  rerun both.
- Package resolution spinning → Xcode → File → Packages → Reset Package
  Caches, then reopen.
- The phone must be unlocked and "Trust This Computer"-ed for Xcode to list
  it as a target.

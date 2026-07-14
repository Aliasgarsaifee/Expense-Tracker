# Expense Tracker

A local-first daily expense tracker that runs as a real app on your own iPhone.
No cloud, no account, no server, no subscription — data lives on the device.

**Stack:** React 19 + TypeScript (Vite) → Dexie over IndexedDB → Recharts →
wrapped with Capacitor 8 (SPM mode, no CocoaPods) → built in Xcode → installed
on your iPhone with a free Apple ID.

**What it tracks per entry:** amount + currency (every active ISO 4217
currency, searchable; INR default; no FX conversion — foreign spends stay in
their own currency), payment method (grouped as Cash / UPI / Credit card /
Debit card, plus custom groups; Cash is the one built-in method — add your
own cards and UPI apps), a category (8 built in, add your own with an emoji),
date, and a free-text note.

## The screens

- **Add** — amount with a currency picker, "paid with" as one chip per
  payment group (a group with several cards opens a picker; last-used
  remembered), category chips with inline "+" to add one, a friendly
  "12 July 2026" date field, note. New cards can be added inline too.
  Each save confirms with a toast (plus a haptic tick on the phone) that
  offers a few seconds of **Undo**.
- **History** — month pager or all-time view with sticky month sections;
  a filter sheet slices by any mix of payment methods, whole payment groups,
  categories, and a date range (OR within each dimension, AND across), plus
  note/amount search — every active filter shows as a dismissible chip. Built
  for reconciling against card/UPI statements: pick a month + a card, compare.
- **Summary** — totals per currency for any window: a day, a month, a year,
  all time, or any range, stepped with ‹ › or picked on a calendar jump sheet
  (tap a day, tap two days for a range, tap a month name or year header;
  data-dotted days, Today/This month/This year/All time shortcuts). Stat
  tiles adapt to the window (daily average, on-pace projection, vs the
  previous period, biggest spend, busiest day/month), an "over time" trend
  chart, and a category chart and by-payment breakdown that tap through to
  the matching History slice.
- **Settings drawer** (☰) — a collapsible group tree of payment methods and
  categories (rename / archive / delete-if-unused, rename your custom groups;
  tap any row to jump to its History), plus default currency,
  exports/imports, auto-backup.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (vitest + fake-indexeddb)
npm run lint       # oxlint
npm run build      # type-check + production build into dist/
```

The data layer (`src/db.ts`), backup format (`src/lib/backup.ts`) and the
money/date/summary/history helpers are all unit-tested. UI lives in
`src/screens/` (Add, History, Summary) with shared pieces in `src/components/`.

## Where the data lives

Everything is stored in IndexedDB (`ExpenseTrackerDB`, schema v4: `expenses` +
`paymentMethods` + `categories`) inside the app's own WKWebView sandbox —
durable, offline, private. Nothing ever leaves the phone unless you export it.

**Backup discipline (non-negotiable):** a lost or reset phone = lost data
unless you exported. From the Settings drawer (☰):

- **Export JSON** after any big batch of edits — this is the real backup
  (expenses, payment methods **and** categories) and can be re-imported
  losslessly (imports merge by id, and same-named methods/categories from a
  different install merge by label, so re-importing never duplicates). Old
  v1/v2 backups import fine.
- **Export CSV** monthly — doubles as your spreadsheet archive
  (`spentOn,amount,currency,category,paymentMethod,note,id,createdAt`).

Both use the iOS share sheet (Files, AirDrop, Mail…) on the phone, or a plain
download in a browser.

### Auto-backup & iCloud

On every launch or foreground (at most once a day) the app writes a JSON
snapshot named `auto-backup-YYYY-MM-DD.json` to its Documents folder and keeps
the last 7 (only files with that exact prefix are ever pruned — anything you
place there yourself is never touched). Because `Info.plist` sets
`UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace`, that folder is
visible in the iOS **Files app → On My iPhone → Expense Tracker → Backups**.
Importing a backup first drops a `pre-import-YYYY-MM-DD.json` safety copy into
the same folder (never auto-pruned), so a wrong-file import is always
reversible.

True iCloud sync (CloudKit / an iCloud Drive container) requires a **paid**
Apple Developer account — it is not available to free personal teams. The $0
alternatives: share-sheet an Export JSON into **Files → iCloud Drive**, or
copy a snapshot out of the Backups folder now and then. Snapshots live inside
the app's sandbox, so deleting the app still deletes them — an exported copy
elsewhere is the only backup that survives that.

## Putting it on your iPhone

One-time setup on the Mac:

1. Install **Xcode** from the Mac App Store (the Command Line Tools alone are
   not enough), then point the tooling at it:
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
2. In Xcode → Settings → Accounts, add your personal (free) Apple ID.

Each install:

```bash
npm run build && npx cap sync ios && npx cap open ios
```

Then in Xcode:

1. Select the **App** project → **Signing & Capabilities** → set **Team** to
   your Apple ID. Xcode will resolve the Swift packages on first open.
2. Plug in the iPhone, pick it as the run target, press **Run** (▶).
3. First launch is blocked: on the phone, go to
   **Settings → General → VPN & Device Management** and **trust** your
   developer certificate, then reopen the app.

### The 7-day re-sign ritual

With a free Apple ID the signing certificate expires after ~7 days and the app
stops opening until you plug in and press Run again (your data is untouched —
only the signature expires). If that gets annoying, the $99/year Apple
Developer Program extends signing to a year. That's the only reason to pay;
no App Store involved.

## App icon & splash

Source art is in `assets/` (SVG → PNG via sharp). The mark is a "pocket
ledger": a clay card tucked into a sage-green pocket on warm sage paper,
with a faint paper grain. Light and dark variants exist — `icon.svg` /
`icon-dark.svg` (1024²) and `splash.svg` / `splash-dark.svg` (2732²). iOS picks
the dark icon and splash automatically in dark mode; the dark app icon is wired
into `AppIcon.appiconset` as an iOS-18 luminosity variant. To regenerate after
editing:

```bash
npx sharp-cli -i assets/icon.svg -o assets/icon.png
npx sharp-cli -i assets/icon-dark.svg -o assets/icon-dark.png
npx sharp-cli -i assets/splash.svg -o assets/splash.png
npx sharp-cli -i assets/splash-dark.svg -o assets/splash-dark.png
npx @capacitor/assets generate --ios --assetPath assets
# capacitor-assets writes only the light app icon and resets Contents.json,
# so re-apply the dark home-screen icon afterwards:
cp assets/icon-dark.png ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-Dark-1024.png
# then re-add the { "luminosity": "dark" } image entry to that Contents.json
```

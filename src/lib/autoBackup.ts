import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { db, listCategories, listPaymentMethods } from '../db'
import { backupToJson } from './backup'
import { todayISO } from './dates'
import { getPref, PREFS, setPref } from './prefs'

const KEEP = 7
// The app's own snapshots carry an "auto-backup-" prefix so the pruner can
// never delete a file the user placed here themselves (their manual exports
// are named "expense-backup-...").
const SNAP_RE = /^auto-backup-\d{4}-\d{2}-\d{2}\.json$/

// Daily safety net: a JSON snapshot lands in the app's Documents folder,
// which Info.plist exposes to the iOS Files app ("On My iPhone"). True
// iCloud sync needs a paid Apple Developer account, so this — plus the
// share-sheet export to iCloud Drive — is the free-account path.
export async function runAutoBackupIfDue(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (!getPref(PREFS.autoBackup, true)) return
  const today = todayISO()
  if (getPref(PREFS.lastAutoBackup, '') === today) return

  const expenses = await db.expenses.toArray()
  if (expenses.length === 0) return // never rotate real snapshots out for empties

  const json = backupToJson({
    expenses,
    paymentMethods: await listPaymentMethods({ includeArchived: true }),
    categories: await listCategories({ includeArchived: true }),
  })
  const todayName = `auto-backup-${today}.json`
  await Filesystem.writeFile({
    path: `Backups/${todayName}`,
    data: json,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  })
  setPref(PREFS.lastAutoBackup, today)

  const { files } = await Filesystem.readdir({
    path: 'Backups',
    directory: Directory.Documents,
  })
  // Never prune the file we just wrote (guards a backward clock change from
  // deleting today's fresh snapshot); keep KEEP-1 of the rest.
  const snaps = files
    .map((f) => f.name)
    .filter((n) => SNAP_RE.test(n) && n !== todayName)
    .sort()
  for (const name of snaps.slice(0, Math.max(0, snaps.length - (KEEP - 1)))) {
    await Filesystem.deleteFile({
      path: `Backups/${name}`,
      directory: Directory.Documents,
    })
  }
}

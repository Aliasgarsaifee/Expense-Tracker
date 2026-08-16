import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

// A cancelled share sheet is not an error, but it also didn't deliver the
// file — callers that stamp "last backed up" state must be able to tell the
// two apart instead of treating a resolved promise as proof of delivery.
export type ExportOutcome = 'saved' | 'cancelled'

// On the phone: write to the app's cache and hand the file to the iOS
// share sheet (Files, AirDrop, Mail...). In a plain browser: download.
export async function exportTextFile(
  filename: string,
  content: string,
  mime: string,
): Promise<ExportOutcome> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    try {
      await Share.share({ title: filename, url: uri, dialogTitle: filename })
    } catch (err) {
      // Dismissing the share sheet rejects; that is not an error.
      if (err instanceof Error && /cancel/i.test(err.message)) return 'cancelled'
      throw err
    }
    return 'saved'
  }

  const file = new File([content], filename, { type: mime })
  // iOS Safari 15+ can hand a file to the real share sheet, which is the only
  // route from an installed PWA to "Save to Files → iCloud Drive". Without
  // this, a PWA export is a download the owner then has to go find.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'saved'
    } catch (err) {
      // Dismissing the sheet rejects with AbortError; that is a decision, not
      // a failure. Anything else falls through to the download so an export
      // never dead-ends.
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled'
    }
  }

  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  // A blob download has no dismiss step — the browser already has the bytes.
  return 'saved'
}

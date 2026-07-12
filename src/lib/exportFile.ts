import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

// On the phone: write to the app's cache and hand the file to the iOS
// share sheet (Files, AirDrop, Mail...). In a plain browser: download.
export async function exportTextFile(
  filename: string,
  content: string,
  mime: string,
): Promise<void> {
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
      if (err instanceof Error && /cancel/i.test(err.message)) return
      throw err
    }
    return
  }

  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

import { rename, rm } from 'fs/promises'

// Swap a freshly written temp file into place. Windows refuses the swap for a moment while
// another program has the target open (a sync client like Nextcloud or OneDrive uploading it, an
// antivirus scan…), so retry briefly before giving up, and never leave the temp file behind.

const RETRIES = 20
const PAUSE_MS = 150

export async function safeRename(temp: string, target: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temp, target)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      const busy = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      if (!busy || attempt >= RETRIES) {
        await rm(temp, { force: true })
        throw err
      }
      await new Promise((r) => setTimeout(r, PAUSE_MS))
    }
  }
}

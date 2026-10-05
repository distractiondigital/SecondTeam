import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { safeRename } from './safeRename'
import { appDataFolder } from './settings'

// The user's app-wide libraries, available in every project:
//   <app data>\poses.json    saved poses     (app data = %LOCALAPPDATA%\SecondTeam on Windows,
//   <app data>\styles.json   style presets    ~/Library/Application Support/SecondTeam on a Mac)
// The UI can only read or replace these files; it never chooses a path.

function libraryPath(file: string): string {
  return join(appDataFolder(), file)
}

export function poseLibraryPath(): string {
  return libraryPath('poses.json')
}

/** `<channel>:load` and `<channel>:save` for one library file. */
function registerLibrary(channel: string, file: string, label: string): void {
  ipcMain.handle(`${channel}:load`, async (): Promise<string | null> => {
    const path = libraryPath(file)
    if (!existsSync(path)) return null
    try {
      return await readFile(path, 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle(`${channel}:save`, async (_e, json: string): Promise<{ ok: true } | { error: string }> => {
    try {
      JSON.parse(json) // refuse anything that isn't JSON
      const path = libraryPath(file)
      await mkdir(dirname(path), { recursive: true })
      const temp = `${path}.tmp`
      await writeFile(temp, json, 'utf-8')
      await safeRename(temp, path)
      return { ok: true }
    } catch (err) {
      return { error: `Couldn't save your ${label}: ${(err as Error).message}` }
    }
  })
}

export function registerPoseLibraryIpc(): void {
  registerLibrary('poses', 'poses.json', 'pose library')
  registerLibrary('styles', 'styles.json', 'style presets')
}

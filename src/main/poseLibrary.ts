import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

// The user's app-wide pose library: %LOCALAPPDATA%\SecondTeam\poses.json.
// The UI can only read or replace this one file; it never chooses the path.

export function poseLibraryPath(): string {
  const base = process.env['LOCALAPPDATA'] ?? join(process.env['USERPROFILE'] ?? '.', 'AppData', 'Local')
  return join(base, 'SecondTeam', 'poses.json')
}

export function registerPoseLibraryIpc(): void {
  ipcMain.handle('poses:load', async (): Promise<string | null> => {
    const file = poseLibraryPath()
    if (!existsSync(file)) return null
    try {
      return await readFile(file, 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle('poses:save', async (_e, json: string): Promise<{ ok: true } | { error: string }> => {
    try {
      JSON.parse(json) // refuse anything that isn't JSON
      const file = poseLibraryPath()
      await mkdir(dirname(file), { recursive: true })
      const temp = `${file}.tmp`
      await writeFile(temp, json, 'utf-8')
      await rename(temp, file)
      return { ok: true }
    } catch (err) {
      return { error: `Couldn't save your pose library: ${(err as Error).message}` }
    }
  })
}

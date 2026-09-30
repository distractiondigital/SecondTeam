import { ipcMain, shell } from 'electron'
import { existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { isSafeId, PASS_FILE_NAMES } from '../shared/passes'
import { isApproved } from './projectFiles'
import { safeRename } from './safeRename'

// Saving a shot's render passes into its project folder:
//   Name.secondteam\scenes\<sceneId>\shots\<shotId>\passes\{clay,depth,normal,id,pose}.png + passes.json
// Only into a folder picked through Save/Open, only those file names, and only plain ids, so the
// UI can't make main write anywhere else.

const PNG_PREFIX = 'data:image/png;base64,'

type Result = { ok: true; path: string } | { error: string }

function passFolder(folder: string, sceneId: unknown, shotId: unknown): string | { error: string } {
  if (!isApproved(folder)) return { error: 'Save the project first: passes are stored inside the project folder.' }
  if (!isSafeId(sceneId) || !isSafeId(shotId)) return { error: 'That shot has an unexpected id.' }
  return join(resolve(folder), 'scenes', sceneId, 'shots', shotId, 'passes')
}

export function registerPassIpc(): void {
  ipcMain.handle(
    'passes:write',
    async (_e, folder: string, sceneId: unknown, shotId: unknown, files: unknown): Promise<Result> => {
      const dir = passFolder(folder, sceneId, shotId)
      if (typeof dir !== 'string') return dir
      if (!files || typeof files !== 'object') return { error: 'No passes to save.' }
      const entries = Object.entries(files as Record<string, unknown>)
      for (const [name, content] of entries) {
        if (!PASS_FILE_NAMES.includes(name) || typeof content !== 'string') return { error: `Unexpected file "${name}".` }
        if (name.endsWith('.png') && !content.startsWith(PNG_PREFIX)) return { error: `"${name}" isn't a PNG.` }
      }
      try {
        await mkdir(dir, { recursive: true })
        for (const [name, content] of entries as [string, string][]) {
          const data = name.endsWith('.png') ? Buffer.from(content.slice(PNG_PREFIX.length), 'base64') : content
          // Temp file, then swap it in, so a half-written file never replaces a good one.
          const target = join(dir, name)
          await writeFile(`${target}.tmp`, data)
          await safeRename(`${target}.tmp`, target)
        }
        return { ok: true, path: dir }
      } catch (err) {
        return { error: `Couldn't save the passes: ${(err as Error).message}` }
      }
    }
  )

  ipcMain.handle('passes:showFolder', async (_e, folder: string, sceneId: unknown, shotId: unknown) => {
    const dir = passFolder(folder, sceneId, shotId)
    if (typeof dir !== 'string') return dir
    if (!existsSync(dir)) return { error: "This shot's passes haven't been saved yet." }
    const problem = await shell.openPath(dir)
    return problem ? { error: problem } : { ok: true }
  })
}

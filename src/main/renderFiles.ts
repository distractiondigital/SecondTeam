import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readdir, readFile, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { isSafeId } from '../shared/passes'
import { isRenderQuality, parseRenderMeta, RENDER_QUALITIES, renderFileNames, type RenderMeta, type RenderQuality } from '../shared/renders'
import { isApproved } from './projectFiles'
import { safeRename } from './safeRename'

// Saved Renders in the project folder (see shared/renders.ts):
//   Name.secondteam\scenes\<sceneId>\shots\<shotId>\render\{draft,final}.{png,json}
// Only into a folder picked through Save/Open, only plain ids and those file names.

const PNG_PREFIX = 'data:image/png;base64,'

export interface SavedRender {
  sceneId: string
  shotId: string
  quality: RenderQuality
  meta: RenderMeta
}

function renderFolder(folder: string, sceneId: unknown, shotId: unknown): string | { error: string } {
  if (!isApproved(folder)) return { error: 'Save the project first: renders are stored inside the project folder.' }
  if (!isSafeId(sceneId) || !isSafeId(shotId)) return { error: 'That shot has an unexpected id.' }
  return join(resolve(folder), 'scenes', sceneId, 'shots', shotId, 'render')
}

async function subfolders(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory() && isSafeId(d.name)).map((d) => d.name)
  } catch {
    return []
  }
}

export function registerRenderIpc(): void {
  ipcMain.handle('renders:write', async (_e, folder: string, sceneId: unknown, shotId: unknown, quality: unknown, png: unknown, meta: unknown) => {
    const dir = renderFolder(folder, sceneId, shotId)
    if (typeof dir !== 'string') return dir
    if (!isRenderQuality(quality)) return { error: 'Unexpected render quality.' }
    if (typeof png !== 'string' || !png.startsWith(PNG_PREFIX)) return { error: "The render isn't a PNG." }
    const info = parseRenderMeta(JSON.stringify(meta))
    if (!info) return { error: 'The render is missing its details.' }
    try {
      await mkdir(dir, { recursive: true })
      const names = renderFileNames(quality)
      for (const [name, data] of [
        [names.image, Buffer.from(png.slice(PNG_PREFIX.length), 'base64')],
        [names.meta, JSON.stringify(info, null, 2)]
      ] as const) {
        // Temp file, then swap it in, so a half-written file never replaces a good one.
        const target = join(dir, name)
        await writeFile(`${target}.tmp`, data)
        await safeRename(`${target}.tmp`, target)
      }
      return { ok: true }
    } catch (err) {
      return { error: `Couldn't save the render: ${(err as Error).message}` }
    }
  })

  /** Every saved render in the project (details only; pictures are read one at a time). */
  ipcMain.handle('renders:list', async (_e, folder: string): Promise<SavedRender[]> => {
    if (!isApproved(folder)) return []
    const scenes = join(resolve(folder), 'scenes')
    const out: SavedRender[] = []
    for (const sceneId of await subfolders(scenes)) {
      for (const shotId of await subfolders(join(scenes, sceneId, 'shots'))) {
        const dir = join(scenes, sceneId, 'shots', shotId, 'render')
        if (!existsSync(dir)) continue
        for (const quality of RENDER_QUALITIES) {
          const names = renderFileNames(quality)
          if (!existsSync(join(dir, names.image))) continue
          try {
            const meta = parseRenderMeta(await readFile(join(dir, names.meta), 'utf-8'))
            if (meta) out.push({ sceneId, shotId, quality, meta })
          } catch {
            // no details: skip it
          }
        }
      }
    }
    return out
  })

  /** One saved render's picture, as a data URL (null if it's gone). */
  ipcMain.handle('renders:read', async (_e, folder: string, sceneId: unknown, shotId: unknown, quality: unknown): Promise<string | null> => {
    const dir = renderFolder(folder, sceneId, shotId)
    if (typeof dir !== 'string' || !isRenderQuality(quality)) return null
    try {
      return PNG_PREFIX + (await readFile(join(dir, renderFileNames(quality).image))).toString('base64')
    } catch {
      return null
    }
  })
}

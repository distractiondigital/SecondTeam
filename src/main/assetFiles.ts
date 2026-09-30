import { clipboard, dialog, ipcMain, nativeImage, type BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { copyFile, mkdir, readFile, writeFile } from 'fs/promises'
import { basename, extname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { isSafeId } from '../shared/passes'
import { isSafeFileName, MAX_REFERENCE_IMAGES } from '../shared/project'
import { isApproved } from './projectFiles'

// Reference images, copied into the project so it stays self-contained:
//   Name.secondteam\assets\cast\<castId>\…   assets\props\<propId>\…   assets\style\…
// Only into a folder picked through Save/Open, only plain ids and file names.

export type AssetKind = 'cast' | 'props' | 'style'
const KINDS: AssetKind[] = ['cast', 'props', 'style']
const THUMB = 160

/** The folder for an entity's images (throws if anything looks wrong). */
export function assetFolder(folder: string, kind: unknown, ownerId: unknown): string {
  if (!isApproved(folder)) throw new Error('Save the project first: reference images are stored in the project folder.')
  if (!KINDS.includes(kind as AssetKind)) throw new Error('Unexpected image kind.')
  if (kind === 'style') return join(resolve(folder), 'assets', 'style')
  if (!isSafeId(ownerId)) throw new Error('Unexpected id.')
  return join(resolve(folder), 'assets', kind as string, ownerId)
}

/** A full path to one reference image, checked. */
export function assetPath(folder: string, kind: unknown, ownerId: unknown, file: unknown): string {
  if (!isSafeFileName(file)) throw new Error('Unexpected image file name.')
  return join(assetFolder(folder, kind, ownerId), file)
}

/** A plain, unique file name for a picked image: its own name, cleaned up, plus a number if taken. */
function freeName(dir: string, original: string): string {
  const ext = extname(original).toLowerCase()
  const stem = basename(original, extname(original)).replace(/[^\w .()-]/g, '_').replace(/^[^\w]+/, '').slice(0, 80) || 'image'
  let name = `${stem}${ext}`
  for (let i = 2; existsSync(join(dir, name)); i++) name = `${stem} (${i})${ext}`
  return name
}

export function registerAssetIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    'assets:add',
    async (_e, folder: string, kind: AssetKind, ownerId: string | null, room: number): Promise<{ files: string[] } | { error: string }> => {
      const win = getWindow()
      if (!win) return { files: [] }
      try {
        const dir = assetFolder(folder, kind, ownerId)
        const result = await dialog.showOpenDialog(win, {
          title: 'Add reference images',
          buttonLabel: 'Add',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]
        })
        if (result.canceled) return { files: [] }
        await mkdir(dir, { recursive: true })
        const files: string[] = []
        for (const source of result.filePaths.slice(0, Math.max(0, Math.min(room, MAX_REFERENCE_IMAGES)))) {
          if (!/\.(png|jpe?g)$/i.test(source)) continue
          const name = freeName(dir, basename(source))
          await copyFile(source, join(dir, name))
          files.push(name)
        }
        return { files }
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )

  // Paste: an image on the clipboard (copied from a browser, a screenshot tool…) is saved as a PNG;
  // image files copied in Explorer are copied in like Add does.
  ipcMain.handle(
    'assets:paste',
    async (_e, folder: string, kind: AssetKind, ownerId: string | null, room: number): Promise<{ files: string[] } | { error: string }> => {
      try {
        const dir = assetFolder(folder, kind, ownerId)
        if (room <= 0) return { error: `That's the most reference images (${MAX_REFERENCE_IMAGES}). Remove one first.` }
        const { png, paths: copied } = await clipboardImages()
        if (!copied.length && !png) return { error: 'The clipboard has no image. Copy an image (or image files in Explorer) first.' }
        await mkdir(dir, { recursive: true })
        const files: string[] = []
        if (copied.length) {
          for (const source of copied.slice(0, room)) {
            const name = freeName(dir, basename(source))
            await copyFile(source, join(dir, name))
            files.push(name)
          }
        } else {
          const name = freeName(dir, `Pasted ${stamp()}.png`)
          await writeFile(join(dir, name), png!)
          files.push(name)
        }
        return { files }
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )

  ipcMain.handle('assets:thumb', async (_e, folder: string, kind: AssetKind, ownerId: string | null, file: string) => {
    try {
      const image = nativeImage.createFromPath(assetPath(folder, kind, ownerId, file))
      if (image.isEmpty()) return null
      return `data:image/jpeg;base64,${image.resize({ width: THUMB, quality: 'good' }).toJPEG(80).toString('base64')}`
    } catch {
      return null
    }
  })
}

/**
 * What's on the clipboard that could be a reference image: image data (copied from a browser or a
 * screenshot tool), or image files copied in Explorer (as file:// links or plain paths).
 */
async function clipboardImages(): Promise<{ png: Buffer | null; paths: string[] }> {
  let png: Buffer | null = null
  const paths: string[] = []
  for (const item of await clipboard.read()) {
    const imageType = item.types.find((t) => t === 'image/png' || t === 'image/jpeg')
    if (imageType && !png) {
      const blob = (await item.getType(imageType)) as Blob
      const bytes = Buffer.from(await blob.arrayBuffer())
      png = imageType === 'image/png' ? bytes : nativeImage.createFromBuffer(bytes).toPNG()
    }
    for (const type of ['text/uri-list', 'text/plain']) {
      if (!item.types.includes(type)) continue
      const text = await ((await item.getType(type)) as Blob).text()
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim().replace(/^"|"$/g, '')
        if (!t) continue
        paths.push(t.startsWith('file:') ? fileURLToPath(t) : t)
      }
    }
  }
  return { png, paths: paths.filter((f) => /\.(png|jpe?g)$/i.test(f) && existsSync(f)) }
}

/** 2026-09-30 14.05.09 (for names of pasted images). */
function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`
}

/** An image's bytes as a PNG (JPEGs are converted). */
export async function readAssetAsPng(folder: string, kind: AssetKind, ownerId: string | null, file: string): Promise<Buffer> {
  const path = assetPath(folder, kind, ownerId, file)
  if (/\.png$/i.test(file)) return readFile(path)
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) throw new Error(`Couldn't read the reference image "${file}".`)
  return image.toPNG()
}

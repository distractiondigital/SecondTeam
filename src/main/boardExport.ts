import { BrowserWindow, ipcMain, nativeImage, shell, type NativeImage } from 'electron'
import { existsSync } from 'fs'
import { copyFile, mkdir, rm, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { appDataFolder } from './settings'
import { exportStamp, freeName, layoutLabel, sequenceFileName } from '../shared/board'
import { boardHtml, imageKey, printedPanels, type BoardExportSpec, type BoardPanelData } from '../shared/boardHtml'
import { isSafeId } from '../shared/passes'
import { takesFolder } from './backend/takeFiles'
import { isApproved } from './projectFiles'
import { safeRename } from './safeRename'

// Storyboard exports, into the project's exports\ folder:
//   Storyboard <date time> Grid 3.pdf  (Electron prints our HTML pages to PDF; no extra libraries)
//   Storyboard <date time> PNGs\001 - 1A.png  (the full-resolution circle takes, in board order)
// In Clay mode the UI renders each shot's clay picture and sends it along ("… Clay.pdf", "… Clay PNGs").
// Only into a folder picked through Save/Open; takes are read only from the project's own takes.

const PRINT_WIDTH = 1600 // px: plenty for a printed frame, keeps the PDF small

type Result = { ok: true; path: string } | { error: string }

function exportsFolder(folder: string): string {
  if (!isApproved(folder)) throw new Error('Save the project first: exports go in the project folder.')
  return join(resolve(folder), 'exports')
}

/** A take's PNG on disk (checked: approved project, plain ids). */
function takePath(folder: string, sceneId: string, shotId: string, takeId: string): string | null {
  if (!isSafeId(takeId)) return null
  const file = join(takesFolder(folder, sceneId, shotId), `${takeId}.png`)
  return existsSync(file) ? file : null
}

function tempFolder(): string {
  return join(appDataFolder(), 'tmp')
}

/** A clay render the UI sent: only a PNG data URL, decoded by Electron (never written as given). */
function clayImage(spec: BoardExportSpec, shotId: string): NativeImage | null {
  const url = spec.clayImages?.[shotId]
  if (typeof url !== 'string' || !url.startsWith('data:image/png;base64,')) return null
  const image = nativeImage.createFromDataURL(url)
  return image.isEmpty() ? null : image
}

/** A panel's picture: in AI, its circle take from the project, else (no take, or Clay) its clay render. */
function panelImage(folder: string, spec: BoardExportSpec, p: BoardPanelData): NativeImage | null {
  if (spec.source === 'ai') {
    const file = p.takeId ? takePath(folder, p.sceneId, p.shotId, p.takeId) : null
    const image = file ? nativeImage.createFromPath(file) : null
    if (image && !image.isEmpty()) return image
  }
  return clayImage(spec, p.shotId)
}

async function exportPdf(folder: string, spec: BoardExportSpec): Promise<Result> {
  const out = exportsFolder(folder)
  // Downscaled JPEGs of the pictures, embedded in the page.
  const images: Record<string, string> = {}
  for (const p of printedPanels(spec)) {
    const key = imageKey(spec, p)
    const image = panelImage(folder, spec, p)
    if (!image) continue
    const scaled = image.getSize().width > PRINT_WIDTH ? image.resize({ width: PRINT_WIDTH, quality: 'best' }) : image
    images[key] = `data:image/jpeg;base64,${scaled.toJPEG(88).toString('base64')}`
  }

  const tmp = tempFolder()
  await mkdir(tmp, { recursive: true })
  const htmlFile = join(tmp, `board-${Date.now()}.html`)
  await writeFile(htmlFile, boardHtml(spec, images), 'utf-8')
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await win.loadFile(htmlFile)
    const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
    await mkdir(out, { recursive: true })
    const label = `${exportStamp()} ${layoutLabel(spec.layout, spec.perPage)}${spec.source === 'clay' ? ' Clay' : ''}`
    const name = freeName(label, (n) => existsSync(join(out, `${n}.pdf`)))
    const target = join(out, `${name}.pdf`)
    await writeFile(`${target}.tmp`, pdf)
    await safeRename(`${target}.tmp`, target)
    return { ok: true, path: target }
  } finally {
    win.destroy()
    await rm(htmlFile, { force: true })
  }
}

async function exportPngs(folder: string, spec: BoardExportSpec): Promise<Result> {
  const out = exportsFolder(folder)
  const dir = join(out, freeName(`${exportStamp()} ${spec.source === 'clay' ? 'Clay PNGs' : 'PNGs'}`, (n) => existsSync(join(out, n))))
  await mkdir(dir, { recursive: true })
  let n = 0
  // Every shot: its full-resolution circle take (AI), else its clay render.
  for (const p of spec.panels) {
    const name = join(dir, sequenceFileName(n, p.shotName))
    const take = spec.source === 'ai' && p.takeId ? takePath(folder, p.sceneId, p.shotId, p.takeId) : null
    if (take) await copyFile(take, name)
    else {
      const image = clayImage(spec, p.shotId)
      if (!image) continue
      await writeFile(name, image.toPNG())
    }
    n++
  }
  return n ? { ok: true, path: dir } : { error: 'No pictures to export yet.' }
}

export function registerBoardIpc(): void {
  ipcMain.handle('board:exportPdf', async (_e, folder: string, spec: BoardExportSpec): Promise<Result> => {
    try {
      return await exportPdf(folder, spec)
    } catch (err) {
      return { error: `Couldn't export the PDF: ${(err as Error).message}` }
    }
  })
  ipcMain.handle('board:exportPngs', async (_e, folder: string, spec: BoardExportSpec): Promise<Result> => {
    try {
      return await exportPngs(folder, spec)
    } catch (err) {
      return { error: `Couldn't export the PNGs: ${(err as Error).message}` }
    }
  })
  ipcMain.handle('board:show', (_e, folder: string, path: string) => {
    // Only things inside this project's exports folder.
    const out = exportsFolder(folder)
    if (!resolve(path).toLowerCase().startsWith(out.toLowerCase())) return
    shell.showItemInFolder(path)
  })
  // Opening the exported PDF in the user's PDF viewer.
  ipcMain.handle('board:open', async (_e, folder: string, path: string) => {
    const out = exportsFolder(folder)
    if (!resolve(path).toLowerCase().startsWith(out.toLowerCase()) || !existsSync(path)) return
    await shell.openPath(path)
  })
}

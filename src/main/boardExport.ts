import { BrowserWindow, ipcMain, nativeImage, shell } from 'electron'
import { existsSync } from 'fs'
import { copyFile, mkdir, rm, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { exportStamp, freeName, layoutLabel, sequenceFileName } from '../shared/board'
import { boardHtml, printedPanels, type BoardExportSpec } from '../shared/boardHtml'
import { isSafeId } from '../shared/passes'
import { takesFolder } from './backend/takeFiles'
import { isApproved } from './projectFiles'
import { safeRename } from './safeRename'

// Storyboard exports, into the project's exports\ folder:
//   Storyboard <date time> Grid 3.pdf  (Electron prints our HTML pages to PDF; no extra libraries)
//   Storyboard <date time> PNGs\001 - 1A.png  (the full-resolution circle takes, in board order)
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
  const base = process.env['LOCALAPPDATA'] ?? join(process.env['USERPROFILE'] ?? '.', 'AppData', 'Local')
  return join(base, 'SecondTeam', 'tmp')
}

async function exportPdf(folder: string, spec: BoardExportSpec): Promise<Result> {
  const out = exportsFolder(folder)
  // Downscaled JPEGs of the circle takes, embedded in the page.
  const images: Record<string, string> = {}
  for (const p of printedPanels(spec)) {
    if (!p.takeId) continue
    const file = takePath(folder, p.sceneId, p.shotId, p.takeId)
    if (!file) continue
    const image = nativeImage.createFromPath(file)
    if (image.isEmpty()) continue
    const scaled = image.getSize().width > PRINT_WIDTH ? image.resize({ width: PRINT_WIDTH, quality: 'best' }) : image
    images[p.takeId] = `data:image/jpeg;base64,${scaled.toJPEG(88).toString('base64')}`
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
    const name = freeName(`${exportStamp()} ${layoutLabel(spec.layout, spec.perPage)}`, (n) => existsSync(join(out, `${n}.pdf`)))
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
  const panels = spec.panels.filter((p) => p.takeId)
  if (!panels.length) return { error: 'No shot has a circle take yet.' }
  const out = exportsFolder(folder)
  const dir = join(out, freeName(`${exportStamp()} PNGs`, (n) => existsSync(join(out, n))))
  await mkdir(dir, { recursive: true })
  let n = 0
  for (const p of panels) {
    const file = takePath(folder, p.sceneId, p.shotId, p.takeId!)
    if (!file) continue
    await copyFile(file, join(dir, sequenceFileName(n++, p.shotName)))
  }
  return { ok: true, path: dir }
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

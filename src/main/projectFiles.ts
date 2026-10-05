import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { basename, join, resolve } from 'path'
import { safeRename } from './safeRename'
import { describeRecent, isRecent, loadRecent, saveRecent, withoutRecent, withRecent, type RecentProject } from './recentProjects'

// Saving and opening project folders (Name.secondteam\project.json).
// The UI never passes arbitrary paths to write to: main only writes into folders the user
// picked through a Save or Open dialog in this session.

const PROJECT_EXT = '.secondteam'
const PROJECT_FILE = 'project.json'
const SUBFOLDERS = ['assets/cast', 'assets/props', 'assets/style', 'scenes', 'exports']

const approvedFolders = new Set<string>()

export type OpenResult = { path: string; json: string } | { error: string } | null
export type SaveAsResult = { path: string; name: string } | null
export type WriteResult = { ok: true } | { error: string }

function approve(folder: string): string {
  const full = resolve(folder)
  approvedFolders.add(full.toLowerCase())
  return full
}

export function isApproved(folder: string): boolean {
  return approvedFolders.has(resolve(folder).toLowerCase())
}

/** Remember a project as opened or saved just now (for the start screen and Open ▾). */
async function remember(folder: string): Promise<void> {
  try {
    await saveRecent(withRecent(loadRecent(), folder))
  } catch {
    // Not worth failing a save or an open over.
  }
}

/** Read a project folder the user chose (or picked from the recent list) and approve it for saving. */
async function readProjectFolder(folder: string): Promise<OpenResult> {
  const file = join(folder, PROJECT_FILE)
  if (!existsSync(file)) {
    return {
      error: `"${basename(folder)}" isn't a Second Team project (there's no project.json inside). Choose the folder that ends in ${PROJECT_EXT}.`
    }
  }
  try {
    const json = await readFile(file, 'utf-8')
    const path = approve(folder)
    await remember(path)
    return { path, json }
  } catch (err) {
    return { error: `Couldn't read project.json: ${(err as Error).message}` }
  }
}

async function ensureStructure(folder: string): Promise<void> {
  for (const sub of SUBFOLDERS) await mkdir(join(folder, sub), { recursive: true })
}

function stripExt(name: string): string {
  return name.toLowerCase().endsWith(PROJECT_EXT) ? name.slice(0, -PROJECT_EXT.length) : name
}

export function registerProjectIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('project:saveAs', async (_e, suggestedName: string): Promise<SaveAsResult> => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      title: 'Save project',
      buttonLabel: 'Save',
      defaultPath: join(app.getPath('documents'), `${suggestedName || 'Untitled'}${PROJECT_EXT}`),
      properties: ['createDirectory', 'showOverwriteConfirmation']
    })
    if (result.canceled || !result.filePath) return null

    const name = stripExt(basename(result.filePath)).trim() || 'Untitled'
    const folder = join(resolve(result.filePath, '..'), `${name}${PROJECT_EXT}`)
    if (existsSync(join(folder, PROJECT_FILE))) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Replace', 'Cancel'],
        noLink: true,
        defaultId: 1,
        cancelId: 1,
        title: 'Replace project?',
        message: `A project called "${name}" already exists in that folder.`,
        detail: 'Replacing it overwrites its project.json. Reference images and takes in the folder are kept.'
      })
      if (response !== 0) return null
    }
    await ensureStructure(folder)
    return { path: approve(folder), name }
  })

  ipcMain.handle('project:open', async (): Promise<OpenResult> => {
    const win = getWindow()
    if (!win) return null
    // Development only: SECONDTEAM_OPEN=<folder> opens that project without the dialog (for
    // automated testing over the debugger). Never used by the installed app.
    const forced = !app.isPackaged ? process.env['SECONDTEAM_OPEN'] : undefined
    const result = forced
      ? { canceled: false, filePaths: [forced] }
      : await dialog.showOpenDialog(win, {
          title: 'Open project: choose a .secondteam folder',
          buttonLabel: 'Open project',
          defaultPath: app.getPath('documents'),
          properties: ['openDirectory']
        })
    if (result.canceled || result.filePaths.length === 0) return null
    return readProjectFolder(result.filePaths[0])
  })

  // Recent projects. Only folders main itself put on the list can be opened this way.
  ipcMain.handle('project:recent', (): RecentProject[] => describeRecent(loadRecent()))
  ipcMain.handle('project:openRecent', async (_e, folder: string): Promise<OpenResult> => {
    if (typeof folder !== 'string' || !isRecent(loadRecent(), folder)) return { error: 'That project is no longer in the recent list.' }
    return readProjectFolder(resolve(folder))
  })
  ipcMain.handle('project:forgetRecent', async (_e, folder: string): Promise<void> => {
    if (typeof folder === 'string') await saveRecent(withoutRecent(loadRecent(), folder))
  })

  ipcMain.handle('project:write', async (_e, folder: string, json: string): Promise<WriteResult> => {
    if (!isApproved(folder)) return { error: 'That folder was not chosen through Save or Open.' }
    try {
      await ensureStructure(folder)
      // Write to a temp file first, then swap it in, so a crash mid-save can't corrupt project.json.
      const target = join(folder, PROJECT_FILE)
      const temp = `${target}.tmp`
      await writeFile(temp, json, 'utf-8')
      await safeRename(temp, target)
      await remember(folder)
      return { ok: true }
    } catch (err) {
      return { error: `Couldn't save: ${(err as Error).message}` }
    }
  })

  ipcMain.handle('dialog:confirmDiscard', async (_e, projectName: string): Promise<'save' | 'discard' | 'cancel'> => {
    const win = getWindow()
    if (!win) return 'cancel'
    return askToSave(win, projectName)
  })

  ipcMain.handle('dialog:error', async (_e, message: string): Promise<void> => {
    const win = getWindow()
    if (win) await dialog.showMessageBox(win, { type: 'error', title: 'Second Team', message })
  })
}

export async function askToSave(win: BrowserWindow, projectName: string): Promise<'save' | 'discard' | 'cancel'> {
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Save', "Don't save", 'Cancel'],
    noLink: true,
    defaultId: 0,
    cancelId: 2,
    title: 'Unsaved changes',
    message: `Save changes to "${projectName}"?`,
    detail: "If you don't save, your changes since the last save will be lost."
  })
  return (['save', 'discard', 'cancel'] as const)[response]
}

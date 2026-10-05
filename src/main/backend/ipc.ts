import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { chosenIds, hasCheckpoint, installItems, type Manifest } from '../../shared/backendManifest'
import type { SetupInfo, SetupProgress, VerifyResult } from '../../shared/setup'
import type { BackendStatus, GenerationEvent, GenerationJob } from '../../shared/takes'
import { cleanComfyUrl, defaultBackendDir, loadSettings, saveSettings, type AppSettings } from '../settings'
import { ComfyProcess } from './comfyProcess'
import { ComfyBackend, type GenerationBackend } from './generation'
import { checkSystem, findExistingInstall, install, installStates, isReady, partialBytes, removeDamaged, verify } from './installer'
import { deleteTake, listTakes, readTake, takesFolder } from './takeFiles'

// Starts the managed ComfyUI with the app and exposes generation to the UI over IPC, plus the
// setup wizard / engine settings: checking this PC, choosing the folder, installing and repairing.
// The UI never talks to ComfyUI itself (its Content-Security-Policy blocks all network access),
// and never passes the backend's file paths: folders are chosen through the main process's dialogs.

let comfy: ComfyProcess | null = null
let backend: GenerationBackend | null = null

export function registerBackendIpc(getWindow: () => BrowserWindow | null): void {
  const root = app.getAppPath()
  const send = (channel: string, payload: unknown) => getWindow()?.webContents.send(channel, payload)
  const manifest = JSON.parse(readFileSync(join(root, 'backend', 'manifest.json'), 'utf-8')) as Manifest
  const items = installItems(manifest)
  let settings: AppSettings = loadSettings()
  const defaultDir = defaultBackendDir(app.isPackaged, root)
  const backendDir = () => settings.backendDir ?? defaultDir
  const update = async (patch: Partial<AppSettings>) => {
    settings = { ...settings, ...patch }
    await saveSettings(settings)
  }

  comfy = new ComfyProcess(
    backendDir(),
    join(process.env['LOCALAPPDATA'] ?? app.getPath('appData'), 'SecondTeam', 'logs'),
    (status: BackendStatus) => send('backend:status', status)
  )
  backend = new ComfyBackend(comfy, join(root, 'backend'))

  // ---------- Setup wizard / engine settings ----------

  let installing: AbortController | null = null
  const progress = (p: SetupProgress) => send('setup:progress', p)
  const restartEngine = () => {
    if (!installing) void comfy!.configure(backendDir(), settings.externalComfyUrl)
  }

  const info = (): SetupInfo => {
    const dir = backendDir()
    return {
      dir,
      isDefaultDir: dir === defaultDir,
      externalUrl: settings.externalComfyUrl,
      skipped: settings.setupSkipped,
      items,
      states: installStates(manifest, dir),
      partial: partialBytes(manifest, dir),
      ready: isReady(manifest, dir),
      installing: installing !== null
    }
  }

  /** Install `ids` in the background, then (re)start the engine from that folder. */
  const runInstall = (ids: string[]): { ok: true } | { error: string } => {
    if (installing) return { error: 'Already installing.' }
    const dir = backendDir()
    const controller = new AbortController()
    installing = controller
    // The engine can't be replaced while it runs from this folder.
    const engineMissing = installStates(manifest, dir)[manifest.comfyui.id] !== 'installed'
    if (ids.includes(manifest.comfyui.id) && engineMissing && comfy!.dir === dir) comfy!.stop()
    void (async () => {
      let result: 'done' | 'paused' | 'failed' = 'failed'
      try {
        result = await install(manifest, dir, ids, progress, controller.signal)
      } catch {
        // already reported through progress
      } finally {
        installing = null
        // A new engine needs starting; new models just need the engine to look again.
        if (result === 'done' && (engineMissing || comfy!.current.state !== 'ready')) restartEngine()
        send('setup:info', info())
      }
    })()
    return { ok: true }
  }

  ipcMain.handle('setup:info', () => info())
  ipcMain.handle('setup:check', () => checkSystem(backendDir()))

  ipcMain.handle('setup:chooseFolder', async (_e, kind: 'install' | 'existing') => {
    if (installing) return { error: 'Pause the download first.' }
    const win = getWindow()
    const options: Electron.OpenDialogOptions = {
      title: kind === 'existing' ? 'Choose the folder that has the AI engine and models' : 'Choose where to install the AI engine and models',
      defaultPath: existsSync(backendDir()) ? backendDir() : undefined,
      properties: ['openDirectory', 'createDirectory']
    }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (picked.canceled || !picked.filePaths[0]) return { cancelled: true }
    const chosen = picked.filePaths[0]
    if (kind === 'existing') {
      const found = findExistingInstall(chosen)
      if (!found) {
        return { error: "That folder doesn't have the AI engine in it (no python_embeded and ComfyUI folders). Pick the folder that contains them." }
      }
      await update({ backendDir: found })
    } else {
      // A drive or a folder with other things in it: keep ours in its own subfolder.
      const usable = findExistingInstall(chosen) ?? (readdirSync(chosen).length === 0 ? chosen : join(chosen, 'Second Team AI'))
      await update({ backendDir: usable })
    }
    restartEngine()
    return { ok: true, info: info() }
  })

  ipcMain.handle('setup:useDefaultFolder', async () => {
    if (installing) return info()
    await update({ backendDir: null })
    restartEngine()
    return info()
  })

  ipcMain.handle('setup:start', (_e, ticked: unknown) => {
    const ids = chosenIds(items, Array.isArray(ticked) ? ticked.filter((t): t is string => typeof t === 'string') : [])
    const states = installStates(manifest, backendDir())
    if (!hasCheckpoint(items, ids) && !items.some((i) => i.kind === 'checkpoint' && states[i.id] === 'installed')) {
      return { error: 'Choose at least one model (RealVisXL or SDXL 1.0): it is what draws the pictures.' }
    }
    return runInstall(ids)
  })

  ipcMain.handle('setup:pause', () => {
    installing?.abort()
    return { ok: true }
  })

  ipcMain.handle('setup:skip', async (_e, skipped: boolean) => {
    await update({ setupSkipped: skipped === true })
    return info()
  })

  // Repair: check everything (with `full`, recompute model checksums), then re-download what's
  // damaged plus any required piece that's missing. Models never installed stay uninstalled.
  ipcMain.handle('backend:repair', async (_e, full: boolean) => {
    if (installing) return { error: 'Already installing.' }
    const dir = backendDir()
    const controller = new AbortController()
    installing = controller
    let result: VerifyResult
    try {
      result = await verify(manifest, dir, full === true, progress, controller.signal)
    } catch {
      return { error: 'The check was stopped.' }
    } finally {
      installing = null
    }
    await removeDamaged(manifest, dir, result.damaged)
    const ids = items.filter((i) => result.states[i.id] === 'damaged' || (result.states[i.id] === 'missing' && i.required)).map((i) => i.id)
    if (!ids.length) {
      progress({ phase: 'finished', id: null, itemDone: 0, itemTotal: 0, overallDone: 0, overallTotal: 0, speed: 0, message: 'Everything checks out.' })
      send('setup:info', info())
      return { ok: true, repaired: [] }
    }
    const started = runInstall(ids)
    return 'error' in started ? started : { ok: true, repaired: ids }
  })

  ipcMain.handle('backend:setExternal', async (_e, url: string | null) => {
    const clean = url === null ? null : cleanComfyUrl(url)
    if (url !== null && !clean) return { error: 'Use an address on this PC, like http://127.0.0.1:8188' }
    await update({ externalComfyUrl: clean })
    restartEngine()
    return info()
  })

  ipcMain.handle('backend:openFolder', async () => {
    if (existsSync(backendDir())) await shell.openPath(backendDir())
  })

  // ---------- Engine + generation ----------

  ipcMain.handle('backend:status', () => comfy!.current)
  ipcMain.handle('backend:restart', () => comfy!.restart())
  ipcMain.handle('backend:openLog', async () => {
    const problem = await shell.openPath(comfy!.current.logFile)
    return problem ? { error: problem } : { ok: true }
  })
  ipcMain.handle('backend:models', async () => {
    try {
      return await backend!.models()
    } catch {
      return []
    }
  })

  ipcMain.handle('generate:start', (_e, job: GenerationJob) => {
    // Runs in the background; progress arrives as 'generate:event' messages.
    void backend!.generate(job, (event: GenerationEvent) => send('generate:event', event))
    return { ok: true }
  })
  ipcMain.handle('generate:cancel', () => backend!.cancel())

  ipcMain.handle('takes:list', async (_e, folder: string, sceneId: string, shotId: string) => {
    try {
      return await listTakes(takesFolder(folder, sceneId, shotId))
    } catch {
      return []
    }
  })
  ipcMain.handle('takes:read', async (_e, folder: string, sceneId: string, shotId: string, takeId: string) => {
    try {
      return await readTake(takesFolder(folder, sceneId, shotId), takeId)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('takes:delete', async (_e, folder: string, sceneId: string, shotId: string, takeId: string) => {
    try {
      await deleteTake(takesFolder(folder, sceneId, shotId), takeId)
      return { ok: true }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  void comfy.configure(backendDir(), settings.externalComfyUrl)
}

/** Stop ComfyUI (called when the app quits). */
export function stopBackend(): void {
  comfy?.stop()
}

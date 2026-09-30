import { app, ipcMain, shell, type BrowserWindow } from 'electron'
import { join } from 'path'
import type { BackendStatus, GenerationEvent, GenerationJob } from '../../shared/takes'
import { ComfyProcess } from './comfyProcess'
import { ComfyBackend, type GenerationBackend } from './generation'
import { deleteTake, listTakes, readTake, takesFolder } from './takeFiles'

// Starts the managed ComfyUI with the app and exposes generation to the UI over IPC.
// The UI never talks to ComfyUI itself (its Content-Security-Policy blocks all network access).

let comfy: ComfyProcess | null = null
let backend: GenerationBackend | null = null

export function registerBackendIpc(getWindow: () => BrowserWindow | null): void {
  const root = app.getAppPath()
  const send = (channel: string, payload: unknown) => getWindow()?.webContents.send(channel, payload)
  comfy = new ComfyProcess(
    join(root, 'ComfyUI'),
    join(process.env['LOCALAPPDATA'] ?? app.getPath('appData'), 'SecondTeam', 'logs'),
    (status: BackendStatus) => send('backend:status', status)
  )
  backend = new ComfyBackend(comfy, join(root, 'backend'))

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

  void comfy.start()
}

/** Stop ComfyUI (called when the app quits). */
export function stopBackend(): void {
  comfy?.stop()
}

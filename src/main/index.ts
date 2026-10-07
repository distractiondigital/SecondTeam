import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { registerAssetIpc } from './assetFiles'
import { registerBoardIpc } from './boardExport'
import { registerFigureIpc } from './figureFiles'
import { registerBackendIpc, stopBackend } from './backend/ipc'
import { registerPassIpc } from './passFiles'
import { registerRenderIpc } from './renderFiles'
import { registerPoseLibraryIpc } from './poseLibrary'
import { askToSave, registerProjectIpc } from './projectFiles'
import { appDataFolder, gpuVendorName, loadSettings, prefersOpenGl, updateSettings } from './settings'
import { isMac, onRealMac } from './platform'
import { cancelUpdateInstall, installUpdateNow, registerUpdates, updateWaitingToInstall } from './updates'

// Keep Electron's own cache and settings in the app's folder (Windows %LOCALAPPDATA%\SecondTeam,
// not the default %APPDATA%; Mac ~/Library/Application Support/SecondTeam). Must run before ready.
app.setPath('userData', join(appDataFolder(), 'app-data'))

// Graphics backend. On Windows with an NVIDIA card, OpenGL instead of Direct3D: it compiles the
// Render's path tracer about 5x faster (seconds instead of half a minute or more) and freezes the
// app far less while it does. The card is noted on each start, so this applies from the next one;
// if the graphics process ever crashes on OpenGL, the PC goes back to Direct3D for good.
// (Development only: SECONDTEAM_ANGLE=gl|d3d11 forces one, to compare.)
const startupSettings = loadSettings()
const forcedBackend = !app.isPackaged ? process.env['SECONDTEAM_ANGLE'] : undefined
const openGl = forcedBackend ? forcedBackend === 'gl' : prefersOpenGl(startupSettings, process.platform)
if (forcedBackend) app.commandLine.appendSwitch('use-angle', forcedBackend)
else if (openGl) app.commandLine.appendSwitch('use-angle', 'gl')

// Only one copy of the app at a time. A second launch just focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

// Unsaved-changes state, reported by the UI.
let hasUnsavedChanges = false
let projectName = 'Untitled'
let closeConfirmed = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 960,
    minHeight: 600,
    title: 'Second Team',
    backgroundColor: '#1b1c1f',
    // No visible menu bar, and Alt never shows it (Alt+drag orbits the view). Its shortcuts still work.
    autoHideMenuBar: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Local-only app: never open new windows or navigate away to outside pages.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })

  mainWindow.on('close', async (event) => {
    if (closeConfirmed || !hasUnsavedChanges || !mainWindow) return
    event.preventDefault()
    const choice = await askToSave(mainWindow, projectName)
    if (choice === 'cancel') cancelUpdateInstall()
    if (choice === 'discard') {
      closeConfirmed = true
      mainWindow.close()
    } else if (choice === 'save') {
      // The UI saves (possibly asking where), then calls app:closeNow if it succeeded.
      mainWindow.webContents.send('app:saveAndClose')
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // In dev, electron-vite serves the UI with hot reload; in a build, load the bundled file.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(() => {
  // No built-in shortcuts beyond what's needed: Electron's default menu would close the window on
  // Ctrl+W and reload it on Ctrl+R (losing unsaved work). The app's own shortcuts live in the UI.
  // Windows: no menu at all (copy/paste in text boxes works without one). Mac: the app menu
  // (About, Hide, Quit ⌘Q, which still asks about unsaved changes) and Cut/Copy/Paste/Select All,
  // which typing needs there; no Undo or Close items, so ⌘Z stays the app's own and there's no ⌘W.
  // Development adds Reload and DevTools.
  const template: Electron.MenuItemConstructorOptions[] = []
  if (onRealMac) {
    template.push({ role: 'appMenu' })
    template.push({ label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] })
  }
  if (!app.isPackaged) template.push({ label: 'Develop', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }] })
  Menu.setApplicationMenu(template.length ? Menu.buildFromTemplate(template) : null)
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.on('app:platform', (e) => (e.returnValue = isMac ? 'mac' : 'win'))
  ipcMain.on('app:setUnsaved', (_e, unsaved: boolean, name: string) => {
    hasUnsavedChanges = unsaved
    projectName = name
  })
  ipcMain.on('app:closeNow', () => {
    closeConfirmed = true
    mainWindow?.close()
  })
  registerProjectIpc(() => mainWindow)
  registerPoseLibraryIpc()
  registerPassIpc()
  registerRenderIpc()
  registerAssetIpc(() => mainWindow)
  registerBoardIpc()
  registerFigureIpc()
  createWindow()
  // Start the AI engine (ComfyUI) in the background; the UI shows its status.
  registerBackendIpc(() => mainWindow)
  registerUpdates(() => mainWindow)
  // Note the graphics card for the next start (see the graphics backend above).
  void app.getGPUInfo('basic').then((info) => {
    const devices = (info as { gpuDevice?: { vendorId?: number; active?: boolean }[] }).gpuDevice ?? []
    const id = (devices.find((d) => d.active) ?? devices[0])?.vendorId
    if (typeof id !== 'number') return
    const vendor = gpuVendorName(id)
    if (vendor !== loadSettings().gpuVendor) void updateSettings({ gpuVendor: vendor })
  })
})

app.on('child-process-gone', (_e, details) => {
  if (details.type === 'GPU' && openGl && ['crashed', 'oom', 'launch-failed', 'integrity-failure', 'abnormal-exit'].includes(details.reason)) {
    void updateSettings({ openGlFailed: true })
  }
})

app.on('window-all-closed', () => {
  // "Restart and update" closes the window first (asking about unsaved changes), then installs.
  if (updateWaitingToInstall()) installUpdateNow()
  else app.quit()
})

// Never leave ComfyUI running after the app is gone.
app.on('will-quit', () => stopBackend())

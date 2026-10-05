import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { registerAssetIpc } from './assetFiles'
import { registerBoardIpc } from './boardExport'
import { registerFigureIpc } from './figureFiles'
import { registerBackendIpc, stopBackend } from './backend/ipc'
import { registerPassIpc } from './passFiles'
import { registerPoseLibraryIpc } from './poseLibrary'
import { askToSave, registerProjectIpc } from './projectFiles'

// Keep Electron's own cache and settings in %LOCALAPPDATA%\SecondTeam (not the default %APPDATA%).
// Must run before the app is ready.
app.setPath('userData', join(process.env['LOCALAPPDATA'] ?? app.getPath('appData'), 'SecondTeam', 'app-data'))

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
  // No built-in menu shortcuts: Electron's default menu would close the window on Ctrl+W and reload
  // it on Ctrl+R (losing unsaved work). The app's own shortcuts live in the UI; typing shortcuts
  // (copy, paste, select all) still work in text boxes. Development keeps reload and DevTools.
  // (The Mac version will need an Edit menu for copy/paste.)
  Menu.setApplicationMenu(
    app.isPackaged
      ? null
      : Menu.buildFromTemplate([
          { label: 'Develop', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }] }
        ])
  )
  ipcMain.handle('app:getVersion', () => app.getVersion())
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
  registerAssetIpc(() => mainWindow)
  registerBoardIpc()
  registerFigureIpc()
  createWindow()
  // Start the AI engine (ComfyUI) in the background; the UI shows its status.
  registerBackendIpc(() => mainWindow)
})

app.on('window-all-closed', () => {
  app.quit()
})

// Never leave ComfyUI running after the app is gone.
app.on('will-quit', () => stopBackend())

import { app, ipcMain, net, shell, type BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import electronUpdater from 'electron-updater'
import {
  newestRelease,
  RELEASES_OWNER,
  RELEASES_PAGE,
  RELEASES_REPO,
  type GithubRelease,
  type UpdateState
} from '../shared/updates'
import { loadSettings, updateSettings } from './settings'

// App updates. The one network call besides downloading the AI engine: asking GitHub for this
// project's releases (nothing about the user or their work is sent).
//   Windows installer: electron-updater reads the release's latest.yml, downloads the installer
//   (checked against its sha512) into %LOCALAPPDATA%\SecondTeam\updates, and on "Restart and
//   update" runs it (Windows' admin prompt: the app is installed for all users) and reopens.
//   Elsewhere (Mac, which can't self-update without a paid Apple certificate; dev builds): a check
//   of GitHub's release list, and Download opens the release page in the browser.
// Nothing downloads or installs without a click. Checks on launch can be turned off.

const { autoUpdater } = electronUpdater

let getWindow: () => BrowserWindow | null = () => null
let state: UpdateState
let releasePage = RELEASES_PAGE
let installAfterClose = false

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  getWindow()?.webContents.send('updates:changed', state)
}

/** GitHub's release notes (simple HTML from latest.yml, or Markdown from the API) as plain text. */
function plainNotes(notes: unknown): string | null {
  const text = Array.isArray(notes)
    ? notes.map((n: { note?: string | null }) => n.note ?? '').join('\n\n')
    : typeof notes === 'string'
      ? notes
      : ''
  const plain = text
    .replace(/<br\s*\/?>|<\/(p|li|h\d)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return plain || null
}

/** A plain-words reason for a failed check or download. */
function reason(error: unknown): string {
  const text = String((error as Error)?.message ?? error)
  if (/latest\.yml|404|Cannot find/i.test(text)) return "The latest release doesn't have update information yet."
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|net::|getaddrinfo|network/i.test(text)) return "Couldn't reach GitHub. Check the internet connection."
  if (/sha512|checksum/i.test(text)) return 'The download was damaged (it failed its check). Try again.'
  return 'Something went wrong while checking for updates.'
}

/** This build installs updates itself (the Windows installer), or a dev test config is given. */
function selfUpdating(): boolean {
  if (process.platform !== 'win32') return false
  if (app.isPackaged) return true
  return Boolean(process.env['SECONDTEAM_UPDATE_TEST'])
}

async function checkReleaseList(): Promise<void> {
  const res = await net.fetch(`https://api.github.com/repos/${RELEASES_OWNER}/${RELEASES_REPO}/releases?per_page=30`, {
    headers: { Accept: 'application/vnd.github+json' }
  })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const newest = newestRelease(app.getVersion(), (await res.json()) as GithubRelease[])
  if (!newest) {
    set({ status: 'none', version: null, notes: null, error: null })
    return
  }
  releasePage = newest.html_url ?? RELEASES_PAGE
  set({ status: 'available', version: newest.tag_name.replace(/^v/, ''), notes: plainNotes(newest.body), error: null })
}

/** Look for a newer version. `quiet`: a check on launch (failures just leave the status idle). */
async function check(quiet: boolean): Promise<void> {
  if (state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') return
  set({ status: 'checking', error: null })
  try {
    if (selfUpdating()) {
      const result = await autoUpdater.checkForUpdates()
      // (the events below set the status; a null result means checks are disabled)
      if (!result) set({ status: 'none' })
    } else {
      await checkReleaseList()
    }
  } catch (error) {
    set(quiet ? { status: 'idle', error: null } : { status: 'error', error: reason(error) })
  }
}

async function download(): Promise<void> {
  if (state.status !== 'available') return
  if (!state.canInstall) {
    void shell.openExternal(releasePage)
    return
  }
  set({ status: 'downloading', percent: 0, error: null })
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    set({ status: 'error', error: reason(error) })
  }
}

/** True once "Restart and update" was chosen: when the window has closed, install instead of quitting. */
export function updateWaitingToInstall(): boolean {
  return installAfterClose
}

/** The window's close was cancelled (Cancel on the unsaved-changes question): don't install after all. */
export function cancelUpdateInstall(): void {
  installAfterClose = false
}

/** Run the downloaded installer (silently, with Windows' admin prompt) and reopen the app afterwards. */
export function installUpdateNow(): void {
  installAfterClose = false
  autoUpdater.quitAndInstall(true, true)
}

export function registerUpdates(window: () => BrowserWindow | null): void {
  getWindow = window
  const settings = loadSettings()
  state = {
    status: 'idle',
    current: app.getVersion(),
    version: null,
    notes: null,
    percent: 0,
    error: null,
    auto: settings.checkForUpdates,
    canInstall: selfUpdating()
  }

  if (selfUpdating()) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowDowngrade = false
    // Our own config: the same GitHub releases, but downloads kept in the app's folder
    // (%LOCALAPPDATA%\SecondTeam\updates) rather than electron-updater's own folder.
    const testConfig = process.env['SECONDTEAM_UPDATE_TEST']
    if (!app.isPackaged && testConfig) {
      autoUpdater.forceDevUpdateConfig = true
      autoUpdater.updateConfigPath = testConfig
    } else {
      const config = join(process.resourcesPath, 'update-config.yml')
      if (existsSync(config)) autoUpdater.updateConfigPath = config
    }
    // Failures also come back through the calls' promises (handled there); without a listener this
    // event would crash the app.
    autoUpdater.on('error', () => {})
    autoUpdater.on('update-available', (info) => set({ status: 'available', version: info.version, notes: plainNotes(info.releaseNotes), error: null }))
    autoUpdater.on('update-not-available', () => set({ status: 'none', version: null, notes: null, error: null }))
    autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version, percent: 100 }))
  }

  ipcMain.handle('updates:get', () => state)
  ipcMain.handle('updates:check', () => check(false))
  ipcMain.handle('updates:download', () => download())
  ipcMain.handle('updates:install', () => {
    if (state.status !== 'ready') return
    // Close the window as usual (it asks about unsaved changes); once it has closed, install.
    installAfterClose = true
    getWindow()?.close()
  })
  ipcMain.handle('updates:setAuto', async (_e, auto: unknown) => {
    await updateSettings({ checkForUpdates: auto === true })
    set({ auto: auto === true })
  })

  // On launch: an installed app checks by itself (if allowed), a little after it has opened.
  if (settings.checkForUpdates && (app.isPackaged || process.env['SECONDTEAM_UPDATE_TEST'])) {
    setTimeout(() => void check(true), 5000)
  }
}

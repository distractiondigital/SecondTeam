import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { safeRename } from './safeRename'

// The app's own settings, in %LOCALAPPDATA%\SecondTeam\settings.json:
//   backendDir        where the AI engine and models live (null = the default below)
//   externalComfyUrl  use a ComfyUI that's already running instead (advanced; null = manage our own)
//   setupSkipped      "Set up later" was chosen, so the wizard doesn't open by itself
//   checkForUpdates   look for a newer Second Team on GitHub when the app starts (main/updates.ts)

export interface AppSettings {
  backendDir: string | null
  externalComfyUrl: string | null
  setupSkipped: boolean
  checkForUpdates: boolean
}

export const DEFAULT_SETTINGS: AppSettings = { backendDir: null, externalComfyUrl: null, setupSkipped: false, checkForUpdates: true }

/**
 * Where the app keeps its own files (settings, libraries, logs, the AI engine by default):
 * Windows %LOCALAPPDATA%\SecondTeam, Mac ~/Library/Application Support/SecondTeam.
 * (Tests on Windows point LOCALAPPDATA at a scratch folder.)
 */
export function appDataFolder(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'SecondTeam')
  const base = process.env['LOCALAPPDATA'] ?? join(process.env['USERPROFILE'] ?? '.', 'AppData', 'Local')
  return join(base, 'SecondTeam')
}

/**
 * Where the engine goes unless the user picks somewhere else. The installed app keeps it in
 * AppData (outside its own folder, so updates and uninstalls never delete it); the dev setup keeps
 * using the repo's ComfyUI\ folder.
 */
export function defaultBackendDir(packaged: boolean, appPath: string, appData = appDataFolder()): string {
  return packaged ? join(appData, 'backend') : join(appPath, 'ComfyUI')
}

/** Only http(s) to this machine: the app never sends anything elsewhere. */
export function cleanComfyUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url.trim()) return null
  try {
    const u = new URL(url.trim())
    if (!/^https?:$/.test(u.protocol)) return null
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return null
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

export function parseSettings(text: string | null): AppSettings {
  let raw: Partial<AppSettings> = {}
  try {
    const parsed = text ? JSON.parse(text) : {}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed
  } catch {
    // damaged file: defaults
  }
  return {
    backendDir: typeof raw.backendDir === 'string' && raw.backendDir.trim() ? raw.backendDir : null,
    externalComfyUrl: cleanComfyUrl(raw.externalComfyUrl),
    setupSkipped: raw.setupSkipped === true,
    checkForUpdates: raw.checkForUpdates !== false
  }
}

const file = () => join(appDataFolder(), 'settings.json')

export function loadSettings(): AppSettings {
  try {
    return parseSettings(existsSync(file()) ? readFileSync(file(), 'utf-8') : null)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  mkdirSync(appDataFolder(), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(settings, null, 2), 'utf-8')
  await safeRename(`${file()}.tmp`, file())
}

/**
 * Change some settings, keeping whatever else is in the file (several parts of the app keep their
 * own settings in it). Returns the settings as saved.
 */
export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...loadSettings(), ...patch }
  await saveSettings(next)
  return next
}

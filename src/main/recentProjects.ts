import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { basename, join, resolve } from 'path'
import { safeRename } from './safeRename'
import { appDataFolder } from './settings'

// The projects opened or saved most recently, newest first, in
// %LOCALAPPDATA%\SecondTeam\recent.json (its own file, so saving other settings never clobbers it).

export const MAX_RECENT = 10

/** A recent project as the start screen and the Open menu show it. */
export interface RecentProject {
  path: string
  name: string
  /** False if the folder (or its project.json) is gone. */
  exists: boolean
  /** When project.json was last written (ms since 1970), or null if it's gone. */
  savedAt: number | null
}

const same = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase()

/** Read the stored list, ignoring anything damaged. */
export function parseRecent(text: string | null): string[] {
  try {
    const raw: unknown = text ? JSON.parse(text) : []
    const list = Array.isArray(raw) ? raw : []
    const out: string[] = []
    for (const p of list) if (typeof p === 'string' && p.trim() && !out.some((q) => same(p, q))) out.push(p)
    return out.slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

/** Put `path` first (once), keeping at most MAX_RECENT. */
export function withRecent(list: string[], path: string): string[] {
  return [resolve(path), ...list.filter((p) => !same(p, path))].slice(0, MAX_RECENT)
}

export function withoutRecent(list: string[], path: string): string[] {
  return list.filter((p) => !same(p, path))
}

export function isRecent(list: string[], path: string): boolean {
  return list.some((p) => same(p, path))
}

const file = () => join(appDataFolder(), 'recent.json')

export function loadRecent(): string[] {
  try {
    return parseRecent(existsSync(file()) ? readFileSync(file(), 'utf-8') : null)
  } catch {
    return []
  }
}

export async function saveRecent(list: string[]): Promise<void> {
  mkdirSync(appDataFolder(), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(list, null, 2), 'utf-8')
  await safeRename(`${file()}.tmp`, file())
}

/** The list with what's on disk now: the name, whether it's still there, and when it was saved. */
export function describeRecent(list: string[]): RecentProject[] {
  return list.map((path) => {
    const projectFile = join(path, 'project.json')
    let savedAt: number | null = null
    try {
      savedAt = existsSync(projectFile) ? statSync(projectFile).mtimeMs : null
    } catch {
      savedAt = null
    }
    return { path, name: basename(path).replace(/\.secondteam$/i, ''), exists: savedAt !== null, savedAt }
  })
}

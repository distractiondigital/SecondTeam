import { create } from 'zustand'
import { newId } from '../../../shared/project'

// The user's app-wide style presets (a named style prompt, and optionally the model it was made
// for), available in every project. Stored by the main process in
// %LOCALAPPDATA%\SecondTeam\styles.json and saved immediately after each change.

export interface StylePreset {
  id: string
  name: string
  /** The style text added to every prompt. */
  text: string
  /** The model file it was designed with (null = any). */
  checkpoint: string | null
}

interface StyleLibraryState {
  presets: StylePreset[]
  loaded: boolean
  load: () => Promise<void>
  /** Save a preset; one with the same name is replaced. */
  save: (name: string, text: string, checkpoint: string | null) => void
  remove: (id: string) => void
}

export function sanitizeStylePresets(raw: unknown): StylePreset[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is StylePreset => Boolean(p) && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.text === 'string')
    .map((p) => ({ id: p.id, name: p.name.trim() || 'Style', text: p.text, checkpoint: typeof p.checkpoint === 'string' ? p.checkpoint : null }))
}

async function persist(presets: StylePreset[]): Promise<void> {
  const result = await window.secondTeam.saveStyleLibrary(JSON.stringify({ version: 1, presets }, null, 2) + '\n')
  if ('error' in result) await window.secondTeam.showError(result.error)
}

export const useStyleLibrary = create<StyleLibraryState>()((set, get) => ({
  presets: [],
  loaded: false,

  load: async () => {
    const json = await window.secondTeam.loadStyleLibrary()
    let presets: StylePreset[] = []
    if (json) {
      try {
        presets = sanitizeStylePresets(JSON.parse(json).presets)
      } catch {
        presets = []
      }
    }
    set({ presets, loaded: true })
  },

  save: (name, text, checkpoint) => {
    const clean = name.trim()
    if (!clean) return
    const existing = get().presets.find((p) => p.name.toLowerCase() === clean.toLowerCase())
    const preset = { id: existing?.id ?? newId(), name: clean, text, checkpoint }
    const presets = existing ? get().presets.map((p) => (p.id === existing.id ? preset : p)) : [...get().presets, preset]
    presets.sort((a, b) => a.name.localeCompare(b.name))
    set({ presets })
    void persist(presets)
  },

  remove: (id) => {
    const presets = get().presets.filter((p) => p.id !== id)
    set({ presets })
    void persist(presets)
  }
}))

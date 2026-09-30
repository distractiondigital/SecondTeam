import { create } from 'zustand'
import type { Units } from '../units'

// UI state: how you're looking at the project. Not saved into project.json and not undoable.

export type GizmoMode = 'translate' | 'rotate' | 'scale'

interface UiState {
  selection: string[]
  gizmoMode: GizmoMode
  snapping: boolean
  units: Units
  /** Folder of the open project (…\Name.secondteam), or null if never saved. */
  projectPath: string | null
  /** Node whose name is being edited in the outliner. */
  renamingId: string | null
  /** Bumped to ask the viewport to frame the selection. */
  frameRequest: number

  select: (ids: string[]) => void
  toggleSelected: (id: string) => void
  setGizmoMode: (mode: GizmoMode) => void
  toggleSnapping: () => void
  setUnits: (units: Units) => void
  setProjectPath: (path: string | null) => void
  setRenamingId: (id: string | null) => void
  requestFrame: () => void
}

export const useUi = create<UiState>()((set) => ({
  selection: [],
  gizmoMode: 'translate',
  snapping: false,
  units: 'm',
  projectPath: null,
  renamingId: null,
  frameRequest: 0,

  select: (ids) => set({ selection: ids }),
  toggleSelected: (id) =>
    set((s) => ({
      selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id]
    })),
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),
  toggleSnapping: () => set((s) => ({ snapping: !s.snapping })),
  setUnits: (units) => set({ units }),
  setProjectPath: (projectPath) => set({ projectPath }),
  setRenamingId: (renamingId) => set({ renamingId }),
  requestFrame: () => set((s) => ({ frameRequest: s.frameRequest + 1 }))
}))

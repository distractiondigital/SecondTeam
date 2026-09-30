import { create } from 'zustand'
import type { Units } from '../units'

// UI state: how you're looking at the project. Not saved into project.json and not undoable.

export type GizmoMode = 'translate' | 'rotate' | 'scale'
/** off: free movement. grid: fixed steps. surface: sides click flush against the floor and other objects. */
export type SnapMode = 'off' | 'grid' | 'surface'
export const SNAP_MODES: SnapMode[] = ['off', 'grid', 'surface']

interface UiState {
  selection: string[]
  gizmoMode: GizmoMode
  snapMode: SnapMode
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
  setSnapMode: (mode: SnapMode) => void
  cycleSnapMode: () => void
  setUnits: (units: Units) => void
  setProjectPath: (path: string | null) => void
  setRenamingId: (id: string | null) => void
  requestFrame: () => void
}

export const useUi = create<UiState>()((set) => ({
  selection: [],
  gizmoMode: 'translate',
  snapMode: 'off',
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
  setSnapMode: (snapMode) => set({ snapMode }),
  cycleSnapMode: () =>
    set((s) => ({ snapMode: SNAP_MODES[(SNAP_MODES.indexOf(s.snapMode) + 1) % SNAP_MODES.length] })),
  setUnits: (units) => set({ units }),
  setProjectPath: (projectPath) => set({ projectPath }),
  setRenamingId: (renamingId) => set({ renamingId }),
  requestFrame: () => set((s) => ({ frameRequest: s.frameRequest + 1 }))
}))

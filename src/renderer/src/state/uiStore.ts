import { create } from 'zustand'
import type { JointName } from '../../../shared/mannequin'
import type { Units } from '../units'
import type { ShotInfo } from '../viewport/shotInfo'

// UI state: how you're looking at the project. Not saved into project.json and not undoable.

export type GizmoMode = 'translate' | 'rotate' | 'scale'
/** off: free movement. grid: fixed steps. surface: sides click flush against the floor and other objects. */
export type SnapMode = 'off' | 'grid' | 'surface'
export const SNAP_MODES: SnapMode[] = ['off', 'grid', 'surface']

interface UiState {
  selection: string[]
  /** Joint being posed, when the selection is a single figure. Cleared whenever the selection changes. */
  selectedJoint: JointName | null
  gizmoMode: GizmoMode
  snapMode: SnapMode
  units: Units
  /** Folder of the open project (…\Name.secondteam), or null if never saved. */
  projectPath: string | null
  /** Node whose name is being edited in the outliner. */
  renamingId: string | null
  /** Bumped to ask the viewport to frame the selection. */
  frameRequest: number
  /** Shot camera the viewport is looking through, or null for the free view. */
  lookThroughId: string | null
  /** Fly speed in camera view, metres per second. */
  flySpeed: number
  /** Shot list thumbnails (data URLs), by camera id. */
  thumbnails: Record<string, string>
  /** Live readouts per camera (height, tilt, subject distance, shot size, angle). */
  shotInfo: Record<string, ShotInfo>

  select: (ids: string[]) => void
  selectJoint: (joint: JointName | null) => void
  toggleSelected: (id: string) => void
  setGizmoMode: (mode: GizmoMode) => void
  setSnapMode: (mode: SnapMode) => void
  cycleSnapMode: () => void
  setUnits: (units: Units) => void
  setProjectPath: (path: string | null) => void
  setRenamingId: (id: string | null) => void
  requestFrame: () => void
  setLookThrough: (id: string | null) => void
  setFlySpeed: (speed: number) => void
  setThumbnails: (thumbnails: Record<string, string>) => void
  setShotInfo: (shotInfo: Record<string, ShotInfo>) => void
}

export const useUi = create<UiState>()((set) => ({
  selection: [],
  selectedJoint: null,
  gizmoMode: 'translate',
  snapMode: 'off',
  units: 'm',
  projectPath: null,
  renamingId: null,
  frameRequest: 0,
  lookThroughId: null,
  flySpeed: 1.5,
  thumbnails: {},
  shotInfo: {},

  select: (ids) => set({ selection: ids, selectedJoint: null }),
  selectJoint: (selectedJoint) => set({ selectedJoint }),
  toggleSelected: (id) =>
    set((s) => ({
      selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id],
      selectedJoint: null
    })),
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),
  setSnapMode: (snapMode) => set({ snapMode }),
  cycleSnapMode: () =>
    set((s) => ({ snapMode: SNAP_MODES[(SNAP_MODES.indexOf(s.snapMode) + 1) % SNAP_MODES.length] })),
  setUnits: (units) => set({ units }),
  setProjectPath: (projectPath) => set({ projectPath }),
  setRenamingId: (renamingId) => set({ renamingId }),
  requestFrame: () => set((s) => ({ frameRequest: s.frameRequest + 1 })),
  setLookThrough: (lookThroughId) => set({ lookThroughId }),
  setFlySpeed: (flySpeed) => set({ flySpeed: Math.min(20, Math.max(0.1, flySpeed)) }),
  setThumbnails: (thumbnails) => set({ thumbnails }),
  setShotInfo: (shotInfo) => set({ shotInfo })
}))

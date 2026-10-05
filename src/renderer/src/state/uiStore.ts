import { create } from 'zustand'
import type { JointName } from '../../../shared/mannequin'
import type { Units } from '../units'
import type { ShotInfo } from '../viewport/shotInfo'

// UI state: how you're looking at the project. Not saved into project.json and not undoable.

export type GizmoMode = 'translate' | 'rotate' | 'scale'
/** off: free movement. grid: fixed steps. surface: sides click flush against the floor and other objects. */
export type SnapMode = 'off' | 'grid' | 'surface'
export const SNAP_MODES: SnapMode[] = ['off', 'grid', 'surface']
/** work: object colours under even work light. clay: uniform grey lit only by the scene's lights. */
export type Shading = 'work' | 'clay'
export type LeftTab = 'outliner' | 'cast' | 'props'
/** The set (3D workspace) or the storyboard. */
export type MainView = 'set' | 'board'
/** What the board's panels show: the circle take, or the shot's clay render. */
export type BoardImage = 'ai' | 'clay'
/** A cast member or prop shown in Properties. */
export type EntityRef = { kind: 'cast' | 'prop'; id: string }

/** How the viewport reads scrolling: a mouse wheel zooms; a trackpad's two-finger swipe orbits (pinch zooms). */
export type NavMode = 'mouse' | 'trackpad'
const NAV_MODE_KEY = 'secondteam.navMode'

function loadNavMode(): NavMode {
  try {
    return localStorage.getItem(NAV_MODE_KEY) === 'trackpad' ? 'trackpad' : 'mouse'
  } catch {
    return 'mouse'
  }
}

/** The folds that keep AI features out of the way: a shot's AI generation, cast/props' AI references, the takes strip. */
export type AiFold = 'shot' | 'refs' | 'strip'
const AI_FOLDS_KEY = 'secondteam.aiFolds'

/** Which AI folds are open, remembered on this PC (all closed at first). */
function loadAiFolds(): Record<AiFold, boolean> {
  const closed = { shot: false, refs: false, strip: false }
  try {
    const raw = JSON.parse(localStorage.getItem(AI_FOLDS_KEY) ?? '{}') as Partial<Record<AiFold, unknown>>
    return { shot: raw.shot === true, refs: raw.refs === true, strip: raw.strip === true }
  } catch {
    return closed
  }
}

interface UiState {
  selection: string[]
  /** Joint being posed, when the selection is a single figure. Cleared whenever the selection changes. */
  selectedJoint: JointName | null
  gizmoMode: GizmoMode
  snapMode: SnapMode
  units: Units
  /** Folder of the open project (…\Name.secondteam), or null if never saved. */
  projectPath: string | null
  /** The start panel (new / open / recent) was closed for this session. */
  startDismissed: boolean
  /** Node whose name is being edited in the outliner. */
  renamingId: string | null
  /** Bumped to ask the viewport to frame the selection. */
  frameRequest: number
  /** Shot camera the viewport is looking through, or null for the free view. */
  lookThroughId: string | null
  shading: Shading
  /** Clay was switched on automatically by entering camera view (so leaving switches it back). */
  shadingAuto: boolean
  /** Fly speed in camera view, metres per second. */
  flySpeed: number
  /** Fly speed in the free view (m/s): faster than a shot camera's, for getting around a set. */
  freeFlySpeed: number
  /** Shot list thumbnails (data URLs), by camera id. */
  thumbnails: Record<string, string>
  /** Live readouts per camera (height, tilt, subject distance, shot size, angle). */
  shotInfo: Record<string, ShotInfo>
  leftTab: LeftTab
  view: MainView
  boardImage: BoardImage
  /** Clay renders for the board (larger than the Shot list's), by camera id, across all scenes. */
  boardClay: Record<string, string>
  /** The cast member or prop being edited in Properties (clears when something in the set is selected). */
  entity: EntityRef | null

  select: (ids: string[]) => void
  selectJoint: (joint: JointName | null) => void
  toggleSelected: (id: string) => void
  setGizmoMode: (mode: GizmoMode) => void
  setSnapMode: (mode: SnapMode) => void
  cycleSnapMode: () => void
  setUnits: (units: Units) => void
  setProjectPath: (path: string | null) => void
  dismissStart: () => void
  setRenamingId: (id: string | null) => void
  requestFrame: () => void
  setLookThrough: (id: string | null) => void
  setShading: (shading: Shading) => void
  setFlySpeed: (speed: number) => void
  setFreeFlySpeed: (speed: number) => void
  setThumbnails: (thumbnails: Record<string, string>) => void
  setShotInfo: (shotInfo: Record<string, ShotInfo>) => void
  setLeftTab: (tab: LeftTab) => void
  setView: (view: MainView) => void
  setBoardImage: (image: BoardImage) => void
  setBoardClay: (images: Record<string, string>) => void
  /** Show a cast member or prop in Properties (null = none). */
  selectEntity: (entity: EntityRef | null) => void
  aiFolds: Record<AiFold, boolean>
  setAiFold: (fold: AiFold, open: boolean) => void
  /** Mouse or trackpad navigation, remembered on this PC. */
  navMode: NavMode
  setNavMode: (mode: NavMode) => void
}

export const useUi = create<UiState>()((set) => ({
  navMode: loadNavMode(),
  setNavMode: (navMode) => {
    try {
      localStorage.setItem(NAV_MODE_KEY, navMode)
    } catch {
      // Not remembered this time; still works.
    }
    set({ navMode })
  },
  aiFolds: loadAiFolds(),
  setAiFold: (fold, open) =>
    set((s) => {
      const aiFolds = { ...s.aiFolds, [fold]: open }
      try {
        localStorage.setItem(AI_FOLDS_KEY, JSON.stringify(aiFolds))
      } catch {
        // Not remembered this time; still works.
      }
      return { aiFolds }
    }),
  selection: [],
  selectedJoint: null,
  gizmoMode: 'translate',
  snapMode: 'off',
  units: 'm',
  projectPath: null,
  startDismissed: false,
  renamingId: null,
  frameRequest: 0,
  lookThroughId: null,
  shading: 'work',
  shadingAuto: false,
  flySpeed: 1.5,
  freeFlySpeed: 5,
  thumbnails: {},
  shotInfo: {},
  leftTab: 'outliner',
  view: 'set',
  boardImage: 'ai',
  boardClay: {},
  entity: null,

  select: (ids) => set((s) => ({ selection: ids, selectedJoint: null, entity: ids.length ? null : s.entity })),
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
  dismissStart: () => set({ startDismissed: true }),
  setRenamingId: (renamingId) => set({ renamingId }),
  requestFrame: () => set((s) => ({ frameRequest: s.frameRequest + 1 })),
  // Camera view shows the shot lit (Clay); leaving it goes back to Work if that's where you were.
  setLookThrough: (lookThroughId) =>
    set((s) => {
      if (lookThroughId && !s.lookThroughId && s.shading === 'work') {
        return { lookThroughId, shading: 'clay', shadingAuto: true }
      }
      if (!lookThroughId && s.lookThroughId && s.shadingAuto) {
        return { lookThroughId, shading: 'work', shadingAuto: false }
      }
      return { lookThroughId }
    }),
  setShading: (shading) => set({ shading, shadingAuto: false }),
  setFlySpeed: (flySpeed) => set({ flySpeed: Math.min(20, Math.max(0.1, flySpeed)) }),
  setFreeFlySpeed: (freeFlySpeed) => set({ freeFlySpeed: Math.min(60, Math.max(0.2, freeFlySpeed)) }),
  setThumbnails: (thumbnails) => set({ thumbnails }),
  setShotInfo: (shotInfo) => set({ shotInfo }),
  setLeftTab: (leftTab) => set({ leftTab }),
  setView: (view) => set({ view }),
  setBoardImage: (boardImage) => set({ boardImage }),
  setBoardClay: (boardClay) => set({ boardClay }),
  selectEntity: (entity) => set(entity ? { entity, selection: [], selectedJoint: null } : { entity: null })
}))

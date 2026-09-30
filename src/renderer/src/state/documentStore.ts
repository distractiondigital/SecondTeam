import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three'
import {
  clampScale,
  createEmptyProject,
  newId,
  repairCamera,
  type Anchor,
  type CameraNode,
  type GroupNode,
  type MannequinNode,
  type PrimitiveNode,
  type PrimitiveType,
  type Project,
  type Scene,
  type SceneNode,
  type Vec3
} from '../../../shared/project'
import {
  anchorHeight,
  DEFAULT_PRIMITIVE_COLOR,
  defaultAnchor,
  PRIMITIVES,
  supportsAnchor
} from '../../../shared/primitives'
import {
  clampBuild,
  clampHeight,
  clampJoint,
  DEFAULT_BUILD,
  DEFAULT_HEIGHT,
  FIGURE_COLORS,
  mirrorPose,
  POSE_PRESETS,
  proportions,
  type JointName,
  type Pose,
  type PresetName
} from '../../../shared/mannequin'
import { nextShotNumber, SENSOR_PRESETS } from '../../../shared/camera'
import { applyOverride, effectiveNodes, isOverridable } from '../../../shared/overrides'

// The document store holds the project: everything that is saved to disk and can be undone.
// Undo works by keeping whole-project snapshots. Immer shares unchanged parts between
// snapshots, so this stays cheap.

const HISTORY_LIMIT = 200
const DUPLICATE_OFFSET = 0.5 // metres along X, so a duplicate is visible next to the original

export type CameraField =
  | 'shotNumber'
  | 'sensor'
  | 'focalLength'
  | 'squeeze'
  | 'guides'
  | 'delivery'
  | 'thirds'
  | 'focusDistance'
  | 'subjectId'
  | 'sizeOverride'
  | 'angleOverride'
  | 'notes'

export type NodePatch = Partial<
  Pick<PrimitiveNode, 'name' | 'position' | 'rotation' | 'scale' | 'color' | 'hidden' | 'locked'> &
    Pick<MannequinNode, 'height' | 'build' | 'limits'> &
    Pick<CameraNode, CameraField>
>

const CAMERA_FIELDS: CameraField[] = [
  'shotNumber',
  'sensor',
  'focalLength',
  'squeeze',
  'guides',
  'delivery',
  'thirds',
  'focusDistance',
  'subjectId',
  'sizeOverride',
  'angleOverride',
  'notes'
]

/** Which node types each patch field applies to (fields not listed apply to every node). */
const FIELD_TYPES: Partial<Record<keyof NodePatch, SceneNode['type'][]>> = {
  color: ['primitive', 'mannequin'],
  height: ['mannequin'],
  build: ['mannequin'],
  limits: ['mannequin'],
  scale: ['primitive', 'group'], // a figure's size comes from its height; cameras don't scale
  ...Object.fromEntries(CAMERA_FIELDS.map((f) => [f, ['camera']]))
}

/** Where a new camera comes from: the current view, plus optional settings to copy. */
export interface CameraSpawn {
  position: Vec3
  rotation: Vec3
  template?: Partial<Pick<CameraNode, 'sensor' | 'focalLength' | 'squeeze' | 'guides' | 'delivery' | 'thirds'>>
}

function normalizeField(key: keyof NodePatch, value: unknown): unknown {
  if (key === 'scale') return clampScale(value as Vec3)
  if (key === 'height') return clampHeight(value as number)
  if (key === 'build') return clampBuild(value as number)
  return value
}

interface DocumentState {
  project: Project
  /** The project as last saved or opened. Unsaved changes = project !== savedProject. */
  savedProject: Project | null
  sceneId: string
  past: Project[]
  future: Project[]
  /** Set while a gizmo drag is in progress; the whole drag becomes one undo step. */
  gestureStart: Project | null
  /** Who has a gesture open (see beginGesture). */
  gestureOwners: string[]
  /** Shot being edited (its camera id); null = the Master scene. Not saved, not undone. */
  activeShotId: string | null

  newProject: () => void
  loadProject: (project: Project) => void
  /** Record which project state is now on disk (defaults to the current one). */
  markSaved: (saved?: Project) => void

  addPrimitive: (primitive: PrimitiveType, groundPoint?: [number, number]) => string
  updateNode: (id: string, patch: NodePatch) => void
  updateNodes: (ids: string[], patch: NodePatch) => void
  /** Move a primitive's origin to its bottom, middle or top without moving the object. */
  setAnchor: (id: string, anchor: Anchor) => void
  /** Add a shot camera at a viewpoint; it gets the next shot number. */
  addCamera: (spawn: CameraSpawn) => string

  addMannequin: (groundPoint?: [number, number]) => string
  /** Set one joint's rotation (degrees); clamped to realistic limits if the figure has them on. */
  setJointRotation: (id: string, joint: JointName, rotation: Vec3) => void
  /** Pelvis shift from standing, as a fraction of the figure's height. */
  setPelvisOffset: (id: string, offset: Vec3) => void
  applyPreset: (id: string, preset: PresetName) => void
  mirrorPose: (id: string) => void
  resetJoint: (id: string, joint: JointName) => void
  /** Edit the Master scene (null) or one shot's version of it. */
  setActiveShot: (shotId: string | null) => void
  /** Drop the active shot's changes to a node (it follows Master again). */
  revertOverride: (id: string) => void
  /** Make the active shot's changes to a node the Master version. */
  pushOverrideToMaster: (id: string) => void
  /** Give a figure a whole pose (from a saved preset). */
  setPose: (id: string, pose: Pose) => void
  /** Save a pose into this project's preset list. Returns its id. */
  addProjectPose: (name: string, pose: Pose) => string
  deleteProjectPose: (poseId: string) => void
  deleteNodes: (ids: string[]) => void
  duplicateNodes: (ids: string[]) => string[]
  groupNodes: (ids: string[]) => string | null
  ungroup: (ids: string[]) => string[]

  /** Start a group of changes that undo as one step. owner says who started it; only that owner ends it. */
  beginGesture: (owner?: string) => void
  endGesture: (owner?: string) => void
  undo: () => void
  redo: () => void
}

function initialState(project: Project, saved: Project | null) {
  return {
    project,
    savedProject: saved,
    sceneId: project.scenes[0].id,
    past: [] as Project[],
    future: [] as Project[],
    gestureStart: null,
    gestureOwners: [] as string[],
    activeShotId: null as string | null
  }
}

export const useDocument = create<DocumentState>()((set, get) => {
  /** Apply a change to the active scene and record it for undo. */
  function change(recipe: (scene: Draft<Scene>, project: Draft<Project>) => void): void {
    const { project, sceneId, past, gestureStart } = get()
    const next = produce(project, (draft) => {
      const scene = draft.scenes.find((s) => s.id === sceneId)
      if (scene) recipe(scene, draft)
    })
    if (next === project) return
    if (gestureStart) {
      set({ project: next })
    } else {
      set({ project: next, past: [...past, project].slice(-HISTORY_LIMIT), future: [] })
    }
  }

  interface EditContext {
    scene: Draft<Scene>
    /** The active shot's camera, or null when editing the Master scene. */
    shot: Draft<CameraNode> | null
    /** A node as the active shot sees it (a plain copy; don't modify it). */
    view: (id: string) => SceneNode | undefined
    /**
     * Change a node's fields. In a shot, per-shot fields become this shot's overrides (a value
     * equal to Master's clears the override); everything else, and all Master edits, change the node.
     */
    write: (id: string, fields: Record<string, unknown>) => void
  }

  /** If undo/redo removed the active shot's camera, go back to editing Master. */
  function dropMissingShot(): void {
    const { activeShotId } = get()
    if (activeShotId && activeScene(get()).nodes[activeShotId]?.type !== 'camera') set({ activeShotId: null })
  }

  /** Like `change`, but aware of the active shot (see EditContext). */
  function edit(recipe: (ctx: EditContext) => void): void {
    const shotId = get().activeShotId
    change((scene) => {
      const s = shotId ? scene.nodes[shotId] : undefined
      const shot = s?.type === 'camera' ? (s as Draft<CameraNode>) : null
      const view = (id: string) => {
        const node = scene.nodes[id]
        if (!node) return undefined
        const plain = toPlain(node)
        return shot ? applyOverride(plain, toPlainValue(shot.overrides[id])) : plain
      }
      const write = (id: string, fields: Record<string, unknown>) => {
        const node = scene.nodes[id] as Draft<SceneNode> | undefined
        if (!node) return
        const perShot = shot && node.type !== 'camera' && node.id !== shot.id
        for (const [field, value] of Object.entries(fields)) {
          if (perShot && isOverridable(node as SceneNode, field)) {
            const o = (shot.overrides[id] ??= {}) as Record<string, unknown>
            if (sameValue((node as Record<string, unknown>)[field], value)) delete o[field]
            else o[field] = value
            if (Object.keys(o).length === 0) delete shot.overrides[id]
          } else if (!sameValue((node as Record<string, unknown>)[field], value)) {
            ;(node as Record<string, unknown>)[field] = value
          }
        }
      }
      recipe({ scene, shot, view, write })
    })
  }

  return {
    ...initialState(createEmptyProject(), null),

    newProject: () => set(initialState(createEmptyProject(), null)),
    loadProject: (project) => set(initialState(project, project)),
    markSaved: (saved) => set({ savedProject: saved ?? get().project }),

    addPrimitive: (primitive, groundPoint = [0, 0]) => {
      const id = newId()
      change((scene) => {
        const label = PRIMITIVES[primitive].label
        const node: PrimitiveNode = {
          id,
          type: 'primitive',
          primitive,
          name: nextName(scene, label),
          parentId: null,
          position: [round(groundPoint[0]), 0, round(groundPoint[1])],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          hidden: false,
          locked: false,
          color: DEFAULT_PRIMITIVE_COLOR,
          anchor: defaultAnchor(primitive),
          propId: null,
          description: ''
        }
        scene.nodes[id] = node
        scene.rootIds.push(id)
      })
      return id
    },

    updateNode: (id, patch) => get().updateNodes([id], patch),
    updateNodes: (ids, patch) => {
      edit(({ scene, write }) => {
        for (const id of ids) {
          const node = scene.nodes[id]
          if (!node) continue
          const fields: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(patch) as [keyof NodePatch, unknown][]) {
            const types = FIELD_TYPES[key]
            if (types && !types.includes(node.type)) continue
            const next = normalizeField(key, value)
            if (key === 'shotNumber' && node.type === 'camera' && node.name === `Shot ${node.shotNumber}`) {
              node.name = `Shot ${String(next).trim()}` // keep the default name in step
            }
            fields[key] = next
          }
          write(id, fields)
          if (node.type === 'camera') repairCamera(node as CameraNode)
        }
      })
    },

    addCamera: (spawn) => {
      const id = newId()
      edit(({ scene, shot }) => {
        const shots = Object.values(scene.nodes).flatMap((n) => (n.type === 'camera' ? [n.shotNumber] : []))
        const shotNumber = nextShotNumber(shots)
        const t = spawn.template ?? {}
        const node: CameraNode = {
          id,
          type: 'camera',
          name: `Shot ${shotNumber}`,
          parentId: null,
          position: spawn.position.map(round) as Vec3,
          rotation: spawn.rotation.map(round) as Vec3,
          scale: [1, 1, 1],
          hidden: false,
          locked: false,
          shotNumber,
          sensor: t.sensor ? { ...t.sensor } : { preset: 'ff', width: SENSOR_PRESETS.ff.width, height: SENSOR_PRESETS.ff.height },
          focalLength: t.focalLength ?? 35,
          squeeze: t.squeeze ?? 1,
          guides: t.guides ? [...t.guides] : [],
          delivery: t.delivery ?? 'sensor',
          thirds: t.thirds ?? false,
          focusDistance: null,
          subjectId: null,
          sizeOverride: null,
          angleOverride: null,
          notes: '',
          // A shot made while another shot is active starts from that shot's version of the set.
          overrides: shot ? toPlainValue(shot.overrides)! : {}
        }
        repairCamera(node)
        scene.nodes[id] = node
        scene.rootIds.push(id)
      })
      return id
    },

    setAnchor: (id, anchor) => {
      edit(({ view, write }) => {
        const node = view(id)
        if (!node || node.type !== 'primitive' || node.anchor === anchor || !supportsAnchor(node.primitive)) return
        // The origin moves along the object's own (rotated, scaled) height axis; shift the
        // position by the same amount so the object stays exactly where it is.
        const rise = (anchorHeight(node.primitive, anchor) - anchorHeight(node.primitive, node.anchor)) * node.scale[1]
        const euler = new Euler(...(node.rotation.map((d) => MathUtils.degToRad(d)) as Vec3), 'XYZ')
        const shift = new Vector3(0, rise, 0).applyEuler(euler)
        write(id, {
          position: [round(node.position[0] + shift.x), round(node.position[1] + shift.y), round(node.position[2] + shift.z)],
          anchor
        })
      })
    },

    addMannequin: (groundPoint = [0, 0]) => {
      const id = newId()
      change((scene) => {
        const figureCount = Object.values(scene.nodes).filter((n) => n.type === 'mannequin').length
        const node: MannequinNode = {
          id,
          type: 'mannequin',
          name: nextName(scene, 'Figure'),
          parentId: null,
          position: [round(groundPoint[0]), 0, round(groundPoint[1])],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          hidden: false,
          locked: false,
          height: DEFAULT_HEIGHT,
          build: DEFAULT_BUILD,
          color: FIGURE_COLORS[figureCount % FIGURE_COLORS.length],
          castId: null,
          limits: true,
          pose: POSE_PRESETS.standing.make(proportions(DEFAULT_HEIGHT, DEFAULT_BUILD))
        }
        scene.nodes[id] = node
        scene.rootIds.push(id)
      })
      return id
    },

    setJointRotation: (id, joint, rotation) => {
      edit(({ view, write }) => {
        const node = view(id)
        if (node?.type !== 'mannequin') return
        const rounded = rotation.map((r) => round(r)) as Vec3
        const pose = node.pose
        pose.joints[joint] = node.limits ? clampJoint(joint, rounded) : rounded
        write(id, { pose })
      })
    },

    setPelvisOffset: (id, offset) => {
      edit(({ view, write }) => {
        const node = view(id)
        if (node?.type !== 'mannequin') return
        write(id, { pose: { ...node.pose, pelvisOffset: offset.map((v) => round(v)) as Vec3 } })
      })
    },

    applyPreset: (id, preset) => {
      edit(({ view, write }) => {
        const node = view(id)
        if (node?.type === 'mannequin') write(id, { pose: POSE_PRESETS[preset].make(proportions(node.height, node.build)) })
      })
    },

    mirrorPose: (id) => {
      edit(({ view, write }) => {
        const node = view(id)
        if (node?.type === 'mannequin') write(id, { pose: mirrorPose(node.pose) })
      })
    },

    resetJoint: (id, joint) => {
      edit(({ view, write }) => {
        const node = view(id)
        if (node?.type !== 'mannequin') return
        const pose = node.pose
        pose.joints[joint] = [0, 0, 0]
        if (joint === 'pelvis') pose.pelvisOffset = [0, 0, 0]
        write(id, { pose })
      })
    },

    setPose: (id, pose) => {
      edit(({ view, write }) => {
        if (view(id)?.type === 'mannequin') write(id, { pose: structuredClone(pose) })
      })
    },

    setActiveShot: (shotId) => set({ activeShotId: shotId }),

    revertOverride: (id) => {
      edit(({ shot }) => {
        if (shot?.overrides[id]) delete shot.overrides[id]
      })
    },

    pushOverrideToMaster: (id) => {
      edit(({ scene, shot }) => {
        const o = shot?.overrides[id]
        const node = scene.nodes[id]
        if (!shot || !o || !node) return
        for (const [field, value] of Object.entries(toPlainValue(o)!)) (node as Record<string, unknown>)[field] = value
        delete shot.overrides[id]
      })
    },

    addProjectPose: (name, pose) => {
      const poseId = newId()
      change((_scene, project) => {
        project.poses.push({ id: poseId, name, pose: structuredClone(pose) })
      })
      return poseId
    },

    deleteProjectPose: (poseId) => {
      change((_scene, project) => {
        const i = project.poses.findIndex((p) => p.id === poseId)
        if (i >= 0) project.poses.splice(i, 1)
      })
    },

    deleteNodes: (ids) => {
      edit(({ scene, shot, write }) => {
        for (const id of topLevelOnly(scene, ids)) {
          const node = scene.nodes[id]
          if (!node) continue
          // In a shot, deleting a set piece only hides it in that shot. Cameras are really deleted.
          if (shot && node.type !== 'camera') {
            write(id, { hidden: true })
            continue
          }
          detach(scene, node)
          const removed = subtreeIds(scene, id)
          for (const d of removed) delete scene.nodes[d]
          // Forget any shot's changes to what was removed.
          for (const n of Object.values(scene.nodes)) {
            if (n.type === 'camera') for (const d of removed) delete n.overrides[d]
          }
        }
      })
    },

    duplicateNodes: (ids) => {
      const created: string[] = []
      edit(({ scene, shot }) => {
        for (const id of topLevelOnly(scene, ids)) {
          const original = scene.nodes[id]
          if (!original) continue
          const idMap = new Map<string, string>()
          const copyId = copySubtree(scene, id, original.parentId, idMap)
          // The copy starts as this shot sees the original.
          if (shot) {
            for (const [from, to] of idMap) {
              const o = shot.overrides[from]
              if (o) shot.overrides[to] = toPlainValue(o)!
            }
          }
          const copy = scene.nodes[copyId]
          copy.position = [round(copy.position[0] + DUPLICATE_OFFSET), copy.position[1], copy.position[2]]
          // Copied cameras become new shots with their own numbers.
          for (const d of subtreeIds(scene, copyId)) {
            const n = scene.nodes[d]
            if (n.type !== 'camera') continue
            const others = Object.values(scene.nodes).flatMap((o) => (o.type === 'camera' && o.id !== d ? [o.shotNumber] : []))
            n.shotNumber = nextShotNumber(others)
            n.name = `Shot ${n.shotNumber}`
          }
          insertAfter(scene, original, copyId)
          created.push(copyId)
        }
      })
      return created
    },

    groupNodes: (ids) => {
      let groupId: string | null = null
      change((scene) => {
        const members = topLevelOnly(scene, ids).map((id) => scene.nodes[id]).filter(Boolean)
        if (members.length === 0) return
        // Keep the group where its members are: same parent if they share one, otherwise top level.
        const parentId = members.every((m) => m.parentId === members[0].parentId) ? members[0].parentId : null
        const parentWorld = parentId ? worldMatrix(scene, parentId) : new Matrix4()
        const parentInverse = parentWorld.clone().invert()

        // Place the group's origin under its members: average X/Z, lowest Y (in the parent's space).
        const localPositions = members.map((m) =>
          new Vector3().setFromMatrixPosition(parentInverse.clone().multiply(worldMatrix(scene, m.id)))
        )
        const origin = new Vector3(
          average(localPositions.map((p) => p.x)),
          Math.min(...localPositions.map((p) => p.y)),
          average(localPositions.map((p) => p.z))
        )

        const id = newId()
        const group: GroupNode = {
          id,
          type: 'group',
          name: nextName(scene, 'Group'),
          parentId,
          position: [round(origin.x), round(origin.y), round(origin.z)],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          hidden: false,
          locked: false,
          childIds: []
        }
        scene.nodes[id] = group
        insertAfter(scene, members[0], id)

        const groupWorldInverse = parentWorld.clone().multiply(localMatrix(group)).invert()
        for (const m of members) {
          const world = worldMatrix(scene, m.id)
          detach(scene, m)
          setLocalFromMatrix(m, groupWorldInverse.clone().multiply(world))
          m.parentId = id
          group.childIds.push(m.id)
        }
        groupId = id
      })
      return groupId
    },

    ungroup: (ids) => {
      const released: string[] = []
      change((scene) => {
        for (const id of ids) {
          const group = scene.nodes[id]
          if (!group || group.type !== 'group') continue
          const groupLocal = localMatrix(group)
          const children = [...group.childIds]
          for (const childId of children) {
            const child = scene.nodes[childId]
            setLocalFromMatrix(child, groupLocal.clone().multiply(localMatrix(child)))
            child.parentId = group.parentId
            insertAfter(scene, group, childId, children.indexOf(childId))
            released.push(childId)
          }
          group.childIds = []
          detach(scene, group)
          delete scene.nodes[id]
        }
      })
      return released
    },

    beginGesture: (owner = 'default') => {
      const { gestureStart, gestureOwners, project } = get()
      if (gestureOwners.includes(owner)) return
      set({ gestureStart: gestureStart ?? project, gestureOwners: [...gestureOwners, owner] })
    },
    endGesture: (owner = 'default') => {
      const { gestureStart, gestureOwners, project, past } = get()
      // Only the one who started a gesture can end it, and overlapping gestures (e.g. scrolling
      // while flying the camera) merge into one undo step that ends when the last one does.
      if (!gestureStart || !gestureOwners.includes(owner)) return
      const owners = gestureOwners.filter((o) => o !== owner)
      if (owners.length > 0) {
        set({ gestureOwners: owners })
      } else if (gestureStart === project) {
        set({ gestureStart: null, gestureOwners: [] })
      } else {
        set({ gestureStart: null, gestureOwners: [], past: [...past, gestureStart].slice(-HISTORY_LIMIT), future: [] })
      }
    },

    undo: () => {
      const { past, future, project, gestureStart } = get()
      if (gestureStart || past.length === 0) return
      set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] })
      dropMissingShot()
    },
    redo: () => {
      const { past, future, project, gestureStart } = get()
      if (gestureStart || future.length === 0) return
      set({ project: future[0], past: [...past, project], future: future.slice(1) })
      dropMissingShot()
    }
  }
})

// ---------- Selectors ----------

export function activeScene(state: Pick<DocumentState, 'project' | 'sceneId'>): Scene {
  return state.project.scenes.find((s) => s.id === state.sceneId) ?? state.project.scenes[0]
}

/** The active scene's nodes as a shot sees them (Master if shotId is null or not a camera). */
export function sceneForShot(
  state: Pick<DocumentState, 'project' | 'sceneId'>,
  shotId: string | null
): Record<string, SceneNode> {
  const scene = activeScene(state)
  const shot = shotId ? scene.nodes[shotId] : undefined
  return effectiveNodes(scene.nodes, shot?.type === 'camera' ? shot.overrides : undefined)
}

/** The active scene's nodes as the shot being edited sees them. */
export function editedNodes(state: Pick<DocumentState, 'project' | 'sceneId' | 'activeShotId'>): Record<string, SceneNode> {
  return sceneForShot(state, state.activeShotId)
}

export function hasUnsavedChanges(state: Pick<DocumentState, 'project' | 'savedProject'>): boolean {
  if (state.savedProject === null) {
    // A brand-new project only counts as changed once something is in it.
    return state.project.scenes.some((s) => s.rootIds.length > 0)
  }
  return state.project !== state.savedProject
}

// ---------- Scene helpers ----------

function round(n: number): number {
  return Math.round(n * 10000) / 10000 || 0 // "|| 0" turns -0 into 0
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i])
  if (a && b && typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b)
  return a === b
}

/** "Box 3" -> "Box"; "Wall" -> "Wall". */
function baseName(name: string): string {
  return name.replace(/\s+\d+$/, '')
}

/** Next free "<label> N" name in the scene. */
function nextName(scene: Scene, label: string): string {
  let max = 0
  const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)$`)
  for (const node of Object.values(scene.nodes)) {
    const m = node.name.match(pattern)
    if (m) max = Math.max(max, Number(m[1]))
    else if (node.name === label) max = Math.max(max, 1)
  }
  return `${label} ${max + 1}`
}

function siblingsOf(scene: Draft<Scene>, node: SceneNode): string[] {
  if (node.parentId) {
    const parent = scene.nodes[node.parentId]
    if (parent?.type === 'group') return parent.childIds
  }
  return scene.rootIds
}

function detach(scene: Draft<Scene>, node: SceneNode): void {
  const list = siblingsOf(scene, node)
  const i = list.indexOf(node.id)
  if (i >= 0) list.splice(i, 1)
}

/** Insert `id` into `anchor`'s sibling list, just after the anchor (plus an optional extra offset). */
function insertAfter(scene: Draft<Scene>, anchor: SceneNode, id: string, extra = 0): void {
  const list = siblingsOf(scene, anchor)
  const i = list.indexOf(anchor.id)
  list.splice(i >= 0 ? i + 1 + extra : list.length, 0, id)
}

function subtreeIds(scene: Scene, id: string): string[] {
  const node = scene.nodes[id]
  if (!node) return []
  if (node.type !== 'group') return [id]
  return [id, ...node.childIds.flatMap((c) => subtreeIds(scene, c))]
}

/** Drop ids whose ancestor is also in the list (acting on the ancestor already covers them). */
export function topLevelOnly(scene: Scene, ids: string[]): string[] {
  const set = new Set(ids)
  return ids.filter((id) => {
    let parent = scene.nodes[id]?.parentId
    while (parent) {
      if (set.has(parent)) return false
      parent = scene.nodes[parent]?.parentId ?? null
    }
    return id in scene.nodes
  })
}

/** Copy a node and everything in it; `idMap` records original id -> copy id. */
function copySubtree(scene: Draft<Scene>, id: string, parentId: string | null, idMap: Map<string, string>): string {
  const source = scene.nodes[id]
  const copyId = newId()
  idMap.set(id, copyId)
  if (source.type === 'group') {
    const copy: GroupNode = { ...toPlain(source), id: copyId, parentId, childIds: [], name: nextName(scene, baseName(source.name)) }
    scene.nodes[copyId] = copy
    copy.childIds = source.childIds.map((c) => copySubtree(scene, c, copyId, idMap))
  } else {
    scene.nodes[copyId] = { ...toPlain(source), id: copyId, parentId, name: nextName(scene, baseName(source.name)) }
  }
  return copyId
}

function toPlain<T extends SceneNode>(node: Draft<T>): T {
  return JSON.parse(JSON.stringify(node)) as T
}

function toPlainValue<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as T)
}

// ---------- Transform math (positions in metres, rotations in degrees) ----------

export function localMatrix(node: Pick<SceneNode, 'position' | 'rotation' | 'scale'>): Matrix4 {
  const euler = new Euler(...(node.rotation.map((d) => MathUtils.degToRad(d)) as Vec3), 'XYZ')
  return new Matrix4().compose(
    new Vector3(...node.position),
    new Quaternion().setFromEuler(euler),
    new Vector3(...node.scale)
  )
}

export function worldMatrix(scene: Scene, id: string): Matrix4 {
  const node = scene.nodes[id]
  const local = localMatrix(node)
  return node.parentId ? worldMatrix(scene, node.parentId).multiply(local) : local
}

function setLocalFromMatrix(node: Draft<SceneNode>, m: Matrix4): void {
  const p = new Vector3()
  const q = new Quaternion()
  const s = new Vector3()
  m.decompose(p, q, s)
  const e = new Euler().setFromQuaternion(q, 'XYZ')
  node.position = [round(p.x), round(p.y), round(p.z)]
  node.rotation = [round(MathUtils.radToDeg(e.x)), round(MathUtils.radToDeg(e.y)), round(MathUtils.radToDeg(e.z))]
  node.scale = [round(s.x), round(s.y), round(s.z)]
}

import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three'
import {
  createEmptyProject,
  newId,
  type GroupNode,
  type PrimitiveNode,
  type PrimitiveType,
  type Project,
  type Scene,
  type SceneNode,
  type Vec3
} from '../../../shared/project'
import { DEFAULT_PRIMITIVE_COLOR, PRIMITIVES } from '../../../shared/primitives'

// The document store holds the project: everything that is saved to disk and can be undone.
// Undo works by keeping whole-project snapshots. Immer shares unchanged parts between
// snapshots, so this stays cheap.

const HISTORY_LIMIT = 200
const DUPLICATE_OFFSET = 0.5 // metres along X, so a duplicate is visible next to the original

export type NodePatch = Partial<
  Pick<PrimitiveNode, 'name' | 'position' | 'rotation' | 'scale' | 'color' | 'hidden' | 'locked'>
>

interface DocumentState {
  project: Project
  /** The project as last saved or opened. Unsaved changes = project !== savedProject. */
  savedProject: Project | null
  sceneId: string
  past: Project[]
  future: Project[]
  /** Set while a gizmo drag is in progress; the whole drag becomes one undo step. */
  gestureStart: Project | null

  newProject: () => void
  loadProject: (project: Project) => void
  /** Record which project state is now on disk (defaults to the current one). */
  markSaved: (saved?: Project) => void

  addPrimitive: (primitive: PrimitiveType, groundPoint?: [number, number]) => string
  updateNode: (id: string, patch: NodePatch) => void
  updateNodes: (ids: string[], patch: NodePatch) => void
  deleteNodes: (ids: string[]) => void
  duplicateNodes: (ids: string[]) => string[]
  groupNodes: (ids: string[]) => string | null
  ungroup: (ids: string[]) => string[]

  beginGesture: () => void
  endGesture: () => void
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
    gestureStart: null
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
      change((scene) => {
        for (const id of ids) {
          const node = scene.nodes[id]
          if (!node) continue
          for (const [key, value] of Object.entries(patch)) {
            if (key === 'color' && node.type !== 'primitive') continue
            if (!sameValue((node as Record<string, unknown>)[key], value)) {
              ;(node as Record<string, unknown>)[key] = value
            }
          }
        }
      })
    },

    deleteNodes: (ids) => {
      change((scene) => {
        for (const id of topLevelOnly(scene, ids)) {
          const node = scene.nodes[id]
          if (!node) continue
          detach(scene, node)
          for (const d of subtreeIds(scene, id)) delete scene.nodes[d]
        }
      })
    },

    duplicateNodes: (ids) => {
      const created: string[] = []
      change((scene) => {
        for (const id of topLevelOnly(scene, ids)) {
          const original = scene.nodes[id]
          if (!original) continue
          const copyId = copySubtree(scene, id, original.parentId)
          const copy = scene.nodes[copyId]
          copy.position = [round(copy.position[0] + DUPLICATE_OFFSET), copy.position[1], copy.position[2]]
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

    beginGesture: () => {
      if (!get().gestureStart) set({ gestureStart: get().project })
    },
    endGesture: () => {
      const { gestureStart, project, past } = get()
      if (!gestureStart) return
      if (gestureStart === project) {
        set({ gestureStart: null })
      } else {
        set({ gestureStart: null, past: [...past, gestureStart].slice(-HISTORY_LIMIT), future: [] })
      }
    },

    undo: () => {
      const { past, future, project, gestureStart } = get()
      if (gestureStart || past.length === 0) return
      set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] })
    },
    redo: () => {
      const { past, future, project, gestureStart } = get()
      if (gestureStart || future.length === 0) return
      set({ project: future[0], past: [...past, project], future: future.slice(1) })
    }
  }
})

// ---------- Selectors ----------

export function activeScene(state: Pick<DocumentState, 'project' | 'sceneId'>): Scene {
  return state.project.scenes.find((s) => s.id === state.sceneId) ?? state.project.scenes[0]
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

function copySubtree(scene: Draft<Scene>, id: string, parentId: string | null): string {
  const source = scene.nodes[id]
  const copyId = newId()
  if (source.type === 'group') {
    const copy: GroupNode = { ...toPlain(source), id: copyId, parentId, childIds: [], name: nextName(scene, baseName(source.name)) }
    scene.nodes[copyId] = copy
    copy.childIds = source.childIds.map((c) => copySubtree(scene, c, copyId))
  } else {
    scene.nodes[copyId] = { ...toPlain(source), id: copyId, parentId, name: nextName(scene, baseName(source.name)) }
  }
  return copyId
}

function toPlain<T extends SceneNode>(node: Draft<T>): T {
  return JSON.parse(JSON.stringify(node)) as T
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

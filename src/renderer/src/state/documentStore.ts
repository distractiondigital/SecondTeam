import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three'
import { sanitizeLookAt, sanitizePlants, type Plants } from '../../../shared/posing'
import { localMatrix, parentWorldMatrix, placementFromMatrix, placementUnder, worldMatrix as worldMatrixOf } from '../../../shared/transforms'
import {
  clampScale,
  createEmptyProject,
  createEmptyScene,
  DEFAULT_REFERENCE_STRENGTH,
  isSafeFileName,
  MAX_REFERENCE_IMAGES,
  newId,
  repairCamera,
  type Anchor,
  type CameraNode,
  type CastLook,
  type CastMember,
  type Prop,
  type GroupNode,
  type LightNode,
  type MannequinNode,
  type PrimitiveNode,
  type PrimitiveType,
  type Project,
  type Scene,
  type SceneNode,
  type Vec3,
  MATERIALS,
  type MaterialKind
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
import {
  compareShotNumbers,
  nextShotName,
  renumberShot,
  repairKit,
  rotationFromPanTiltRoll,
  shotLetters,
  type CameraKit
} from '../../../shared/camera'
import { applyOverride, effectiveNodes, isOverridable } from '../../../shared/overrides'
import {
  clampCone,
  clampKelvin,
  clampLightSize,
  clampStops,
  clampUnit,
  defaultLightSize,
  LIGHT_LABELS,
  type LightKind
} from '../../../shared/lighting'
import { clampTime, DEFAULT_ENVIRONMENT, type Environment } from '../../../shared/environment'
import { DEFAULT_STOP } from '../../../shared/depthOfField'
import {
  AVERAGE_BODY,
  DEFAULT_HANDS,
  defaultAppearance,
  sanitizeAppearance,
  sanitizeBody,
  sanitizeExpression,
  sanitizeHands
} from '../../../shared/humanBody'
import { repairGeneration, type GenerationSettings } from '../../../shared/prompt'

// The document store holds the project: everything that is saved to disk and can be undone.
// Undo works by keeping whole-project snapshots. Immer shares unchanged parts between
// snapshots, so this stays cheap.

const HISTORY_LIMIT = 200
const DUPLICATE_OFFSET = 0.5 // metres along X, so a duplicate is visible next to the original

export type CameraField =
  | 'shotNumber'
  | 'focalLength'
  | 'focusDistance'
  | 'aperture'
  | 'subjectId'
  | 'sizeOverride'
  | 'angleOverride'
  | 'lightingOverride'
  | 'description'
  | 'notes'
  | 'circleTake'
  | 'boardText'
  | 'dialogue'

export type LightField = 'stops' | 'kelvin' | 'size' | 'shadows' | 'coneAngle' | 'falloff'
const LIGHT_FIELDS: LightField[] = ['stops', 'kelvin', 'size', 'shadows', 'coneAngle', 'falloff']

export type NodePatch = Partial<
  Pick<PrimitiveNode, 'name' | 'position' | 'rotation' | 'scale' | 'color' | 'hidden' | 'locked'> &
    Pick<MannequinNode, 'height' | 'build' | 'limits' | 'castId' | 'style' | 'body' | 'appearance' | 'expression' | 'hands' | 'plants' | 'lookAt'> &
    Pick<PrimitiveNode, 'material'> &
    Pick<PrimitiveNode, 'propId'> &
    Pick<CameraNode, CameraField> &
    Pick<LightNode, LightField>
>

const CAMERA_FIELDS: CameraField[] = [
  'shotNumber',
  'focalLength',
  'focusDistance',
  'aperture',
  'subjectId',
  'sizeOverride',
  'angleOverride',
  'lightingOverride',
  'description',
  'notes',
  'circleTake',
  'boardText',
  'dialogue'
]

/** Which node types each patch field applies to (fields not listed apply to every node). */
const FIELD_TYPES: Partial<Record<keyof NodePatch, SceneNode['type'][]>> = {
  color: ['primitive', 'mannequin'],
  height: ['mannequin'],
  build: ['mannequin'],
  limits: ['mannequin'],
  castId: ['mannequin'],
  style: ['mannequin'],
  body: ['mannequin'],
  appearance: ['mannequin'],
  expression: ['mannequin'],
  hands: ['mannequin'],
  plants: ['mannequin'],
  material: ['primitive'],
  lookAt: ['mannequin'],
  propId: ['primitive', 'group'],
  scale: ['primitive', 'group'], // a figure's size comes from its height; cameras don't scale
  ...Object.fromEntries(CAMERA_FIELDS.map((f) => [f, ['camera']])),
  ...Object.fromEntries(LIGHT_FIELDS.map((f) => [f, ['light']])),
  // Shots describe their frame; figures, objects and groups describe themselves for regional prompts.
  description: ['camera', 'primitive', 'group', 'mannequin']
}

/** Where a new camera comes from: the current view, plus optional settings to copy. */
export interface CameraSpawn {
  position: Vec3
  rotation: Vec3
  /** Lens for the new shot (defaults to the active shot's, or 35 mm). */
  focalLength?: number
}

function normalizeField(key: keyof NodePatch, value: unknown, node: SceneNode): unknown {
  if (key === 'scale') return clampScale(value as Vec3)
  if (key === 'height') return clampHeight(value as number)
  if (key === 'build') return clampBuild(value as number)
  if (key === 'body') return sanitizeBody(value)
  if (key === 'appearance') return sanitizeAppearance(value, 0.5)
  if (key === 'expression') return sanitizeExpression(value)
  if (key === 'hands') return sanitizeHands(value)
  if (key === 'plants') return sanitizePlants(value)
  if (key === 'material') return MATERIALS.includes(value as MaterialKind) ? value : 'matte'
  if (key === 'lookAt') return sanitizeLookAt(value)
  if (key === 'style') return value === 'mannequin' ? 'mannequin' : 'human'
  if (key === 'stops') return clampStops(value as number)
  if (key === 'kelvin') return clampKelvin(value as number)
  if (key === 'size' && node.type === 'light') return clampLightSize(node.kind, value as number)
  if (key === 'falloff') return clampUnit(value as number)
  if (key === 'coneAngle') return clampCone(value as number)
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

  /** `base`: the height of the surface it stands on (m). */
  addPrimitive: (primitive: PrimitiveType, groundPoint?: [number, number], base?: number) => string
  updateNode: (id: string, patch: NodePatch) => void
  updateNodes: (ids: string[], patch: NodePatch) => void
  /** Move a primitive's origin to its bottom, middle or top without moving the object. */
  setAnchor: (id: string, anchor: Anchor) => void
  /** Add a shot (its camera) at a viewpoint; it gets the scene's next letter (1A, 1B…). */
  addCamera: (spawn: CameraSpawn) => string
  /** Change the project-wide camera body/format (sensor, squeeze, guides, delivery, thirds). */
  updateCameraKit: (patch: Partial<CameraKit>) => void
  /** Change the project's generation settings (kept in range; one undo step). */
  updateGeneration: (patch: Partial<GenerationSettings>) => void
  /** The project's style text, added to every prompt. */
  setStyleText: (text: string) => void
  /** Style reference images (file names in assets/style/). */
  setStyleImages: (images: string[]) => void

  /** Add a cast member or prop; returns its id. */
  addCast: (init?: Partial<Omit<CastMember, 'id'>>) => string
  updateCast: (id: string, patch: Partial<Omit<CastMember, 'id'>>) => void
  /** Delete a cast member; figures linked to it (in every scene) become unlinked. */
  deleteCast: (id: string) => void
  addProp: (init?: Partial<Omit<Prop, 'id'>>) => string
  updateProp: (id: string, patch: Partial<Omit<Prop, 'id'>>) => void
  /**
   * A cast member's / prop's own text for the active scene or the shot being edited (used instead
   * of the usual description there); null goes back to the usual one.
   */
  setDescriptionTweak: (entityId: string, scope: 'scene' | 'shot', text: string | null) => void
  /** Delete a prop; objects and groups linked to it (in every scene) become unlinked. */
  deleteProp: (id: string) => void
  /** The storyboard's order (shot camera ids, across scenes). */
  setBoardOrder: (order: string[]) => void
  /** A storyboard panel's captions, for a shot in any scene. */
  updatePanel: (sceneId: string, shotId: string, patch: { boardText?: string | null; dialogue?: string; notes?: string }) => void

  /** Switch to another scene (back to its own set, not a shot). */
  setSceneId: (sceneId: string) => void
  /** Add an empty scene, or a copy of the current scene's set (without shots). Returns its id. */
  addScene: (copyCurrent: boolean) => string
  /** Change the current scene's number and/or title; its shots are renamed to match. */
  renameScene: (number: number, name: string) => void
  /** Whether render passes and thumbnails get the automatic floor. */
  setSceneFloor: (floor: boolean) => void
  /** Time of day / ground of a shot (if it has its own) or else of the active scene. */
  setEnvironment: (shotId: string | null, patch: Partial<Environment>) => void
  /** Give a shot its own environment (starting from the scene's), or make it follow the scene again. */
  setShotOwnEnvironment: (shotId: string, own: boolean) => void
  /** Delete the current scene (not the last one). */
  deleteScene: () => void
  /** Put the scene's shots in this order; they're renamed to match (1A, 1B, 1C…). */
  reorderShots: (cameraIds: string[]) => void

  addMannequin: (groundPoint?: [number, number], base?: number) => string
  /** Add a light 2.5 m above where it goes (see shared/placement.ts); sun and spot start aimed down and forward. */
  addLight: (kind: LightKind, groundPoint?: [number, number], base?: number) => string
  /** Set one joint's rotation (degrees); clamped to realistic limits if the figure has them on. */
  setJointRotation: (id: string, joint: JointName, rotation: Vec3) => void
  /** Pelvis shift from standing, as a fraction of the figure's height. */
  setPelvisOffset: (id: string, offset: Vec3) => void
  /**
   * Posing 2: several joints, the hip offset and/or the planted hands/feet at once, as one change
   * (joints are clamped to their ranges if the figure has limits on). `plants` replaces the set.
   */
  updatePose: (id: string, change: { joints?: Partial<Record<JointName, Vec3>>; pelvisOffset?: Vec3; plants?: Plants }) => void
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
  /**
   * Outliner drag & drop: move nodes into `parentId` (a group, or null for the top level), just
   * before `beforeId` (or at the end). Everything keeps its place in the world, in Master and in
   * every shot. A group can't go inside itself. Always changes Master (the hierarchy is Master's).
   */
  moveNodes: (ids: string[], parentId: string | null, beforeId: string | null) => void

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
    project: Draft<Project>
  }

  /** If undo/redo removed the active shot's camera, go back to editing Master. */
  function dropMissingShot(): void {
    const { activeShotId } = get()
    if (activeShotId && activeScene(get()).nodes[activeShotId]?.type !== 'camera') set({ activeShotId: null })
  }

  /** Like `change`, but aware of the active shot (see EditContext). */
  function edit(recipe: (ctx: EditContext) => void): void {
    const shotId = get().activeShotId
    change((scene, project) => {
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
      recipe({ scene, shot, view, write, project })
    })
  }

  return {
    ...initialState(createEmptyProject(), null),

    newProject: () => set(initialState(createEmptyProject(), null)),
    loadProject: (project) => set(initialState(project, project)),
    markSaved: (saved) => set({ savedProject: saved ?? get().project }),

    addPrimitive: (primitive, groundPoint = [0, 0], base = 0) => {
      const id = newId()
      change((scene) => {
        const label = PRIMITIVES[primitive].label
        const node: PrimitiveNode = {
          id,
          type: 'primitive',
          primitive,
          name: nextName(scene, label),
          parentId: null,
          position: [round(groundPoint[0]), round(base), round(groundPoint[1])],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          hidden: false,
          locked: false,
          color: DEFAULT_PRIMITIVE_COLOR,
          anchor: defaultAnchor(primitive),
          material: 'matte',
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
      edit(({ scene, shot, write, project }) => {
        for (const id of ids) {
          const node = scene.nodes[id]
          if (!node) continue
          const fields: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(patch) as [keyof NodePatch, unknown][]) {
            const types = FIELD_TYPES[key]
            if (types && !types.includes(node.type)) continue
            const next = normalizeField(key, value, node)
            if (key === 'shotNumber' && node.type === 'camera' && node.name === `Shot ${node.shotNumber}`) {
              node.name = `Shot ${String(next).trim()}` // keep the default name in step
            }
            fields[key] = next
          }
          write(id, fields)
          if (node.type === 'camera') repairCamera(node as CameraNode)
          // Figures linked to a cast member share its look (in the scene's set; a shot's change
          // stays a cheat for that shot).
          if (node.type === 'mannequin' && node.castId && (!shot || 'castId' in fields)) {
            const cast = project.cast.find((c) => c.id === node.castId)
            if (!cast) continue
            if ('castId' in fields && cast.look) {
              // Just linked: take the cast member's look.
              Object.assign(node, toPlainValue(cast.look))
            } else if ('castId' in fields || LOOK_FIELDS.some((f) => f in fields)) {
              // Changed (or first linked): this figure's look becomes the cast member's, everywhere.
              const look = lookOf(node as MannequinNode)
              cast.look = look
              for (const sc of project.scenes) {
                for (const other of Object.values(sc.nodes)) {
                  if (other.type === 'mannequin' && other.castId === cast.id && other.id !== node.id) Object.assign(other, toPlainValue(look))
                }
              }
            }
          }
        }
      })
    },

    addCamera: (spawn) => {
      const id = newId()
      edit(({ scene, shot }) => {
        const shots = Object.values(scene.nodes).flatMap((n) => (n.type === 'camera' ? [n.shotNumber] : []))
        const shotNumber = nextShotName(scene.number, shots)
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
          focalLength: spawn.focalLength ?? shot?.focalLength ?? 35,
          focusDistance: null,
          aperture: shot?.aperture ?? DEFAULT_STOP,
          subjectId: null,
          sizeOverride: null,
          angleOverride: null,
          lightingOverride: null,
          // A new shot made from another starts with its description (usually the same action).
          description: shot?.description ?? '',
          notes: '',
          circleTake: null,
          boardText: null,
          dialogue: '',
          environment: shot?.environment ? toPlainValue(shot.environment)! : null,
          // A shot made while another shot is active starts from that shot's version of the set.
          overrides: shot ? toPlainValue(shot.overrides)! : {},
          // …and that shot's own cast/prop texts.
          descriptions: shot ? { ...shot.descriptions } : {}
        }
        repairCamera(node)
        scene.nodes[id] = node
        scene.rootIds.push(id)
      })
      return id
    },

    updateCameraKit: (patch) => {
      change((_scene, project) => {
        const next = repairKit({ ...toPlainValue(project.camera), ...patch })
        if (!sameValue(toPlainValue(project.camera), next)) project.camera = next
      })
    },

    updateGeneration: (patch) => {
      change((_scene, project) => {
        const next = repairGeneration({ ...toPlainValue(project.generation), ...patch })
        if (!sameValue(toPlainValue(project.generation), next)) project.generation = next
      })
    },

    setStyleText: (text) => {
      if (get().project.styleText === text) return
      change((_scene, project) => {
        project.styleText = text
      })
    },

    setStyleImages: (images) => {
      change((_scene, project) => {
        project.styleImages = images.filter(isSafeFileName).slice(0, MAX_REFERENCE_IMAGES)
      })
    },

    addCast: (init = {}) => {
      const id = newId()
      change((_scene, project) => {
        project.cast.push({
          id,
          name: init.name?.trim() || `Cast ${project.cast.length + 1}`,
          description: init.description ?? '',
          color: init.color ?? FIGURE_COLORS[project.cast.length % FIGURE_COLORS.length],
          images: (init.images ?? []).filter(isSafeFileName).slice(0, MAX_REFERENCE_IMAGES),
          strength: clampStrength(init.strength ?? DEFAULT_REFERENCE_STRENGTH),
          look: null
        })
      })
      return id
    },

    updateCast: (id, patch) => {
      change((_scene, project) => {
        const c = project.cast.find((x) => x.id === id)
        if (!c) return
        if (patch.name !== undefined) c.name = patch.name.trim() || c.name
        if (patch.description !== undefined) c.description = patch.description
        if (patch.color !== undefined) c.color = patch.color
        if (patch.images !== undefined) c.images = patch.images.filter(isSafeFileName).slice(0, MAX_REFERENCE_IMAGES)
        if (patch.strength !== undefined) c.strength = clampStrength(patch.strength)
      })
    },

    deleteCast: (id) => {
      change((_scene, project) => {
        project.cast = project.cast.filter((c) => c.id !== id)
        for (const s of project.scenes) {
          for (const n of Object.values(s.nodes)) if (n.type === 'mannequin' && n.castId === id) n.castId = null
        }
      })
    },

    addProp: (init = {}) => {
      const id = newId()
      change((_scene, project) => {
        project.props.push({
          id,
          name: init.name?.trim() || `Prop ${project.props.length + 1}`,
          description: init.description ?? '',
          images: (init.images ?? []).filter(isSafeFileName).slice(0, MAX_REFERENCE_IMAGES),
          strength: clampStrength(init.strength ?? DEFAULT_REFERENCE_STRENGTH)
        })
      })
      return id
    },

    setDescriptionTweak: (entityId, scope, text) => {
      change((scene) => {
        const shotId = get().activeShotId
        const shot = shotId ? scene.nodes[shotId] : undefined
        const holder = scope === 'scene' ? scene : shot?.type === 'camera' ? shot : null
        if (!holder) return
        if (text === null) delete holder.descriptions[entityId]
        else holder.descriptions[entityId] = text.slice(0, 2000)
      })
    },

    updateProp: (id, patch) => {
      change((_scene, project) => {
        const p = project.props.find((x) => x.id === id)
        if (!p) return
        if (patch.name !== undefined) p.name = patch.name.trim() || p.name
        if (patch.description !== undefined) p.description = patch.description
        if (patch.images !== undefined) p.images = patch.images.filter(isSafeFileName).slice(0, MAX_REFERENCE_IMAGES)
        if (patch.strength !== undefined) p.strength = clampStrength(patch.strength)
      })
    },

    deleteProp: (id) => {
      change((_scene, project) => {
        project.props = project.props.filter((p) => p.id !== id)
        for (const s of project.scenes) {
          for (const n of Object.values(s.nodes)) {
            if ((n.type === 'primitive' || n.type === 'group') && n.propId === id) n.propId = null
          }
        }
      })
    },

    setBoardOrder: (order) => {
      const next = [...new Set(order)]
      if (sameValue(toPlainValue(get().project.board.order), next)) return
      change((_scene, project) => {
        project.board.order = next
      })
    },

    updatePanel: (sceneId, shotId, patch) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId)
      const before = scene?.nodes[shotId]
      if (!before || before.type !== 'camera') return
      if (Object.entries(patch).every(([k, v]) => (before as unknown as Record<string, unknown>)[k] === v)) return
      change((_scene, project) => {
        const shot = project.scenes.find((s) => s.id === sceneId)?.nodes[shotId]
        if (!shot || shot.type !== 'camera') return
        if (patch.boardText !== undefined) shot.boardText = patch.boardText
        if (patch.dialogue !== undefined) shot.dialogue = patch.dialogue
        if (patch.notes !== undefined) shot.notes = patch.notes
      })
    },

    setSceneId: (sceneId) => {
      if (get().project.scenes.some((s) => s.id === sceneId)) set({ sceneId, activeShotId: null })
    },

    addScene: (copyCurrent) => {
      const current = activeScene(get())
      const number = Math.max(0, ...get().project.scenes.map((s) => s.number)) + 1
      const scene = createEmptyScene(number)
      if (copyCurrent) {
        // The set without its shots: drop cameras (and group entries pointing at them).
        const plain = JSON.parse(JSON.stringify(current)) as Scene
        for (const node of Object.values(plain.nodes)) {
          if (node.type === 'camera') delete plain.nodes[node.id]
        }
        for (const node of Object.values(plain.nodes)) {
          if (node.type === 'group') node.childIds = node.childIds.filter((c) => c in plain.nodes)
        }
        scene.nodes = plain.nodes
        scene.rootIds = plain.rootIds.filter((id) => id in plain.nodes)
        scene.floor = plain.floor
        scene.environment = plain.environment
      }
      change((_scene, project) => {
        const i = project.scenes.findIndex((s) => s.id === current.id)
        project.scenes.splice(i + 1, 0, scene)
      })
      set({ sceneId: scene.id, activeShotId: null })
      return scene.id
    },

    renameScene: (number, name) => {
      change((scene) => {
        const n = Math.max(1, Math.round(number)) || scene.number
        if (n !== scene.number) {
          for (const node of Object.values(scene.nodes)) {
            if (node.type !== 'camera') continue
            const renamed = renumberShot(node.shotNumber, scene.number, n)
            if (node.name === `Shot ${node.shotNumber}`) node.name = `Shot ${renamed}`
            node.shotNumber = renamed
          }
          scene.number = n
        }
        if (scene.name !== name.trim()) scene.name = name.trim()
      })
    },

    setEnvironment: (shotId, patch) => {
      const clean = { ...patch, ...(patch.time !== undefined ? { time: clampTime(patch.time) } : {}) }
      change((scene) => {
        const shot = shotId ? scene.nodes[shotId] : undefined
        if (shot?.type === 'camera' && shot.environment) Object.assign(shot.environment, clean)
        else scene.environment = { ...(toPlainValue(scene.environment) ?? DEFAULT_ENVIRONMENT), ...clean }
      })
    },

    setShotOwnEnvironment: (shotId, own) => {
      change((scene) => {
        const shot = scene.nodes[shotId]
        if (shot?.type !== 'camera' || Boolean(shot.environment) === own) return
        shot.environment = own ? (toPlainValue(scene.environment) ?? { ...DEFAULT_ENVIRONMENT }) : null
      })
    },

    setSceneFloor: (floor) => {
      if (activeScene(get()).floor === floor) return
      change((scene) => {
        scene.floor = floor
      })
    },

    reorderShots: (cameraIds) => {
      change((scene) => {
        const known = new Set(shotsInOrder(scene).map((c) => c.id))
        const ordered = cameraIds.filter((id) => known.has(id)).map((id) => scene.nodes[id] as Draft<CameraNode>)
        // Any shot missing from the list keeps its place at the end.
        for (const c of shotsInOrder(scene)) if (!cameraIds.includes(c.id)) ordered.push(c)
        renameShotsInOrder(scene, ordered)
      })
    },

    deleteScene: () => {
      const { project, sceneId } = get()
      if (project.scenes.length < 2) return
      const i = project.scenes.findIndex((s) => s.id === sceneId)
      change((_scene, draft) => {
        draft.scenes.splice(i, 1)
      })
      const remaining = get().project.scenes
      set({ sceneId: remaining[Math.max(0, i - 1)].id, activeShotId: null })
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

    addLight: (kind, groundPoint = [0, 0], base = 0) => {
      const id = newId()
      change((scene) => {
        const aimed = kind === 'sun' || kind === 'spot'
        const node: LightNode = {
          id,
          type: 'light',
          kind,
          name: nextName(scene, LIGHT_LABELS[kind]),
          parentId: null,
          position: [round(groundPoint[0]), round(base + (kind === 'ambient' ? 3 : 2.5)), round(groundPoint[1])],
          // Aimed down and forward: pan 30°, tilt down 45° (sun) or 60° (spot).
          rotation: aimed ? rotationFromPanTiltRoll(30, kind === 'sun' ? -45 : -60, 0) : [0, 0, 0],
          scale: [1, 1, 1],
          hidden: false,
          locked: false,
          stops: kind === 'ambient' ? -2 : 0,
          kelvin: kind === 'sun' ? 5600 : kind === 'ambient' ? 7000 : 3200,
          size: defaultLightSize(kind),
          shadows: kind !== 'ambient',
          coneAngle: 40,
          falloff: 0.3
        }
        scene.nodes[id] = node
        scene.rootIds.push(id)
      })
      return id
    },

    addMannequin: (groundPoint = [0, 0], base = 0) => {
      const id = newId()
      change((scene) => {
        const figureCount = Object.values(scene.nodes).filter((n) => n.type === 'mannequin').length
        // New figures are people, alternating man / woman (change it in Properties).
        const male = figureCount % 2 === 0
        const height = male ? 1.78 : 1.65
        const node: MannequinNode = {
          id,
          type: 'mannequin',
          name: nextName(scene, 'Figure'),
          parentId: null,
          position: [round(groundPoint[0]), round(base), round(groundPoint[1])],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          hidden: false,
          locked: false,
          height,
          build: DEFAULT_BUILD,
          style: 'human',
          body: { ...AVERAGE_BODY, gender: male ? 1 : 0 },
          appearance: defaultAppearance(male ? 1 : 0),
          expression: 'neutral',
          hands: { ...DEFAULT_HANDS },
          plants: {},
          lookAt: null,
          color: FIGURE_COLORS[figureCount % FIGURE_COLORS.length],
          castId: null,
          description: '',
          limits: true,
          pose: POSE_PRESETS.standing.make(proportions(height, DEFAULT_BUILD))
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

    updatePose: (id, change) => {
      edit(({ view, write }) => {
        const node = view(id)
        if (node?.type !== 'mannequin') return
        const pose = node.pose
        for (const [joint, rotation] of Object.entries(change.joints ?? {}) as [JointName, Vec3][]) {
          const rounded = rotation.map((r) => round(r)) as Vec3
          pose.joints[joint] = node.limits ? clampJoint(joint, rounded) : rounded
        }
        if (change.pelvisOffset) pose.pelvisOffset = change.pelvisOffset.map((v) => round(v)) as Vec3
        write(id, change.plants ? { pose, plants: sanitizePlants(change.plants) } : { pose })
      })
    },

    // A new whole pose releases planted hands and feet (they'd pull it back out of shape).
    applyPreset: (id, preset) => {
      edit(({ view, write }) => {
        const node = view(id)
        if (node?.type === 'mannequin') write(id, { pose: POSE_PRESETS[preset].make(proportions(node.height, node.build)), plants: {} })
      })
    },

    mirrorPose: (id) => {
      edit(({ view, write }) => {
        const node = view(id)
        if (node?.type === 'mannequin') write(id, { pose: mirrorPose(node.pose), plants: {} })
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
        if (view(id)?.type === 'mannequin') write(id, { pose: structuredClone(pose), plants: {} })
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
          const hadShot = removed.some((d) => scene.nodes[d]?.type === 'camera')
          for (const d of removed) delete scene.nodes[d]
          // Shots keep consecutive names: deleting 1B turns 1C into 1B.
          if (hadShot) renameShotsInOrder(scene, shotsInOrder(scene))
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
            n.shotNumber = nextShotName(scene.number, others)
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
        // Cameras belong to their shots, so they're never grouped with set pieces.
        const members = topLevelOnly(scene, ids)
          .map((id) => scene.nodes[id])
          .filter((n) => n && n.type !== 'camera')
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
          childIds: [],
          propId: null,
          description: ''
        }
        scene.nodes[id] = group
        insertAfter(scene, members[0], id)

        reparentInPlace(scene, members.map((m) => m.id), () => {
          for (const m of members) {
            detach(scene, m)
            m.parentId = id
            group.childIds.push(m.id)
          }
        })
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
          const children = [...group.childIds]
          reparentInPlace(scene, children, () => {
            for (const childId of children) {
              scene.nodes[childId].parentId = group.parentId
              insertAfter(scene, group, childId, children.indexOf(childId))
              released.push(childId)
            }
            group.childIds = []
          })
          detach(scene, group)
          delete scene.nodes[id]
        }
      })
      return released
    },

    moveNodes: (ids, parentId, beforeId) => {
      change((scene) => {
        if (parentId && scene.nodes[parentId]?.type !== 'group') return
        // Not into itself or anything inside it, and cameras stay out of the hierarchy.
        const members = topLevelOnly(scene, ids).filter((id) => {
          const node = scene.nodes[id]
          return node && node.type !== 'camera' && !(parentId && subtreeIds(scene, id).includes(parentId))
        })
        if (members.length === 0) return
        // Keep their Outliner order, whatever order they were selected in.
        const order = scene.rootIds.flatMap((id) => subtreeIds(scene, id))
        members.sort((x, y) => order.indexOf(x) - order.indexOf(y))
        const target = () => (parentId ? (scene.nodes[parentId] as Draft<GroupNode>).childIds : scene.rootIds)
        // Dropping next to one of the moved items: anchor on the next item that stays.
        let anchor = beforeId
        if (anchor && members.includes(anchor)) {
          const list = target()
          anchor = list.slice(list.indexOf(anchor)).find((x) => !members.includes(x)) ?? null
        }
        reparentInPlace(scene, members, () => {
          for (const id of members) detach(scene, scene.nodes[id])
          const list = target()
          const at = anchor && list.includes(anchor) ? list.indexOf(anchor) : list.length
          list.splice(at, 0, ...members)
          for (const id of members) scene.nodes[id].parentId = parentId
        })
      })
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

/** The scene a shot belongs to (any scene, e.g. for the storyboard), else the active scene. */
export function sceneOfShot(state: Pick<DocumentState, 'project' | 'sceneId'>, shotId: string | null): Scene {
  const active = activeScene(state)
  if (!shotId || active.nodes[shotId]) return active
  return state.project.scenes.find((s) => s.nodes[shotId]?.type === 'camera') ?? active
}

/** A shot's nodes as it sees them, in its own scene (the active scene's Master if shotId is null or not a camera). */
export function sceneForShot(
  state: Pick<DocumentState, 'project' | 'sceneId'>,
  shotId: string | null
): Record<string, SceneNode> {
  const scene = sceneOfShot(state, shotId)
  const shot = shotId ? scene.nodes[shotId] : undefined
  return effectiveNodes(scene.nodes, shot?.type === 'camera' ? shot.overrides : undefined)
}

/** A shot's environment (its own, else its scene's); null = the active scene's. */
export function environmentFor(state: Pick<DocumentState, 'project' | 'sceneId'>, shotId: string | null): Environment {
  const scene = sceneOfShot(state, shotId)
  const shot = shotId ? scene.nodes[shotId] : undefined
  // (A project loaded by an older build and still in memory has none yet.)
  return (shot?.type === 'camera' && shot.environment) || scene.environment || DEFAULT_ENVIRONMENT
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

// ---------- Cast looks ----------

/** The fields a cast member's linked figures share. */
const LOOK_FIELDS = ['style', 'height', 'body', 'appearance'] as const

function lookOf(node: MannequinNode): CastLook {
  return toPlainValue({ style: node.style, height: node.height, body: node.body, appearance: node.appearance })!
}

// ---------- Scene helpers ----------

function round(n: number): number {
  return Math.round(n * 10000) / 10000 || 0 // "|| 0" turns -0 into 0
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function clampStrength(v: number): number {
  return Number.isFinite(v) ? Math.min(1.5, Math.max(0, v)) : DEFAULT_REFERENCE_STRENGTH
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

/** The scene's shots (cameras) in list order: by shot name. */
function shotsInOrder(scene: Draft<Scene>): Draft<CameraNode>[] {
  return (Object.values(scene.nodes).filter((n) => n.type === 'camera') as Draft<CameraNode>[]).sort((a, b) =>
    compareShotNumbers(a.shotNumber, b.shotNumber)
  )
}

/** Name shots consecutively in the given order: 1A, 1B, 1C… (the default "Shot 1A" labels follow). */
function renameShotsInOrder(scene: Draft<Scene>, shots: Draft<CameraNode>[]): void {
  shots.forEach((c, i) => {
    const name = `${scene.number}${shotLetters(i)}`
    if (c.shotNumber === name) return
    if (c.name === `Shot ${c.shotNumber}`) c.name = `Shot ${name}`
    c.shotNumber = name
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

// ---------- Transform math (see shared/transforms.ts) ----------

export { localMatrix }

export function worldMatrix(scene: Scene, id: string): Matrix4 {
  return worldMatrixOf(scene.nodes, id)
}

function setLocalFromMatrix(node: Draft<SceneNode>, m: Matrix4): void {
  Object.assign(node, placementFromMatrix(m))
}

/** A plain (non-draft) copy of the scene's nodes, for maths that reads the whole scene. */
function plainNodes(scene: Draft<Scene>): Record<string, SceneNode> {
  return JSON.parse(JSON.stringify(scene.nodes)) as Record<string, SceneNode>
}

const PLACEMENT_FIELDS = ['position', 'rotation', 'scale'] as const
const PLACEMENT_TOLERANCE = 1e-3

/**
 * Re-parent `ids` (what `restructure` does to parentIds and child lists) without anything moving
 * in the world: in Master, and in every shot of the scene (a shot that had moved one of them,
 * or its old or new group, gets its own placement re-expressed in the new group).
 */
function reparentInPlace(scene: Draft<Scene>, ids: string[], restructure: () => void): void {
  const shots = Object.values(scene.nodes).filter((n): n is Draft<CameraNode> => n.type === 'camera')
  const before = plainNodes(scene)
  const masterWorld = new Map(ids.map((id) => [id, worldMatrixOf(before, id)]))
  const shotWorld = shots.map((shot) => {
    const view = effectiveNodes(before, toPlainValue(shot.overrides))
    return new Map(ids.map((id) => [id, worldMatrixOf(view, id)]))
  })

  restructure()

  for (const id of ids) {
    const node = scene.nodes[id]
    setLocalFromMatrix(node, parentWorldMatrix(plainNodes(scene), node.parentId).invert().multiply(masterWorld.get(id)!))
  }
  const after = plainNodes(scene)
  shots.forEach((shot, i) => {
    const view = effectiveNodes(after, toPlainValue(shot.overrides))
    for (const id of ids) {
      const node = scene.nodes[id]
      const needed = placementUnder(shotWorld[i].get(id)!, parentWorldMatrix(view, node.parentId))
      const o = (shot.overrides[id] ?? {}) as Record<string, unknown>
      for (const field of PLACEMENT_FIELDS) {
        const master = node[field]
        if (needed[field].every((v, k) => Math.abs(v - master[k]) < PLACEMENT_TOLERANCE)) delete o[field]
        else o[field] = needed[field]
      }
      if (Object.keys(o).length) shot.overrides[id] = o
      else delete shot.overrides[id]
    }
  })
}

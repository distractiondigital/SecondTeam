// The saved project format (project.json). Human-readable and schema-versioned.
// Units: positions in metres, rotations in degrees (XYZ Euler order), Y is up.

import {
  clampBuild,
  clampHeight,
  DEFAULT_BUILD,
  DEFAULT_HEIGHT,
  FIGURE_COLORS,
  JOINT_NAMES,
  restPose,
  sanitizeSavedPoses,
  type Pose,
  type SavedPose
} from './mannequin'
import {
  clampFocal,
  compareShotNumbers,
  DEFAULT_KIT,
  nextShotName,
  repairKit,
  type CameraKit
} from './camera'
import { sanitizeOverrides, type ShotOverrides } from './overrides'
import { clampCone, clampKelvin, clampStops, clampUnit, LIGHT_KINDS, type LightKind } from './lighting'

// v1: M1 (primitives, groups). v2: M2 adds mannequins. v3: M3 adds cameras.
// v4: per-shot changes (camera.overrides). v5: numbered scenes, shots 1A/1B…, one camera kit per project.
// v6: lights. v7: scene.floor (automatic floor in renders).
export const SCHEMA_VERSION = 7

export type Vec3 = [number, number, number]

export const PRIMITIVE_TYPES = ['box', 'cylinder', 'sphere', 'plane', 'capsule', 'cone'] as const
export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number]

/** Where an object's origin sits along its height. Scaling and rotating happen around it. */
export const ANCHORS = ['bottom', 'center', 'top'] as const
export type Anchor = (typeof ANCHORS)[number]

/** Smallest allowed scale on any axis. A zero scale makes an object impossible to click. */
export const MIN_SCALE = 0.001

export function clampScale(scale: Vec3): Vec3 {
  return scale.map((s) => (Number.isFinite(s) ? Math.max(MIN_SCALE, s) : 1)) as Vec3
}

interface NodeBase {
  id: string
  name: string
  parentId: string | null
  position: Vec3
  rotation: Vec3
  scale: Vec3
  hidden: boolean
  locked: boolean
}

export interface PrimitiveNode extends NodeBase {
  type: 'primitive'
  primitive: PrimitiveType
  /** Viewport colour only; does not affect generation. */
  color: string
  /** Origin point along the height. Planes are always 'center'. */
  anchor: Anchor
  /** Link to a Prop entry (Milestone 7). */
  propId: string | null
  /** Optional description override for prompts (Milestone 7). */
  description: string
}

export interface GroupNode extends NodeBase {
  type: 'group'
  childIds: string[]
}

/** A posable human figure. Its scale stays 1; height and build set its size. */
export interface MannequinNode extends NodeBase {
  type: 'mannequin'
  /** Metres, floor to top of head. */
  height: number
  /** 0 = slim … 1 = broad. */
  build: number
  /** Viewport colour (Milestone 7: taken from the linked cast member). */
  color: string
  /** Link to a Cast entry (Milestone 7). */
  castId: string | null
  /** Keep joints inside realistic ranges. */
  limits: boolean
  pose: Pose
}

/**
 * A shot: its camera placement and lens. Looks down its local -Z; its scale stays 1.
 * The camera body and format (sensor, squeeze, guides, delivery frame) are project-wide: Project.camera.
 */
export interface CameraNode extends NodeBase {
  type: 'camera'
  /** Shot name, e.g. '1A'. */
  shotNumber: string
  /** Millimetres. */
  focalLength: number
  /** Metres, or null if not set. */
  focusDistance: number | null
  /** The object or figure the shot is about; null = the nearest figure in frame. */
  subjectId: string | null
  sizeOverride: string | null
  angleOverride: string | null
  /** Hand-written lighting description; null = worked out from the lights. */
  lightingOverride: string | null
  notes: string
  /** This shot's changes to other objects; everything else follows the Master scene. */
  overrides: ShotOverrides
}

/** A light. Sun and spot shine down their local -Z; ambient is an even fill with no direction. */
export interface LightNode extends NodeBase {
  type: 'light'
  kind: LightKind
  /** Brightness in stops: 0 = standard key, +1 = twice as bright. */
  stops: number
  /** Colour temperature. */
  kelvin: number
  /** 0 = hard shadows, 1 = very soft. */
  softness: number
  shadows: boolean
  /** Spot: full cone angle in degrees. */
  coneAngle: number
  /** Spot: how soft the edge of the beam is, 0-1. */
  falloff: number
}

export type SceneNode = PrimitiveNode | GroupNode | MannequinNode | CameraNode | LightNode

export interface Scene {
  id: string
  /** Scene number from the script: 1, 2, 3… Shots are named after it (1A, 1B…). */
  number: number
  /** Optional title, e.g. 'INT. KITCHEN – NIGHT'. */
  name: string
  notes: string
  /** Render passes and thumbnails include an endless floor at ground level. */
  floor: boolean
  nodes: Record<string, SceneNode>
  /** Top-level node order (outliner order). */
  rootIds: string[]
}

export interface Project {
  schemaVersion: number
  name: string
  defaultAspect: string
  styleText: string
  scenes: Scene[]
  /** The camera body and format every shot uses. */
  camera: CameraKit
  // Filled in by later milestones; kept as open records so older files still load.
  cast: unknown[]
  props: unknown[]
  /** Poses saved into this project (the app-wide library is stored separately). */
  poses: SavedPose[]
}

export function newId(): string {
  return crypto.randomUUID()
}

export function createEmptyScene(number = 1, name = ''): Scene {
  return { id: newId(), number, name, notes: '', floor: true, nodes: {}, rootIds: [] }
}

/** 'Scene 01', or 'Scene 01 · INT. KITCHEN' when it has a title. */
export function sceneLabel(scene: Pick<Scene, 'number' | 'name'>): string {
  const label = `Scene ${String(scene.number).padStart(2, '0')}`
  return scene.name.trim() ? `${label} · ${scene.name.trim()}` : label
}

export function createEmptyProject(name = 'Untitled'): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    defaultAspect: '16:9',
    styleText: '',
    scenes: [createEmptyScene()],
    camera: structuredClone(DEFAULT_KIT),
    cast: [],
    props: [],
    poses: []
  }
}

/** Thrown with a message that can be shown to the user as-is. */
export class ProjectFileError extends Error {}

/** Upgrade older project files to the current schema. Add a step here whenever SCHEMA_VERSION goes up. */
export function migrateProject(raw: Record<string, unknown>): Record<string, unknown> {
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0
  if (version > SCHEMA_VERSION) {
    throw new ProjectFileError(
      `This project was saved by a newer version of Second Team (format ${version}). Please update the app.`
    )
  }
  if (version < 5 && Array.isArray(raw.scenes)) migrateToV5(raw)
  return raw
}

type Loose = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * v4 -> v5: number the scenes, take the project camera kit from the first shot's camera, and
 * rename plain-number shots (1, 2, 3) to the scene's letters (1A, 1B, 1C).
 */
function migrateToV5(raw: Loose): void {
  let kit: Loose | undefined
  ;(raw.scenes as Loose[]).forEach((scene, i) => {
    if (!scene || typeof scene !== 'object') return
    if (typeof scene.number !== 'number') {
      scene.number = i + 1
      if (typeof scene.name !== 'string' || /^Scene\s+\d+$/i.test(scene.name.trim())) scene.name = ''
    }
    const cameras = Object.values((scene.nodes ?? {}) as Loose)
      .filter((n: Loose) => n?.type === 'camera')
      .sort((a: Loose, b: Loose) => compareShotNumbers(String(a.shotNumber), String(b.shotNumber)))
    if (!kit && cameras[0]) {
      const c = cameras[0]
      kit = { sensor: c.sensor, squeeze: c.squeeze, guides: c.guides, delivery: c.delivery, thirds: c.thirds }
    }
    const names: string[] = cameras.map((c: Loose) => String(c.shotNumber)).filter((s) => !/^\d+$/.test(s))
    for (const c of cameras) {
      if (!/^\d+$/.test(String(c.shotNumber))) continue
      const next = nextShotName(scene.number, names)
      if (c.name === `Shot ${c.shotNumber}`) c.name = `Shot ${next}`
      c.shotNumber = next
      names.push(next)
    }
  })
  raw.camera = kit ?? raw.camera
}

function isVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
}

function checkNode(node: unknown, id: string, scene: Scene): void {
  const n = node as Partial<SceneNode> | null
  const bad = (what: string): never => {
    throw new ProjectFileError(`Object "${n?.name ?? id}" in ${scene.name} has an invalid ${what}.`)
  }
  if (!n || typeof n !== 'object') bad('entry')
  if (n!.id !== id) bad('id')
  if (typeof n!.name !== 'string') bad('name')
  if (!isVec3(n!.position)) bad('position')
  if (!isVec3(n!.rotation)) bad('rotation')
  if (!isVec3(n!.scale)) bad('scale')
  if (n!.parentId !== null && !(typeof n!.parentId === 'string' && n!.parentId in scene.nodes)) bad('parent')
  if (n!.type === 'primitive') {
    if (!PRIMITIVE_TYPES.includes(n!.primitive as PrimitiveType)) bad('shape type')
  } else if (n!.type === 'group') {
    if (!Array.isArray(n!.childIds) || !n!.childIds.every((c) => c in scene.nodes)) bad('child list')
  } else if (n!.type === 'camera') {
    if (typeof (n as Partial<CameraNode>).focalLength !== 'number') bad('lens')
  } else if (n!.type === 'light') {
    if (!LIGHT_KINDS.includes((n as Partial<LightNode>).kind as LightKind)) bad('light type')
  } else if (n!.type === 'mannequin') {
    const pose = n!.pose as Partial<Pose> | undefined
    if (!pose || typeof pose !== 'object' || typeof pose.joints !== 'object' || pose.joints === null) bad('pose')
    for (const r of Object.values(pose!.joints!)) if (!isVec3(r)) bad('joint rotation')
  } else {
    bad('type')
  }
}

/** Keep a camera's settings in range and fill any missing ones. */
export function repairCamera(c: CameraNode): void {
  c.scale = [1, 1, 1]
  c.shotNumber = typeof c.shotNumber === 'string' && c.shotNumber.trim() ? c.shotNumber.trim() : '1A'
  c.focalLength = clampFocal(c.focalLength)
  // Body and format settings now live on the project (older files kept them per camera).
  for (const legacy of ['sensor', 'squeeze', 'guides', 'delivery', 'thirds']) delete (c as Loose)[legacy]
  c.focusDistance =
    typeof c.focusDistance === 'number' && Number.isFinite(c.focusDistance) ? Math.max(0.1, c.focusDistance) : null
  c.subjectId = typeof c.subjectId === 'string' ? c.subjectId : null
  c.sizeOverride = typeof c.sizeOverride === 'string' && c.sizeOverride ? c.sizeOverride : null
  c.angleOverride = typeof c.angleOverride === 'string' && c.angleOverride ? c.angleOverride : null
  c.lightingOverride = typeof c.lightingOverride === 'string' && c.lightingOverride ? c.lightingOverride : null
  c.notes = typeof c.notes === 'string' ? c.notes : ''
}

/** Fill in fields added after a file was saved, and fix values that would break the viewport. */
function repairNode(node: SceneNode, scene: Scene): void {
  node.scale = clampScale(node.scale)
  if (node.type === 'primitive') {
    // Files from before anchors existed: planes were centred, everything else sat on its base.
    if (node.primitive === 'plane') node.anchor = 'center'
    else if (!ANCHORS.includes(node.anchor)) node.anchor = 'bottom'
  }
  if (node.type === 'camera') {
    repairCamera(node)
    node.overrides = sanitizeOverrides(node.overrides, scene.nodes)
  }
  if (node.type === 'light') {
    node.scale = [1, 1, 1]
    node.stops = clampStops(node.stops ?? 0)
    node.kelvin = clampKelvin(node.kelvin ?? 5600)
    node.softness = clampUnit(node.softness ?? 0.5)
    node.shadows = node.shadows !== false
    node.coneAngle = clampCone(node.coneAngle ?? 40)
    node.falloff = clampUnit(node.falloff ?? 0.3)
  }
  if (node.type === 'mannequin') {
    node.scale = [1, 1, 1]
    node.height = clampHeight(node.height ?? DEFAULT_HEIGHT)
    node.build = clampBuild(node.build ?? DEFAULT_BUILD)
    node.limits = node.limits !== false
    node.castId = typeof node.castId === 'string' ? node.castId : null
    node.color = typeof node.color === 'string' ? node.color : FIGURE_COLORS[0]
    const rest = restPose()
    for (const j of JOINT_NAMES) if (!isVec3(node.pose.joints[j])) node.pose.joints[j] = rest.joints[j]
    if (!isVec3(node.pose.pelvisOffset)) node.pose.pelvisOffset = rest.pelvisOffset
  }
}

/** Parse and check a project.json string. Throws ProjectFileError with a friendly message. */
export function parseProject(json: string): Project {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new ProjectFileError('project.json is damaged or not valid JSON.')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ProjectFileError('project.json does not contain a Second Team project.')
  }
  const p = migrateProject(raw as Record<string, unknown>) as Partial<Project>
  if (typeof p.name !== 'string' || !Array.isArray(p.scenes) || p.scenes.length === 0) {
    throw new ProjectFileError('project.json is missing its name or scenes.')
  }
  for (const scene of p.scenes) {
    if (!scene || typeof scene.nodes !== 'object' || !Array.isArray(scene.rootIds)) {
      throw new ProjectFileError('A scene in project.json is damaged.')
    }
    for (const [id, node] of Object.entries(scene.nodes)) checkNode(node, id, scene)
    if (!scene.rootIds.every((id) => id in scene.nodes)) {
      throw new ProjectFileError(`The object list in ${scene.name} is damaged.`)
    }
    for (const node of Object.values(scene.nodes)) repairNode(node, scene)
    if (typeof scene.number !== 'number' || !Number.isFinite(scene.number)) scene.number = p.scenes.indexOf(scene) + 1
    if (typeof scene.name !== 'string') scene.name = ''
    scene.floor = scene.floor !== false
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    name: p.name,
    defaultAspect: typeof p.defaultAspect === 'string' ? p.defaultAspect : '16:9',
    styleText: typeof p.styleText === 'string' ? p.styleText : '',
    scenes: p.scenes,
    camera: repairKit(p.camera),
    cast: Array.isArray(p.cast) ? p.cast : [],
    props: Array.isArray(p.props) ? p.props : [],
    poses: sanitizeSavedPoses(p.poses)
  }
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2) + '\n'
}

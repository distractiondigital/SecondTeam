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

// v1: M1 (primitives, groups). v2: M2 adds mannequins.
export const SCHEMA_VERSION = 2

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

export type SceneNode = PrimitiveNode | GroupNode | MannequinNode

export interface Scene {
  id: string
  name: string
  notes: string
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
  // Filled in by later milestones; kept as open records so older files still load.
  cast: unknown[]
  props: unknown[]
  /** Poses saved into this project (the app-wide library is stored separately). */
  poses: SavedPose[]
}

export function newId(): string {
  return crypto.randomUUID()
}

export function createEmptyScene(name = 'Scene 1'): Scene {
  return { id: newId(), name, notes: '', nodes: {}, rootIds: [] }
}

export function createEmptyProject(name = 'Untitled'): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    defaultAspect: '16:9',
    styleText: '',
    scenes: [createEmptyScene()],
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
  return raw
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
  } else if (n!.type === 'mannequin') {
    const pose = n!.pose as Partial<Pose> | undefined
    if (!pose || typeof pose !== 'object' || typeof pose.joints !== 'object' || pose.joints === null) bad('pose')
    for (const r of Object.values(pose!.joints!)) if (!isVec3(r)) bad('joint rotation')
  } else {
    bad('type')
  }
}

/** Fill in fields added after a file was saved, and fix values that would break the viewport. */
function repairNode(node: SceneNode): void {
  node.scale = clampScale(node.scale)
  if (node.type === 'primitive') {
    // Files from before anchors existed: planes were centred, everything else sat on its base.
    if (node.primitive === 'plane') node.anchor = 'center'
    else if (!ANCHORS.includes(node.anchor)) node.anchor = 'bottom'
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
    for (const node of Object.values(scene.nodes)) repairNode(node)
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    name: p.name,
    defaultAspect: typeof p.defaultAspect === 'string' ? p.defaultAspect : '16:9',
    styleText: typeof p.styleText === 'string' ? p.styleText : '',
    scenes: p.scenes,
    cast: Array.isArray(p.cast) ? p.cast : [],
    props: Array.isArray(p.props) ? p.props : [],
    poses: sanitizeSavedPoses(p.poses)
  }
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2) + '\n'
}

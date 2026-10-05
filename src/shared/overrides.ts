import { MATERIALS, type Anchor, type MaterialKind, type SceneNode, type Vec3 } from './project'
import { sanitizeAppearance, sanitizeBody, sanitizeExpression, sanitizeHands, type BodySliders, type FigureAppearance, type Hands } from './humanBody'
import { sanitizePose, type Pose } from './mannequin'
import { sanitizeLookAt, sanitizePlants, type LookAt, type Plants } from './posing'

// Master scene + per-shot changes.
//
// Every shot sees the Master scene, except for fields it has changed ("overrides"), which are
// stored on the shot's camera: camera.overrides[nodeId] = { position, pose, hidden, ... }.
// Anything a shot hasn't changed keeps following Master.

export const OVERRIDABLE_FIELDS = [
  'position',
  'rotation',
  'scale',
  'anchor',
  'hidden',
  'color',
  'material',
  'pose',
  'height',
  'build',
  'limits',
  'body',
  'appearance',
  'expression',
  'hands',
  'plants',
  'lookAt',
  'stops',
  'kelvin',
  'softness',
  'shadows',
  'coneAngle',
  'falloff'
] as const
export type OverridableField = (typeof OVERRIDABLE_FIELDS)[number]

export interface NodeOverride {
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  anchor?: Anchor
  hidden?: boolean
  color?: string
  material?: MaterialKind
  pose?: Pose
  height?: number
  build?: number
  limits?: boolean
  body?: BodySliders
  appearance?: FigureAppearance
  expression?: string
  hands?: Hands
  plants?: Plants
  lookAt?: LookAt | null
  stops?: number
  kelvin?: number
  softness?: number
  shadows?: boolean
  coneAngle?: number
  falloff?: number
}

export type ShotOverrides = Record<string, NodeOverride>

/** Which fields a node of this type can change per shot. Cameras belong to their shot, so none. */
export function overridableFor(node: SceneNode): OverridableField[] {
  switch (node.type) {
    case 'primitive':
      return ['position', 'rotation', 'scale', 'anchor', 'hidden', 'color', 'material']
    case 'group':
      return ['position', 'rotation', 'scale', 'hidden']
    case 'mannequin':
      return ['position', 'rotation', 'hidden', 'color', 'pose', 'height', 'build', 'limits', 'body', 'appearance', 'expression', 'hands', 'plants', 'lookAt']
    case 'light':
      return ['position', 'rotation', 'hidden', 'stops', 'kelvin', 'softness', 'shadows', 'coneAngle', 'falloff']
    case 'camera':
      return []
  }
}

export function isOverridable(node: SceneNode, field: string): field is OverridableField {
  return (overridableFor(node) as string[]).includes(field)
}

/** Deep-ish equality for override values (numbers, strings, arrays, poses). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i])
  if (a && b && typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b)
  return false
}

// Merged nodes are cached so that a node without changes keeps its identity (React only
// redraws what changed) and a merged node is only rebuilt when its node or override changes.
const mergedCache = new WeakMap<SceneNode, WeakMap<NodeOverride, SceneNode>>()
const scenesCache = new WeakMap<Record<string, SceneNode>, WeakMap<ShotOverrides, Record<string, SceneNode>>>()

/** One node as a shot sees it. */
export function applyOverride(node: SceneNode, override: NodeOverride | undefined): SceneNode {
  if (!override) return node
  let byOverride = mergedCache.get(node)
  if (!byOverride) mergedCache.set(node, (byOverride = new WeakMap()))
  let merged = byOverride.get(override)
  if (!merged) {
    const fields: Record<string, unknown> = {}
    for (const f of overridableFor(node)) if (override[f] !== undefined) fields[f] = override[f]
    merged = { ...node, ...fields } as SceneNode
    byOverride.set(override, merged)
  }
  return merged
}

/** All nodes as a shot sees them (Master if `overrides` is undefined). */
export function effectiveNodes(
  nodes: Record<string, SceneNode>,
  overrides: ShotOverrides | undefined
): Record<string, SceneNode> {
  if (!overrides || Object.keys(overrides).length === 0) return nodes
  let byOverrides = scenesCache.get(nodes)
  if (!byOverrides) scenesCache.set(nodes, (byOverrides = new WeakMap()))
  let result = byOverrides.get(overrides)
  if (!result) {
    result = {}
    for (const [id, node] of Object.entries(nodes)) result[id] = applyOverride(node, overrides[id])
    byOverrides.set(overrides, result)
  }
  return result
}

/** Which fields of `id` a shot has changed (empty if none). */
export function overriddenFields(overrides: ShotOverrides | undefined, id: string): OverridableField[] {
  const o = overrides?.[id]
  return o ? (OVERRIDABLE_FIELDS.filter((f) => o[f] !== undefined) as OverridableField[]) : []
}

type NumberField = 'height' | 'build' | 'stops' | 'kelvin' | 'softness' | 'coneAngle' | 'falloff'
const NUMBER_FIELDS: string[] = ['height', 'build', 'stops', 'kelvin', 'softness', 'coneAngle', 'falloff']

const isVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))

/** Clean overrides read from a file: known fields with valid values, for nodes that exist. */
export function sanitizeOverrides(raw: unknown, nodes: Record<string, SceneNode>): ShotOverrides {
  const out: ShotOverrides = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const node = nodes[id]
    if (!node || !value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const o: NodeOverride = {}
    for (const f of overridableFor(node)) {
      const x = v[f]
      if (x === undefined) continue
      if ((f === 'position' || f === 'rotation' || f === 'scale') && isVec3(x)) o[f] = x
      else if ((f === 'hidden' || f === 'limits' || f === 'shadows') && typeof x === 'boolean') o[f] = x
      else if (f === 'color' && typeof x === 'string') o.color = x
      else if (f === 'material' && MATERIALS.includes(x as MaterialKind)) o.material = x as MaterialKind
      else if (f === 'anchor' && (x === 'bottom' || x === 'center' || x === 'top')) o.anchor = x
      else if (NUMBER_FIELDS.includes(f) && typeof x === 'number' && Number.isFinite(x)) o[f as NumberField] = x
      else if (f === 'body' && x && typeof x === 'object') o.body = sanitizeBody(x)
      else if (f === 'appearance' && x && typeof x === 'object') o.appearance = sanitizeAppearance(x, 0.5)
      else if (f === 'expression' && typeof x === 'string') o.expression = sanitizeExpression(x)
      else if (f === 'hands' && x && typeof x === 'object') o.hands = sanitizeHands(x)
      else if (f === 'plants' && x && typeof x === 'object') o.plants = sanitizePlants(x)
      else if (f === 'lookAt') o.lookAt = sanitizeLookAt(x)
      else if (f === 'pose') {
        const pose = sanitizePose(x)
        if (pose) o.pose = pose
      }
    }
    if (Object.keys(o).length > 0) out[id] = o
  }
  return out
}

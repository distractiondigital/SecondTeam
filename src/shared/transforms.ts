import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three'
import type { SceneNode, Vec3 } from './project'

// Placement maths for scene nodes: positions in metres, rotations in degrees (XYZ order), and
// each node placed relative to the group it's in. Pure; used by the document store and the
// multi-selection gizmo.

type Placement = Pick<SceneNode, 'position' | 'rotation' | 'scale'>

const round = (n: number) => Math.round(n * 10000) / 10000 || 0 // "|| 0" turns -0 into 0

/** A node's placement inside its parent, as a matrix. */
export function localMatrix(node: Placement): Matrix4 {
  const euler = new Euler(...(node.rotation.map((d) => MathUtils.degToRad(d)) as Vec3), 'XYZ')
  return new Matrix4().compose(new Vector3(...node.position), new Quaternion().setFromEuler(euler), new Vector3(...node.scale))
}

/** A node's placement in the world (through all the groups it's in). */
export function worldMatrix(nodes: Record<string, SceneNode>, id: string): Matrix4 {
  const node = nodes[id]
  const local = localMatrix(node)
  return node.parentId && nodes[node.parentId] ? worldMatrix(nodes, node.parentId).multiply(local) : local
}

/** The world matrix of a node's parent group (identity at the top level). */
export function parentWorldMatrix(nodes: Record<string, SceneNode>, parentId: string | null): Matrix4 {
  return parentId && nodes[parentId] ? worldMatrix(nodes, parentId) : new Matrix4()
}

/** Position / rotation / scale from a matrix, rounded like everything else in the file. */
export function placementFromMatrix(m: Matrix4): { position: Vec3; rotation: Vec3; scale: Vec3 } {
  const p = new Vector3()
  const q = new Quaternion()
  const s = new Vector3()
  m.decompose(p, q, s)
  const e = new Euler().setFromQuaternion(q, 'XYZ')
  return {
    position: [round(p.x), round(p.y), round(p.z)],
    rotation: [round(MathUtils.radToDeg(e.x)), round(MathUtils.radToDeg(e.y)), round(MathUtils.radToDeg(e.z))],
    scale: [round(s.x), round(s.y), round(s.z)]
  }
}

/**
 * Where a node must sit inside `newParentWorld` to stay where it is in the world.
 * `world` is the node's current world matrix.
 */
export function placementUnder(world: Matrix4, newParentWorld: Matrix4): { position: Vec3; rotation: Vec3; scale: Vec3 } {
  return placementFromMatrix(newParentWorld.clone().invert().multiply(world))
}

/**
 * Move a set of things together: `delta` is how the gizmo's pivot moved (world space, from the
 * start of the drag). Each item's start world matrix is moved by it and expressed in its parent.
 */
export function movedPlacement(startWorld: Matrix4, delta: Matrix4, parentWorld: Matrix4): { position: Vec3; rotation: Vec3; scale: Vec3 } {
  return placementUnder(delta.clone().multiply(startWorld), parentWorld)
}

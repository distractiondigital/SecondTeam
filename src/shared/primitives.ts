import type { Anchor, PrimitiveType, Vec3 } from './project'

export interface PrimitiveInfo {
  label: string
  /** Real-world size at scale 1, in metres: width (X), height (Y), depth (Z). */
  baseSize: Vec3
}

// Sizes are measured with the base of the shape at Y = 0. The anchor picks where along the
// height the object's origin sits (bottom by default, so new objects rest on the floor).
export const PRIMITIVES: Record<PrimitiveType, PrimitiveInfo> = {
  box: { label: 'Box', baseSize: [1, 1, 1] },
  cylinder: { label: 'Cylinder', baseSize: [0.5, 1, 0.5] },
  sphere: { label: 'Sphere', baseSize: [1, 1, 1] },
  plane: { label: 'Plane', baseSize: [4, 0, 4] },
  capsule: { label: 'Capsule', baseSize: [0.5, 1.8, 0.5] },
  cone: { label: 'Cone', baseSize: [1, 1, 1] }
}

export const DEFAULT_PRIMITIVE_COLOR = '#a3a6ad'

/** Planes are flat, so they only have a centre anchor. */
export function supportsAnchor(primitive: PrimitiveType): boolean {
  return PRIMITIVES[primitive].baseSize[1] > 0
}

export function defaultAnchor(primitive: PrimitiveType): Anchor {
  return supportsAnchor(primitive) ? 'bottom' : 'center'
}

/** Height of the anchor point above the shape's base, at scale 1 (metres). */
export function anchorHeight(primitive: PrimitiveType, anchor: Anchor): number {
  const h = PRIMITIVES[primitive].baseSize[1]
  return anchor === 'bottom' ? 0 : anchor === 'center' ? h / 2 : h
}

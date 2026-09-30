import type { PrimitiveType, Vec3 } from './project'

export interface PrimitiveInfo {
  label: string
  /** Real-world size at scale 1, in metres: width (X), height (Y), depth (Z). */
  baseSize: Vec3
}

// Every primitive's origin sits at the centre of its base, so new objects rest on the floor.
export const PRIMITIVES: Record<PrimitiveType, PrimitiveInfo> = {
  box: { label: 'Box', baseSize: [1, 1, 1] },
  cylinder: { label: 'Cylinder', baseSize: [0.5, 1, 0.5] },
  sphere: { label: 'Sphere', baseSize: [1, 1, 1] },
  plane: { label: 'Plane', baseSize: [4, 0, 4] },
  capsule: { label: 'Capsule', baseSize: [0.5, 1.8, 0.5] },
  cone: { label: 'Cone', baseSize: [1, 1, 1] }
}

export const DEFAULT_PRIMITIVE_COLOR = '#a3a6ad'

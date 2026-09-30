import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry
} from 'three'
import type { Anchor, PrimitiveType } from '../../../shared/project'
import { anchorHeight } from '../../../shared/primitives'

// One geometry per primitive, sized to PRIMITIVES[type].baseSize with its base at Y = 0.
const BASE: Record<PrimitiveType, () => BufferGeometry> = {
  box: () => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cylinder: () => new CylinderGeometry(0.25, 0.25, 1, 32).translate(0, 0.5, 0),
  sphere: () => new SphereGeometry(0.5, 32, 16).translate(0, 0.5, 0),
  plane: () => new PlaneGeometry(4, 4).rotateX(-Math.PI / 2),
  capsule: () => new CapsuleGeometry(0.25, 1.3, 8, 16).translate(0, 0.9, 0),
  cone: () => new ConeGeometry(0.5, 1, 32).translate(0, 0.5, 0)
}

const cache = new Map<string, BufferGeometry>()

/** Shared geometry for a primitive, shifted so the object's origin sits at its anchor. */
export function getGeometry(primitive: PrimitiveType, anchor: Anchor): BufferGeometry {
  const key = `${primitive}:${anchor}`
  let geometry = cache.get(key)
  if (!geometry) {
    geometry = BASE[primitive]().translate(0, -anchorHeight(primitive, anchor), 0)
    cache.set(key, geometry)
  }
  return geometry
}

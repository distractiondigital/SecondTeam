import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry
} from 'three'
import type { PrimitiveType } from '../../../shared/project'

// One shared geometry per primitive type, sized to PRIMITIVES[type].baseSize,
// with the origin at the centre of the base so objects sit on the floor.
export const GEOMETRIES: Record<PrimitiveType, BufferGeometry> = {
  box: new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cylinder: new CylinderGeometry(0.25, 0.25, 1, 32).translate(0, 0.5, 0),
  sphere: new SphereGeometry(0.5, 32, 16).translate(0, 0.5, 0),
  plane: new PlaneGeometry(4, 4).rotateX(-Math.PI / 2),
  capsule: new CapsuleGeometry(0.25, 1.3, 8, 16).translate(0, 0.9, 0),
  cone: new ConeGeometry(0.5, 1, 32).translate(0, 0.5, 0)
}

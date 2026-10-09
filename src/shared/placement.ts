import type { Vec3 } from './project'

// Where something added from the toolbar goes: in front of the view, never inside a wall. A ray
// from the viewport camera through the middle of the view finds what you're looking at (or the
// floor). Looking at a floor or a table top, the new object goes right there, on it; looking at a
// wall or the side of something, it goes PULL_BACK towards you, on the floor; looking at the sky,
// SKY_DISTANCE ahead, on the floor. Pure and tested.

/** How far back from a wall (or the side of anything) a new object goes (m). */
export const PULL_BACK = 2
/** The closest in front of the camera a pulled-back object goes (m, along the floor). */
export const MIN_AHEAD = 0.5
/** Where a new object goes when the view meets nothing (m ahead, along the floor). */
export const SKY_DISTANCE = 5
/** A surface at least this upward-facing (normal's height) is something to put things on. */
const UPWARD = 0.7

/** What the ray from the camera hit first: where, how far, and the surface's normal (towards the camera). */
export interface DropHit {
  point: Vec3
  distance: number
  normal: Vec3
}

/** Where a new object goes ([x, y, z]; y is the surface it stands on). `direction` is normalised. */
export function dropPoint(origin: Vec3, direction: Vec3, hit: DropHit | null): Vec3 {
  // The floor (y = 0), if the view looks down onto it from above.
  const floorT = origin[1] > 0 && direction[1] < -1e-6 ? -origin[1] / direction[1] : Infinity
  const along = (t: number): Vec3 => [origin[0] + direction[0] * t, origin[1] + direction[1] * t, origin[2] + direction[2] * t]

  if (hit && hit.distance < floorT) {
    if (hit.normal[1] >= UPWARD) return hit.point
    // A wall or the side of something: back towards the camera, on the floor.
    const dx = origin[0] - hit.point[0]
    const dz = origin[2] - hit.point[2]
    const across = Math.hypot(dx, dz)
    if (across < 1e-6) return [hit.point[0], 0, hit.point[2]]
    const back = Math.min(PULL_BACK, Math.max(0, across - MIN_AHEAD))
    return [hit.point[0] + (dx / across) * back, 0, hit.point[2] + (dz / across) * back]
  }
  if (Number.isFinite(floorT)) {
    const p = along(floorT)
    return [p[0], 0, p[2]]
  }
  // Nothing in view (the sky): ahead along the floor.
  const flat = Math.hypot(direction[0], direction[2])
  if (flat < 1e-6) return [origin[0], 0, origin[2]]
  return [origin[0] + (direction[0] / flat) * SKY_DISTANCE, 0, origin[2] + (direction[2] / flat) * SKY_DISTANCE]
}

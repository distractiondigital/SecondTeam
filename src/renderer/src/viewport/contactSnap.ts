import { Box3, Vector3 } from 'three'

// Surface ("contact") snapping: while you drag an object, if one of its sides comes within
// reach of the floor or of another object's side, nudge it so the two touch exactly.
// Works on axis-aligned bounding boxes, so it's exact for sets built square to the world
// and approximate for rotated objects.

export const CONTACT_REACH = 0.15 // metres
const OVERLAP_TOLERANCE = 0.01 // metres; sides must face each other to count as touching

export type Axis = 'x' | 'y' | 'z'
const AXES: Axis[] = ['x', 'y', 'z']

function facing(a: Box3, b: Box3, axis: Axis): boolean {
  // Two boxes can touch along `axis` only if they overlap on the other two axes.
  return AXES.filter((o) => o !== axis).every(
    (o) => a.min[o] < b.max[o] - OVERLAP_TOLERANCE && a.max[o] > b.min[o] + OVERLAP_TOLERANCE
  )
}

/**
 * World-space offset that brings `moving` flush against the nearest surface, looking only
 * along the axes being dragged. `floorY` is the floor height (null for no floor).
 */
export function contactOffset(
  moving: Box3,
  targets: Box3[],
  axes: Axis[],
  floorY: number | null = 0,
  reach = CONTACT_REACH
): Vector3 {
  const offset = new Vector3()
  for (const axis of axes) {
    let best: number | null = null
    const consider = (d: number) => {
      if (Math.abs(d) <= reach && (best === null || Math.abs(d) < Math.abs(best))) best = d
    }
    if (axis === 'y' && floorY !== null) consider(floorY - moving.min.y)
    for (const t of targets) {
      if (!facing(moving, t, axis)) continue
      consider(t.max[axis] - moving.min[axis]) // resting against the target's far side
      consider(t.min[axis] - moving.max[axis]) // resting against the target's near side
    }
    if (best !== null) offset[axis] = best
  }
  return offset
}

/** Which axes the gizmo is dragging, from TransformControls' axis name ("X", "XY", "XYZ"…). */
export function draggedAxes(gizmoAxis: string | null): Axis[] {
  if (!gizmoAxis) return []
  return AXES.filter((a) => gizmoAxis.toLowerCase().includes(a))
}

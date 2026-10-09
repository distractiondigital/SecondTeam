import { describe, expect, it } from 'vitest'
import { dropPoint, MIN_AHEAD, PULL_BACK, SKY_DISTANCE } from './placement'
import type { Vec3 } from './project'

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v)
  return v.map((x) => x / l) as Vec3
}

describe('where new objects go', () => {
  it('lands where the view meets the floor', () => {
    const p = dropPoint([0, 2, 5], norm([0, -2, -5]), null)
    expect(p[0]).toBeCloseTo(0)
    expect(p[1]).toBe(0)
    expect(p[2]).toBeCloseTo(0)
  })

  it('sits on a table top it looks at', () => {
    expect(dropPoint([0, 2, 3], norm([0, -1, -2]), { point: [0, 0.75, 0.5], distance: 2.8, normal: [0, 1, 0] })).toEqual([0, 0.75, 0.5])
  })

  it('comes back from a wall towards the camera, on the floor', () => {
    const p = dropPoint([0, 1.6, 6], [0, 0, -1], { point: [0, 1.6, 0], distance: 6, normal: [0, 0, 1] })
    expect(p).toEqual([0, 0, PULL_BACK])
  })

  it('never ends up behind the camera when the wall is close', () => {
    const p = dropPoint([0, 1.6, 1], [0, 0, -1], { point: [0, 1.6, 0], distance: 1, normal: [0, 0, 1] })
    expect(p[2]).toBeCloseTo(1 - MIN_AHEAD)
  })

  it('takes whichever is nearer: the floor in front of a far wall', () => {
    // Looking down at the floor 3 m ahead; a wall would only be met 10 m away.
    const dir = norm([0, -1.5, -3])
    const p = dropPoint([0, 1.5, 3], dir, { point: [0, -3.5, -7], distance: 11, normal: [0, 0, 1] })
    expect(p[2]).toBeCloseTo(0)
    expect(p[1]).toBe(0)
  })

  it('goes a little way ahead when looking at the sky', () => {
    const p = dropPoint([1, 1.6, 0], norm([0, 0.3, -1]), null)
    expect(p[0]).toBeCloseTo(1)
    expect(p[1]).toBe(0)
    expect(p[2]).toBeCloseTo(-SKY_DISTANCE)
  })
})

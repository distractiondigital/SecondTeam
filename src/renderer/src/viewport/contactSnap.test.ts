import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { contactOffset, draggedAxes } from './contactSnap'

const box = (min: [number, number, number], max: [number, number, number]) =>
  new Box3(new Vector3(...min), new Vector3(...max))

describe('contact snap', () => {
  const wall = box([2, 0, -2], [2.1, 3, 2]) // a thin wall at x = 2..2.1

  it('pulls a box flush against a nearby wall', () => {
    const moving = box([0.9, 0, 0], [1.9, 1, 1]) // 10 cm short of the wall
    expect(contactOffset(moving, [wall], ['x']).x).toBeCloseTo(0.1)
  })

  it('pushes a box out of a wall it slightly overlaps', () => {
    const moving = box([1.05, 0, 0], [2.05, 1, 1])
    expect(contactOffset(moving, [wall], ['x']).x).toBeCloseTo(-0.05)
  })

  it('ignores surfaces that are out of reach or not facing', () => {
    expect(contactOffset(box([0, 0, 0], [1, 1, 1]), [wall], ['x']).x).toBe(0)
    const beside = box([0.9, 0, 3], [1.9, 1, 4]) // past the wall's end along Z
    expect(contactOffset(beside, [wall], ['x']).x).toBe(0)
  })

  it('drops onto the floor and onto other objects', () => {
    expect(contactOffset(box([0, 0.1, 0], [1, 1.1, 1]), [], ['y']).y).toBeCloseTo(-0.1)
    const table = box([0, 0, 0], [2, 0.75, 1])
    const cup = box([0.5, 0.8, 0.2], [0.6, 0.9, 0.3])
    expect(contactOffset(cup, [table], ['y']).y).toBeCloseTo(-0.05)
  })

  it('only snaps along the dragged axes', () => {
    const moving = box([0.9, 0.1, 0], [1.9, 1.1, 1])
    const offset = contactOffset(moving, [wall], ['x'])
    expect(offset.y).toBe(0)
    expect(draggedAxes('XZ')).toEqual(['x', 'z'])
    expect(draggedAxes(null)).toEqual([])
  })
})

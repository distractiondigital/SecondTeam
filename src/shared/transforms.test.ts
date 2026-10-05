import { describe, expect, it } from 'vitest'
import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three'
import type { SceneNode } from './project'
import { localMatrix, movedPlacement, parentWorldMatrix, placementUnder, worldMatrix } from './transforms'

const box = (id: string, parentId: string | null, position: [number, number, number], rotationY = 0): SceneNode =>
  ({ id, type: 'primitive', parentId, position, rotation: [0, rotationY, 0], scale: [1, 1, 1] }) as unknown as SceneNode

describe('transforms', () => {
  const nodes: Record<string, SceneNode> = {
    g: { ...box('g', null, [5, 0, 0], 90), type: 'group', childIds: ['a'] } as unknown as SceneNode,
    a: box('a', 'g', [1, 0, 0]),
    b: box('b', null, [0, 0, 2])
  }

  it('places a node through its groups', () => {
    // Group turned 90° about Y: its +X is the world's -Z.
    const p = new Vector3().setFromMatrixPosition(worldMatrix(nodes, 'a'))
    expect(p.distanceTo(new Vector3(5, 0, -1))).toBeLessThan(1e-6)
  })

  it('re-expresses a placement under a new parent without moving it', () => {
    const local = placementUnder(worldMatrix(nodes, 'b'), parentWorldMatrix(nodes, 'g'))
    const back = new Vector3().setFromMatrixPosition(worldMatrix({ ...nodes, b: { ...nodes.b, parentId: 'g', ...local } }, 'b'))
    expect(back.distanceTo(new Vector3(0, 0, 2))).toBeLessThan(1e-3)
  })

  it('moves several things together by the same world move', () => {
    // Turn everything 90° about Y around the point (0, 0, 0), then lift it 1 m.
    const delta = new Matrix4().compose(new Vector3(0, 1, 0), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), MathUtils.degToRad(90)), new Vector3(1, 1, 1))
    const a = movedPlacement(worldMatrix(nodes, 'a'), delta, parentWorldMatrix(nodes, 'g'))
    const b = movedPlacement(worldMatrix(nodes, 'b'), delta, parentWorldMatrix(nodes, null))
    const after = { ...nodes, a: { ...nodes.a, ...a }, b: { ...nodes.b, ...b } }
    // (5, 0, -1) turned 90° → (-1, 0, -5), lifted → (-1, 1, -5).
    expect(new Vector3().setFromMatrixPosition(worldMatrix(after, 'a')).distanceTo(new Vector3(-1, 1, -5))).toBeLessThan(1e-3)
    // (0, 0, 2) → (2, 1, 0), and it turned with the move.
    expect(new Vector3().setFromMatrixPosition(worldMatrix(after, 'b')).distanceTo(new Vector3(2, 1, 0))).toBeLessThan(1e-3)
    expect(b.rotation[1]).toBeCloseTo(90, 3)
    expect(localMatrix(after.a).equals(localMatrix(nodes.a))).toBe(false)
  })
})

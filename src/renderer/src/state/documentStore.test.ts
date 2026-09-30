import { beforeEach, describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { activeScene, hasUnsavedChanges, useDocument, worldMatrix } from './documentStore'
import { parseProject, serializeProject } from '../../../shared/project'

const doc = () => useDocument.getState()
const scene = () => activeScene(doc())
const anchorOf = (id: string) => {
  const n = scene().nodes[id]
  return n.type === 'primitive' ? n.anchor : null
}
const worldPos = (id: string) => new Vector3().setFromMatrixPosition(worldMatrix(scene(), id))

beforeEach(() => doc().newProject())

describe('undo / redo', () => {
  it('undoes and redoes adds and edits', () => {
    const a = doc().addPrimitive('box')
    doc().updateNode(a, { position: [2, 0, 0] })
    expect(scene().nodes[a].position).toEqual([2, 0, 0])

    doc().undo()
    expect(scene().nodes[a].position).toEqual([0, 0, 0])
    doc().undo()
    expect(scene().nodes[a]).toBeUndefined()

    doc().redo()
    doc().redo()
    expect(scene().nodes[a].position).toEqual([2, 0, 0])
  })

  it('records a whole gizmo drag as one step', () => {
    const a = doc().addPrimitive('box')
    doc().beginGesture()
    for (let x = 1; x <= 10; x++) doc().updateNode(a, { position: [x, 0, 0] })
    doc().endGesture()
    doc().undo()
    expect(scene().nodes[a].position).toEqual([0, 0, 0])
  })

  it('ignores edits that change nothing', () => {
    const a = doc().addPrimitive('box')
    const pastLength = doc().past.length
    doc().updateNode(a, { position: [0, 0, 0] })
    expect(doc().past.length).toBe(pastLength)
  })

  it('a new edit clears redo', () => {
    const a = doc().addPrimitive('box')
    doc().updateNode(a, { name: 'Wall' })
    doc().undo()
    doc().updateNode(a, { name: 'Door' })
    doc().redo()
    expect(scene().nodes[a].name).toBe('Door')
  })
})

describe('naming, duplicate, delete', () => {
  it('numbers new objects and duplicates', () => {
    const a = doc().addPrimitive('box')
    doc().addPrimitive('box')
    expect(scene().nodes[a].name).toBe('Box 1')
    const [copy] = doc().duplicateNodes([a])
    expect(scene().nodes[copy].name).toBe('Box 3')
    expect(scene().nodes[copy].position[0]).toBeCloseTo(0.5)
    expect(scene().rootIds.indexOf(copy)).toBe(1)
  })

  it('deleting a group deletes its contents', () => {
    const a = doc().addPrimitive('box')
    const b = doc().addPrimitive('cone')
    const g = doc().groupNodes([a, b])!
    doc().deleteNodes([g])
    expect(Object.keys(scene().nodes)).toHaveLength(0)
    expect(scene().rootIds).toHaveLength(0)
  })

  it('duplicating a group copies its contents with new ids', () => {
    const a = doc().addPrimitive('box')
    const g = doc().groupNodes([a])!
    const [copy] = doc().duplicateNodes([g])
    const copyNode = scene().nodes[copy]
    expect(copyNode.type).toBe('group')
    if (copyNode.type !== 'group') return
    expect(copyNode.childIds).toHaveLength(1)
    expect(copyNode.childIds[0]).not.toBe(a)
    expect(scene().nodes[copyNode.childIds[0]].parentId).toBe(copy)
    expect(scene().nodes[copyNode.childIds[0]].name).toBe('Box 2')
    expect(copyNode.name).toBe('Group 2')
  })
})

describe('group / ungroup', () => {
  it('keeps objects where they are in the world', () => {
    const a = doc().addPrimitive('box', [2, 0])
    const b = doc().addPrimitive('sphere', [4, 2])
    doc().updateNode(b, { position: [4, 1, 2], rotation: [0, 45, 0] })
    const g = doc().groupNodes([a, b])!
    expect(scene().rootIds).toEqual([g])
    expect(scene().nodes[g].position).toEqual([3, 0, 1])
    expect(worldPos(b).toArray().map((n) => Number(n.toFixed(4)))).toEqual([4, 1, 2])

    doc().updateNode(g, { position: [3, 0, 1 + 5], rotation: [0, 90, 0] })
    const moved = worldPos(a)
    doc().ungroup([g])
    expect(scene().nodes[g]).toBeUndefined()
    expect(scene().rootIds).toEqual([a, b])
    expect(worldPos(a).distanceTo(moved)).toBeLessThan(1e-3)
  })
})

describe('anchor and scale', () => {
  it('changing the anchor keeps the object where it is', () => {
    const a = doc().addPrimitive('box')
    doc().updateNode(a, { rotation: [90, 0, 0], scale: [1, 2, 1] })
    const before = worldPos(a)
    doc().setAnchor(a, 'top')
    // The origin moved to the top, which (rotated 90° about X) points along +Z, 2 m away.
    expect(worldPos(a).clone().sub(before).toArray().map((n) => Number(n.toFixed(4)))).toEqual([0, 0, 2])
    expect(anchorOf(a)).toBe('top')
  })

  it('planes stay centred', () => {
    const p = doc().addPrimitive('plane')
    doc().setAnchor(p, 'bottom')
    expect(anchorOf(p)).toBe('center')
  })

  it('never lets a scale reach zero', () => {
    const a = doc().addPrimitive('plane')
    doc().updateNode(a, { scale: [1, 0, -2] })
    expect(scene().nodes[a].scale).toEqual([1, 0.001, 0.001])
  })

  it('repairs zero scales and missing anchors in older files', () => {
    const a = doc().addPrimitive('box')
    const raw = JSON.parse(serializeProject(doc().project))
    const node = raw.scenes[0].nodes[a]
    node.scale = [1, 0, 1]
    delete node.anchor
    const loaded = parseProject(JSON.stringify(raw)).scenes[0].nodes[a]
    expect(loaded.scale).toEqual([1, 0.001, 1])
    expect(loaded.type === 'primitive' && loaded.anchor).toBe('bottom')
  })
})

describe('saving', () => {
  it('round-trips through project.json', () => {
    const a = doc().addPrimitive('capsule', [1, 1])
    doc().groupNodes([a])
    const json = serializeProject(doc().project)
    const loaded = parseProject(json)
    expect(loaded).toEqual(doc().project)
  })

  it('tracks unsaved changes', () => {
    expect(hasUnsavedChanges(doc())).toBe(false)
    doc().addPrimitive('box')
    expect(hasUnsavedChanges(doc())).toBe(true)
    doc().markSaved()
    expect(hasUnsavedChanges(doc())).toBe(false)
    doc().addPrimitive('box')
    doc().undo()
    expect(hasUnsavedChanges(doc())).toBe(false)
  })

  it('rejects damaged files with a friendly message', () => {
    expect(() => parseProject('{not json')).toThrow('not valid JSON')
    expect(() => parseProject('{"name":"x"}')).toThrow('missing')
    expect(() => parseProject('{"schemaVersion":99,"name":"x","scenes":[]}')).toThrow('newer version')
  })
})

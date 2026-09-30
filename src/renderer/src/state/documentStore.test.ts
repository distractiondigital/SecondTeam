import { beforeEach, describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { activeScene, hasUnsavedChanges, sceneForShot, useDocument, worldMatrix } from './documentStore'
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

  it('only lets the owner of a gesture end it, and merges overlapping gestures', () => {
    const a = doc().addPrimitive('box')
    doc().beginGesture('fly')
    doc().updateNode(a, { position: [1, 0, 0] })
    doc().endGesture('slider') // someone else can't close the camera's undo step
    doc().beginGesture('wheel')
    doc().updateNode(a, { position: [2, 0, 0] })
    doc().endGesture('wheel')
    doc().updateNode(a, { position: [3, 0, 0] })
    doc().endGesture('fly')
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

describe('figures', () => {
  const figure = (id: string) => {
    const n = scene().nodes[id]
    if (n.type !== 'mannequin') throw new Error('not a figure')
    return n
  }

  it('adds a standing figure with its own colour', () => {
    const a = doc().addMannequin()
    const b = doc().addMannequin()
    expect(figure(a).name).toBe('Figure 1')
    expect(figure(a).height).toBe(1.75)
    expect(figure(a).color).not.toBe(figure(b).color)
  })

  it('keeps joints inside their limits unless limits are off', () => {
    const a = doc().addMannequin()
    doc().setJointRotation(a, 'kneeL', [-40, 0, 0])
    expect(figure(a).pose.joints.kneeL).toEqual([0, 0, 0])
    doc().updateNode(a, { limits: false })
    doc().setJointRotation(a, 'kneeL', [-40, 0, 0])
    expect(figure(a).pose.joints.kneeL).toEqual([-40, 0, 0])
  })

  it('makes every pose change one undo step', () => {
    const a = doc().addMannequin()
    doc().applyPreset(a, 'pointing')
    doc().mirrorPose(a)
    expect(figure(a).pose.joints.shoulderL[0]).toBe(-88)
    doc().undo()
    expect(figure(a).pose.joints.shoulderR[0]).toBe(-88)
    doc().undo()
    expect(figure(a).pose.joints.shoulderR[0]).toBe(0)
  })

  it('clamps height and ignores scale', () => {
    const a = doc().addMannequin()
    doc().updateNode(a, { height: 5, scale: [2, 2, 2] })
    expect(figure(a).height).toBe(2.1)
    expect(figure(a).scale).toEqual([1, 1, 1])
  })

  it('duplicates the pose and survives save and load', () => {
    const a = doc().addMannequin()
    doc().applyPreset(a, 'sitting')
    const [copy] = doc().duplicateNodes([a])
    expect(figure(copy).pose).toEqual(figure(a).pose)
    const loaded = parseProject(serializeProject(doc().project))
    expect(loaded).toEqual(doc().project)
    expect(loaded.schemaVersion).toBe(4)
  })

  it('saves poses into the project and applies them to other figures', () => {
    const a = doc().addMannequin()
    const b = doc().addMannequin()
    doc().applyPreset(a, 'armsCrossed')
    const poseId = doc().addProjectPose('Waiting', figure(a).pose)
    doc().setPose(b, doc().project.poses[0].pose)
    expect(figure(b).pose).toEqual(figure(a).pose)
    const loaded = parseProject(serializeProject(doc().project))
    expect(loaded.poses.map((p) => p.name)).toEqual(['Waiting'])
    doc().deleteProjectPose(poseId)
    expect(doc().project.poses).toHaveLength(0)
    doc().undo()
    expect(doc().project.poses).toHaveLength(1)
  })

  it('drops damaged saved poses when loading', () => {
    const raw = JSON.parse(serializeProject(doc().project))
    raw.poses = [{ id: 'x', name: 'Bad', pose: { joints: { head: 'nope' } } }, { name: 'No id' }]
    expect(parseProject(JSON.stringify(raw)).poses).toEqual([])
  })

  it('fills in missing joints when loading', () => {
    const a = doc().addMannequin()
    const raw = JSON.parse(serializeProject(doc().project))
    delete raw.scenes[0].nodes[a].pose.joints.head
    const loaded = parseProject(JSON.stringify(raw)).scenes[0].nodes[a]
    expect(loaded.type === 'mannequin' && loaded.pose.joints.head).toEqual([0, 0, 0])
  })
})

describe('cameras', () => {
  const cam = (id: string) => {
    const n = scene().nodes[id]
    if (n.type !== 'camera') throw new Error('not a camera')
    return n
  }
  const view = { position: [1, 1.6, 4] as [number, number, number], rotation: [-5, 20, 0] as [number, number, number] }

  it('adds numbered shots from the view, copying lens settings when asked', () => {
    const a = doc().addCamera(view)
    expect(cam(a).shotNumber).toBe('1')
    expect(cam(a).name).toBe('Shot 1')
    expect(cam(a).sensor.preset).toBe('ff')
    expect(cam(a).position).toEqual([1, 1.6, 4])
    const b = doc().addCamera({ ...view, template: { focalLength: 85, squeeze: 2, guides: ['2.39'], delivery: '2.39' } })
    expect(cam(b).shotNumber).toBe('2')
    expect(cam(b).focalLength).toBe(85)
    expect(cam(b).delivery).toBe('2.39')
  })

  it('keeps settings valid and the default name in step with the shot number', () => {
    const a = doc().addCamera(view)
    doc().updateNode(a, { focalLength: 2000, squeeze: 1.73, shotNumber: '12A', scale: [3, 3, 3] })
    expect(cam(a).focalLength).toBe(600)
    expect(cam(a).squeeze).toBe(1.7)
    expect(cam(a).name).toBe('Shot 12A')
    expect(cam(a).scale).toEqual([1, 1, 1])
    doc().updateNode(a, { delivery: '2.39' }) // not an enabled guide
    expect(cam(a).delivery).toBe('sensor')
  })

  it('gives duplicated cameras new shot numbers', () => {
    const a = doc().addCamera(view)
    doc().updateNode(a, { shotNumber: '7' })
    const [copy] = doc().duplicateNodes([a])
    expect(cam(copy).shotNumber).toBe('8')
    expect(cam(copy).name).toBe('Shot 8')
  })

  it('saves and loads cameras', () => {
    const a = doc().addCamera({ ...view, template: { guides: ['16:9', 'custom:2.2'], delivery: 'custom:2.2' } })
    const loaded = parseProject(serializeProject(doc().project))
    expect(loaded).toEqual(doc().project)
    const c = loaded.scenes[0].nodes[a]
    expect(c.type === 'camera' && c.delivery).toBe('custom:2.2')
  })

  it('still opens older files', () => {
    const raw = JSON.parse(serializeProject(doc().project))
    raw.schemaVersion = 1
    expect(parseProject(JSON.stringify(raw)).schemaVersion).toBe(4)
  })
})

describe('master scene and per-shot changes', () => {
  const view = { position: [0, 1.6, 5] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }
  const seen = (shotId: string | null, id: string) => sceneForShot(doc(), shotId)[id]
  const cam = (id: string) => {
    const n = scene().nodes[id]
    if (n.type !== 'camera') throw new Error('not a camera')
    return n
  }

  it('edits in a shot change only that shot', () => {
    const box = doc().addPrimitive('box')
    const s1 = doc().addCamera(view)
    const s2 = doc().addCamera(view)
    doc().setActiveShot(s2)
    doc().updateNode(box, { position: [2, 0, 0], color: '#ff0000' })
    expect(seen(s2, box).position).toEqual([2, 0, 0])
    expect(seen(null, box).position).toEqual([0, 0, 0]) // Master unchanged
    expect(seen(s1, box).position).toEqual([0, 0, 0])
    // Master edits flow to shots that haven't changed that field.
    doc().setActiveShot(null)
    doc().updateNode(box, { position: [5, 0, 0], rotation: [0, 45, 0] })
    expect(seen(s1, box).position).toEqual([5, 0, 0])
    expect(seen(s2, box).position).toEqual([2, 0, 0])
    expect(seen(s2, box).rotation).toEqual([0, 45, 0])
  })

  it('setting a value back to Master clears the change', () => {
    const box = doc().addPrimitive('box')
    const s1 = doc().addCamera(view)
    doc().setActiveShot(s1)
    doc().updateNode(box, { position: [2, 0, 0] })
    doc().updateNode(box, { position: [0, 0, 0] })
    expect(cam(s1).overrides).toEqual({})
  })

  it('new shots start from the active shot; shots made from Master start clean', () => {
    const fig = doc().addMannequin()
    const s1 = doc().addCamera(view)
    doc().setActiveShot(s1)
    doc().applyPreset(fig, 'sitting')
    const s2 = doc().addCamera(view)
    expect(seen(s2, fig)).toEqual(seen(s1, fig))
    doc().setActiveShot(null)
    const s3 = doc().addCamera(view)
    expect(cam(s3).overrides).toEqual({})
    // Later edits in shot 1 don't touch shot 2.
    doc().setActiveShot(s1)
    doc().applyPreset(fig, 'pointing')
    const s2Fig = seen(s2, fig)
    expect(s2Fig.type === 'mannequin' && s2Fig.pose.joints.kneeL[0]).toBe(90)
  })

  it('delete in a shot hides there only; delete in Master removes everywhere', () => {
    const box = doc().addPrimitive('box')
    const s1 = doc().addCamera(view)
    const s2 = doc().addCamera(view)
    doc().setActiveShot(s1)
    doc().deleteNodes([box])
    expect(seen(s1, box).hidden).toBe(true)
    expect(seen(s2, box).hidden).toBe(false)
    doc().setActiveShot(null)
    doc().deleteNodes([box])
    expect(scene().nodes[box]).toBeUndefined()
    expect(cam(s1).overrides).toEqual({})
  })

  it('revert and push to master', () => {
    const box = doc().addPrimitive('box')
    const s1 = doc().addCamera(view)
    const s2 = doc().addCamera(view)
    doc().setActiveShot(s1)
    doc().updateNode(box, { position: [3, 0, 0] })
    doc().revertOverride(box)
    expect(seen(s1, box).position).toEqual([0, 0, 0])
    doc().updateNode(box, { position: [3, 0, 0] })
    doc().pushOverrideToMaster(box)
    expect(seen(null, box).position).toEqual([3, 0, 0])
    expect(seen(s2, box).position).toEqual([3, 0, 0])
    expect(cam(s1).overrides).toEqual({})
  })

  it('figures change pose, height and colour per shot, and it all undoes', () => {
    const fig = doc().addMannequin()
    const s1 = doc().addCamera(view)
    doc().setActiveShot(s1)
    doc().updateNode(fig, { height: 1.2, color: '#00ff00' })
    doc().setJointRotation(fig, 'elbowL', [-90, 0, 0])
    const f = seen(s1, fig)
    expect(f.type === 'mannequin' && [f.height, f.color, f.pose.joints.elbowL[0]]).toEqual([1.2, '#00ff00', -90])
    const master = seen(null, fig)
    expect(master.type === 'mannequin' && master.height).toBe(1.75)
    doc().undo()
    doc().undo()
    expect(cam(s1).overrides).toEqual({})
  })

  it('cameras are always edited directly, and saves keep shot changes', () => {
    const box = doc().addPrimitive('box')
    const s1 = doc().addCamera(view)
    doc().setActiveShot(s1)
    doc().updateNode(s1, { focalLength: 50 })
    expect(cam(s1).focalLength).toBe(50)
    doc().updateNode(box, { hidden: true })
    const loaded = parseProject(serializeProject(doc().project))
    expect(loaded).toEqual(doc().project)
    expect(loaded.schemaVersion).toBe(4)
  })

  it('leaves the shot if undo removes its camera', () => {
    const s1 = doc().addCamera(view)
    doc().setActiveShot(s1)
    doc().undo()
    expect(doc().activeShotId).toBeNull()
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

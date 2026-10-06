import { beforeEach, describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { activeScene, environmentFor, hasUnsavedChanges, sceneForShot, useDocument, worldMatrix } from './documentStore'
import { descriptionFor, parseProject, SCHEMA_VERSION, sceneLabel, serializeProject, type MannequinNode } from '../../../shared/project'
import { AVERAGE_BODY } from '../../../shared/humanBody'

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

  it('keeps a shot-moved object where it is in that shot when grouping', () => {
    const a = doc().addPrimitive('box', [2, 0])
    const b = doc().addPrimitive('sphere', [4, 2])
    const shot = doc().addCamera({ position: [0, 1.6, 6], rotation: [0, 0, 0] })
    doc().setActiveShot(shot)
    doc().updateNode(a, { position: [-3, 0, 1] })
    doc().setActiveShot(null)
    const g = doc().groupNodes([a, b])!
    const inShot = () => new Vector3().setFromMatrixPosition(worldMatrix({ ...scene(), nodes: sceneForShot(doc(), shot) }, a))
    expect(inShot().distanceTo(new Vector3(-3, 0, 1))).toBeLessThan(1e-3)
    expect(worldPos(a).distanceTo(new Vector3(2, 0, 0))).toBeLessThan(1e-3)
    doc().ungroup([g])
    expect(inShot().distanceTo(new Vector3(-3, 0, 1))).toBeLessThan(1e-3)
  })
})

describe('outliner drag & drop (moveNodes)', () => {
  const near = (v: Vector3, x: number, y: number, z: number) => expect(v.distanceTo(new Vector3(x, y, z))).toBeLessThan(1e-3)

  it('reorders at the top level', () => {
    const a = doc().addPrimitive('box')
    const b = doc().addPrimitive('box')
    const c = doc().addPrimitive('box')
    doc().moveNodes([c], null, a)
    expect(scene().rootIds).toEqual([c, a, b])
    doc().moveNodes([c], null, null)
    expect(scene().rootIds).toEqual([a, b, c])
    // Several at once keep their order; dropping before one of them anchors on the next one.
    doc().moveNodes([b, a], null, c)
    expect(scene().rootIds).toEqual([a, b, c])
    doc().moveNodes([a, b], null, a)
    expect(scene().rootIds).toEqual([a, b, c])
    doc().moveNodes([c], null, b)
    expect(scene().rootIds).toEqual([a, c, b])
  })

  it('moves into and out of a group without moving in the world', () => {
    const a = doc().addPrimitive('box', [1, 1])
    const b = doc().addPrimitive('box', [3, 0])
    const c = doc().addPrimitive('sphere', [-2, 4])
    const g = doc().groupNodes([a, b])!
    doc().updateNode(g, { position: [5, 0, 0], rotation: [0, 90, 0] })
    const cWorld = worldPos(c)
    doc().moveNodes([c], g, null)
    expect(scene().nodes[c].parentId).toBe(g)
    expect(scene().rootIds).toEqual([g])
    const group = scene().nodes[g]
    expect(group.type === 'group' && group.childIds).toEqual([a, b, c])
    near(worldPos(c), cWorld.x, cWorld.y, cWorld.z)

    doc().moveNodes([c], null, g)
    expect(scene().rootIds).toEqual([c, g])
    expect(scene().nodes[c].parentId).toBeNull()
    near(worldPos(c), cWorld.x, cWorld.y, cWorld.z)

    // One undo step.
    doc().undo()
    expect(scene().nodes[c].parentId).toBe(g)
  })

  it('keeps per-shot placements in place', () => {
    const a = doc().addPrimitive('box', [1, 1])
    const c = doc().addPrimitive('sphere', [-2, 4])
    const g = doc().groupNodes([a])!
    doc().updateNode(g, { position: [5, 0, 0], rotation: [0, 90, 0] })
    const shot = doc().addCamera({ position: [0, 1.6, 6], rotation: [0, 0, 0] })
    doc().setActiveShot(shot)
    doc().updateNode(c, { position: [0, 2, -1] })
    doc().moveNodes([c], g, null)
    // Changed Master's hierarchy even while editing the shot.
    expect(scene().nodes[c].parentId).toBe(g)
    const inShot = new Vector3().setFromMatrixPosition(worldMatrix({ ...scene(), nodes: sceneForShot(doc(), shot) }, c))
    near(inShot, 0, 2, -1)
    near(worldPos(c), -2, 0, 4)
  })

  it('refuses to put a group inside itself or its contents', () => {
    const a = doc().addPrimitive('box')
    const inner = doc().groupNodes([a])!
    const outer = doc().groupNodes([inner])!
    doc().moveNodes([outer], inner, null)
    expect(scene().nodes[outer].parentId).toBeNull()
    doc().moveNodes([outer], outer, null)
    expect(scene().nodes[outer].parentId).toBeNull()
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
    expect(figure(a).height).toBe(1.78) // the first new figure is a man
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
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('posing 2: plants, look-at and several joints in one step, per shot, and older files', () => {
    const a = doc().addMannequin()
    expect(figure(a).plants).toEqual({})
    expect(figure(a).lookAt).toBeNull()
    const steps = doc().past.length
    const plant = { position: [0.1, 0.08, 0.05] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }
    doc().updatePose(a, { joints: { hipL: [-20, 0, 0], kneeL: [40, 0, 0] }, pelvisOffset: [0, -0.05, 0], plants: { ankleL: plant } })
    expect(doc().past.length).toBe(steps + 1)
    expect(figure(a).pose.joints.kneeL).toEqual([40, 0, 0])
    expect(figure(a).plants.ankleL).toEqual(plant)

    // A shot can plant somewhere else and look at its camera; Master keeps its own.
    const shot = doc().addCamera({ position: [0, 1.6, 4], rotation: [0, 0, 0] })
    doc().setActiveShot(shot)
    doc().updatePose(a, { plants: {} })
    doc().updateNode(a, { lookAt: { kind: 'camera' } })
    const inShot = sceneForShot(doc(), shot)[a] as MannequinNode
    expect(inShot.plants).toEqual({})
    expect(inShot.lookAt).toEqual({ kind: 'camera' })
    expect(figure(a).plants.ankleL).toEqual(plant)
    expect(figure(a).lookAt).toBeNull()
    doc().setActiveShot(null)

    // Survives save and load; a new whole pose releases plants.
    expect(parseProject(serializeProject(doc().project))).toEqual(doc().project)
    doc().applyPreset(a, 'walking')
    expect(figure(a).plants).toEqual({})

    // Figures from before v13 open with nothing planted and no look-at.
    const raw = JSON.parse(serializeProject(doc().project))
    raw.schemaVersion = 12
    for (const s of raw.scenes) for (const n of Object.values(s.nodes) as Record<string, unknown>[]) if (n.type === 'mannequin') {
      delete n.plants
      delete n.lookAt
    }
    const old = parseProject(JSON.stringify(raw))
    const f = old.scenes[0].nodes[a] as MannequinNode
    expect(f.plants).toEqual({})
    expect(f.lookAt).toBeNull()
  })

  it('cast and prop texts per scene and per shot (shot, then scene, then the usual one)', () => {
    const maribel = doc().addCast({ name: 'Maribel', description: 'woman in her 20s, olive raincoat' })
    const entity = () => doc().project.cast.find((c) => c.id === maribel)!
    const a = doc().addCamera({ position: [0, 1.6, 4], rotation: [0, 0, 0] })
    const b = doc().addCamera({ position: [1, 1.6, 4], rotation: [0, 0, 0] })
    const cam = (id: string) => scene().nodes[id] as never
    doc().setDescriptionTweak(maribel, 'scene', 'woman in her 20s, olive raincoat, soaking wet')
    doc().setActiveShot(a)
    doc().setDescriptionTweak(maribel, 'shot', 'woman in her 20s, soaking wet, hair plastered down')
    doc().setActiveShot(null)
    expect(descriptionFor(entity(), scene(), cam(a))).toBe('woman in her 20s, soaking wet, hair plastered down')
    expect(descriptionFor(entity(), scene(), cam(b))).toBe('woman in her 20s, olive raincoat, soaking wet')
    expect(descriptionFor(entity(), null, null)).toBe('woman in her 20s, olive raincoat')
    // Survives save/load; back to the usual text.
    expect(parseProject(serializeProject(doc().project))).toEqual(doc().project)
    doc().setDescriptionTweak(maribel, 'scene', null)
    expect(descriptionFor(entity(), scene(), cam(b))).toBe('woman in her 20s, olive raincoat')
  })

  it('objects have a material (matte by default, older files too), changeable per shot', () => {
    const box = doc().addPrimitive('box')
    expect((scene().nodes[box] as { material: string }).material).toBe('matte')
    const shot = doc().addCamera({ position: [0, 1.6, 4], rotation: [0, 0, 0] })
    doc().setActiveShot(shot)
    doc().updateNode(box, { material: 'metal' })
    expect((sceneForShot(doc(), shot)[box] as { material: string }).material).toBe('metal')
    expect((scene().nodes[box] as { material: string }).material).toBe('matte')
    doc().setActiveShot(null)
    const raw = JSON.parse(serializeProject(doc().project))
    raw.schemaVersion = 13
    delete raw.scenes[0].nodes[box].material
    delete raw.scenes[0].descriptions
    const old = parseProject(JSON.stringify(raw))
    expect((old.scenes[0].nodes[box] as { material: string }).material).toBe('matte')
    expect(old.scenes[0].descriptions).toEqual({})
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

describe('shots and cameras', () => {
  const cam = (id: string) => {
    const n = scene().nodes[id]
    if (n.type !== 'camera') throw new Error('not a camera')
    return n
  }
  const view = { position: [1, 1.6, 4] as [number, number, number], rotation: [-5, 20, 0] as [number, number, number] }

  it('names shots after the scene: 1A, 1B…', () => {
    const a = doc().addCamera(view)
    expect(cam(a).shotNumber).toBe('1A')
    expect(cam(a).name).toBe('Shot 1A')
    expect(cam(a).position).toEqual([1, 1.6, 4])
    const b = doc().addCamera({ ...view, focalLength: 85 })
    expect(cam(b).shotNumber).toBe('1B')
    expect(cam(b).focalLength).toBe(85)
  })

  it('new shots take the active shot lens', () => {
    const a = doc().addCamera({ ...view, focalLength: 50 })
    doc().setActiveShot(a)
    const b = doc().addCamera(view)
    expect(cam(b).focalLength).toBe(50)
  })

  it('keeps lens valid and the default name in step with the shot number', () => {
    const a = doc().addCamera(view)
    doc().updateNode(a, { focalLength: 2000, shotNumber: '12A', scale: [3, 3, 3] })
    expect(cam(a).focalLength).toBe(600)
    expect(cam(a).name).toBe('Shot 12A')
    expect(cam(a).scale).toEqual([1, 1, 1])
  })

  it('shares one camera body across the project, undoably', () => {
    doc().updateCameraKit({ squeeze: 1.73, guides: ['2.39', '16:9'], delivery: '2.39' })
    expect(doc().project.camera.squeeze).toBe(1.7)
    expect(doc().project.camera.delivery).toBe('2.39')
    doc().updateCameraKit({ delivery: 'custom:9' }) // not an enabled guide
    expect(doc().project.camera.delivery).toBe('sensor')
    doc().undo()
    expect(doc().project.camera.delivery).toBe('2.39')
  })

  it('keeps shot names consecutive when shots are deleted or reordered', () => {
    const a = doc().addCamera(view)
    const b = doc().addCamera(view)
    const c = doc().addCamera(view)
    const names = () => [a, b, c].map((id) => (scene().nodes[id]?.type === 'camera' ? cam(id).shotNumber : null))
    doc().reorderShots([c, a, b])
    expect(names()).toEqual(['1B', '1C', '1A'])
    expect(cam(c).name).toBe('Shot 1A')
    doc().deleteNodes([c])
    expect(names()).toEqual(['1A', '1B', null])
    doc().undo()
    expect(names()).toEqual(['1B', '1C', '1A'])
  })

  it('gives duplicated cameras the next letter', () => {
    const a = doc().addCamera(view)
    const [copy] = doc().duplicateNodes([a])
    expect(cam(copy).shotNumber).toBe('1B')
  })

  it('never groups cameras', () => {
    const box = doc().addPrimitive('box')
    const a = doc().addCamera(view)
    const g = doc().groupNodes([box, a])!
    expect(cam(a).parentId).toBeNull()
    expect(scene().nodes[g].type === 'group' && (scene().nodes[g] as { childIds: string[] }).childIds).toEqual([box])
  })

  it('saves and loads the project camera', () => {
    doc().updateCameraKit({ guides: ['16:9', 'custom:2.2'], delivery: 'custom:2.2' })
    doc().addCamera(view)
    const loaded = parseProject(serializeProject(doc().project))
    expect(loaded).toEqual(doc().project)
    expect(loaded.camera.delivery).toBe('custom:2.2')
  })
})

describe('scenes', () => {
  it('adds empty scenes and copies of the set without shots', () => {
    const box = doc().addPrimitive('box')
    doc().addCamera({ position: [0, 1, 3], rotation: [0, 0, 0] })
    const s2 = doc().addScene(true)
    expect(doc().sceneId).toBe(s2)
    expect(scene().number).toBe(2)
    expect(Object.values(scene().nodes).map((n) => n.type)).toEqual(['primitive'])
    expect(box in scene().nodes).toBe(true)
    expect(doc().addCamera({ position: [0, 1, 3], rotation: [0, 0, 0] }) && scene().rootIds.length).toBe(2)
    const shot = Object.values(scene().nodes).find((n) => n.type === 'camera')
    expect(shot?.type === 'camera' && shot.shotNumber).toBe('2A')
    doc().addScene(false)
    expect(scene().number).toBe(3)
    expect(scene().rootIds).toEqual([])
  })

  it('renames a scene and its shots together', () => {
    const a = doc().addCamera({ position: [0, 1, 3], rotation: [0, 0, 0] })
    doc().renameScene(5, 'EXT. STREET')
    expect(scene().number).toBe(5)
    expect(scene().name).toBe('EXT. STREET')
    const c = scene().nodes[a]
    expect(c.type === 'camera' && [c.shotNumber, c.name]).toEqual(['5A', 'Shot 5A'])
  })

  it('toggles the render floor with undo, and duplicates keep it', () => {
    expect(scene().floor).toBe(true)
    doc().setSceneFloor(false)
    expect(scene().floor).toBe(false)
    doc().addScene(true)
    expect(scene().floor).toBe(false)
    doc().undo()
    doc().undo()
    expect(scene().floor).toBe(true)
  })

  it('labels scenes with their number and title', () => {
    expect(sceneLabel({ number: 3, name: '' })).toBe('Scene 03')
    expect(sceneLabel({ number: 3, name: 'INT. KITCHEN' })).toBe('Scene 03 · INT. KITCHEN')
  })

  it('switching scenes leaves the shot; deleting keeps at least one scene', () => {
    const a = doc().addCamera({ position: [0, 1, 3], rotation: [0, 0, 0] })
    doc().setActiveShot(a)
    const first = doc().sceneId
    doc().addScene(false)
    expect(doc().activeShotId).toBeNull()
    doc().deleteScene()
    expect(doc().sceneId).toBe(first)
    expect(doc().project.scenes).toHaveLength(1)
    doc().deleteScene()
    expect(doc().project.scenes).toHaveLength(1)
  })
})

describe('lights', () => {
  const lamp = (id: string, shotId: string | null = null) => {
    const n = sceneForShot(doc(), shotId)[id]
    if (n.type !== 'light') throw new Error('not a light')
    return n
  }

  it('adds lights aimed down and forward, with sensible defaults', () => {
    const sun = doc().addLight('sun', [1, 2])
    expect(lamp(sun).name).toBe('Sun 1')
    expect(lamp(sun).position).toEqual([1, 2.5, 2])
    expect(lamp(sun).stops).toBe(0)
    const amb = doc().addLight('ambient')
    expect(lamp(amb).shadows).toBe(false)
    expect(lamp(amb).stops).toBe(-2)
  })

  it('keeps values in range and never scales lights', () => {
    const spot = doc().addLight('spot')
    doc().updateNode(spot, { stops: 12, kelvin: 500, softness: 3, coneAngle: 400, scale: [2, 2, 2] })
    expect([lamp(spot).stops, lamp(spot).kelvin, lamp(spot).softness, lamp(spot).coneAngle]).toEqual([6, 1800, 1, 120])
    expect(lamp(spot).scale).toEqual([1, 1, 1])
  })

  it('can be cheated per shot', () => {
    const sun = doc().addLight('sun')
    const shot = doc().addCamera({ position: [0, 1.6, 4], rotation: [0, 0, 0] })
    doc().setActiveShot(shot)
    doc().updateNode(sun, { stops: 1, kelvin: 3200 })
    expect([lamp(sun, shot).stops, lamp(sun, shot).kelvin]).toEqual([1, 3200])
    expect([lamp(sun).stops, lamp(sun).kelvin]).toEqual([0, 5600])
  })

  it('saves and loads lights', () => {
    doc().addLight('spot')
    const loaded = parseProject(serializeProject(doc().project))
    expect(loaded).toEqual(doc().project)
  })
})

describe('generation settings', () => {
  it('keeps settings in range as one undo step each, and saves them', () => {
    doc().updateGeneration({ takes: 20, steps: 0 })
    expect(doc().project.generation.takes).toBe(8)
    expect(doc().project.generation.steps).toBe(1)
    doc().updateGeneration({ strictness: null, strength: 1.2 })
    doc().setStyleText('pencil sketch')
    const loaded = parseProject(serializeProject(doc().project))
    expect(loaded.generation.strength).toBe(1.2)
    expect(loaded.generation.strictness).toBeNull()
    expect(loaded.styleText).toBe('pencil sketch')
    doc().undo()
    doc().undo()
    doc().undo()
    expect(doc().project.generation.takes).toBe(2)
  })

  it('gives shots a description that new shots copy from the active shot', () => {
    const a = doc().addCamera({ position: [0, 1, 3], rotation: [0, 0, 0] })
    doc().updateNode(a, { description: 'a rainy bus stop' })
    doc().setActiveShot(a)
    const b = doc().addCamera({ position: [0, 1, 3], rotation: [0, 0, 0] })
    const nb = scene().nodes[b]
    expect(nb.type === 'camera' && nb.description).toBe('a rainy bus stop')
  })
})

describe('cast, props and circle takes', () => {
  it('adds, edits and deletes cast members; deleting unlinks their figures', () => {
    const fig = doc().addMannequin()
    const maribel = doc().addCast({ name: 'Maribel', description: 'woman, olive raincoat', images: ['a.png', '../evil.png'] })
    expect(doc().project.cast[0]).toMatchObject({ name: 'Maribel', images: ['a.png'] })
    doc().updateNode(fig, { castId: maribel })
    const f = scene().nodes[fig]
    expect(f.type === 'mannequin' && f.castId).toBe(maribel)
    doc().updateCast(maribel, { strength: 9, name: '  ' })
    expect(doc().project.cast[0]).toMatchObject({ strength: 1.5, name: 'Maribel' })
    doc().deleteCast(maribel)
    const g = scene().nodes[fig]
    expect(g.type === 'mannequin' && g.castId).toBeNull()
    doc().undo()
    const h = scene().nodes[fig]
    expect(h.type === 'mannequin' && h.castId).toBe(maribel)
  })

  it('links props to objects and groups, and describes unlinked things', () => {
    const box = doc().addPrimitive('box')
    const crate = doc().addProp({ name: 'Crate' })
    doc().updateNode(box, { propId: crate })
    doc().updateNode(box, { description: 'a rusty oil drum' })
    const b = scene().nodes[box]
    expect(b.type === 'primitive' && [b.propId, b.description]).toEqual([crate, 'a rusty oil drum'])
    doc().deleteProp(crate)
    const c = scene().nodes[box]
    expect(c.type === 'primitive' && c.propId).toBeNull()
  })

  it('circles one take per shot, with undo, and saves it all', () => {
    const shot = doc().addCamera({ position: [0, 1, 3], rotation: [0, 0, 0] })
    doc().updateNode(shot, { circleTake: '20260930-010203-abcd' })
    doc().setStyleImages(['still.jpg', 'x.exe'])
    const loaded = parseProject(serializeProject(doc().project))
    const c = Object.values(loaded.scenes[0].nodes).find((n) => n.type === 'camera')
    expect(c?.type === 'camera' && c.circleTake).toBe('20260930-010203-abcd')
    expect(loaded.styleImages).toEqual(['still.jpg'])
    doc().undo()
    doc().undo()
    const d = scene().nodes[shot]
    expect(d.type === 'camera' && d.circleTake).toBeNull()
  })

  it('loads older projects with empty cast and props', () => {
    const raw = JSON.parse(serializeProject(doc().project))
    raw.schemaVersion = 8
    raw.cast = [{ id: 'c1', name: 'Old', images: ['ok.png', 'C:\bad.png'] }, { nope: 1 }]
    delete raw.styleImages
    const p = parseProject(JSON.stringify(raw))
    expect(p.cast).toHaveLength(1)
    expect(p.cast[0]).toMatchObject({ id: 'c1', images: ['ok.png'], strength: 0.8 })
    expect(p.styleImages).toEqual([])
  })
})

describe('human figures', () => {
  it('makes new figures human, alternating man and woman, and saves the body', () => {
    const a = doc().addMannequin()
    const b = doc().addMannequin()
    const fa = scene().nodes[a]
    const fb = scene().nodes[b]
    expect(fa.type === 'mannequin' && [fa.style, fa.body.gender]).toEqual(['human', 1])
    expect(fb.type === 'mannequin' && [fb.style, fb.body.gender]).toEqual(['human', 0])
    doc().updateNode(a, { body: { ...AVERAGE_BODY, gender: 1, age: 0.8, muscle: 0.2, weight: 2 } })
    const loaded = parseProject(serializeProject(doc().project)).scenes[0].nodes[a]
    expect(loaded.type === 'mannequin' && loaded.body).toEqual({ ...AVERAGE_BODY, gender: 1, age: 0.8, muscle: 0.2, weight: 1 })
    doc().undo()
    const back = scene().nodes[a]
    expect(back.type === 'mannequin' && back.body.age).toBe(0.5)
  })

  it('opens older figures as mannequins', () => {
    const a = doc().addMannequin()
    const raw = JSON.parse(serializeProject(doc().project))
    raw.schemaVersion = 11
    delete raw.scenes[0].nodes[a].style
    delete raw.scenes[0].nodes[a].body
    raw.scenes[0].nodes[a].build = 0.8
    const old = parseProject(JSON.stringify(raw)).scenes[0].nodes[a]
    expect(old.type === 'mannequin' && [old.style, old.body.weight]).toEqual(['mannequin', 0.8])
  })

  it('lets a shot change the body', () => {
    const fig = doc().addMannequin()
    const cam = doc().addCamera({ position: [0, 1, 3], rotation: [0, 0, 0] })
    doc().setActiveShot(cam)
    doc().updateNode(fig, { body: { ...AVERAGE_BODY, gender: 0, age: 0.9, muscle: 0.5, weight: 0.5 } })
    const inShot = sceneForShot(doc(), cam)[fig]
    const master = scene().nodes[fig]
    expect(inShot.type === 'mannequin' && inShot.body.age).toBe(0.9)
    expect(master.type === 'mannequin' && master.body.age).toBe(0.5)
  })
})

describe('cast looks', () => {
  it('shares body and clothes between figures linked to the same cast member', () => {
    const a = doc().addMannequin()
    const b = doc().addMannequin()
    const maribel = doc().addCast({ name: 'Maribel' })
    doc().updateNode(a, { body: { ...AVERAGE_BODY, gender: 0, age: 0.6, muscle: 0.4, weight: 0.3 } })
    doc().updateNode(a, { castId: maribel }) // first link: the cast member takes a's look
    expect(doc().project.cast[0].look?.body.age).toBe(0.6)
    doc().updateNode(b, { castId: maribel }) // b takes the cast member's look
    const fig = (id: string) => scene().nodes[id] as MannequinNode
    expect(fig(b).body.age).toBe(0.6)
    // Changing either one changes both (one undo step).
    doc().updateNode(b, { appearance: { hair: 'hair-bob01', eyebrows: null, garments: { outfit: 'outfit-dress-shift' }, colors: {}, skinTone: 0.3, eyeColor: 'brown' } })
    expect(fig(a).appearance.hair).toBe('hair-bob01')
    expect(doc().project.cast[0].look?.appearance.garments.outfit).toBe('outfit-dress-shift')
    doc().undo()
    expect(fig(a).appearance.hair).not.toBe('hair-bob01')
    // A change inside a shot stays that shot's cheat.
    const cam = doc().addCamera({ position: [0, 1, 3], rotation: [0, 0, 0] })
    doc().setActiveShot(cam)
    doc().updateNode(a, { body: { ...AVERAGE_BODY, gender: 0, age: 0.9, muscle: 0.4, weight: 0.3 } })
    expect(fig(b).body.age).toBe(0.6)
    const loaded = parseProject(serializeProject(doc().project))
    expect(loaded.cast[0].look?.body.age).toBe(0.6)
  })
})

describe('environment', () => {
  it('belongs to the scene, and a shot can have its own (undoable, saved)', () => {
    const a = doc().addCamera({ position: [0, 1, 3], rotation: [0, 0, 0] })
    const b = doc().addCamera({ position: [0, 1, 3], rotation: [0, 0, 0] })
    expect(environmentFor(doc(), a)).toEqual({ time: 12, ground: '#9a9a96', fog: 0 })
    doc().setEnvironment(a, { time: 18.5 }) // a follows the scene: changes the scene
    expect(scene().environment.time).toBe(18.5)
    expect(environmentFor(doc(), b).time).toBe(18.5)
    doc().setShotOwnEnvironment(a, true)
    doc().setEnvironment(a, { time: 2, ground: '#224422' })
    expect(environmentFor(doc(), a)).toEqual({ time: 2, ground: '#224422', fog: 0 })
    expect(environmentFor(doc(), b).time).toBe(18.5)
    doc().setEnvironment(null, { time: 40 }) // clamped
    expect(scene().environment.time).toBe(24)
    const loaded = parseProject(serializeProject(doc().project))
    const la = loaded.scenes[0].nodes[a]
    expect(la.type === 'camera' && la.environment).toEqual({ time: 2, ground: '#224422', fog: 0 })
    expect(loaded.scenes[0].environment.time).toBe(24)
    doc().undo()
    doc().setShotOwnEnvironment(a, false)
    expect(environmentFor(doc(), a).time).toBe(18.5)
    doc().undo()
    expect(environmentFor(doc(), a).time).toBe(2)
  })

  it('fills in a midday default for older files', () => {
    const raw = JSON.parse(serializeProject(doc().project))
    raw.schemaVersion = 10
    delete raw.scenes[0].environment
    expect(parseProject(JSON.stringify(raw)).scenes[0].environment).toEqual({ time: 12, ground: '#9a9a96', fog: 0 })
  })
})

describe('storyboard', () => {
  it('keeps its own order and panel captions, with undo, and saves them', () => {
    const a = doc().addCamera({ position: [0, 1, 3], rotation: [0, 0, 0] })
    const b = doc().addCamera({ position: [0, 1, 3], rotation: [0, 0, 0] })
    doc().setBoardOrder([b, a, b])
    expect(doc().project.board.order).toEqual([b, a])
    doc().updateNode(a, { boardText: 'She turns.', dialogue: "Who's there?" })
    const loaded = parseProject(serializeProject(doc().project))
    expect(loaded.board.order).toEqual([b, a])
    const la = loaded.scenes[0].nodes[a]
    expect(la.type === 'camera' && [la.boardText, la.dialogue]).toEqual(['She turns.', "Who's there?"])
    // Reordering on the board never renames shots.
    const sa = scene().nodes[a]
    expect(sa.type === 'camera' && sa.shotNumber).toBe('1A')
    doc().undo()
    doc().undo()
    expect(doc().project.board.order).toEqual([])
  })

  it('loads older projects with an empty board', () => {
    const raw = JSON.parse(serializeProject(doc().project))
    raw.schemaVersion = 9
    delete raw.board
    const p = parseProject(JSON.stringify(raw))
    expect(p.board.order).toEqual([])
  })
})

describe('older project files', () => {
  it('turns v4 per-camera settings into the project camera and renames numbered shots', () => {
    const raw = {
      schemaVersion: 4,
      name: 'Old',
      scenes: [
        {
          id: 's1',
          name: 'Scene 1',
          notes: '',
          rootIds: ['c1', 'c2'],
          nodes: {
            c1: {
              id: 'c1', type: 'camera', name: 'Shot 1', parentId: null, position: [0, 1, 3], rotation: [0, 0, 0],
              scale: [1, 1, 1], hidden: false, locked: false, shotNumber: '1', focalLength: 50, focusDistance: null,
              sensor: { preset: 'alexa35', width: 27.99, height: 19.22 }, squeeze: 2, guides: ['2.39'], delivery: '2.39',
              thirds: true, subjectId: null, sizeOverride: null, angleOverride: null, notes: '', overrides: {}
            },
            c2: {
              id: 'c2', type: 'camera', name: 'Shot 2', parentId: null, position: [0, 1, 3], rotation: [0, 0, 0],
              scale: [1, 1, 1], hidden: false, locked: false, shotNumber: '2', focalLength: 35, focusDistance: null,
              sensor: { preset: 'ff', width: 36, height: 24 }, squeeze: 1, guides: [], delivery: 'sensor',
              thirds: false, subjectId: null, sizeOverride: null, angleOverride: null, notes: '', overrides: {}
            }
          }
        }
      ]
    }
    const p = parseProject(JSON.stringify(raw))
    expect(p.schemaVersion).toBe(SCHEMA_VERSION)
    expect(p.camera.sensor.preset).toBe('alexa35')
    expect(p.camera.delivery).toBe('2.39')
    expect(p.scenes[0].number).toBe(1)
    expect(p.scenes[0].name).toBe('')
    expect(p.scenes[0].floor).toBe(true)
    expect(p.generation.steps).toBe(30)
    // Shots from before the lens stop get T2.8.
    expect(Object.values(p.scenes[0].nodes).every((n) => n.type === 'camera' && n.aperture === 2.8)).toBe(true)
    const shot = Object.values(p.scenes[0].nodes)[0]
    expect(shot.type === 'camera' && shot.description).toBe('')
    const shots = Object.values(p.scenes[0].nodes).map((n) => (n.type === 'camera' ? [n.shotNumber, n.name] : null))
    expect(shots).toEqual([
      ['1A', 'Shot 1A'],
      ['1B', 'Shot 1B']
    ])
    expect('sensor' in p.scenes[0].nodes.c1).toBe(false)
  })

  it('still opens v1 files', () => {
    const raw = JSON.parse(serializeProject(doc().project))
    raw.schemaVersion = 1
    delete raw.camera
    expect(parseProject(JSON.stringify(raw)).schemaVersion).toBe(SCHEMA_VERSION)
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
    expect(master.type === 'mannequin' && master.height).toBe(1.78)
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
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION)
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

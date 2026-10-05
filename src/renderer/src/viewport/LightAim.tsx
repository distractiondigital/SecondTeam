import { useMemo, useRef, useState } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Euler,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineLoop,
  LineSegments,
  MathUtils,
  Object3D,
  Plane,
  Quaternion,
  Raycaster,
  Vector3
} from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import { aimAt } from '../../../shared/lighting'
import { viewportBridge } from './viewportBridge'
import { setSurfaces } from './surfaces'
import { editedNodes, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { SELECTION_COLOR } from './selection'

// Where a selected sun or spot lands: a dashed aim line from the light to the first surface it
// hits (or the ground), a small cross there, and for a spot the outline of its pool of light
// (48 rays around the edge of the cone). The cross has its own move gizmo: drag it and the light
// turns to point at it (the light stays where it is; one undo step per drag). A viewport helper: never in renders, thumbnails or
// passes, and hidden while looking through a camera, like the light icons.

const FOOTPRINT_RAYS = 48
const MISS_LENGTH = 3 // metres of aim line when it hits nothing (a light pointing at the sky)
const MAX_DISTANCE = 200
const CROSS = 0.08
const UPDATE_EVERY = 0.1 // seconds between re-aims (rays against figures and sets add up)

const GROUND = new Plane(new Vector3(0, 1, 0), 0)

function lineGeometry(points: number): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(points * 3), 3))
  return g
}

export default function LightAim() {
  const selection = useUi((s) => s.selection)
  const inCameraView = useUi((s) => s.lookThroughId !== null)
  const light = useDocument((s) => {
    const n = selection.length === 1 ? editedNodes(s)[selection[0]] : undefined
    return n?.type === 'light' && (n.kind === 'sun' || n.kind === 'spot') && !n.hidden ? n : null
  })
  const scene = useThree((s) => s.scene)

  const parts = useMemo(() => {
    const group = new Group()
    group.userData.helper = true
    const style = { color: SELECTION_COLOR, depthTest: false, transparent: true, opacity: 0.9 }
    const aim = new Line(lineGeometry(2), new LineDashedMaterial({ ...style, dashSize: 0.12, gapSize: 0.08 }))
    const cross = new LineSegments(lineGeometry(6), new LineBasicMaterial(style))
    const footprint = new LineLoop(lineGeometry(FOOTPRINT_RAYS), new LineBasicMaterial(style))
    for (const o of [aim, cross, footprint]) {
      o.renderOrder = 1002
      o.frustumCulled = false
      group.add(o)
    }
    return { group, aim, cross, footprint }
  }, [])
  const since = useRef(Infinity)
  // The aim point's handle: sits on the cross, except while it's being dragged.
  const handle = useMemo(() => {
    const o = new Object3D()
    o.userData.helper = true
    return o
  }, [])
  const dragging = useRef(false)
  const [handleShown, setHandleShown] = useState(false)

  /** Turn the light to point at the handle. */
  const aimAtHandle = () => {
    const object = light ? scene.getObjectByName(light.id) : null
    if (!light || !object) return
    object.updateWorldMatrix(true, false)
    handle.updateWorldMatrix(true, false)
    const from = new Vector3().setFromMatrixPosition(object.matrixWorld)
    const to = new Vector3().setFromMatrixPosition(handle.matrixWorld)
    const aim = aimAt(from.toArray(), to.toArray())
    if (!aim) return
    // World pan/tilt, then into the light's own group (if it's in one).
    const world = new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(aim.tilt), MathUtils.degToRad(aim.pan), 0, 'YXZ'))
    const parent = object.parent ? object.parent.getWorldQuaternion(new Quaternion()) : new Quaternion()
    const e = new Euler().setFromQuaternion(parent.invert().multiply(world), 'XYZ')
    const deg = (r: number) => Math.round(MathUtils.radToDeg(r) * 10000) / 10000 || 0
    useDocument.getState().updateNode(light.id, { rotation: [deg(e.x), deg(e.y), deg(e.z)] })
    since.current = Infinity // re-aim the line straight away
  }

  useFrame((_, delta) => {
    since.current += delta
    const { group, aim, cross, footprint } = parts
    group.visible = Boolean(light) && !inCameraView
    const wantHandle = Boolean(light) && !inCameraView && !light?.locked
    if (wantHandle !== handleShown) setHandleShown(wantHandle)
    if (!light || inCameraView) return
    const object = scene.getObjectByName(light.id)
    if (!object) return
    // Re-aim a few times a second (enough to follow a drag, light on the CPU).
    if (since.current < UPDATE_EVERY) return
    since.current = 0

    object.updateWorldMatrix(true, false)
    const origin = new Vector3().setFromMatrixPosition(object.matrixWorld)
    const turn = new Quaternion().setFromRotationMatrix(object.matrixWorld)
    const forward = new Vector3(0, 0, -1).applyQuaternion(turn)
    const nodes = editedNodes(useDocument.getState())
    const targets = setSurfaces(scene, nodes)
    const ray = new Raycaster()
    ray.far = MAX_DISTANCE
    /** Where a ray from the light lands (null if it lands nowhere). */
    const land = (dir: Vector3): Vector3 | null => {
      ray.set(origin, dir)
      const hit = ray.intersectObjects(targets, false)[0]?.point ?? null
      const ground = dir.y < 0 ? ray.ray.intersectPlane(GROUND, new Vector3()) : null
      if (hit && ground) return hit.distanceTo(origin) < ground.distanceTo(origin) ? hit : ground
      return hit ?? ground
    }

    // Aim line and the cross where it lands.
    const hit = land(forward)
    const end = hit ?? origin.clone().addScaledVector(forward, MISS_LENGTH)
    if (!dragging.current) handle.position.copy(end)
    const a = aim.geometry.getAttribute('position') as BufferAttribute
    a.setXYZ(0, origin.x, origin.y, origin.z)
    a.setXYZ(1, end.x, end.y, end.z)
    a.needsUpdate = true
    aim.geometry.computeBoundingSphere()
    aim.computeLineDistances()
    cross.visible = Boolean(hit)
    if (hit) {
      const c = cross.geometry.getAttribute('position') as BufferAttribute
      c.setXYZ(0, hit.x - CROSS, hit.y, hit.z)
      c.setXYZ(1, hit.x + CROSS, hit.y, hit.z)
      c.setXYZ(2, hit.x, hit.y, hit.z - CROSS)
      c.setXYZ(3, hit.x, hit.y, hit.z + CROSS)
      c.setXYZ(4, hit.x, hit.y - CROSS, hit.z)
      c.setXYZ(5, hit.x, hit.y + CROSS, hit.z)
      c.needsUpdate = true
    }

    // A spot's pool of light: rays around the edge of its cone.
    footprint.visible = light.kind === 'spot'
    if (light.kind !== 'spot') return
    const half = MathUtils.degToRad(light.coneAngle / 2)
    const side = new Vector3(1, 0, 0).applyQuaternion(turn)
    const edge = forward.clone().applyAxisAngle(side, half)
    const f = footprint.geometry.getAttribute('position') as BufferAttribute
    let landed = 0
    for (let i = 0; i < FOOTPRINT_RAYS; i++) {
      const dir = edge.clone().applyAxisAngle(forward, (i / FOOTPRINT_RAYS) * Math.PI * 2)
      const p = land(dir)
      if (p) landed++
      const q = p ?? origin.clone().addScaledVector(dir, MISS_LENGTH)
      f.setXYZ(i, q.x, q.y, q.z)
    }
    f.needsUpdate = true
    // Pointing at the sky: no pool to show.
    footprint.visible = landed > FOOTPRINT_RAYS / 2
  })

  return (
    <>
      <primitive object={parts.group} />
      <primitive object={handle} />
      {handleShown && (
        <TransformControls
          object={handle}
          mode="translate"
          size={0.6}
          onMouseDown={() => {
            viewportBridge.gizmoBusy = true
            dragging.current = true
            useDocument.getState().beginGesture('aim')
          }}
          onObjectChange={() => dragging.current && aimAtHandle()}
          onMouseUp={() => {
            aimAtHandle()
            dragging.current = false
            useDocument.getState().endGesture('aim')
            setTimeout(() => (viewportBridge.gizmoBusy = false), 0)
          }}
        />
      )}
    </>
  )
}

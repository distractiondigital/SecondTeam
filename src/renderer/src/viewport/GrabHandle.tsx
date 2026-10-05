import { useEffect, useMemo, useRef, useState } from 'react'
import { Mesh, MeshBasicMaterial, Plane, Raycaster, SphereGeometry, Vector2, Vector3, type Ray } from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useDocument } from '../state/documentStore'
import { SELECTION_COLOR } from './selection'
import { viewportBridge } from './viewportBridge'

// Spencer's grab ball: click and hold it, and the mouse moves it across the screen (on the plane
// facing the camera through the ball); while still holding, W and S push it away from / toward the
// camera (Shift faster), and Space turns snapping off and on. One hold places a point anywhere in
// 3D; the whole drag is one undo step. A viewport helper: never in renders.

const SIZE = 0.016 // ball radius as a fraction of its distance from the camera
const DEPTH_SPEED = 0.5 // depth change per second, as a fraction of the distance to the camera
const FAST = 3

export interface GrabMove {
  /** Where the ball is (world). */
  point: Vector3
  /** The ray from the camera through the cursor (for snapping onto what's under it). */
  ray: Ray
  /** Snapping on (Space toggles it during a drag). */
  snap: boolean
}

interface Props {
  /** Where the ball sits when not being dragged (world); read every frame. */
  at: () => Vector3 | null
  onStart: () => void
  /** The ball moved; return true if it snapped onto something (the ball turns green). */
  onMove: (move: GrabMove) => boolean
  onEnd: () => void
  /** Show the snap state (green / white) for hands and feet. */
  snapping?: boolean
}

const COLORS = { free: SELECTION_COLOR, snapped: '#5fd38a', snapOff: '#e8e8e8' }

export default function GrabHandle({ at, onStart, onMove, onEnd, snapping = false }: Props) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const ball = useMemo(() => {
    const m = new Mesh(new SphereGeometry(1, 20, 14), new MeshBasicMaterial({ color: SELECTION_COLOR, depthTest: false, transparent: true, opacity: 0.9 }))
    m.renderOrder = 1003
    m.userData.helper = true
    return m
  }, [])
  useEffect(() => () => {
    ball.geometry.dispose()
    ;(ball.material as MeshBasicMaterial).dispose()
  }, [ball])

  const drag = useRef<{
    plane: Plane
    cursor: Vector2
    keys: Set<string>
    snap: boolean
    point: Vector3
  } | null>(null)
  const [state, setState] = useState<'free' | 'snapped' | 'snapOff'>('free')
  const callbacks = useRef({ onMove, onEnd })
  callbacks.current = { onMove, onEnd }

  const rayAt = (cursor: Vector2) => {
    const r = new Raycaster()
    r.setFromCamera(cursor, camera)
    return r.ray
  }

  /** Put the ball where the cursor is on the drag plane and tell the owner. */
  const update = () => {
    const d = drag.current
    if (!d) return
    const ray = rayAt(d.cursor)
    const hit = ray.intersectPlane(d.plane, new Vector3())
    if (hit) d.point.copy(hit)
    const snapped = callbacks.current.onMove({ point: d.point.clone(), ray, snap: d.snap })
    setState(!d.snap ? 'snapOff' : snapped ? 'snapped' : 'free')
  }

  const begin = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    viewportBridge.gizmoBusy = true
    viewportBridge.grabbing = true
    const forward = camera.getWorldDirection(new Vector3())
    const point = ball.position.clone()
    const rect = gl.domElement.getBoundingClientRect()
    drag.current = {
      plane: new Plane().setFromNormalAndCoplanarPoint(forward, point),
      cursor: new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1),
      keys: new Set(),
      snap: true,
      point
    }
    useDocument.getState().beginGesture('grab')
    onStart()
    setState('free')
  }

  useEffect(() => {
    const canvas = gl.domElement
    const onMovePointer = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const rect = canvas.getBoundingClientRect()
      d.cursor.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      update()
    }
    const onUp = (e: PointerEvent) => {
      if (!drag.current || e.button !== 0) return
      drag.current = null
      viewportBridge.grabbing = false
      callbacks.current.onEnd()
      useDocument.getState().endGesture('grab')
      setState('free')
      // The browser sends a click after the release; don't let it change the selection.
      setTimeout(() => (viewportBridge.gizmoBusy = false), 0)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const d = drag.current
      if (!d) return
      // While grabbing, the keyboard belongs to the ball.
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Space' && !e.repeat) {
        d.snap = !d.snap
        update()
      } else d.keys.add(e.code)
    }
    const onKeyUp = (e: KeyboardEvent) => drag.current?.keys.delete(e.code)
    window.addEventListener('pointermove', onMovePointer)
    window.addEventListener('pointerup', onUp)
    // Capture: before the app's own shortcuts (W/E/R, Space…).
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('pointermove', onMovePointer)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      if (drag.current) {
        drag.current = null
        viewportBridge.grabbing = false
        viewportBridge.gizmoBusy = false
        useDocument.getState().endGesture('grab')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera])

  useFrame((_, delta) => {
    const d = drag.current
    if (d) {
      // W / S: along the view, faster the further away.
      const dir = (d.keys.has('KeyW') ? 1 : 0) - (d.keys.has('KeyS') ? 1 : 0)
      if (dir) {
        const fast = d.keys.has('ShiftLeft') || d.keys.has('ShiftRight') ? FAST : 1
        const distance = Math.max(0.3, d.point.distanceTo(camera.position))
        const forward = camera.getWorldDirection(new Vector3())
        d.plane.constant -= dir * distance * DEPTH_SPEED * fast * delta
        d.point.addScaledVector(forward, dir * distance * DEPTH_SPEED * fast * delta)
        update()
      }
      ball.position.copy(d.point)
    } else {
      const p = at()
      ball.visible = Boolean(p)
      if (p) ball.position.copy(p)
    }
    ball.scale.setScalar(Math.max(0.01, ball.position.distanceTo(camera.position) * SIZE))
    ;(ball.material as MeshBasicMaterial).color.set(snapping ? COLORS[state] : COLORS.free)
  })

  return <primitive object={ball} onPointerDown={begin} />
}

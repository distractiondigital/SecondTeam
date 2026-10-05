import { useEffect } from 'react'
import { Spherical, Vector3, type PerspectiveCamera } from 'three'
import { useThree } from '@react-three/fiber'
import { useUi } from '../state/uiStore'
import { viewportBridge } from './viewportBridge'

// Laptop-friendly navigation in the free view, on top of the mouse controls (OrbitControls):
//   Trackpad mode (toolbar Input switch): two-finger swipe orbits, Shift + swipe pans, pinch zooms.
//     (Windows keeps three-finger swipes for itself, so they never reach the app.)
//   Either mode: Alt + left-drag orbits, Alt + Shift + left-drag pans (no middle button needed).
// The free view isn't part of the project, so none of this is undoable. In camera view,
// LookThrough handles the equivalents (it skips everything here).

interface OrbitLike {
  enabled: boolean
  target: Vector3
  update: () => void
}

const PINCH_SPEED = 0.01 // zoom per pixel of pinch
const MIN_DISTANCE = 0.1
const MAX_DISTANCE = 500

export default function ViewNav() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null
  const gl = useThree((s) => s.gl)
  const lookId = useUi((s) => s.lookThroughId)

  useEffect(() => {
    const canvas = gl.domElement

    /** Orbit around the pivot by a drag/swipe of (dx, dy) pixels. */
    const orbit = (dx: number, dy: number) => {
      if (!controls) return
      const h = Math.max(1, canvas.clientHeight)
      const offset = camera.position.clone().sub(controls.target)
      const s = new Spherical().setFromVector3(offset)
      s.theta -= (2 * Math.PI * dx) / h
      s.phi = Math.min(Math.PI - 0.01, Math.max(0.01, s.phi - (2 * Math.PI * dy) / h))
      camera.position.copy(controls.target).add(offset.setFromSpherical(s))
      camera.lookAt(controls.target)
      controls.update()
    }
    /** Slide the view (and its pivot) by (dx, dy) pixels, so what's under the cursor follows it. */
    const pan = (dx: number, dy: number) => {
      if (!controls) return
      const distance = camera.position.distanceTo(controls.target)
      const perPixel = (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, canvas.clientHeight)
      const right = new Vector3().setFromMatrixColumn(camera.matrix, 0)
      const up = new Vector3().setFromMatrixColumn(camera.matrix, 1)
      const move = right.multiplyScalar(-dx * perPixel).add(up.multiplyScalar(dy * perPixel))
      camera.position.add(move)
      controls.target.add(move)
      controls.update()
    }
    /** Zoom toward the pivot (pinch). */
    const zoom = (amount: number) => {
      if (!controls) return
      const offset = camera.position.clone().sub(controls.target)
      const length = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, offset.length() * Math.exp(amount * PINCH_SPEED)))
      camera.position.copy(controls.target).add(offset.setLength(length))
      controls.update()
    }

    // Trackpad: swipes and pinches arrive as wheel events (a pinch with Ctrl held).
    const onWheel = (e: WheelEvent) => {
      if (useUi.getState().navMode !== 'trackpad' || useUi.getState().lookThroughId || viewportBridge.flying) return
      e.preventDefault()
      e.stopImmediatePropagation() // not OrbitControls' zoom
      const scale = e.deltaMode === 1 ? 16 : 1 // lines → pixels
      if (e.ctrlKey) zoom(e.deltaY * scale)
      else if (e.shiftKey) pan(-e.deltaX * scale, -e.deltaY * scale)
      else orbit(e.deltaX * scale * 0.35, e.deltaY * scale * 0.35)
    }

    // Alt + left-drag: orbit (with Shift: pan). Caught before the app's own clicks and box select.
    let dragging = false
    const onDown = (e: PointerEvent) => {
      if (e.target !== canvas || e.button !== 0 || !e.altKey || useUi.getState().lookThroughId) return
      e.preventDefault()
      e.stopPropagation()
      dragging = true
      viewportBridge.suppressClick = true
      if (controls) controls.enabled = false
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      if (e.shiftKey) pan(e.movementX, e.movementY)
      else orbit(e.movementX, e.movementY)
    }
    const onUp = () => {
      if (!dragging) return
      dragging = false
      if (controls) controls.enabled = true
      // The click that follows the release isn't a selection.
      setTimeout(() => (viewportBridge.suppressClick = false), 0)
    }

    canvas.addEventListener('wheel', onWheel, { passive: false, capture: true })
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      canvas.removeEventListener('wheel', onWheel, { capture: true })
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [camera, controls, gl, lookId])

  // A click right after Alt-dragging (or Alt-looking in camera view) is swallowed, so it doesn't select.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!viewportBridge.suppressClick) return
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [])

  return null
}

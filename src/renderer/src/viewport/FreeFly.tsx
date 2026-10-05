import { useEffect, useRef } from 'react'
import { Euler, MathUtils, Vector3, type PerspectiveCamera } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useUi } from '../state/uiStore'
import { flyStep, isMoving, isTyping, LOOK_SENSITIVITY, MOVE_KEYS } from './flyInput'
import { viewportBridge } from './viewportBridge'

// Flying the free (orbit) view with the same controls as the camera view: hold the right mouse
// button to look around, and while it's held W A S D / Space / C fly, Shift faster, scroll sets the
// speed. Letting go hands back to orbiting, around a point in front of you at the same distance as
// before. The free view isn't part of the project, so nothing here is undoable or saved.

interface OrbitLike {
  enabled: boolean
  target: Vector3
  update: () => void
}

export default function FreeFly() {
  const lookId = useUi((s) => s.lookThroughId)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null
  const gl = useThree((s) => s.gl)
  const input = useRef({ flying: false, keys: new Set<string>(), look: { x: 0, y: 0 }, pan: 0, tilt: 0, distance: 5 })

  useEffect(() => {
    if (lookId || !controls) return
    const canvas = gl.domElement
    const state = input.current

    const stop = () => {
      if (!state.flying) return
      state.flying = false
      state.keys.clear()
      viewportBridge.flying = false
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      // Orbit around the point straight ahead, as far away as the old pivot was.
      const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
      controls.target.copy(camera.position).addScaledVector(forward, state.distance)
      controls.enabled = true
      controls.update()
    }
    const onContextMenu = (e: Event) => e.preventDefault()
    const onDown = (e: PointerEvent) => {
      if (e.button !== 2) return
      const euler = new Euler().setFromQuaternion(camera.quaternion, 'YXZ')
      state.pan = MathUtils.radToDeg(euler.y)
      state.tilt = MathUtils.radToDeg(euler.x)
      state.distance = Math.max(0.5, camera.position.distanceTo(controls.target))
      state.flying = true
      viewportBridge.flying = true
      controls.enabled = false
      canvas.requestPointerLock()
    }
    const onMove = (e: PointerEvent) => {
      if (!state.flying || document.pointerLockElement !== canvas) return
      state.look.x += e.movementX
      state.look.y += e.movementY
    }
    const onUp = (e: PointerEvent) => {
      if (e.button === 2) stop()
    }
    const onLockChange = () => {
      if (document.pointerLockElement !== canvas) stop()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!state.flying || isTyping(e.target) || e.altKey) return
      if (MOVE_KEYS.has(e.code) || e.key === 'Shift') {
        e.preventDefault()
        state.keys.add(e.code)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => state.keys.delete(e.code)
    const onWheel = (e: WheelEvent) => {
      if (!state.flying) return // otherwise the orbit controls zoom as usual
      e.preventDefault()
      e.stopImmediatePropagation()
      const ui = useUi.getState()
      ui.setFlySpeed(ui.flySpeed * (e.deltaY < 0 ? 1.25 : 0.8))
    }

    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.addEventListener('pointerdown', onDown)
    // Capture, so a scroll while flying changes the speed instead of zooming the orbit.
    canvas.addEventListener('wheel', onWheel, { passive: false, capture: true })
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('pointerlockchange', onLockChange)
    return () => {
      stop()
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('wheel', onWheel, { capture: true })
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('pointerlockchange', onLockChange)
    }
  }, [lookId, controls, camera, gl])

  useFrame((_, delta) => {
    const state = input.current
    if (!state.flying) return
    state.pan -= state.look.x * LOOK_SENSITIVITY
    state.tilt = MathUtils.clamp(state.tilt - state.look.y * LOOK_SENSITIVITY, -89, 89)
    state.look.x = 0
    state.look.y = 0
    if (isMoving(state.keys)) flyStep(camera.position, state.pan, state.keys, useUi.getState().flySpeed, delta)
    camera.quaternion.setFromEuler(new Euler(MathUtils.degToRad(state.tilt), MathUtils.degToRad(state.pan), 0, 'YXZ'))
  })

  return null
}

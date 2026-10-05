import { useEffect, useRef } from 'react'
import { Euler, MathUtils, Matrix4, Quaternion, Vector3, type PerspectiveCamera } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { clampFocal, opticsFor } from '../../../shared/camera'
import type { Vec3 } from '../../../shared/project'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { cameraPose } from './shotInfo'
import { viewFit } from './viewFit'
import { viewportBridge } from './viewportBridge'
import { flyStep, isMoving, isTyping, LOOK_SENSITIVITY, MOVE_KEYS } from './flyInput'

// Looking through a shot camera. The viewport's own camera copies the shot camera every frame
// (with a wider field of view so the frame fits with a margin; FrameOverlay draws the frame).
//
// Controls while looking through (video-game / Unreal style):
//   hold right mouse   look around (pan / tilt); cursor comes back on release
//     + W A S D        move level (dolly / truck), Space up, C or Left Ctrl down, Shift faster
//     + scroll         fly speed
//   Q / E              roll the horizon; Ctrl+Q or Ctrl+E levels it
//   scroll             dolly in / out along the lens axis
//   Ctrl+scroll        zoom (focal length)
// Each drag, scroll burst or roll press is one undo step.

const ROLL_SPEED = 30 // degrees per second
const DOLLY_STEP = 0.15 // metres per scroll notch at normal speed
const WHEEL_GESTURE_END = 350 // ms after the last scroll notch

interface OrbitLike {
  enabled: boolean
  update: () => void
}

const r4 = (n: number) => Math.round(n * 10000) / 10000 || 0

function startPose(object: Parameters<typeof cameraPose>[0]) {
  const p = cameraPose(object)
  return { position: p.position.clone(), pan: p.pan, tilt: p.tilt, roll: p.roll }
}

export default function LookThrough() {
  const lookId = useUi((s) => s.lookThroughId)
  const exists = useDocument((s) => (lookId ? activeScene(s).nodes[lookId]?.type === 'camera' : false))
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  const input = useRef({
    flying: false,
    keys: new Set<string>(),
    look: { x: 0, y: 0 },
    roll: 0, // -1, 0, +1 while Q / E is held
    // The camera pose while a move is in progress. The 3D scene catches up with the document a
    // frame later, so moves build on this instead of re-reading the scene (which could lose motion).
    working: null as { position: Vector3; pan: number; tilt: number; roll: number } | null,
    wheelTimer: undefined as ReturnType<typeof setTimeout> | undefined
  })

  // Leave camera view if the camera is deleted (or undone away).
  useEffect(() => {
    if (lookId && !exists) useUi.getState().setLookThrough(null)
  }, [lookId, exists])

  /** Move the shot camera to a world position and pan/tilt/roll (degrees). */
  const setWorldPose = (id: string, position: Vector3, pan: number, tilt: number, roll: number) => {
    const object = scene.getObjectByName(id)
    if (!object) return
    const q = new Quaternion().setFromEuler(
      new Euler(MathUtils.degToRad(tilt), MathUtils.degToRad(pan), MathUtils.degToRad(-roll), 'YXZ')
    )
    const world = new Matrix4().compose(position, q, new Vector3(1, 1, 1))
    const parentInverse = object.parent ? object.parent.matrixWorld.clone().invert() : new Matrix4()
    const local = parentInverse.multiply(world)
    const p = new Vector3()
    const lq = new Quaternion()
    local.decompose(p, lq, new Vector3())
    const e = new Euler().setFromQuaternion(lq, 'XYZ')
    useDocument.getState().updateNode(id, {
      position: p.toArray().map(r4) as Vec3,
      rotation: [e.x, e.y, e.z].map((r) => r4(MathUtils.radToDeg(r))) as Vec3
    })
  }

  // Save the free view on entry and restore it on exit.
  useEffect(() => {
    if (!lookId) return
    const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov }
    if (controls) controls.enabled = false
    return () => {
      camera.position.copy(saved.position)
      camera.quaternion.copy(saved.quaternion)
      camera.fov = saved.fov
      camera.near = 0.05
      camera.updateProjectionMatrix()
      if (controls) {
        controls.enabled = true
        controls.update()
      }
    }
  }, [lookId, camera, controls])

  // Mouse, keyboard and wheel.
  useEffect(() => {
    if (!lookId) return
    const canvas = gl.domElement
    const state = input.current
    const doc = () => useDocument.getState()

    const stopFlying = () => {
      if (!state.flying) return
      state.flying = false
      state.working = null
      state.keys.clear()
      viewportBridge.flying = false
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      doc().endGesture('fly')
    }

    const onContextMenu = (e: Event) => e.preventDefault()
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 2) return
      state.flying = true
      viewportBridge.flying = true
      doc().beginGesture('fly')
      canvas.requestPointerLock()
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!state.flying || document.pointerLockElement !== canvas) return
      state.look.x += e.movementX
      state.look.y += e.movementY
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 2) stopFlying()
    }
    const onLockChange = () => {
      if (document.pointerLockElement !== canvas) stopFlying()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey) return
      if (e.code === 'KeyQ' || e.code === 'KeyE') {
        e.preventDefault()
        if (e.repeat) return
        const id = useUi.getState().lookThroughId
        const object = id ? scene.getObjectByName(id) : null
        if (!id || !object) return
        if (e.ctrlKey) {
          // Level the horizon.
          if (state.working) state.working.roll = 0
          const pose = state.working ?? cameraPose(object)
          setWorldPose(id, pose.position, pose.pan, pose.tilt, 0)
        } else {
          state.roll = e.code === 'KeyQ' ? -1 : 1
          doc().beginGesture('roll')
        }
        return
      }
      if (state.flying && (MOVE_KEYS.has(e.code) || e.key === 'Shift')) {
        e.preventDefault()
        state.keys.add(e.code)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      state.keys.delete(e.code)
      if ((e.code === 'KeyQ' && state.roll === -1) || (e.code === 'KeyE' && state.roll === 1)) {
        state.roll = 0
        if (!state.flying) state.working = null
        doc().endGesture('roll')
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault() // also stops Ctrl+scroll from zooming the whole window
      const id = useUi.getState().lookThroughId
      const node = id ? activeScene(doc()).nodes[id] : undefined
      const object = id ? scene.getObjectByName(id) : null
      if (!id || node?.type !== 'camera' || !object) return
      const notch = Math.sign(e.deltaY)
      if (state.flying) {
        useUi.getState().setFlySpeed(useUi.getState().flySpeed * (notch < 0 ? 1.25 : 0.8))
        return
      }
      if (!state.wheelTimer) doc().beginGesture('wheel')
      clearTimeout(state.wheelTimer)
      state.wheelTimer = setTimeout(() => {
        state.wheelTimer = undefined
        if (!state.flying && !state.roll) state.working = null
        doc().endGesture('wheel')
      }, WHEEL_GESTURE_END)
      if (e.ctrlKey) {
        const f = node.focalLength * (notch < 0 ? 1.06 : 1 / 1.06)
        doc().updateNode(id, { focalLength: Math.round(clampFocal(f) * 10) / 10 })
      } else {
        const w = (state.working ??= startPose(object))
        const q = new Quaternion().setFromEuler(
          new Euler(MathUtils.degToRad(w.tilt), MathUtils.degToRad(w.pan), MathUtils.degToRad(-w.roll), 'YXZ')
        )
        const forward = new Vector3(0, 0, -1).applyQuaternion(q)
        w.position.addScaledVector(forward, DOLLY_STEP * (useUi.getState().flySpeed / 1.5) * -notch)
        setWorldPose(id, w.position, w.pan, w.tilt, w.roll)
      }
    }

    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('pointerlockchange', onLockChange)
    return () => {
      stopFlying()
      if (state.roll) {
        state.roll = 0
        doc().endGesture('roll')
      }
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('wheel', onWheel)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('pointerlockchange', onLockChange)
    }
  }, [lookId, gl, scene])

  useFrame((_, delta) => {
    const id = useUi.getState().lookThroughId
    if (!id) return
    const node = activeScene(useDocument.getState()).nodes[id]
    const object = scene.getObjectByName(id)
    if (node?.type !== 'camera' || !object) return
    const state = input.current

    // Fly: apply mouse look, movement and roll to the shot camera.
    const moving = state.flying && isMoving(state.keys)
    if ((state.flying && (state.look.x || state.look.y)) || moving || state.roll) {
      const w = (state.working ??= startPose(object))
      w.pan -= state.look.x * LOOK_SENSITIVITY
      w.tilt = MathUtils.clamp(w.tilt - state.look.y * LOOK_SENSITIVITY, -89, 89)
      w.roll += state.roll * ROLL_SPEED * delta
      state.look.x = 0
      state.look.y = 0
      const { position, pan, tilt, roll } = w
      if (moving) flyStep(position, pan, state.keys, useUi.getState().flySpeed, delta)
      setWorldPose(id, position, pan, tilt, roll)
    }

    // Show the view from the shot camera (from the move in progress, if there is one).
    const w = state.working
    if (w) {
      camera.position.copy(w.position)
      camera.quaternion.setFromEuler(
        new Euler(MathUtils.degToRad(w.tilt), MathUtils.degToRad(w.pan), MathUtils.degToRad(-w.roll), 'YXZ')
      )
    } else {
      const pose = cameraPose(object)
      camera.position.copy(pose.position)
      camera.quaternion.copy(pose.quaternion)
    }
    const kit = useDocument.getState().project.camera
    camera.fov = viewFit(opticsFor(kit, node.focalLength), size.width, size.height).verticalFov
    camera.aspect = size.width / Math.max(1, size.height)
    camera.near = 0.02
    camera.updateProjectionMatrix()
  })

  return null
}

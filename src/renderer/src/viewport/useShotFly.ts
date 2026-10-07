import { useEffect, useRef } from 'react'
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { clampFocal } from '../../../shared/camera'
import type { Vec3 } from '../../../shared/project'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { cameraPose } from './shotInfo'
import { viewportBridge } from './viewportBridge'
import { flyStep, isMoving, isTyping, LOOK_SENSITIVITY, MOVE_KEYS } from './flyInput'

// Steering a shot camera with the mouse and keyboard, shared by camera view (LookThrough, on the
// whole canvas) and the shot picture-in-picture (PipRender, on its small window). Video-game /
// Unreal style:
//   hold right mouse   look around (pan / tilt); cursor comes back on release
//     + W A S D        move level (dolly / truck), Space up, C or Left Ctrl down, Shift faster
//     + scroll         fly speed
//   Q / E              roll the horizon; Ctrl+Q or Ctrl+E levels it (in the picture-in-picture,
//                      only while the right mouse is held: elsewhere E is the rotate tool)
//   scroll             dolly in / out along the lens axis
//   Ctrl+scroll        zoom (focal length)
// Each drag, scroll burst or roll press is one undo step.

const ROLL_SPEED = 30 // degrees per second
const DOLLY_STEP = 0.15 // metres per scroll notch at normal speed
const WHEEL_GESTURE_END = 350 // ms after the last scroll notch

const r4 = (n: number) => Math.round(n * 10000) / 10000 || 0

/** A camera pose in world space: position and pan / tilt / roll in degrees. */
export interface WorkingPose {
  position: Vector3
  pan: number
  tilt: number
  roll: number
}

function startPose(object: Parameters<typeof cameraPose>[0]): WorkingPose {
  const p = cameraPose(object)
  return { position: p.position.clone(), pan: p.pan, tilt: p.tilt, roll: p.roll }
}

/** The rotation of a pan / tilt / roll pose. */
export function poseQuaternion(w: WorkingPose): Quaternion {
  return new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(w.tilt), MathUtils.degToRad(w.pan), MathUtils.degToRad(-w.roll), 'YXZ'))
}

export interface ShotFlyOptions {
  /** The element that takes the mouse (and the pointer lock while looking), or null for none. */
  element: HTMLElement | null
  /** The shot camera being steered right now, or null. */
  shotId: () => string | null
  /** Q / E roll even when the right mouse isn't held (camera view). */
  rollAnytime: boolean
}

/**
 * Steer a shot camera from `element`. Returns the pose of the move in progress (null between
 * moves): the 3D scene catches up with the document a frame later, so views should show this.
 */
export function useShotFly({ element, shotId, rollAnytime }: ShotFlyOptions): { current: WorkingPose | null } {
  const scene = useThree((s) => s.scene)
  const working = useRef<WorkingPose | null>(null)
  const input = useRef({
    flying: false,
    /** Looking with Alt + left button (instead of the right button). */
    altLook: false,
    keys: new Set<string>(),
    look: { x: 0, y: 0 },
    roll: 0, // -1, 0, +1 while Q / E is held
    wheelTimer: undefined as ReturnType<typeof setTimeout> | undefined
  })
  const getShot = useRef(shotId)
  getShot.current = shotId

  /** Move the shot camera to a world position and pan/tilt/roll (degrees). */
  const setWorldPose = (id: string, w: WorkingPose) => {
    const object = scene.getObjectByName(id)
    if (!object) return
    const world = new Matrix4().compose(w.position, poseQuaternion(w), new Vector3(1, 1, 1))
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

  // Mouse, keyboard and wheel.
  useEffect(() => {
    if (!element) return
    const state = input.current
    const doc = () => useDocument.getState()
    const camera = () => {
      const id = getShot.current()
      const node = id ? activeScene(doc()).nodes[id] : undefined
      const object = id ? scene.getObjectByName(id) : null
      return id && node?.type === 'camera' && object ? { id, node, object } : null
    }

    const stopFlying = () => {
      if (!state.flying) return
      state.flying = false
      working.current = null
      state.keys.clear()
      viewportBridge.flying = false
      if (document.pointerLockElement === element) document.exitPointerLock()
      if (state.roll && !rollAnytime) {
        state.roll = 0
        doc().endGesture('roll')
      }
      doc().endGesture('fly')
    }

    const onContextMenu = (e: Event) => e.preventDefault()
    const onPointerDown = (e: PointerEvent) => {
      // Right button, or Alt + left (laptops): look around while held.
      const altLook = e.button === 0 && e.altKey
      if ((e.button !== 2 && !altLook) || !camera()) return
      if (altLook) {
        state.altLook = true
        viewportBridge.suppressClick = true
      }
      state.flying = true
      viewportBridge.flying = true
      doc().beginGesture('fly')
      element.requestPointerLock()
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!state.flying || document.pointerLockElement !== element) return
      state.look.x += e.movementX
      state.look.y += e.movementY
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 2 || (e.button === 0 && state.altLook)) {
        stopFlying()
        if (state.altLook) {
          state.altLook = false
          // The click that follows the release isn't a selection.
          setTimeout(() => (viewportBridge.suppressClick = false), 0)
        }
      }
    }
    const onLockChange = () => {
      if (document.pointerLockElement !== element) stopFlying()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || (e.altKey && !state.altLook)) return
      if ((e.code === 'KeyQ' || e.code === 'KeyE') && (rollAnytime || state.flying)) {
        e.preventDefault()
        if (e.repeat) return
        const c = camera()
        if (!c) return
        if (e.ctrlKey) {
          // Level the horizon.
          const pose = working.current ?? startPose(c.object)
          pose.roll = 0
          setWorldPose(c.id, pose)
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
        if (!state.flying) working.current = null
        doc().endGesture('roll')
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault() // also stops Ctrl+scroll from zooming the whole window
      const c = camera()
      if (!c) return
      const notch = Math.sign(e.deltaY)
      // A trackpad sends many small scrolls (and a pinch as Ctrl + scroll): go by how far, not by notches.
      const trackpad = useUi.getState().navMode === 'trackpad'
      const steps = trackpad ? -e.deltaY / (e.ctrlKey ? 15 : 60) : -notch
      if (state.flying) {
        useUi.getState().setFlySpeed(useUi.getState().flySpeed * (notch < 0 ? 1.25 : 0.8))
        return
      }
      if (!state.wheelTimer) doc().beginGesture('wheel')
      clearTimeout(state.wheelTimer)
      state.wheelTimer = setTimeout(() => {
        state.wheelTimer = undefined
        if (!state.flying && !state.roll) working.current = null
        doc().endGesture('wheel')
      }, WHEEL_GESTURE_END)
      // Ctrl+scroll (Cmd+scroll on a Mac) or a pinch (which arrives as Ctrl+scroll): zoom the lens.
      if (e.ctrlKey || e.metaKey) {
        const f = c.node.focalLength * Math.pow(1.06, steps)
        doc().updateNode(c.id, { focalLength: Math.round(clampFocal(f) * 10) / 10 })
      } else {
        const w = (working.current ??= startPose(c.object))
        const forward = new Vector3(0, 0, -1).applyQuaternion(poseQuaternion(w))
        w.position.addScaledVector(forward, DOLLY_STEP * (useUi.getState().flySpeed / 1.5) * steps)
        setWorldPose(c.id, w)
      }
    }

    element.addEventListener('contextmenu', onContextMenu)
    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('wheel', onWheel, { passive: false })
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
      if (state.wheelTimer) {
        clearTimeout(state.wheelTimer)
        state.wheelTimer = undefined
        doc().endGesture('wheel')
      }
      working.current = null
      element.removeEventListener('contextmenu', onContextMenu)
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('wheel', onWheel)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('pointerlockchange', onLockChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, scene, rollAnytime])

  // Fly: apply mouse look, movement and roll to the shot camera.
  useFrame((_, delta) => {
    if (!element) return
    const id = getShot.current()
    const object = id ? scene.getObjectByName(id) : null
    if (!id || !object) return
    const state = input.current
    const moving = state.flying && isMoving(state.keys)
    if ((state.flying && (state.look.x || state.look.y)) || moving || state.roll) {
      const w = (working.current ??= startPose(object))
      w.pan -= state.look.x * LOOK_SENSITIVITY
      w.tilt = MathUtils.clamp(w.tilt - state.look.y * LOOK_SENSITIVITY, -89, 89)
      w.roll += state.roll * ROLL_SPEED * delta
      state.look.x = 0
      state.look.y = 0
      if (moving) flyStep(w.position, w.pan, state.keys, useUi.getState().flySpeed, delta)
      setWorldPose(id, w)
    }
  })

  return working
}

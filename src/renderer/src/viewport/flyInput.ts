import { MathUtils, Vector3 } from 'three'

// Game-style fly controls, shared by the camera view (LookThrough) and the free view (FreeFly):
// hold the right mouse button to look around; while it's held, W A S D move level, Space goes up,
// C or Left Ctrl goes down, Shift goes faster, and scrolling changes the fly speed.

export const LOOK_SENSITIVITY = 0.12 // degrees per pixel
export const FAST = 3
export const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'ControlLeft'])

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

/** Is any movement key held? */
export function isMoving(keys: Set<string>): boolean {
  return [...keys].some((k) => MOVE_KEYS.has(k))
}

/** Move `position` for the held keys: level along the view's pan (degrees), at `speed` m/s for `delta` seconds. */
export function flyStep(position: Vector3, pan: number, keys: Set<string>, speed: number, delta: number): void {
  const step = speed * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? FAST : 1) * delta
  const yaw = MathUtils.degToRad(pan)
  const forward = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
  const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
  const axis = (plus: string, minus: string) => (keys.has(plus) ? 1 : 0) - (keys.has(minus) ? 1 : 0)
  position.addScaledVector(forward, axis('KeyW', 'KeyS') * step)
  position.addScaledVector(right, axis('KeyD', 'KeyA') * step)
  position.y += ((keys.has('Space') ? 1 : 0) - (keys.has('KeyC') || keys.has('ControlLeft') ? 1 : 0)) * step
}

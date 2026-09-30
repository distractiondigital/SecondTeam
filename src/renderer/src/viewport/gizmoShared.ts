import { useEffect, useState } from 'react'
import { MathUtils, type Euler } from 'three'
import { useUi } from '../state/uiStore'

// Helpers shared by the object gizmo and the joint gizmo.

export const ROTATE_SNAP_DEGREES = 15

export const r4 = (n: number) => Math.round(n * 10000) / 10000 || 0

/** True while the Ctrl key is held (it flips grid snapping during a drag). */
export function useCtrlHeld(): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const update = (e: KeyboardEvent) => setHeld(e.ctrlKey)
    const release = () => setHeld(false)
    window.addEventListener('keydown', update)
    window.addEventListener('keyup', update)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', update)
      window.removeEventListener('keyup', update)
      window.removeEventListener('blur', release)
    }
  }, [])
  return held
}

/** Is grid snapping active right now? Holding Ctrl flips the toolbar setting. */
export function useGridSnap(): boolean {
  const snapMode = useUi((s) => s.snapMode)
  const ctrlHeld = useCtrlHeld()
  return (snapMode === 'grid') !== ctrlHeld
}

/**
 * The gizmo's own rotation snap turns in 15° steps from wherever the object started (7° → 22°).
 * Lock the result to whole 15° increments instead, so a stray rotation snaps back onto the grid.
 */
export function lockRotationToGrid(rotation: Euler): void {
  const step = MathUtils.degToRad(ROTATE_SNAP_DEGREES)
  rotation.set(
    Math.round(rotation.x / step) * step,
    Math.round(rotation.y / step) * step,
    Math.round(rotation.z / step) * step
  )
}

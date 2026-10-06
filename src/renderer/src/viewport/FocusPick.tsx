import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Raycaster, Vector2, type Object3D } from 'three'
import { useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { isHelper } from './renderShot'
import { viewportBridge } from './viewportBridge'

// Click to focus: while the focus pick is on (camera view), the next left click in the viewport
// sets the shot's focus distance to whatever is under the cursor (its distance along the lens axis,
// like a focus puller's tape). Esc cancels; the click never selects anything. Holding Shift in camera
// view turns the pick on until Shift is let go, so you can pull focus click after click.

let shiftHeld = false

function shown(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible || isHelper(p)) return false
  return true
}

export default function FocusPick() {
  const picking = useUi((s) => s.focusPicking && s.lookThroughId !== null)
  const looking = useUi((s) => s.lookThroughId !== null)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    if (!picking) return
    const canvas = gl.domElement
    const cursor = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    const raycaster = new Raycaster()

    const onDown = (e: PointerEvent) => {
      if (e.target !== canvas || e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      viewportBridge.suppressClick = true
      setTimeout(() => (viewportBridge.suppressClick = false), 0)
      const rect = canvas.getBoundingClientRect()
      const ndc = new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.intersectObject(scene, true).find((h) => (h.object as { isMesh?: boolean }).isMesh && shown(h.object))
      const ui = useUi.getState()
      ui.setFocusPicking(shiftHeld)
      if (!hit || !ui.lookThroughId) return
      // Distance along the lens axis (the focus plane is square to the lens).
      const depth = -hit.point.clone().applyMatrix4(camera.matrixWorldInverse).z
      if (depth > 0) useDocument.getState().updateNode(ui.lookThroughId, { focusDistance: Math.max(0.1, Math.round(depth * 100) / 100) })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      useUi.getState().setFocusPicking(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      canvas.style.cursor = cursor
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [picking, gl, camera, scene])

  // Hold Shift: pick focus until it's let go (not while flying or typing).
  useEffect(() => {
    if (!looking) return
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]') !== null
    const onDown = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' || e.repeat || typing(e) || viewportBridge.flying || e.ctrlKey || e.metaKey || e.altKey) return
      shiftHeld = true
      useUi.getState().setFocusPicking(true)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' || !shiftHeld) return
      shiftHeld = false
      useUi.getState().setFocusPicking(false)
    }
    const onBlur = () => {
      if (!shiftHeld) return
      shiftHeld = false
      useUi.getState().setFocusPicking(false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      shiftHeld = false
    }
  }, [looking])

  return null
}

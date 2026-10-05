import { useEffect } from 'react'
import { Box3, Vector3 } from 'three'
import { useThree } from '@react-three/fiber'
import { activeScene, editedNodes, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { isMovable } from './SelectionGizmo'
import { CLICK_DRAG_TOLERANCE, outermostAncestor } from './selection'
import { viewportBridge } from './viewportBridge'

// Box select: left-drag in the viewport draws a rectangle; everything whose middle (the centre
// of its on-screen bounds) is inside gets selected. Plain drag replaces the selection, Shift adds,
// Ctrl removes. Things in a group select the group (like clicking). Hidden, locked and camera
// objects are skipped. Not while a gizmo is being dragged.

export default function BoxSelect() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const canvas = gl.domElement
    const host = canvas.parentElement
    if (!host) return
    const rect = document.createElement('div')
    rect.className = 'box-select'
    rect.style.display = 'none'
    host.appendChild(rect)

    let start: { x: number; y: number } | null = null
    let active = false

    const local = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect()
      return { x: e.clientX - b.left, y: e.clientY - b.top }
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.altKey || viewportBridge.flying) return
      start = local(e)
      active = false
    }
    const onMove = (e: PointerEvent) => {
      if (!start) return
      // The gizmo grabbed this press (it says so on the same press, after us).
      if (viewportBridge.gizmoBusy) {
        start = null
        rect.style.display = 'none'
        return
      }
      const p = local(e)
      if (!active && Math.hypot(p.x - start.x, p.y - start.y) <= CLICK_DRAG_TOLERANCE) return
      active = true
      viewportBridge.boxSelecting = true
      Object.assign(rect.style, {
        display: 'block',
        left: `${Math.min(start.x, p.x)}px`,
        top: `${Math.min(start.y, p.y)}px`,
        width: `${Math.abs(p.x - start.x)}px`,
        height: `${Math.abs(p.y - start.y)}px`
      })
    }
    const onUp = (e: PointerEvent) => {
      if (!start) return
      const from = start
      start = null
      rect.style.display = 'none'
      if (!active) return
      active = false
      const to = local(e)
      select(
        { left: Math.min(from.x, to.x), right: Math.max(from.x, to.x), top: Math.min(from.y, to.y), bottom: Math.max(from.y, to.y) },
        e.shiftKey ? 'add' : e.ctrlKey ? 'remove' : 'replace'
      )
      // The browser sends a click after the release; don't let it clear the new selection.
      setTimeout(() => (viewportBridge.boxSelecting = false), 0)
    }

    const select = (r: { left: number; right: number; top: number; bottom: number }, how: 'replace' | 'add' | 'remove') => {
      const state = useDocument.getState()
      const nodes = editedNodes(state)
      const sceneData = activeScene(state)
      const lookId = useUi.getState().lookThroughId
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      scene.updateMatrixWorld(true)
      const candidates = new Set<string>()
      for (const node of Object.values(nodes)) {
        if (node.type === 'camera' || node.id === lookId) continue
        const id = outermostAncestor(sceneData, node.id)
        if (nodes[id]?.type !== 'camera' && isMovable(nodes, id)) candidates.add(id)
      }
      const inside: string[] = []
      for (const id of candidates) {
        const object = scene.getObjectByName(id)
        if (!object) continue
        const box = new Box3().setFromObject(object)
        if (box.isEmpty()) continue
        const c = box.getCenter(new Vector3()).project(camera)
        if (c.z < -1 || c.z > 1) continue // behind the camera or past the far end
        const x = ((c.x + 1) / 2) * width
        const y = ((1 - c.y) / 2) * height
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) inside.push(id)
      }
      const ui = useUi.getState()
      if (how === 'replace') ui.select(inside)
      else if (how === 'add') ui.select([...new Set([...ui.selection, ...inside])])
      else ui.select(ui.selection.filter((id) => !inside.includes(id)))
    }

    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      rect.remove()
    }
  }, [gl, camera, scene])

  return null
}

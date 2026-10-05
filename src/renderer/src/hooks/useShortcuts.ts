import { useEffect } from 'react'
import {
  deleteSelected,
  duplicateSelected,
  groupSelected,
  redo,
  renameSelected,
  stepShot,
  toggleCameraView,
  toggleHiddenSelected,
  undo,
  ungroupSelected
} from '../state/actions'
import { newProject, openProject, saveProject, saveProjectAs } from '../state/projectIO'
import { useUi } from '../state/uiStore'
import { viewportBridge } from '../viewport/viewportBridge'

// Keyboard shortcuts, loosely following Blender and Unreal.

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'color'].includes(target.type)
}

const CAMERA_VIEW_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyC', 'KeyF', 'Space'])

export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey) return
      // While flying a camera, keys belong to the camera (so Ctrl+S etc. can't fire by accident).
      if (viewportBridge.flying || viewportBridge.grabbing) return
      const key = e.key.toLowerCase()
      const ui = useUi.getState()

      const run = (action: () => unknown) => {
        e.preventDefault()
        action()
      }

      if (e.ctrlKey || e.metaKey) {
        if (key === 'z' && e.shiftKey) return run(redo)
        if (key === 'z') return run(undo)
        if (key === 'y') return run(redo)
        if (key === 'd') return run(duplicateSelected)
        if (key === 'g' && e.shiftKey) return run(ungroupSelected)
        if (key === 'g') return run(groupSelected)
        if (key === 's' && e.shiftKey) return run(saveProjectAs)
        if (key === 's') return run(saveProject)
        if (key === 'o') return run(openProject)
        if (key === 'n') return run(newProject)
        return
      }

      // The storyboard has no 3D tools: only the Ctrl shortcuts above (save, undo…) apply there.
      if (ui.view === 'board') return

      if (key === 'tab' && e.shiftKey) return run(ui.cycleSnapMode)
      // Numpad 0 like Blender, or  (the key left of 1) for keyboards without a numpad.
      if (e.code === 'Numpad0' || e.code === 'Backquote') return run(toggleCameraView)
      if (e.shiftKey) return

      // In camera view the letter keys fly the camera (see LookThrough) instead of switching tools.
      if (ui.lookThroughId) {
        if (key === 'arrowleft') return run(() => stepShot(-1))
        if (key === 'arrowright') return run(() => stepShot(1))
        if (CAMERA_VIEW_KEYS.has(e.code)) return
      }

      switch (key) {
        case 'w':
          return run(() => ui.setGizmoMode('translate'))
        case 'e':
          return run(() => ui.setGizmoMode('rotate'))
        case 'r':
          return run(() => ui.setGizmoMode('scale'))
        case 'f':
          return run(ui.requestFrame)
        case 'delete':
        case 'x':
          return run(deleteSelected)
        case 'h':
          return run(toggleHiddenSelected)
        case 'f2':
          return run(renameSelected)
        case 'escape':
          // Step out of joint posing first, then out of camera view, then clear the selection.
          return run(() =>
            ui.selectedJoint ? ui.selectJoint(null) : ui.lookThroughId ? ui.setLookThrough(null) : ui.select([])
          )
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

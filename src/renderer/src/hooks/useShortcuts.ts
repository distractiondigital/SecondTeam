import { useEffect } from 'react'
import {
  deleteSelected,
  duplicateSelected,
  groupSelected,
  redo,
  renameSelected,
  toggleHiddenSelected,
  undo,
  ungroupSelected
} from '../state/actions'
import { newProject, openProject, saveProject, saveProjectAs } from '../state/projectIO'
import { useUi } from '../state/uiStore'

// Keyboard shortcuts, loosely following Blender and Unreal.

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'color'].includes(target.type)
}

export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey) return
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

      if (key === 'tab' && e.shiftKey) return run(ui.toggleSnapping)
      if (e.shiftKey) return

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
          return run(() => ui.select([]))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

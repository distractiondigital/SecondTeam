import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { activeScene, sceneForShot, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { renderShot } from './renderShot'
import { computeShotInfo, type ShotInfo } from './shotInfo'
import { shotScenes } from './ShotScenes'
import { renderBoardClay } from './boardClay'

const INFO_DELAY = 80 // ms after a change, so the 3D scenes have caught up
const THUMBNAIL_DELAY = 450 // ms of quiet before re-rendering every shot's thumbnail
const LIVE_DELAY = 120 // ms: the shot being edited re-renders this soon after a change
const THUMBNAIL_WIDTH = 192
const BOARD_WIDTH = 640 // the storyboard's clay pictures

// Keeps each shot's live readouts and shot-list thumbnail up to date. Each shot is measured
// and rendered from its own hidden copy of the set (see ShotScenes), so it shows that shot's
// version even while you edit Master or another shot.
// Thumbnails (Clay stills), to keep things light: the shot being edited (or looked through)
// re-renders live; leaving it renders it once more and keeps that still; the others keep theirs.
// Changes to the scene's set (Master) touch every shot, so then they all re-render after a pause.
export default function ShotTracker() {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    let infoTimer: ReturnType<typeof setTimeout> | undefined
    let thumbTimer: ReturnType<typeof setTimeout> | undefined

    const cameras = () => {
      const docScene = activeScene(useDocument.getState())
      return {
        docScene,
        cameras: Object.values(docScene.nodes).filter((n) => n.type === 'camera')
      }
    }

    const updateInfo = () => {
      const { docScene, cameras: list } = cameras()
      const info: Record<string, ShotInfo> = {}
      for (const c of list) {
        const scene = shotScenes.get(c.id)
        if (c.type !== 'camera' || !scene) continue
        scene.updateMatrixWorld(true)
        // Measure against this shot's version of the set (e.g. a figure's per-shot height).
        const shotScene = { ...docScene, nodes: sceneForShot(useDocument.getState(), c.id) }
        const i = computeShotInfo(shotScene, c, useDocument.getState().project.camera, scene)
        if (i) info[c.id] = i
      }
      useUi.getState().setShotInfo(info)
    }

    /** Re-render these shots' thumbnails (all = every shot); the rest keep their stills. */
    const updateThumbnails = (only: Set<string> | 'all') => {
      const { cameras: list } = cameras()
      const previous = useUi.getState().thumbnails
      const thumbnails: Record<string, string> = {}
      for (const c of list) {
        const scene = shotScenes.get(c.id)
        if (c.type !== 'camera') continue
        // Keep its still unless it's one to refresh, or it has none yet (a new shot or scene).
        if (only !== 'all' && !only.has(c.id) && previous[c.id]) {
          thumbnails[c.id] = previous[c.id]
          continue
        }
        if (!scene) {
          if (previous[c.id]) thumbnails[c.id] = previous[c.id]
          continue
        }
        scene.updateMatrixWorld(true)
        const canvas = renderShot(gl, scene, c, useDocument.getState().project.camera, THUMBNAIL_WIDTH)
        if (canvas) thumbnails[c.id] = canvas.toDataURL('image/jpeg', 0.82)
      }
      useUi.getState().setThumbnails(thumbnails)
      if (only === 'all') updateBoardClay()
    }

    // Storyboard in Clay mode: every shot in every scene (ShotScenes builds their copies then).
    const updateBoardClay = () => {
      const ui = useUi.getState()
      if (ui.view !== 'board' || ui.boardImage !== 'clay') return
      ui.setBoardClay(renderBoardClay(gl, BOARD_WIDTH, 'image/jpeg'))
    }

    // What to refresh at the next render: shot ids, or every shot.
    let pending: Set<string> | 'all' = 'all'
    const schedule = (what: Set<string> | 'all') => {
      clearTimeout(infoTimer)
      infoTimer = setTimeout(updateInfo, INFO_DELAY)
      if (what === 'all' || pending === 'all') pending = 'all'
      else for (const id of what) pending.add(id)
      const live = pending !== 'all'
      clearTimeout(thumbTimer)
      thumbTimer = setTimeout(() => {
        const what = pending
        pending = new Set()
        updateThumbnails(what)
      }, live ? LIVE_DELAY : THUMBNAIL_DELAY)
    }

    schedule('all')
    const unsubscribe = useDocument.subscribe((state, previous) => {
      if (state.sceneId !== previous.sceneId) return schedule('all')
      // Switched shots (or back to Master): the one you left gets its final still, the new one a fresh one.
      if (state.activeShotId !== previous.activeShotId) {
        schedule(new Set([previous.activeShotId, state.activeShotId].filter((id): id is string => Boolean(id))))
      }
      if (state.project === previous.project) return
      // Editing a shot only changes that shot; editing the set (Master) changes them all.
      schedule(state.activeShotId ? new Set([state.activeShotId]) : 'all')
    })
    const unsubscribeUi = useUi.subscribe((state, previous) => {
      if (state.view !== previous.view || state.boardImage !== previous.boardImage) schedule('all')
      if (state.thumbnailRefresh !== previous.thumbnailRefresh) schedule('all')
      // Leaving camera view: that shot's final still.
      if (state.lookThroughId !== previous.lookThroughId && previous.lookThroughId) schedule(new Set([previous.lookThroughId]))
    })
    return () => {
      unsubscribe()
      unsubscribeUi()
      clearTimeout(infoTimer)
      clearTimeout(thumbTimer)
    }
  }, [gl])

  return null
}

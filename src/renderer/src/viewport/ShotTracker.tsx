import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { activeScene, sceneForShot, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { renderShot } from './renderShot'
import { computeShotInfo, type ShotInfo } from './shotInfo'
import { shotScenes } from './ShotScenes'

const INFO_DELAY = 80 // ms after a change, so the 3D scenes have caught up
const THUMBNAIL_DELAY = 450 // ms of quiet before re-rendering thumbnails
const THUMBNAIL_WIDTH = 192
const BOARD_WIDTH = 640 // the storyboard's clay pictures

// Keeps each shot's live readouts and shot-list thumbnail up to date. Each shot is measured
// and rendered from its own hidden copy of the set (see ShotScenes), so it shows that shot's
// version even while you edit Master or another shot.
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

    const updateThumbnails = () => {
      const { cameras: list } = cameras()
      const thumbnails: Record<string, string> = {}
      for (const c of list) {
        const scene = shotScenes.get(c.id)
        if (c.type !== 'camera' || !scene) continue
        scene.updateMatrixWorld(true)
        const canvas = renderShot(gl, scene, c, useDocument.getState().project.camera, THUMBNAIL_WIDTH)
        if (canvas) thumbnails[c.id] = canvas.toDataURL('image/jpeg', 0.82)
      }
      useUi.getState().setThumbnails(thumbnails)
      updateBoardClay()
    }

    // Storyboard in Clay mode: every shot in every scene (ShotScenes builds their copies then).
    const updateBoardClay = () => {
      const ui = useUi.getState()
      if (ui.view !== 'board' || ui.boardImage !== 'clay') return
      const { project } = useDocument.getState()
      const images: Record<string, string> = {}
      for (const c of project.scenes.flatMap((s) => Object.values(s.nodes))) {
        const scene = shotScenes.get(c.id)
        if (c.type !== 'camera' || !scene) continue
        scene.updateMatrixWorld(true)
        const canvas = renderShot(gl, scene, c, project.camera, BOARD_WIDTH)
        if (canvas) images[c.id] = canvas.toDataURL('image/jpeg', 0.85)
      }
      ui.setBoardClay(images)
    }

    const schedule = () => {
      clearTimeout(infoTimer)
      infoTimer = setTimeout(updateInfo, INFO_DELAY)
      clearTimeout(thumbTimer)
      thumbTimer = setTimeout(updateThumbnails, THUMBNAIL_DELAY)
    }

    schedule()
    const unsubscribe = useDocument.subscribe((state, previous) => {
      if (state.project !== previous.project || state.sceneId !== previous.sceneId) schedule()
    })
    const unsubscribeUi = useUi.subscribe((state, previous) => {
      if (state.view !== previous.view || state.boardImage !== previous.boardImage) schedule()
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

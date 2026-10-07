import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { activeScene, sceneForShot, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { renderShot } from './renderShot'
import { computeShotInfo, type ShotInfo } from './shotInfo'
import { shotScenes } from './ShotScenes'
import { focusOf, renderBoardClay } from './boardClay'
import { shotFingerprint } from './shotFingerprint'
import { renderFor, useRenders } from '../state/renders'
import { figuresLoading, onFiguresLoading } from './humanData'

const INFO_DELAY = 80 // ms after a change, so the 3D scenes have caught up
const THUMBNAIL_DELAY = 450 // ms of quiet before re-rendering every shot's thumbnail
const LIVE_DELAY = 120 // ms: the shot being edited re-renders this soon after a change
const THUMBNAIL_WIDTH = 192
const BOARD_WIDTH = 640 // the storyboard's clay pictures

// Keeps each shot's live readouts and shot-list thumbnail up to date. Each shot is measured
// and rendered from its own hidden copy of the set (see ShotScenes), so it shows that shot's
// version even while you edit Master or another shot.
// Thumbnails (Clay stills), to keep things light: the shot being edited (or looked through)
// re-renders live; after a pause every shot is checked and only those whose picture could have
// changed (see fingerprint) re-render.
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

    const lastPrint = new Map<string, string>()
    const fingerprint = shotFingerprint

    /** Re-render these shots' thumbnails (all = every shot); the rest keep their stills. */
    const updateThumbnails = (only: Set<string> | 'all') => {
      // A figure is still putting on its hair and clothes: wait (it calls back when done).
      if (figuresLoading()) return
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
        // Nothing that shows has changed: keep the still.
        const shotPrint = fingerprint(c.id)
        // An up-to-date Render (path traced) is the thumbnail while it lasts.
        const render = renderFor(c.id, shotPrint)
        const print = render ? `${shotPrint}:${render.quality}` : shotPrint
        if (previous[c.id] && lastPrint.get(c.id) === print) {
          thumbnails[c.id] = previous[c.id]
          continue
        }
        if (render) {
          thumbnails[c.id] = render.url
          lastPrint.set(c.id, print)
          continue
        }
        scene.updateMatrixWorld(true)
        const canvas = renderShot(gl, scene, c, useDocument.getState().project.camera, THUMBNAIL_WIDTH, focusOf(c, scene))
        if (canvas) {
          thumbnails[c.id] = canvas.toDataURL('image/jpeg', 0.82)
          lastPrint.set(c.id, print)
        }
      }
      useUi.getState().setThumbnails(thumbnails)
      if (only === 'all') updateBoardClay()
    }

    // Storyboard in Clay mode: every shot in every scene (ShotScenes builds their copies then).
    const updateBoardClay = () => {
      const ui = useUi.getState()
      // (In AI mode too: shots without a circle take show their clay render.)
      if (ui.view !== 'board') return
      ui.setBoardClay(renderBoardClay(gl, BOARD_WIDTH, 'image/jpeg'))
    }

    // The shot being edited (or looked through) re-renders soon after each change; every shot is
    // checked after a pause, and only those whose fingerprint changed re-render.
    let liveTimer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(infoTimer)
      infoTimer = setTimeout(updateInfo, INFO_DELAY)
      const active = useUi.getState().lookThroughId ?? useDocument.getState().activeShotId
      clearTimeout(liveTimer)
      if (active) liveTimer = setTimeout(() => updateThumbnails(new Set([active])), LIVE_DELAY)
      clearTimeout(thumbTimer)
      thumbTimer = setTimeout(() => updateThumbnails('all'), THUMBNAIL_DELAY)
    }

    schedule()
    const unsubscribe = useDocument.subscribe((state, previous) => {
      if (state.project !== previous.project || state.sceneId !== previous.sceneId || state.activeShotId !== previous.activeShotId) schedule()
    })
    const unsubscribeUi = useUi.subscribe((state, previous) => {
      if (state.view !== previous.view || state.boardImage !== previous.boardImage) schedule()
    })
    // Figures finished loading: every picture again (the project didn't change, so nothing else
    // would take them; until now they were waiting).
    const unsubscribeFigures = onFiguresLoading(() => {
      if (figuresLoading()) return
      lastPrint.clear()
      clearTimeout(thumbTimer)
      thumbTimer = setTimeout(() => updateThumbnails('all'), 100)
    })
    // A Render finished (or was loaded): it becomes that shot's thumbnail.
    const unsubscribeRenders = useRenders.subscribe((state, previous) => {
      if (state.byShot !== previous.byShot) {
        clearTimeout(thumbTimer)
        thumbTimer = setTimeout(() => updateThumbnails('all'), 50)
      }
    })
    return () => {
      unsubscribe()
      unsubscribeUi()
      unsubscribeRenders()
      unsubscribeFigures()
      clearTimeout(infoTimer)
      clearTimeout(thumbTimer)
      clearTimeout(liveTimer)
    }
  }, [gl])

  return null
}

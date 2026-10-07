import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { boardShots } from '../../../shared/board'
import { deliveryFrame, opticsFor } from '../../../shared/camera'
import { useDocument } from '../state/documentStore'
import { keepRender, renderFor, useRenders } from '../state/renders'
import { useUi } from '../state/uiStore'
import { focusOf } from './boardClay'
import { canvasToPng, PathTrace } from './pathTrace'
import { shotFingerprint } from './shotFingerprint'
import { shotScenes } from './ShotScenes'
import { figuresLoading } from './humanData'

// While the Board shows Renders: every shot without an up-to-date Render is rendered (Draft, at
// board size), one at a time in board order, a little each frame so the app stays responsive.
// The board shows each one as it's finished (state/renders.ts).

/** The board's Render pictures (px wide). */
export const BOARD_RENDER_WIDTH = 640

export default function RenderQueue() {
  const onBoard = useUi((s) => s.view === 'board' && s.boardImage === 'render')
  return onBoard ? <Queue /> : null
}

function Queue() {
  const gl = useThree((s) => s.gl)
  const pt = useMemo(() => new PathTrace(gl), [gl])
  const job = useRef<{ shotId: string; print: string } | null>(null)
  useEffect(
    () => () => {
      pt.dispose()
      useRenders.setState({ queue: null })
    },
    [pt]
  )

  useFrame(() => {
    // Figures still putting on hair and clothes: wait, and start that shot again once they're done.
    if (figuresLoading()) {
      job.current = null
      return
    }
    const doc = useDocument.getState()
    const shots = boardShots(doc.project)
    const missing = shots.filter((b) => !renderFor(b.shot.id, shotFingerprint(b.shot.id)))
    const done = shots.length - missing.length

    // The shot being rendered changed (or got a Render elsewhere): drop it.
    const current = job.current
    if (current && (shotFingerprint(current.shotId) !== current.print || !missing.some((b) => b.shot.id === current.shotId))) job.current = null

    if (!job.current) {
      // The next shot whose hidden copy of the set is ready.
      const next = missing.find((b) => shotScenes.has(b.shot.id))
      if (!next) {
        const queue = missing.length ? { done, total: shots.length, shotId: null } : null
        const was = useRenders.getState().queue
        if (was?.done !== queue?.done || was?.total !== queue?.total || was?.shotId !== null) useRenders.setState({ queue })
        return
      }
      const scene = shotScenes.get(next.shot.id)!
      const kit = doc.project.camera
      const ratio = deliveryFrame(opticsFor(kit, next.shot.focalLength)).ratio
      scene.updateMatrixWorld(true)
      pt.prepare(scene, next.shot, kit, focusOf(next.shot, scene), BOARD_RENDER_WIDTH, Math.round(BOARD_RENDER_WIDTH / ratio), 'draft')
      job.current = { shotId: next.shot.id, print: shotFingerprint(next.shot.id) }
      useRenders.setState({ queue: { done, total: shots.length, shotId: next.shot.id } })
    }

    pt.step()
    if (pt.done && job.current) {
      const { shotId, print } = job.current
      job.current = null
      const canvas = pt.toCanvas()
      const samples = pt.target
      void canvasToPng(canvas).then((url) => keepRender(shotId, 'draft', { url, print, width: canvas.width, height: canvas.height, samples }))
    }
  })

  return null
}

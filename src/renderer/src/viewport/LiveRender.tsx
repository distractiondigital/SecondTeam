import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { opticsFor } from '../../../shared/camera'
import { activeScene, useDocument } from '../state/documentStore'
import { keepRender, useRenders } from '../state/renders'
import { useUi } from '../state/uiStore'
import { focusOf } from './boardClay'
import { PathTrace } from './pathTrace'
import { setFingerprint, shotFingerprint } from './shotFingerprint'
import { shotScenes } from './ShotScenes'
import { viewFit } from './viewFit'

// Camera view with Render on: the shot path-traced into its delivery frame, refining from grainy
// to clean. It draws over the Clay picture (LiveClayPost), and only once the shot has been still
// for a moment: while the camera moves or the set is being edited you see Clay. Moving the camera
// just starts the picture again; changing the set rebuilds the path tracer's copy of it first.
// When the picture is finished it's kept as the shot's Render (state/renders.ts).

/** How long things must be still before the Render shows (ms). */
const SETTLE = 200

export default function LiveRender() {
  const looking = useUi((s) => s.lookThroughId !== null)
  const clay = useUi((s) => s.shading === 'clay')
  const live = useRenders((s) => s.live)
  return looking && clay && live ? <Tracing /> : null
}

function Tracing() {
  const gl = useThree((s) => s.gl)
  const pt = useMemo(() => new PathTrace(gl), [gl])
  useEffect(
    () => () => {
      pt.dispose()
      useRenders.setState({ liveSamples: 0, liveTarget: 0 })
    },
    [pt]
  )
  const st = useRef({ setPrint: '', shotPrint: '', sizeKey: '', changedAt: 0, prepared: false, kept: false, shown: -1 })

  // Priority 2: after the Clay picture (LiveClayPost, 1).
  useFrame((state) => {
    const ui = useUi.getState()
    const id = ui.lookThroughId
    const doc = useDocument.getState()
    const node = id ? activeScene(doc).nodes[id] : undefined
    const scene = id ? shotScenes.get(id) : undefined
    if (!id || node?.type !== 'camera' || !scene) return
    const s = st.current
    const kit = doc.project.camera
    const quality = useRenders.getState().quality

    // The delivery frame on screen, in CSS pixels (and the picture's size in device pixels).
    const { size } = state
    const frame = viewFit(opticsFor(kit, node.focalLength), size.width, size.height).delivery
    const dpr = gl.getPixelRatio()
    const w = Math.max(16, Math.round(frame.width * dpr))
    const h = Math.max(16, Math.round(frame.height * dpr))

    // What changed: the set (rebuild), or just the camera (start again).
    const now = performance.now()
    const setPrint = setFingerprint(id)
    const shotPrint = shotFingerprint(id)
    const sizeKey = `${w}x${h}:${quality}`
    if (setPrint !== s.setPrint || sizeKey !== s.sizeKey) {
      s.setPrint = setPrint
      s.sizeKey = sizeKey
      s.prepared = false
      s.changedAt = now
    } else if (shotPrint !== s.shotPrint) {
      s.changedAt = now
      if (s.prepared) {
        scene.updateMatrixWorld(true)
        pt.moveCamera(scene, node, kit, focusOf(node, scene))
      }
    }
    if (shotPrint !== s.shotPrint) s.kept = false
    s.shotPrint = shotPrint
    if (now - s.changedAt < SETTLE) {
      if (s.shown !== 0) useRenders.setState({ liveSamples: 0, liveTarget: pt.target })
      s.shown = 0
      return
    }
    if (!s.prepared) {
      scene.updateMatrixWorld(true)
      pt.prepare(scene, node, kit, focusOf(node, scene), w, h, quality)
      s.prepared = true
      s.kept = false
    }

    pt.step()
    const samples = Math.floor(pt.samples)
    if (samples !== s.shown) {
      s.shown = samples
      useRenders.setState({ liveSamples: samples, liveTarget: pt.target })
    }
    if (samples < 1) return

    // Over the Clay picture, in the delivery frame.
    const y = size.height - frame.y - frame.height
    gl.setViewport(frame.x, y, frame.width, frame.height)
    gl.setScissor(frame.x, y, frame.width, frame.height)
    gl.setScissorTest(true)
    try {
      pt.present(null)
    } finally {
      gl.setScissorTest(false)
      gl.setViewport(0, 0, size.width, size.height)
      gl.setScissor(0, 0, size.width, size.height)
    }

    // Finished: keep it as the shot's Render.
    if (pt.done && !s.kept) {
      s.kept = true
      const url = pt.toCanvas().toDataURL('image/png')
      void keepRender(id, quality, { url, print: shotPrint, width: w, height: h, samples: pt.target })
    }
  }, 2)

  return null
}

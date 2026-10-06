import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Object3D, PerspectiveCamera } from 'three'
import { opticsFor } from '../../../shared/camera'
import { shotFocus } from '../../../shared/depthOfField'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { DepthOfField } from './depthOfField'
import { isHelper, withHidden } from './renderShot'
import { viewFit } from './viewFit'

// The live camera view with the lens's depth of field. While looking through a shot (and the HUD's
// DoF switch is on) this takes over drawing the viewport: the set renders into an offscreen
// picture, gets blurred like the real lens would (DepthOfField), and the helpers (gizmos, grab
// balls, aim lines) are drawn on top, sharp, still hidden by the set where they're behind it.

const RENDERABLE = (o: Object3D) =>
  Boolean((o as { isMesh?: boolean }).isMesh || (o as { isLine?: boolean }).isLine || (o as { isPoints?: boolean }).isPoints || (o as { isSprite?: boolean }).isSprite)

/** Is this object, or anything it sits in, a viewport helper? */
function inHelper(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (isHelper(p)) return true
  return false
}

export default function LiveDepthOfField() {
  const lookId = useUi((s) => s.lookThroughId)
  const on = useUi((s) => s.dofPreview)
  return lookId && on ? <LiveBlur /> : null
}

function LiveBlur() {
  const gl = useThree((s) => s.gl)
  const dof = useMemo(() => new DepthOfField(), [])
  useEffect(() => () => dof.dispose(), [dof])

  // Priority 1: R3F stops drawing the frame itself while this is mounted.
  useFrame((state) => {
    const { scene, size } = state
    const camera = state.camera as PerspectiveCamera
    const doc = useDocument.getState()
    const ui = useUi.getState()
    const id = ui.lookThroughId
    const node = id ? activeScene(doc).nodes[id] : undefined
    if (node?.type !== 'camera') {
      gl.render(scene, camera)
      return
    }
    const dpr = gl.getPixelRatio()
    dof.setSize(size.width * dpr, size.height * dpr)
    const kit = doc.project.camera
    const fit = viewFit(opticsFor(kit, node.focalLength), size.width, size.height)

    withHidden(scene, isHelper, () => {
      gl.setRenderTarget(dof.target)
      gl.clear()
      gl.render(scene, camera)
    })
    gl.setRenderTarget(null)
    dof.render(
      gl,
      camera,
      {
        focalLength: node.focalLength,
        stop: node.aperture,
        focus: shotFocus(node.focusDistance, ui.shotInfo[node.id]?.subjectDepth),
        squeeze: kit.squeeze,
        pxPerMm: fit.pxPerMm * dpr
      },
      null
    )

    // Helpers on top, against the set's depth. Nothing else draws again (no sky, no shadows).
    const background = scene.background
    const autoClear = gl.autoClear
    const shadows = gl.shadowMap.autoUpdate
    scene.background = null
    gl.autoClear = false
    gl.shadowMap.autoUpdate = false
    try {
      withHidden(scene, (o) => RENDERABLE(o) && !inHelper(o), () => gl.render(scene, camera))
    } finally {
      scene.background = background
      gl.autoClear = autoClear
      gl.shadowMap.autoUpdate = shadows
    }
  }, 1)

  return null
}

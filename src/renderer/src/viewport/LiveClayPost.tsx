import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Object3D, PerspectiveCamera } from 'three'
import { opticsFor } from '../../../shared/camera'
import { shotFocus } from '../../../shared/depthOfField'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { ClayPost, type DofParams } from './clayPost'
import { castFromFrontFaces } from './softShadows'
import { isHelper, withHidden } from './renderShot'
import { viewFit } from './viewFit'

// The live viewport with the Clay finishing passes (clayPost.ts): ambient occlusion in Clay
// shading, and the lens's depth of field while looking through a shot (with the HUD's DoF switch
// on). While active this takes over drawing: the set renders into an offscreen picture, gets
// finished, and the helpers (gizmos, grab balls, aim lines, camera bodies) are drawn on top, sharp,
// still hidden by the set where they're behind it. Work shading draws as before.

const RENDERABLE = (o: Object3D) =>
  Boolean((o as { isMesh?: boolean }).isMesh || (o as { isLine?: boolean }).isLine || (o as { isPoints?: boolean }).isPoints || (o as { isSprite?: boolean }).isSprite)

/** Is this object, or anything it sits in, a viewport helper? */
function inHelper(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (isHelper(p)) return true
  return false
}

export default function LiveClayPost() {
  const clay = useUi((s) => s.shading === 'clay')
  const lookingWithDof = useUi((s) => s.lookThroughId !== null && s.dofPreview)
  return clay || lookingWithDof ? <LivePost /> : null
}

function LivePost() {
  const gl = useThree((s) => s.gl)
  const post = useMemo(() => new ClayPost(), [])
  useEffect(() => () => post.dispose(), [post])

  // Priority 1: R3F stops drawing the frame itself while this is mounted.
  useFrame((state) => {
    const { scene, size } = state
    const camera = state.camera as PerspectiveCamera
    const doc = useDocument.getState()
    const ui = useUi.getState()
    const dpr = gl.getPixelRatio()
    post.setSize(size.width * dpr, size.height * dpr)

    // Depth of field: only through a shot's lens.
    let dof: DofParams | null = null
    const node = ui.lookThroughId ? activeScene(doc).nodes[ui.lookThroughId] : undefined
    if (node?.type === 'camera' && ui.dofPreview) {
      const kit = doc.project.camera
      dof = {
        focalLength: node.focalLength,
        stop: node.aperture,
        focus: shotFocus(node.focusDistance, ui.shotInfo[node.id]?.subjectDepth),
        squeeze: kit.squeeze,
        pxPerMm: viewFit(opticsFor(kit, node.focalLength), size.width, size.height).pxPerMm * dpr
      }
    }

    castFromFrontFaces(scene)
    withHidden(scene, isHelper, () => {
      gl.setRenderTarget(post.target)
      gl.clear()
      gl.render(scene, camera)
    })
    gl.setRenderTarget(null)
    post.render(gl, camera, { dof, ao: ui.shading === 'clay' }, null)

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

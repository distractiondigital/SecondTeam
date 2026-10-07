import { useEffect, useMemo } from 'react'
import { PerspectiveCamera } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { deliveryFrame, fieldOfView, opticsFor } from '../../../shared/camera'
import { shotFocus } from '../../../shared/depthOfField'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { ClayPost, prepareOcclusion, type DofParams } from './clayPost'
import { isHelper, withHidden } from './renderShot'
import { cameraPose } from './shotInfo'
import { shotScenes } from './ShotScenes'
import { castFromFrontFaces, updateLightSizes } from './softShadows'
import { poseQuaternion, useShotFly } from './useShotFly'

// The picture of the shot picture-in-picture (panels/ShotPip.tsx lays out the window): after the
// viewport has been drawn, the shot is drawn through its lens into the window's rectangle of the
// same canvas (viewport + scissor). It's always the Clay picture, whatever the viewport's shading:
// it draws the shot's hidden lit copy of the set (ShotScenes, as thumbnails do) with the Clay
// finishing passes (ambient occlusion, and depth of field with the camera view's DoF switch).
// Mount only while the window shows: its late useFrame stops R3F drawing the frame on its own.

const pipShotId = () => useDocument.getState().activeShotId

export default function PipRender() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const element = useUi((s) => s.pipElement)
  const working = useShotFly({ element, shotId: pipShotId, rollAnytime: false })
  const camera = useMemo(() => new PerspectiveCamera(40, 1, 0.02, 1000), [])
  const post = useMemo(() => new ClayPost(), [])
  useEffect(() => () => post.dispose(), [post])

  useFrame((state) => {
    const el = useUi.getState().pipElement
    const ui = useUi.getState()
    const doc = useDocument.getState()
    const id = doc.activeShotId
    const node = id ? activeScene(doc).nodes[id] : undefined
    const object = id ? scene.getObjectByName(id) : null
    if (!el || ui.lookThroughId || node?.type !== 'camera' || !object) return

    // The window's picture area, in canvas pixels from the bottom left (as the GPU counts).
    const canvasRect = gl.domElement.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const w = Math.round(r.width)
    const h = Math.round(r.height)
    if (w < 2 || h < 2) return
    const x = Math.round(r.left - canvasRect.left)
    const y = Math.round(canvasRect.bottom - r.bottom)

    // The shot camera (as it's being moved, if it is).
    const kit = doc.project.camera
    const optics = opticsFor(kit, node.focalLength)
    const pose = working.current
    if (pose) {
      camera.position.copy(pose.position)
      camera.quaternion.copy(poseQuaternion(pose))
    } else {
      const p = cameraPose(object)
      camera.position.copy(p.position)
      camera.quaternion.copy(p.quaternion)
    }
    camera.fov = fieldOfView(optics).vertical
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    // The shot's own lit copy of the set (the live set has only work lights in Work shading).
    const shot = shotScenes.get(node.id)
    const target = shot ?? scene
    const size = state.size
    const autoClear = gl.autoClear
    const shadows = gl.shadowMap.autoUpdate
    gl.autoClear = true
    // The copy's shadow maps are its own; the live set's were drawn this frame already.
    gl.shadowMap.autoUpdate = Boolean(shot)
    gl.setViewport(x, y, w, h)
    gl.setScissor(x, y, w, h)
    gl.setScissorTest(true)
    try {
      const dpr = gl.getPixelRatio()
      post.setSize(w * dpr, h * dpr)
      let dof: DofParams | null = null
      if (ui.dofPreview) {
        dof = {
          focalLength: node.focalLength,
          stop: node.aperture,
          focus: shotFocus(node.focusDistance, ui.shotInfo[node.id]?.subjectDepth),
          squeeze: kit.squeeze,
          pxPerMm: (h * dpr) / deliveryFrame(optics).height
        }
      }
      castFromFrontFaces(target)
      updateLightSizes(target)
      prepareOcclusion(target)
      withHidden(target, isHelper, () =>
        post.withOcclusion(() => {
          gl.setRenderTarget(post.target)
          gl.clear()
          gl.render(target, camera)
        })
      )
      gl.setRenderTarget(null)
      post.render(gl, camera, { dof, ao: true }, null)
    } finally {
      gl.setScissorTest(false)
      gl.setScissor(0, 0, size.width, size.height)
      gl.setViewport(0, 0, size.width, size.height)
      gl.autoClear = autoClear
      gl.shadowMap.autoUpdate = shadows
      // Light sizes are shared by every material: put back the live set's for the next frame.
      updateLightSizes(scene)
    }
  }, 10)

  return null
}

import { useEffect, useMemo } from 'react'
import { PerspectiveCamera, ShaderMaterial, SRGBColorSpace, WebGLRenderTarget, type Scene } from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { useFrame, useThree } from '@react-three/fiber'
import { deliveryFrame, fieldOfView, opticsFor } from '../../../shared/camera'
import { shotFocus } from '../../../shared/depthOfField'
import { activeScene, useDocument } from '../state/documentStore'
import { figuresLoading } from './humanData'
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
//
// The Clay picture is costly (the whole set again, with soft shadows and occlusion), so it's kept
// in a picture of its own and only redrawn when something it shows changed (the project, the shot
// camera, the window's size or DoF, figures finishing loading), at most ~30 times a second while
// you work (posing, dragging), plus once a second anyway; other frames just paste the picture.

/** Shortest time between redraws while things keep changing (ms). */
const BUSY_INTERVAL = 33
/** Redraw anyway this often (ms): things the checks don't see (textures arriving, shadows settling). */
const IDLE_INTERVAL = 1000
/** Redraws after a change settles: the occlusion uses the previous picture's depth, so it takes two. */
const SETTLE_DRAWS = 2

const COPY_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`
// The kept picture is finished (tone mapped) and stored as sRGB like thumbnails (renderShot): it
// reads back as linear, so turn it back into the screen's colours, without tone mapping it again.
const COPY_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(map, vUv);
    #include <colorspace_fragment>
  }
`

const pipShotId = () => useDocument.getState().activeShotId

export default function PipRender() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const element = useUi((s) => s.pipElement)
  const working = useShotFly({ element, shotId: pipShotId, rollAnytime: false })
  const camera = useMemo(() => new PerspectiveCamera(40, 1, 0.02, 1000), [])
  const post = useMemo(() => new ClayPost(), [])
  const kept = useMemo(
    () => ({
      picture: (() => {
        const t = new WebGLRenderTarget(1, 1)
        t.texture.colorSpace = SRGBColorSpace
        return t
      })(),
      copy: new FullScreenQuad(new ShaderMaterial({ uniforms: { map: { value: null } }, vertexShader: COPY_VERTEX, fragmentShader: COPY_FRAGMENT, depthTest: false, depthWrite: false })),
      /** What the picture shows (inputs to compare), when it was drawn, and draws still due. */
      what: '',
      project: null as unknown,
      shot: null as Scene | null,
      drawnAt: -Infinity,
      settle: 0
    }),
    []
  )
  useEffect(
    () => () => {
      post.dispose()
      kept.picture.dispose()
      kept.copy.dispose()
      ;(kept.copy.material as ShaderMaterial).dispose()
    },
    [post, kept]
  )

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
    const dpr = gl.getPixelRatio()
    const pw = Math.round(w * dpr)
    const ph = Math.round(h * dpr)

    // Redraw only if what the picture shows changed (see the top of the file).
    const e = camera.matrixWorld.elements
    const what = `${pw}x${ph}|${ui.dofPreview}|${camera.fov.toFixed(4)}|${e.map((v) => v.toFixed(5)).join(',')}|${figuresLoading()}`
    const now = performance.now()
    const changed = what !== kept.what || doc.project !== kept.project || (shot ?? null) !== kept.shot
    if (changed) kept.settle = SETTLE_DRAWS
    const due = kept.settle > 0 ? now - kept.drawnAt >= BUSY_INTERVAL : now - kept.drawnAt >= IDLE_INTERVAL
    kept.what = what
    kept.project = doc.project
    kept.shot = shot ?? null

    const autoClear = gl.autoClear
    const shadows = gl.shadowMap.autoUpdate
    try {
      if (due) {
        kept.settle = Math.max(0, kept.settle - 1)
        kept.drawnAt = now
        if (kept.picture.width !== pw || kept.picture.height !== ph) kept.picture.setSize(pw, ph)
        gl.autoClear = true
        // The copy's shadow maps are its own; the live set's were drawn this frame already.
        gl.shadowMap.autoUpdate = Boolean(shot)
        gl.setScissorTest(false)
        post.setSize(pw, ph)
        let dof: DofParams | null = null
        if (ui.dofPreview) {
          dof = {
            focalLength: node.focalLength,
            stop: node.aperture,
            focus: shotFocus(node.focusDistance, ui.shotInfo[node.id]?.subjectDepth),
            squeeze: kit.squeeze,
            pxPerMm: ph / deliveryFrame(optics).height
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
        post.render(gl, camera, { dof, ao: true }, kept.picture)
        // Light sizes are shared by every material: put back the live set's for the next frame.
        updateLightSizes(scene)
      }
      // Paste the picture into the window's rectangle.
      gl.setRenderTarget(null)
      gl.autoClear = false
      gl.setViewport(x, y, w, h)
      gl.setScissor(x, y, w, h)
      gl.setScissorTest(true)
      ;(kept.copy.material as ShaderMaterial).uniforms.map.value = kept.picture.texture
      kept.copy.render(gl)
    } finally {
      gl.setScissorTest(false)
      gl.setScissor(0, 0, size.width, size.height)
      gl.setViewport(0, 0, size.width, size.height)
      gl.autoClear = autoClear
      gl.shadowMap.autoUpdate = shadows
    }
  }, 10)

  return null
}

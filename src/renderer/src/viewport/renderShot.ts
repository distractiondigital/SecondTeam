import {
  PerspectiveCamera,
  SRGBColorSpace,
  WebGLRenderTarget,
  type Object3D,
  type Scene as ThreeScene,
  type WebGLRenderer
} from 'three'
import { deliveryFrame, fieldOfView, opticsFor, type CameraKit } from '../../../shared/camera'
import type { CameraNode } from '../../../shared/project'
import { ClayPost } from './clayPost'
import { castFromFrontFaces } from './softShadows'
import { cameraPose } from './shotInfo'

// Render the set through a shot camera's delivery frame, without any helpers (gizmos,
// camera bodies, labels, selection outlines). Used for shot-list thumbnails, and (with the
// helpers below) for the render passes in renderPasses.ts.

export function isHelper(o: Object3D): boolean {
  return Boolean(o.userData.helper) || Boolean((o as { isTransformControls?: boolean }).isTransformControls)
}

/** The shot's camera, looking through its delivery frame at `aspect` (width / height). */
export function shotCamera(scene: ThreeScene, node: CameraNode, kit: CameraKit, aspect?: number): PerspectiveCamera | null {
  const object = scene.getObjectByName(node.id)
  if (!object) return null
  const optics = opticsFor(kit, node.focalLength)
  const pose = cameraPose(object)
  const camera = new PerspectiveCamera(fieldOfView(optics).vertical, aspect ?? deliveryFrame(optics).ratio, 0.05, 1000)
  camera.position.copy(pose.position)
  camera.quaternion.copy(pose.quaternion)
  camera.updateMatrixWorld()
  return camera
}

/** Hide every object matching `hide` while `run` runs, then show them again. */
export function withHidden<T>(scene: ThreeScene, hide: (o: Object3D) => boolean, run: () => T): T {
  const hidden: Object3D[] = []
  scene.traverse((o) => {
    if (o.visible && hide(o)) {
      o.visible = false
      hidden.push(o)
    }
  })
  try {
    return run()
  } finally {
    for (const o of hidden) o.visible = true
  }
}

/** Read an 8-bit RGBA render target into a canvas (flipping WebGL's bottom-up rows). */
export function targetToCanvas(gl: WebGLRenderer, target: WebGLRenderTarget, w: number, h: number): HTMLCanvasElement {
  const pixels = new Uint8Array(w * h * 4)
  gl.readRenderTargetPixels(target, 0, 0, w, h, pixels)
  return pixelsToCanvas(pixels, w, h, true)
}

/** RGBA bytes to a canvas; `bottomUp` for rows read back from WebGL. */
export function pixelsToCanvas(pixels: Uint8Array | Uint8ClampedArray, w: number, h: number, bottomUp: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(w, h)
  if (bottomUp) {
    for (let row = 0; row < h; row++) {
      image.data.set(pixels.subarray((h - row - 1) * w * 4, (h - row) * w * 4), row * w * 4)
    }
  } else {
    image.data.set(pixels)
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** Render `scene` from `camera` into a new w x h colour image. */
export function renderToCanvas(
  gl: WebGLRenderer,
  scene: ThreeScene,
  camera: PerspectiveCamera,
  w: number,
  h: number,
  options: { srgb: boolean; samples: number }
): HTMLCanvasElement {
  const target = new WebGLRenderTarget(w, h, { samples: options.samples })
  if (options.srgb) target.texture.colorSpace = SRGBColorSpace
  const previous = gl.getRenderTarget()
  try {
    gl.setRenderTarget(target)
    gl.render(scene, camera)
    return targetToCanvas(gl, target, w, h)
  } finally {
    gl.setRenderTarget(previous)
    target.dispose()
  }
}

const postFor = new WeakMap<WebGLRenderer, ClayPost>()

/**
 * Renders one frame as a canvas, `width` pixels wide, with the Clay finish (ambient occlusion).
 * With `focus` (metres along the lens axis, Infinity allowed) it also has the lens's depth of field
 * at the shot's stop.
 */
export function renderShot(
  gl: WebGLRenderer,
  scene: ThreeScene,
  node: CameraNode,
  kit: CameraKit,
  width: number,
  focus?: number
): HTMLCanvasElement | null {
  const camera = shotCamera(scene, node, kit)
  if (!camera) return null
  const w = Math.round(width)
  const h = Math.max(1, Math.round(width / camera.aspect))

  let post = postFor.get(gl)
  if (!post) {
    post = new ClayPost()
    postFor.set(gl, post)
  }
  post.setSize(w, h)
  const optics = opticsFor(kit, node.focalLength)
  const output = new WebGLRenderTarget(w, h)
  output.texture.colorSpace = SRGBColorSpace
  const previous = gl.getRenderTarget()
  try {
    castFromFrontFaces(scene)
    withHidden(scene, isHelper, () => {
      gl.setRenderTarget(post.target)
      gl.clear()
      gl.render(scene, camera)
    })
    const dof =
      focus === undefined
        ? null
        : { focalLength: node.focalLength, stop: node.aperture, focus, squeeze: kit.squeeze, pxPerMm: h / deliveryFrame(optics).height }
    post.render(gl, camera, { dof, ao: true }, output)
    return targetToCanvas(gl, output, w, h)
  } finally {
    gl.setRenderTarget(previous)
    output.dispose()
  }
}

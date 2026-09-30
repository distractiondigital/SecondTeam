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
import { cameraPose } from './shotInfo'

// Render the set through a shot camera's delivery frame, without any helpers (gizmos,
// camera bodies, labels, selection outlines). Used for shot-list thumbnails now, and for
// render passes in Milestone 5.

function isHelper(o: Object3D): boolean {
  return Boolean(o.userData.helper) || Boolean((o as { isTransformControls?: boolean }).isTransformControls)
}

/** Renders one frame and returns it as a canvas, `width` pixels wide. */
export function renderShot(
  gl: WebGLRenderer,
  scene: ThreeScene,
  node: CameraNode,
  kit: CameraKit,
  width: number
): HTMLCanvasElement | null {
  const optics = opticsFor(kit, node.focalLength)
  const object = scene.getObjectByName(node.id)
  if (!object) return null
  const frame = deliveryFrame(optics)
  const w = Math.round(width)
  const h = Math.max(1, Math.round(width / frame.ratio))

  const pose = cameraPose(object)
  const camera = new PerspectiveCamera(fieldOfView(optics).vertical, frame.ratio, 0.05, 1000)
  camera.position.copy(pose.position)
  camera.quaternion.copy(pose.quaternion)
  camera.updateMatrixWorld()

  const hidden: Object3D[] = []
  scene.traverse((o) => {
    if (o.visible && isHelper(o)) {
      o.visible = false
      hidden.push(o)
    }
  })

  const target = new WebGLRenderTarget(w, h, { samples: 4 })
  target.texture.colorSpace = SRGBColorSpace
  const previous = gl.getRenderTarget()
  try {
    gl.setRenderTarget(target)
    gl.render(scene, camera)
    const pixels = new Uint8Array(w * h * 4)
    gl.readRenderTargetPixels(target, 0, 0, w, h, pixels)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    const image = ctx.createImageData(w, h)
    // WebGL rows are bottom-up; images are top-down.
    for (let row = 0; row < h; row++) {
      image.data.set(pixels.subarray((h - row - 1) * w * 4, (h - row) * w * 4), row * w * 4)
    }
    ctx.putImageData(image, 0, 0)
    return canvas
  } finally {
    gl.setRenderTarget(previous)
    target.dispose()
    for (const o of hidden) o.visible = true
  }
}

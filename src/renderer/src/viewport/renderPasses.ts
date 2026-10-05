import {
  Color,
  DoubleSide,
  FloatType,
  FrontSide,
  HemisphereLight,
  Quaternion,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  type Material,
  type Mesh,
  type Object3D,
  type PerspectiveCamera,
  type Scene as ThreeScene,
  type Side,
  type WebGLRenderer
} from 'three'
import { deliveryFrame, opticsFor, type CameraKit } from '../../../shared/camera'
import {
  COCO_COLORS,
  COCO_LIMBS,
  depthToGrey,
  entityKey,
  figureKeypoints,
  idLegend,
  isShown,
  poseStroke,
  sdxlSize,
  type FigurePoints,
  type IdEntry,
  type PassKind
} from '../../../shared/passes'
import type { CameraNode, CastMember, Prop, SceneNode } from '../../../shared/project'
import { facingPhrase } from '../../../shared/prompt'
import { isHelper, pixelsToCanvas, renderToCanvas, shotCamera, withHidden } from './renderShot'
import { hasLights } from './SceneNodes'

// Renders a shot's five control images (clay, depth, normals, object ID, pose) from its hidden
// copy of the set (ShotScenes). Clay, depth, normals and ID are 3D renders where every mesh
// briefly wears the pass's material; pose is drawn in 2D from the figures' projected joints.

export interface PassResult {
  width: number
  height: number
  /** PNG data URLs. */
  images: Record<PassKind, string>
  legend: IdEntry[]
  /** Distance (m) of the nearest and farthest surface in the depth pass. */
  depthRange: { near: number; far: number }
  /** Figures with at least part of their skeleton in the pose pass. */
  figures: number
  /** Which way each figure faces as this camera sees it, by node id ('facing the camera', …). */
  facings: Record<string, string | null>
}

export interface PassInput {
  gl: WebGLRenderer
  scene: ThreeScene
  shot: CameraNode
  kit: CameraKit
  /** The shot's version of the set. */
  nodes: Record<string, SceneNode>
  rootIds: string[]
  cast: CastMember[]
  props: Prop[]
}

const VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vDepth = -viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;
  }
`

const DEPTH_FRAGMENT = /* glsl */ `
  varying vec3 vNormal;
  varying float vDepth;
  void main() { gl_FragColor = vec4(vDepth, 0.0, 0.0, 1.0); }
`

// View-space normal: red = facing right, green = up, blue = toward the lens.
const NORMAL_FRAGMENT = /* glsl */ `
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  }
`

const FLAT_FRAGMENT = /* glsl */ `
  uniform vec3 color;
  varying vec3 vNormal;
  varying float vDepth;
  void main() { gl_FragColor = vec4(color, 1.0); }
`

function shader(fragmentShader: string, side: Side, color?: [number, number, number]): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader,
    side,
    uniforms: color ? { color: { value: new Vector3(color[0] / 255, color[1] / 255, color[2] / 255) } } : {}
  })
}

const isMesh = (o: Object3D): o is Mesh => (o as Mesh).isMesh === true

/** Material side of a mesh (planes are two-sided). */
function sideOf(mesh: Mesh): Side {
  const m = mesh.material as Material | Material[]
  return (Array.isArray(m) ? m[0] : m)?.side === DoubleSide ? DoubleSide : FrontSide
}

/** Put `pick(mesh)` on every visible mesh while `run` renders, then restore the real materials. */
function withMaterials<T>(scene: ThreeScene, pick: (mesh: Mesh) => Material, run: () => T): T {
  const saved: [Mesh, Mesh['material']][] = []
  scene.traverse((o) => {
    if (isMesh(o)) {
      saved.push([o, o.material])
      o.material = pick(o)
    }
  })
  try {
    return run()
  } finally {
    for (const [mesh, material] of saved) mesh.material = material
  }
}

/** Two variants of a pass material, one-sided and two-sided, made on first use. */
function bySide(make: (side: Side) => Material): (mesh: Mesh) => Material {
  const cache = new Map<Side, Material>()
  return (mesh) => {
    const side = sideOf(mesh)
    if (!cache.has(side)) cache.set(side, make(side))
    return cache.get(side)!
  }
}

/** The nearest scene node (figure, object, group) a mesh belongs to, or null (e.g. the floor). */
function nodeOf(o: Object3D, nodes: Record<string, SceneNode>): string | null {
  for (let p: Object3D | null = o; p; p = p.parent) if (p.name in nodes) return p.name
  return null
}

const excluded = (o: Object3D) => isHelper(o) || Boolean(o.userData.grid)

/** Clear to transparent black instead of the viewport background while `run` renders. */
function onBlack<T>(gl: WebGLRenderer, scene: ThreeScene, run: () => T): T {
  const background = scene.background
  const clearColor = gl.getClearColor(new Color())
  const clearAlpha = gl.getClearAlpha()
  scene.background = null
  gl.setClearColor(0x000000, 0)
  try {
    return run()
  } finally {
    scene.background = background
    gl.setClearColor(clearColor, clearAlpha)
  }
}

/** Force every pixel opaque (empty space stays black rather than see-through). */
function opaque(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'source-over'
  return canvas
}

export function renderPasses(input: PassInput): PassResult | null {
  const { gl, scene, shot, kit, nodes, rootIds, cast, props } = input
  const { width: w, height: h } = sdxlSize(deliveryFrame(opticsFor(kit, shot.focalLength)).ratio)
  scene.updateMatrixWorld(true)
  const camera = shotCamera(scene, shot, kit, w / h)
  if (!camera) return null

  const made: Material[] = []
  const track = <M extends Material>(m: M): M => {
    made.push(m)
    return m
  }

  try {
    return withHidden(scene, excluded, () => {
      const clay = renderClay(gl, scene, camera, w, h, hasLights(nodes), track)

      const normal = withMaterials(
        scene,
        bySide((side) => track(shader(NORMAL_FRAGMENT, side))),
        () => opaque(onBlack(gl, scene, () => renderToCanvas(gl, scene, camera, w, h, { srgb: false, samples: 4 })))
      )

      const { canvas: depth, near, far } = renderDepth(gl, scene, camera, w, h, track)

      const legend = idLegend(rootIds, nodes, cast, props)
      const colors = new Map(legend.map((e) => [e.key, e.color]))
      const idMaterials = new Map<string, Material>()
      const black = bySide((side) => track(shader(FLAT_FRAGMENT, side, [0, 0, 0])))
      const id = withMaterials(
        scene,
        (mesh) => {
          const node = nodeOf(mesh, nodes)
          const entity = node ? entityKey(node, nodes) : null
          const color = entity ? colors.get(entity) : undefined
          if (!color) return black(mesh)
          const key = `${color}:${sideOf(mesh)}`
          if (!idMaterials.has(key)) {
            // Straight from the hex: three's Color would convert it to linear light.
            const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number]
            idMaterials.set(key, track(shader(FLAT_FRAGMENT, sideOf(mesh), rgb)))
          }
          return idMaterials.get(key)!
        },
        // No anti-aliasing: every pixel is exactly one object's colour.
        () => opaque(onBlack(gl, scene, () => renderToCanvas(gl, scene, camera, w, h, { srgb: false, samples: 0 })))
      )

      const { canvas: pose, figures } = drawPose(scene, camera, nodes, w, h)
      countPixels(id, legend)
      const facings = figureFacings(scene, camera, nodes)

      return {
        width: w,
        height: h,
        images: {
          clay: clay.toDataURL('image/png'),
          depth: depth.toDataURL('image/png'),
          normal: normal.toDataURL('image/png'),
          id: id.toDataURL('image/png'),
          pose: pose.toDataURL('image/png')
        },
        legend,
        depthRange: { near, far },
        figures,
        facings
      }
    })
  } finally {
    for (const m of made) m.dispose()
  }
}

/** The lit clay render (each object in its material colour). A scene with no lights gets a dim fill instead of the work lights. */
function renderClay(
  gl: WebGLRenderer,
  scene: ThreeScene,
  camera: PerspectiveCamera,
  w: number,
  h: number,
  lit: boolean,
  track: <M extends Material>(m: M) => M
): HTMLCanvasElement {
  const render = () => renderToCanvas(gl, scene, camera, w, h, { srgb: true, samples: 4 })
  if (lit) return render()
  const fill = new HemisphereLight('#ffffff', '#444444', 0.6)
  scene.add(fill)
  try {
    return withHidden(scene, (o) => Boolean(o.userData.workLight), render)
  } finally {
    scene.remove(fill)
    fill.dispose()
  }
}

/** Distance of each pixel from the lens (floating point), turned into inverse-depth grey. */
function renderDepth(
  gl: WebGLRenderer,
  scene: ThreeScene,
  camera: PerspectiveCamera,
  w: number,
  h: number,
  track: <M extends Material>(m: M) => M,
  range?: { near: number; far: number }
): { canvas: HTMLCanvasElement; near: number; far: number } {
  const target = new WebGLRenderTarget(w, h, { type: FloatType })
  const previous = gl.getRenderTarget()
  const floats = new Float32Array(w * h * 4)
  try {
    onBlack(gl, scene, () => {
      gl.setRenderTarget(target)
      withMaterials(scene, bySide((side) => track(shader(DEPTH_FRAGMENT, side))), () => gl.render(scene, camera))
      gl.readRenderTargetPixels(target, 0, 0, w, h, floats)
    })
  } finally {
    gl.setRenderTarget(previous)
    target.dispose()
  }
  const distances = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) distances[i] = floats[i * 4]
  const { grey, near, far } = depthToGrey(distances, range)
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = grey[i]
    rgba[i * 4 + 3] = 255
  }
  return { canvas: pixelsToCanvas(rgba, w, h, true), near, far }
}

/** Which way each visible figure's body (its chest) faces, as this camera sees it. */
function figureFacings(
  scene: ThreeScene,
  camera: PerspectiveCamera,
  nodes: Record<string, SceneNode>
): Record<string, string | null> {
  const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
  const out: Record<string, string | null> = {}
  for (const node of Object.values(nodes)) {
    if (node.type !== 'mannequin' || !isShown(node.id, nodes)) continue
    const chest = scene.getObjectByName(`${node.id}:chest`)
    if (!chest) continue
    const forward = new Vector3(0, 0, 1).applyQuaternion(chest.getWorldQuaternion(new Quaternion()))
    const toLens = camera.position.clone().sub(chest.getWorldPosition(new Vector3()))
    out[node.id] = facingPhrase(
      forward.toArray() as [number, number, number],
      toLens.toArray() as [number, number, number],
      right.toArray() as [number, number, number]
    )
  }
  return out
}

const FIGURE_SOURCES = [
  'shoulderL',
  'elbowL',
  'wristL',
  'shoulderR',
  'elbowR',
  'wristR',
  'hipL',
  'kneeL',
  'ankleL',
  'hipR',
  'kneeR',
  'ankleR'
] as const
const HEAD_SOURCES = ['nose', 'eyeL', 'eyeR', 'earL', 'earR'] as const

/** OpenPose COCO-18 skeletons of every visible figure, on black. */
function drawPose(
  scene: ThreeScene,
  camera: PerspectiveCamera,
  nodes: Record<string, SceneNode>,
  w: number,
  h: number
): { canvas: HTMLCanvasElement; figures: number } {
  let figures = 0
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  const { stick, dot } = poseStroke(w, h)
  const toView = camera.matrixWorldInverse
  const v = new Vector3()

  const project = (p: [number, number, number]): [number, number] | null => {
    v.set(...p).applyMatrix4(toView)
    if (v.z > -camera.near) return null // behind the lens
    v.set(...p).project(camera)
    return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h]
  }
  const world = (name: string): [number, number, number] | null => {
    const o = scene.getObjectByName(name)
    if (!o) return null
    const p = o.getWorldPosition(new Vector3())
    return [p.x, p.y, p.z]
  }

  for (const node of Object.values(nodes)) {
    if (node.type !== 'mannequin' || !isShown(node.id, nodes)) continue
    const points: Partial<FigurePoints> = {}
    let complete = true
    for (const j of FIGURE_SOURCES) {
      const p = world(`${node.id}:${j}`)
      if (p) points[j] = p
      else complete = false
    }
    for (const k of HEAD_SOURCES) {
      const p = world(`${node.id}:kp:${k}`)
      if (p) points[k] = p
      else complete = false
    }
    const headObject = scene.getObjectByName(`${node.id}:head`)
    if (!complete || !headObject) continue
    const q = headObject.getWorldQuaternion(new Quaternion())
    const forward = new Vector3(0, 0, 1).applyQuaternion(q)
    const left = new Vector3(1, 0, 0).applyQuaternion(q)
    const keypoints = figureKeypoints(
      points as FigurePoints,
      { forward: [forward.x, forward.y, forward.z], left: [left.x, left.y, left.z] },
      [camera.position.x, camera.position.y, camera.position.z],
      project,
      w,
      h
    )
    if (keypoints.some(Boolean)) figures++

    // Limbs first, as OpenPose does: ellipses in 60% of the limb's colour, then the joints on top.
    COCO_LIMBS.forEach(([a, b], i) => {
      const pa = keypoints[a]
      const pb = keypoints[b]
      if (!pa || !pb) return
      const [r, g, bl] = COCO_COLORS[i].map((c) => Math.round(c * 0.6))
      ctx.fillStyle = `rgb(${r},${g},${bl})`
      ctx.beginPath()
      ctx.ellipse(
        (pa[0] + pb[0]) / 2,
        (pa[1] + pb[1]) / 2,
        Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / 2,
        stick,
        Math.atan2(pb[1] - pa[1], pb[0] - pa[0]),
        0,
        Math.PI * 2
      )
      ctx.fill()
    })
    keypoints.forEach((p, i) => {
      if (!p) return
      const [r, g, b] = COCO_COLORS[i]
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.beginPath()
      ctx.arc(p[0], p[1], dot, 0, Math.PI * 2)
      ctx.fill()
    })
  }
  return { canvas, figures }
}

/** How many pixels of each legend colour the ID pass has (0 = that entity isn't in frame). */
function countPixels(canvas: HTMLCanvasElement, legend: IdEntry[]): void {
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
  const byColor = new Map<number, IdEntry>()
  for (const e of legend) {
    e.pixels = 0
    byColor.set(parseInt(e.color.slice(1), 16), e)
  }
  for (let i = 0; i < data.length; i += 4) {
    const e = byColor.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
    if (e) e.pixels!++
  }
}

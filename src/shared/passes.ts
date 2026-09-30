// Render passes (Milestone 5): the maths that doesn't need a GPU. The size a shot renders at,
// the OpenPose skeleton from a figure's joints, depth-to-grey and the object-ID colours.
// The rendering itself lives in renderer/src/viewport/renderPasses.ts.

import type { SceneNode } from './project'

export const PASS_KINDS = ['clay', 'depth', 'normal', 'id', 'pose'] as const
export type PassKind = (typeof PASS_KINDS)[number]

export const PASS_LABELS: Record<PassKind, string> = {
  clay: 'Clay',
  depth: 'Depth',
  normal: 'Normals',
  id: 'Object ID',
  pose: 'Pose'
}

/** Files a pass export may write (and nothing else). */
export const PASS_FILE_NAMES: readonly string[] = [...PASS_KINDS.map((k) => `${k}.png`), 'passes.json']

/** Scene and shot ids used as folder names: plain letters, digits and dashes only. */
export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(id)
}

// ---------------------------------------------------------------------------------------------
// Size

const SDXL_PIXELS = 1024 * 1024

/**
 * The SDXL generation size for a frame shape: both sides a multiple of 64, about one megapixel,
 * as close to the ratio as that allows (16:9 -> 1344 x 768, 2.39 -> 1536 x 640).
 */
export function sdxlSize(ratio: number): { width: number; height: number } {
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1
  let best = { width: 1024, height: 1024 }
  let bestScore = Infinity
  for (let h = 256; h <= 4096; h += 64) {
    for (let w = 256; w <= 4096; w += 64) {
      const ratioError = Math.abs(Math.log(w / h / r))
      const areaError = Math.abs(Math.log((w * h) / SDXL_PIXELS))
      const score = ratioError + 0.25 * areaError
      if (score < bestScore) {
        bestScore = score
        best = { width: w, height: h }
      }
    }
  }
  return best
}

// ---------------------------------------------------------------------------------------------
// Pose (OpenPose COCO-18)

/** COCO-18 keypoint order, as OpenPose and the pose ControlNets use it. Left/right are the person's own. */
export const COCO_KEYPOINTS = [
  'nose',
  'neck',
  'rShoulder',
  'rElbow',
  'rWrist',
  'lShoulder',
  'lElbow',
  'lWrist',
  'rHip',
  'rKnee',
  'rAnkle',
  'lHip',
  'lKnee',
  'lAnkle',
  'rEye',
  'lEye',
  'rEar',
  'lEar'
] as const
export type CocoKeypoint = (typeof COCO_KEYPOINTS)[number]

/** The OpenPose colour of each keypoint (and of the limb with the same index). */
export const COCO_COLORS: [number, number, number][] = [
  [255, 0, 0],
  [255, 85, 0],
  [255, 170, 0],
  [255, 255, 0],
  [170, 255, 0],
  [85, 255, 0],
  [0, 255, 0],
  [0, 255, 85],
  [0, 255, 170],
  [0, 255, 255],
  [0, 170, 255],
  [0, 85, 255],
  [0, 0, 255],
  [85, 0, 255],
  [170, 0, 255],
  [255, 0, 255],
  [255, 0, 170],
  [255, 0, 85]
]

/** The 17 limbs OpenPose draws, as keypoint index pairs, in drawing (and colour) order. */
export const COCO_LIMBS: [number, number][] = [
  [1, 2],
  [1, 5],
  [2, 3],
  [3, 4],
  [5, 6],
  [6, 7],
  [1, 8],
  [8, 9],
  [9, 10],
  [1, 11],
  [11, 12],
  [12, 13],
  [1, 0],
  [0, 14],
  [14, 16],
  [0, 15],
  [15, 17]
]

type V3 = [number, number, number]

/** Where each COCO keypoint comes from on a figure (the joint origins and head markers). */
export interface FigurePoints {
  nose: V3
  eyeL: V3
  eyeR: V3
  earL: V3
  earR: V3
  shoulderL: V3
  elbowL: V3
  wristL: V3
  shoulderR: V3
  elbowR: V3
  wristR: V3
  hipL: V3
  kneeL: V3
  ankleL: V3
  hipR: V3
  kneeR: V3
  ankleR: V3
}

export interface HeadFrame {
  /** Unit vector the face points along. */
  forward: V3
  /** Unit vector toward the figure's own left ear. */
  left: V3
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]

/**
 * A figure's 18 keypoints in image pixels (null = not drawn). `project` maps a world point to
 * pixels, or null when it's behind the camera. Like a real OpenPose detection, the face is left
 * out when the head is turned away, an ear turned away from the lens is dropped, and anything
 * outside the frame is dropped.
 */
export function figureKeypoints(
  p: FigurePoints,
  head: HeadFrame,
  cameraPosition: V3,
  project: (world: V3) => [number, number] | null,
  width: number,
  height: number
): ([number, number] | null)[] {
  const headCentre = mid(p.earL, p.earR)
  const toCamera = unit(sub(cameraPosition, headCentre))
  const facing = dot(head.forward, toCamera)
  const faceShows = facing > -0.15
  // How much each eye / ear points at the lens: eyes look forward and a little sideways.
  const side = (sign: number, forwardShare: number): number =>
    dot(
      unit([
        head.forward[0] * forwardShare + head.left[0] * sign,
        head.forward[1] * forwardShare + head.left[1] * sign,
        head.forward[2] * forwardShare + head.left[2] * sign
      ]),
      toCamera
    )

  const sources: [V3, boolean][] = [
    [p.nose, faceShows],
    [mid(p.shoulderL, p.shoulderR), true],
    [p.shoulderR, true],
    [p.elbowR, true],
    [p.wristR, true],
    [p.shoulderL, true],
    [p.elbowL, true],
    [p.wristL, true],
    [p.hipR, true],
    [p.kneeR, true],
    [p.ankleR, true],
    [p.hipL, true],
    [p.kneeL, true],
    [p.ankleL, true],
    [p.eyeR, faceShows && side(-0.6, 1) > -0.2],
    [p.eyeL, faceShows && side(0.6, 1) > -0.2],
    [p.earR, side(-1, 0) > -0.3],
    [p.earL, side(1, 0) > -0.3]
  ]
  return sources.map(([world, visible]) => {
    if (!visible) return null
    const px = project(world)
    if (!px) return null
    const [x, y] = px
    return x >= 0 && x <= width && y >= 0 && y <= height ? px : null
  })
}

/** Stick and dot sizes for a pose image, matching OpenPose's look at 512 px and scaling up. */
export function poseStroke(width: number, height: number): { stick: number; dot: number } {
  const s = Math.min(width, height) / 512
  return { stick: 4 * s, dot: 4 * s }
}

// ---------------------------------------------------------------------------------------------
// Depth

/**
 * Turn per-pixel distances from the camera (metres; 0 = nothing there) into a greyscale depth
 * map: nearest surface white, farthest black, empty black. It's inverse depth (disparity), the
 * curve MiDaS / Depth Anything produce and depth ControlNets are trained on.
 */
export function depthToGrey(distances: Float32Array): { grey: Uint8Array; near: number; far: number } {
  let near = Infinity
  let far = 0
  for (const d of distances) {
    if (d > 0) {
      if (d < near) near = d
      if (d > far) far = d
    }
  }
  const grey = new Uint8Array(distances.length)
  if (far === 0) return { grey, near: 0, far: 0 }
  const a = 1 / far
  const b = 1 / near
  for (let i = 0; i < distances.length; i++) {
    const d = distances[i]
    if (d <= 0) continue
    grey[i] = b - a < 1e-9 ? 255 : Math.round(((1 / d - a) / (b - a)) * 255)
  }
  return { grey, near, far }
}

// ---------------------------------------------------------------------------------------------
// Object ID

/** Flat, clearly different colours (none black: black is floor and empty space). */
export const ID_PALETTE: [number, number, number][] = [
  [230, 25, 75],
  [60, 180, 75],
  [255, 225, 25],
  [0, 130, 200],
  [245, 130, 48],
  [145, 30, 180],
  [70, 240, 240],
  [240, 50, 230],
  [210, 245, 60],
  [250, 190, 212],
  [0, 128, 128],
  [220, 190, 255],
  [170, 110, 40],
  [255, 250, 200],
  [128, 0, 0],
  [170, 255, 195],
  [128, 128, 0],
  [255, 215, 180],
  [0, 0, 128],
  [128, 128, 128]
]

export interface IdEntry {
  nodeId: string
  name: string
  /** '#rrggbb' */
  color: string
}

const hex = (c: [number, number, number]): string => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')

/**
 * One colour per visible figure and top-level object or group, in outliner order. (Milestone 7
 * switches this to one colour per linked Cast member or Prop.)
 */
export function idLegend(rootIds: string[], nodes: Record<string, SceneNode>): IdEntry[] {
  const entries: IdEntry[] = []
  for (const id of rootIds) {
    const n = nodes[id]
    if (!n || n.hidden || n.type === 'camera' || n.type === 'light') continue
    if (n.type === 'group' && !hasVisibleSolid(n.id, nodes)) continue
    const i = entries.length
    // Past the palette, vary the brightness so later colours still differ.
    const base = ID_PALETTE[i % ID_PALETTE.length]
    const round = Math.floor(i / ID_PALETTE.length)
    const color = base.map((v) => Math.max(1, Math.round(v * (round % 2 ? 0.6 : 1)))) as [number, number, number]
    entries.push({ nodeId: n.id, name: n.name, color: hex(color) })
  }
  return entries
}

function hasVisibleSolid(id: string, nodes: Record<string, SceneNode>): boolean {
  const n = nodes[id]
  if (!n || n.hidden) return false
  if (n.type === 'primitive' || n.type === 'mannequin') return true
  return n.type === 'group' && n.childIds.some((c) => hasVisibleSolid(c, nodes))
}

import type { Vec3 } from './project'

// The posable figure: a 17-joint skeleton, its proportions, joint limits and pose presets.
//
// Conventions (all joints share them, so maths and mirroring stay simple):
// - The figure stands on the floor at its origin, facing +Z. Its LEFT side is +X.
// - At rest every joint frame lines up with the figure's frame. Limbs hang down (-Y),
//   the spine points up (+Y), feet point forward (+Z).
// - Joint rotations are XYZ Euler angles in degrees, relative to the parent joint:
//     X  swings a hanging limb back (+) or forward (-); tips the spine forward (+) or back (-);
//        points the toes down (+) or up (-)
//     Y  twists around the bone; + turns the front of the body toward the figure's left
//     Z  swings a hanging limb toward the figure's left (+) or right (-)

export const JOINT_NAMES = [
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
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
export type JointName = (typeof JOINT_NAMES)[number]

export interface JointInfo {
  label: string
  parent: JointName | null
  /** The same joint on the other side of the body (itself for centre joints). */
  mirror: JointName
}

export const JOINTS: Record<JointName, JointInfo> = {
  pelvis: { label: 'Pelvis', parent: null, mirror: 'pelvis' },
  spine: { label: 'Lower back', parent: 'pelvis', mirror: 'spine' },
  chest: { label: 'Chest', parent: 'spine', mirror: 'chest' },
  neck: { label: 'Neck', parent: 'chest', mirror: 'neck' },
  head: { label: 'Head', parent: 'neck', mirror: 'head' },
  shoulderL: { label: 'Left shoulder', parent: 'chest', mirror: 'shoulderR' },
  elbowL: { label: 'Left elbow', parent: 'shoulderL', mirror: 'elbowR' },
  wristL: { label: 'Left wrist', parent: 'elbowL', mirror: 'wristR' },
  shoulderR: { label: 'Right shoulder', parent: 'chest', mirror: 'shoulderL' },
  elbowR: { label: 'Right elbow', parent: 'shoulderR', mirror: 'elbowL' },
  wristR: { label: 'Right wrist', parent: 'elbowR', mirror: 'wristL' },
  hipL: { label: 'Left hip', parent: 'pelvis', mirror: 'hipR' },
  kneeL: { label: 'Left knee', parent: 'hipL', mirror: 'kneeR' },
  ankleL: { label: 'Left ankle', parent: 'kneeL', mirror: 'ankleR' },
  hipR: { label: 'Right hip', parent: 'pelvis', mirror: 'hipL' },
  kneeR: { label: 'Right knee', parent: 'hipR', mirror: 'kneeL' },
  ankleR: { label: 'Right ankle', parent: 'kneeR', mirror: 'ankleL' }
}

export interface Pose {
  joints: Record<JointName, Vec3>
  /** Pelvis shift from its standing position, as a fraction of the figure's height (X, Y, Z). */
  pelvisOffset: Vec3
}

export const MIN_HEIGHT = 0.9
export const MAX_HEIGHT = 2.1
export const DEFAULT_HEIGHT = 1.75
export const DEFAULT_BUILD = 0.5

export const FIGURE_COLORS = ['#c98f6f', '#6f9ac9', '#8fbf6f', '#c96f9a', '#c9b56f', '#9a7fc9', '#6fc0b5', '#c97f6f']

export function clampHeight(h: number): number {
  return Number.isFinite(h) ? Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h)) : DEFAULT_HEIGHT
}

export function clampBuild(b: number): number {
  return Number.isFinite(b) ? Math.min(1, Math.max(0, b)) : DEFAULT_BUILD
}

// ---------- Proportions ----------

export interface Proportions {
  height: number
  /** Joint heights above the floor when standing (metres). */
  pelvisY: number
  spineY: number
  chestY: number
  neckY: number
  headY: number
  shoulderY: number
  hipY: number
  kneeY: number
  ankleY: number
  /** Half the distance between the shoulder / hip joints. */
  shoulderHalf: number
  hipHalf: number
  /** Segment lengths. */
  upperArm: number
  forearm: number
  hand: number
  footLength: number
  /** Head size: height of the skull from the head joint to the crown. */
  headSize: number
  /** Body widths/depths and limb radii (metres). */
  pelvisWidth: number
  waistWidth: number
  chestWidth: number
  torsoDepth: number
  neckRadius: number
  upperArmRadius: number
  forearmRadius: number
  thighRadius: number
  shinRadius: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Segment sizes for a figure of `height` metres and `build` (0 slim … 1 broad).
 * Proportions blend from a child's (head about 1/5 of height, shorter legs) at 1 m to an
 * adult's (head about 1/7.5) from 1.7 m up.
 */
export function proportions(height: number, build: number): Proportions {
  const H = clampHeight(height)
  const adult = Math.min(1, Math.max(0, (H - 1.0) / 0.7))
  const width = lerp(0.82, 1.25, clampBuild(build)) // multiplier on widths and limb thickness

  const headFrac = lerp(0.2, 0.133, adult)
  const hipFrac = lerp(0.45, 0.52, adult)
  const ankleY = 0.045 * H
  const hipY = hipFrac * H
  const kneeY = ankleY + (hipY - ankleY) * 0.49
  const pelvisY = hipY + 0.04 * H
  const headSize = headFrac * H * 0.82 // head joint sits a little below the chin line
  const headY = H - headSize
  const neckY = headY - lerp(0.03, 0.045, adult) * H
  const torso = neckY - pelvisY
  const spineY = pelvisY + torso * 0.22
  const chestY = pelvisY + torso * 0.55
  const shoulderY = neckY - 0.015 * H
  const armScale = lerp(0.9, 1, adult)

  return {
    height: H,
    pelvisY,
    spineY,
    chestY,
    neckY,
    headY,
    shoulderY,
    hipY,
    kneeY,
    ankleY,
    shoulderHalf: lerp(0.105, 0.118, adult) * H * width,
    hipHalf: 0.052 * H * width,
    upperArm: 0.172 * H * armScale,
    forearm: 0.152 * H * armScale,
    hand: 0.1 * H * armScale,
    footLength: 0.15 * H,
    headSize,
    pelvisWidth: 0.19 * H * width,
    waistWidth: 0.15 * H * width,
    chestWidth: 0.2 * H * width,
    torsoDepth: 0.11 * H * width,
    neckRadius: 0.028 * H * width,
    upperArmRadius: 0.026 * H * width,
    forearmRadius: 0.021 * H * width,
    thighRadius: 0.042 * H * width,
    shinRadius: 0.03 * H * width
  }
}

// ---------- Joint limits ----------

type Range = [number, number]
export interface JointLimit {
  x: Range
  y: Range
  z: Range
}

// Left side and centre joints; right-side limits are mirrored from these.
const LEFT_LIMITS: Partial<Record<JointName, JointLimit>> = {
  spine: { x: [-30, 45], y: [-30, 30], z: [-30, 30] },
  chest: { x: [-20, 30], y: [-30, 30], z: [-20, 20] },
  neck: { x: [-35, 40], y: [-40, 40], z: [-25, 25] },
  head: { x: [-35, 30], y: [-40, 40], z: [-20, 20] },
  shoulderL: { x: [-180, 60], y: [-90, 90], z: [-30, 180] },
  elbowL: { x: [-150, 0], y: [-80, 80], z: [0, 0] },
  wristL: { x: [-80, 70], y: [0, 0], z: [-25, 25] },
  hipL: { x: [-120, 30], y: [-45, 45], z: [-30, 45] },
  kneeL: { x: [0, 150], y: [0, 0], z: [0, 0] },
  ankleL: { x: [-35, 50], y: [-15, 15], z: [-25, 25] }
}

const flip = ([lo, hi]: Range): Range => [-hi, -lo]

/** Realistic range for a joint, or null if it rotates freely (the pelvis). */
export function jointLimit(joint: JointName): JointLimit | null {
  const own = LEFT_LIMITS[joint]
  if (own) return own
  const mirrored = LEFT_LIMITS[JOINTS[joint].mirror]
  if (!mirrored || JOINTS[joint].mirror === joint) return null
  return { x: mirrored.x, y: flip(mirrored.y), z: flip(mirrored.z) }
}

const clamp = (v: number, [lo, hi]: Range) => Math.min(hi, Math.max(lo, v))

export function clampJoint(joint: JointName, rotation: Vec3): Vec3 {
  const limit = jointLimit(joint)
  if (!limit) return rotation
  // `|| 0` turns -0 into 0
  return [clamp(rotation[0], limit.x) || 0, clamp(rotation[1], limit.y) || 0, clamp(rotation[2], limit.z) || 0]
}

export function withinLimits(joint: JointName, rotation: Vec3): boolean {
  const c = clampJoint(joint, rotation)
  return c.every((v, i) => Math.abs(v - rotation[i]) < 1e-9)
}

// ---------- Saved poses ----------

/** A pose the user saved, in the project or in their app-wide library. */
export interface SavedPose {
  id: string
  name: string
  pose: Pose
}

const isVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))

/** A clean copy of `raw` as a pose (missing joints at rest), or null if it isn't a pose. */
export function sanitizePose(raw: unknown): Pose | null {
  const r = raw as Partial<Pose> | null
  if (!r || typeof r !== 'object' || !r.joints || typeof r.joints !== 'object') return null
  const pose = restPose()
  for (const j of JOINT_NAMES) {
    const v = (r.joints as Record<string, unknown>)[j]
    if (v !== undefined && !isVec3(v)) return null
    if (v) pose.joints[j] = [...v] as Vec3
  }
  if (r.pelvisOffset !== undefined) {
    if (!isVec3(r.pelvisOffset)) return null
    pose.pelvisOffset = [...r.pelvisOffset] as Vec3
  }
  return pose
}

/** Keep only well-formed saved poses from a list read from disk. */
export function sanitizeSavedPoses(raw: unknown): SavedPose[] {
  if (!Array.isArray(raw)) return []
  const out: SavedPose[] = []
  for (const item of raw) {
    const pose = sanitizePose(item?.pose)
    if (pose && typeof item.id === 'string' && typeof item.name === 'string') {
      out.push({ id: item.id, name: item.name, pose })
    }
  }
  return out
}

// ---------- Poses ----------

export function restPose(): Pose {
  const joints = {} as Record<JointName, Vec3>
  for (const j of JOINT_NAMES) joints[j] = [0, 0, 0]
  return { joints, pelvisOffset: [0, 0, 0] }
}

/** Swap left and right: each side takes the other's pose, reflected across the body's centre line. */
export function mirrorPose(pose: Pose): Pose {
  const joints = {} as Record<JointName, Vec3>
  for (const j of JOINT_NAMES) {
    const [x, y, z] = pose.joints[JOINTS[j].mirror]
    joints[j] = [x, -y || 0, -z || 0]
  }
  const [ox, oy, oz] = pose.pelvisOffset
  return { joints, pelvisOffset: [-ox || 0, oy, oz] }
}

type PoseSpec = { joints: Partial<Record<JointName, Vec3>>; pelvisOffset?: Vec3 }

function build(spec: PoseSpec): Pose {
  const pose = restPose()
  for (const [j, r] of Object.entries(spec.joints)) pose.joints[j as JointName] = r
  if (spec.pelvisOffset) pose.pelvisOffset = spec.pelvisOffset
  return pose
}

const armsRelaxed: Partial<Record<JointName, Vec3>> = {
  shoulderL: [0, 0, 6],
  shoulderR: [0, 0, -6],
  elbowL: [-8, 0, 0],
  elbowR: [-8, 0, 0]
}

export interface PresetInfo {
  label: string
  /** Presets that move the hips work out the offset from the figure's own leg lengths. */
  make: (p: Proportions) => Pose
}

export const PRESET_NAMES = [
  'standing',
  'walking',
  'sitting',
  'pointing',
  'armsCrossed',
  'lookingOverShoulder',
  'lyingDown'
] as const
export type PresetName = (typeof PRESET_NAMES)[number]

export const POSE_PRESETS: Record<PresetName, PresetInfo> = {
  standing: { label: 'Standing', make: () => build({ joints: armsRelaxed }) },
  walking: {
    label: 'Walking',
    make: () =>
      build({
        joints: {
          hipL: [-25, 0, 0],
          kneeL: [10, 0, 0],
          ankleL: [-5, 0, 0],
          hipR: [15, 0, 0],
          kneeR: [25, 0, 0],
          ankleR: [15, 0, 0],
          shoulderL: [18, 0, 6],
          elbowL: [-10, 0, 0],
          shoulderR: [-22, 0, -6],
          elbowR: [-25, 0, 0],
          chest: [0, 6, 0]
        },
        pelvisOffset: [0, -0.018, 0]
      })
  },
  sitting: {
    label: 'Sitting',
    make: (p: Proportions) =>
      build({
        joints: {
          hipL: [-90, 0, 4],
          hipR: [-90, 0, -4],
          kneeL: [90, 0, 0],
          kneeR: [90, 0, 0],
          spine: [-5, 0, 0],
          // Hands resting on the thighs
          shoulderL: [-12, 0, 8],
          shoulderR: [-12, 0, -8],
          elbowL: [-48, 0, 0],
          elbowR: [-48, 0, 0]
        },
        // Seat height = knee height: drop the hips by the length of the thigh.
        pelvisOffset: [0, (p.kneeY - p.hipY) / p.height, 0]
      })
  },
  pointing: {
    label: 'Pointing',
    make: () =>
      build({
        joints: {
          shoulderL: [0, 0, 6],
          elbowL: [-8, 0, 0],
          shoulderR: [-88, 0, -4],
          elbowR: [-4, 0, 0],
          chest: [0, -10, 0],
          head: [0, -8, 0]
        }
      })
  },
  armsCrossed: {
    label: 'Arms crossed',
    make: () =>
      build({
        joints: {
          shoulderL: [-25, -70, 6],
          elbowL: [-95, 0, 0],
          shoulderR: [-25, 70, -6],
          elbowR: [-110, 0, 0]
        }
      })
  },
  lookingOverShoulder: {
    label: 'Looking over shoulder',
    make: () =>
      build({
        joints: {
          ...armsRelaxed,
          spine: [0, 20, 0],
          chest: [0, 25, 0],
          neck: [0, 35, 0],
          head: [-5, 35, 0]
        }
      })
  },
  lyingDown: {
    label: 'Lying down',
    make: (p: Proportions) =>
      build({
        joints: {
          pelvis: [-90, 0, 0],
          shoulderL: [0, 0, 8],
          shoulderR: [0, 0, -8]
        },
        // Lower the hips to rest on the floor (half the body's depth off the ground).
        pelvisOffset: [0, (p.torsoDepth * 0.55 - p.pelvisY) / p.height, 0]
      })
  }
}

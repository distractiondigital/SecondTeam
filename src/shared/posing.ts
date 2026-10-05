import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three'
import { clampJoint, JOINT_NAMES, JOINTS, type JointName, type Pose, type Proportions } from './mannequin'
import type { Vec3 } from './project'

// Posing 2: where the joints are (forward kinematics), reaching a hand or foot to a point
// (two-bone inverse kinematics), planted hands/feet, and looking at a target. Pure maths in the
// figure's own space: origin on the floor between the feet, facing +Z, its left is +X, metres.
// Joint conventions are in mannequin.ts.

export type LimbEnd = 'wristL' | 'wristR' | 'ankleL' | 'ankleR'
export const LIMB_ENDS: LimbEnd[] = ['wristL', 'wristR', 'ankleL', 'ankleR']

/** A planted hand or foot: where its wrist/ankle is and how it's turned, in the figure's space. */
export interface Plant {
  position: Vec3
  /** XYZ Euler degrees of the hand/foot in the figure's space. */
  rotation: Vec3
}
export type Plants = Partial<Record<LimbEnd, Plant>>

/** What a head looks at: the shot's camera, another node (a figure means its face), or a point in the world. */
export type LookAt = { kind: 'camera' } | { kind: 'node'; id: string } | { kind: 'point'; position: Vec3 }

const CHAINS: Record<LimbEnd, [JointName, JointName, JointName]> = {
  wristL: ['shoulderL', 'elbowL', 'wristL'],
  wristR: ['shoulderR', 'elbowR', 'wristR'],
  ankleL: ['hipL', 'kneeL', 'ankleL'],
  ankleR: ['hipR', 'kneeR', 'ankleR']
}

/** The joints a planted end (or a reach) drives. */
export function chainOf(end: LimbEnd): [JointName, JointName, JointName] {
  return CHAINS[end]
}

const isArm = (end: LimbEnd) => end.startsWith('wrist')

const quat = (r: Vec3) =>
  new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(r[0]), MathUtils.degToRad(r[1]), MathUtils.degToRad(r[2]), 'XYZ'))
const r4 = (n: number) => Math.round(n * 10000) / 10000 || 0
export const degrees = (q: Quaternion): Vec3 => {
  const e = new Euler().setFromQuaternion(q, 'XYZ')
  return [r4(MathUtils.radToDeg(e.x)), r4(MathUtils.radToDeg(e.y)), r4(MathUtils.radToDeg(e.z))]
}

/** Each joint's offset from its parent joint at rest (the pelvis: from the figure's origin). */
export function jointOffsets(p: Proportions, pelvisOffset: Vec3 = [0, 0, 0]): Record<JointName, Vec3> {
  const [ox, oy, oz] = pelvisOffset
  const thigh = p.hipY - p.kneeY
  const shin = p.kneeY - p.ankleY
  return {
    pelvis: [ox * p.height, p.pelvisY + oy * p.height, oz * p.height],
    spine: [0, p.spineY - p.pelvisY, 0],
    chest: [0, p.chestY - p.spineY, 0],
    neck: [0, p.neckY - p.chestY, 0],
    head: [0, p.headY - p.neckY, 0],
    shoulderL: [p.shoulderHalf, p.shoulderY - p.chestY, 0],
    elbowL: [0, -p.upperArm, 0],
    wristL: [0, -p.forearm, 0],
    shoulderR: [-p.shoulderHalf, p.shoulderY - p.chestY, 0],
    elbowR: [0, -p.upperArm, 0],
    wristR: [0, -p.forearm, 0],
    hipL: [p.hipHalf, p.hipY - p.pelvisY, 0],
    kneeL: [0, -thigh, 0],
    ankleL: [0, -shin, 0],
    hipR: [-p.hipHalf, p.hipY - p.pelvisY, 0],
    kneeR: [0, -thigh, 0],
    ankleR: [0, -shin, 0]
  }
}

export interface JointFrame {
  position: Vector3
  rotation: Quaternion
}

/** Every joint's position and turn in the figure's space for a pose. */
export function forwardKinematics(pose: Pose, p: Proportions): Record<JointName, JointFrame> {
  const offsets = jointOffsets(p, pose.pelvisOffset)
  const out = {} as Record<JointName, JointFrame>
  for (const j of JOINT_NAMES) {
    const parent = JOINTS[j].parent
    const local = quat(pose.joints[j])
    const offset = new Vector3(...offsets[j])
    if (!parent) out[j] = { position: offset, rotation: local }
    else {
      const pf = out[parent]
      out[j] = { position: pf.position.clone().add(offset.applyQuaternion(pf.rotation)), rotation: pf.rotation.clone().multiply(local) }
    }
  }
  return out
}

/** The turn (figure space) of a pose's joint. */
function worldRotation(frames: Record<JointName, JointFrame>, joint: JointName): Quaternion {
  return frames[joint].rotation.clone()
}

/** How far (degrees, summed over X/Y/Z) a rotation is outside a joint's range; 0 if inside. */
function limitExcess(joint: JointName, rotation: Vec3): number {
  const clamped = clampJoint(joint, rotation)
  return rotation.reduce((sum, v, i) => sum + Math.abs(v - clamped[i]), 0)
}

/** Swing/twist split: the part of `q` that turns about `axis` (a unit vector), as an angle in radians. */
function twistAngle(q: Quaternion, axis: Vector3): number {
  const projection = axis.clone().multiplyScalar(axis.dot(new Vector3(q.x, q.y, q.z)))
  const twist = new Quaternion(projection.x, projection.y, projection.z, q.w)
  if (twist.lengthSq() < 1e-12) return 0
  twist.normalize()
  const angle = 2 * Math.atan2(new Vector3(twist.x, twist.y, twist.z).dot(axis), twist.w)
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

export interface ReachOptions {
  /** Keep joints inside their realistic ranges. */
  limits: boolean
  /**
   * The hand/foot's wanted turn in the figure's space. Without it, a hand keeps its angle to the
   * forearm and a foot keeps its turn in the world (stays level).
   */
  endRotation?: Quaternion
}

/**
 * Bend a limb so its wrist/ankle reaches `target` (figure space). The elbow/knee keeps bending the
 * way it already did (no flipping); out of reach, the limb points straight at the target.
 * Returns the new rotations for the limb's three joints.
 */
export function solveReach(pose: Pose, p: Proportions, end: LimbEnd, target: Vector3, options: ReachOptions): Partial<Record<JointName, Vec3>> {
  const [rootJ, midJ, endJ] = CHAINS[end]
  const arm = isArm(end)
  const frames = forwardKinematics(pose, p)
  const parentJ = JOINTS[rootJ].parent!
  const parentRot = worldRotation(frames, parentJ)
  const A = frames[rootJ].position.clone()
  const B = frames[midJ].position.clone()
  const C = frames[endJ].position.clone()
  const l1 = arm ? p.upperArm : p.hipY - p.kneeY
  const l2 = arm ? p.forearm : p.kneeY - p.ankleY
  const endBefore = options.endRotation ?? (arm ? null : worldRotation(frames, endJ))

  const toTarget = target.clone().sub(A)
  // Out of reach: as far as the limb goes, straight at the target. Too close: as folded as it gets.
  const reach = MathUtils.clamp(toTarget.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.9999)
  const u = toTarget.lengthSq() > 1e-10 ? toTarget.clone().normalize() : new Vector3(0, -1, 0)

  // Which way the elbow/knee points: as it is now, or the natural way (elbows back, knees forward).
  const natural = new Vector3(0, 0, arm ? -1 : 1).applyQuaternion(parentRot)
  const bent = B.clone().sub(A).sub(u.clone().multiplyScalar(B.clone().sub(A).dot(u)))
  const straightNow = C.clone().sub(A).length() > (l1 + l2) * 0.995
  let pole = !straightNow && bent.lengthSq() > 1e-8 ? bent.normalize() : natural.clone()
  pole.sub(u.clone().multiplyScalar(pole.dot(u)))
  if (pole.lengthSq() < 1e-8) pole = new Vector3(1, 0, 0).sub(u.clone().multiplyScalar(u.x))
  pole.normalize()

  /** The limb bent toward `pole`: the root's local rotation and the elbow/knee bend (radians, signed). */
  const bendToward = (pole: Vector3): { root: Vec3; midX: number } => {
    // Law of cosines: the elbow/knee sits on the circle of points l1 from A and l2 from the target.
    const cosA = MathUtils.clamp((l1 * l1 + reach * reach - l2 * l2) / (2 * l1 * reach), -1, 1)
    const sinA = Math.sqrt(1 - cosA * cosA)
    const mid = A.clone().add(u.clone().multiplyScalar(l1 * cosA).add(pole.clone().multiplyScalar(l1 * sinA)))
    const tip = A.clone().add(u.clone().multiplyScalar(reach))
    const upper = mid.clone().sub(A).normalize()
    const lower = tip.clone().sub(mid).normalize()
    // Root frame: its -Y along the upper bone; its Z toward where the lower bone swings (forward
    // for a forearm, backward for a shin), so the elbow/knee is a pure hinge about its X.
    const yAxis = upper.clone().negate()
    let swing = lower.clone().sub(upper.clone().multiplyScalar(lower.dot(upper)))
    if (swing.lengthSq() < 1e-8) swing = pole.clone().negate()
    swing.normalize()
    const zAxis = arm ? swing : swing.clone().negate()
    const xAxis = new Vector3().crossVectors(yAxis, zAxis).normalize()
    const rootWorld = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(xAxis, yAxis, zAxis))
    const bend = Math.acos(MathUtils.clamp(upper.dot(lower), -1, 1))
    return { root: degrees(parentRot.clone().invert().multiply(rootWorld)), midX: arm ? -bend : bend }
  }

  // With limits on, an elbow/knee pointing a little differently often stays in range where the
  // first choice doesn't (e.g. a knee turned out to put a foot up on a box beside the figure):
  // swing it around the reach line and keep the nearest direction that fits best.
  let chosen = bendToward(pole)
  if (options.limits && limitExcess(rootJ, chosen.root) > 0) {
    let best = { excess: limitExcess(rootJ, chosen.root), turn: 0, solved: chosen }
    for (let k = 1; k <= 18; k++) {
      for (const sign of [1, -1]) {
        const turn = sign * k * 10
        const solved = bendToward(pole.clone().applyAxisAngle(u, MathUtils.degToRad(turn)))
        const excess = limitExcess(rootJ, solved.root)
        if (excess < best.excess - 1e-6) best = { excess, turn, solved }
      }
    }
    chosen = best.solved
  }
  const midX = chosen.midX

  let rootLocal = chosen.root
  if (options.limits) rootLocal = clampJoint(rootJ, rootLocal)
  const rootW = parentRot.clone().multiply(quat(rootLocal))
  let midLocal: Vec3 = [r4(MathUtils.radToDeg(midX)), 0, 0]
  let endLocal = pose.joints[endJ]

  if (endBefore) {
    // Hand/foot turned as wanted: a forearm can carry the twist (an elbow's Y), the wrist the rest.
    const mid0 = rootW.clone().multiply(quat(midLocal))
    let local = mid0.clone().invert().multiply(endBefore)
    if (arm) {
      const twist = MathUtils.radToDeg(twistAngle(local, new Vector3(0, 1, 0)))
      midLocal = [midLocal[0], r4(twist), 0]
      local = rootW.clone().multiply(quat(midLocal)).invert().multiply(endBefore)
    }
    endLocal = degrees(local)
  }
  if (options.limits) {
    midLocal = clampJoint(midJ, midLocal)
    endLocal = clampJoint(endJ, endLocal)
  }
  return { [rootJ]: rootLocal, [midJ]: midLocal, [endJ]: endLocal }
}

/** Shares of a look-at turn: chest, then neck, then head (of what's left at each step). */
const LOOK_SHARES: [JointName, number][] = [
  ['chest', 0.15],
  ['neck', 0.35 / 0.85],
  ['head', 1]
]

/** Where the eyes are, for aiming the face (figure space). */
export function eyePoint(frames: Record<JointName, JointFrame>, p: Proportions): Vector3 {
  return frames.head.position.clone().add(new Vector3(0, p.headSize * 0.45, p.headSize * 0.35).applyQuaternion(frames.head.rotation))
}

/** Turn chest, neck and head so the face points at `target` (figure space), keeping the head's own tilt. */
export function solveLookAt(pose: Pose, p: Proportions, target: Vector3, limits: boolean): Partial<Record<JointName, Vec3>> {
  const working: Pose = { ...pose, joints: { ...pose.joints } }
  for (const [joint, share] of LOOK_SHARES) {
    const frames = forwardKinematics(working, p)
    const forward = new Vector3(0, 0, 1).applyQuaternion(frames.head.rotation).normalize()
    const want = target.clone().sub(eyePoint(frames, p))
    if (want.lengthSq() < 1e-6) break
    want.normalize()
    const turn = new Quaternion().slerp(new Quaternion().setFromUnitVectors(forward, want), share)
    const parentRot = frames[JOINTS[joint].parent!].rotation
    const next = turn.multiply(frames[joint].rotation)
    let local = degrees(parentRot.clone().invert().multiply(next))
    if (limits) local = clampJoint(joint, local)
    working.joints[joint] = local
  }
  return { chest: working.joints.chest, neck: working.joints.neck, head: working.joints.head }
}

/** The figure's own space → its node's space, from where a hand/foot is in a pose. */
export function plantFromPose(pose: Pose, p: Proportions, end: LimbEnd): Plant {
  const frames = forwardKinematics(pose, p)
  const f = frames[end]
  return { position: f.position.toArray().map(r4) as Vec3, rotation: degrees(f.rotation) }
}

export interface PosedFigure {
  pose: Pose
  plants?: Plants
  limits: boolean
}

/**
 * The pose that gets drawn: the stored pose, with planted hands/feet reaching their spots and the
 * head looking at `lookTarget` (figure space; null = no look-at).
 */
export function effectivePose(figure: PosedFigure, p: Proportions, lookTarget: Vector3 | null): Pose {
  const plants = figure.plants ?? {}
  if (Object.keys(plants).length === 0 && !lookTarget) return figure.pose
  const pose: Pose = { ...figure.pose, joints: { ...figure.pose.joints } }
  for (const end of LIMB_ENDS) {
    const plant = plants[end]
    if (!plant) continue
    Object.assign(pose.joints, solveReach(pose, p, end, new Vector3(...plant.position), { limits: figure.limits, endRotation: quat(plant.rotation) }))
  }
  if (lookTarget) Object.assign(pose.joints, solveLookAt(pose, p, lookTarget, figure.limits))
  return pose
}

/** Joints worked out by plants / look-at (their rotate rings are hidden). */
export function drivenJoints(plants: Plants | undefined, looking: boolean): Set<JointName> {
  const out = new Set<JointName>()
  for (const end of LIMB_ENDS) if (plants?.[end]) for (const j of CHAINS[end]) out.add(j)
  if (looking) {
    out.add('neck')
    out.add('head')
  }
  return out
}

const isVec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))

/** Planted hands/feet from a file (anything damaged is dropped). */
export function sanitizePlants(raw: unknown): Plants {
  const out: Plants = {}
  if (!raw || typeof raw !== 'object') return out
  for (const end of LIMB_ENDS) {
    const v = (raw as Record<string, unknown>)[end] as Record<string, unknown> | undefined
    if (v && isVec(v.position) && isVec(v.rotation)) out[end] = { position: [...v.position], rotation: [...v.rotation] }
  }
  return out
}

/** A look-at target from a file (null = off). */
export function sanitizeLookAt(raw: unknown): LookAt | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  if (v.kind === 'camera') return { kind: 'camera' }
  if (v.kind === 'node' && typeof v.id === 'string' && v.id) return { kind: 'node', id: v.id }
  if (v.kind === 'point' && isVec(v.position)) return { kind: 'point', position: [...v.position] }
  return null
}

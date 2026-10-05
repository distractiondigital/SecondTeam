import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { mirrorPose, POSE_PRESETS, proportions, restPose, withinLimits, type Pose } from './mannequin'
import {
  drivenJoints,
  effectivePose,
  eyePoint,
  forwardKinematics,
  plantFromPose,
  solveLookAt,
  solveReach,
  type LimbEnd
} from './posing'

const p = proportions(1.75, 0.5)
const child = proportions(1.1, 0.3)
const withJoints = (pose: Pose, joints: Partial<Pose['joints']>): Pose => ({ ...pose, joints: { ...pose.joints, ...joints } })
const posAfter = (pose: Pose, joints: Partial<Pose['joints']>, end: LimbEnd, props = p) =>
  forwardKinematics(withJoints(pose, joints), props)[end].position

describe('forward kinematics', () => {
  it('places the rest pose like the mannequin', () => {
    const f = forwardKinematics(restPose(), p)
    expect(f.wristL.position.x).toBeCloseTo(p.shoulderHalf, 6)
    expect(f.wristL.position.y).toBeCloseTo(p.shoulderY - p.upperArm - p.forearm, 6)
    expect(f.ankleR.position.distanceTo(new Vector3(-p.hipHalf, p.ankleY, 0))).toBeLessThan(1e-9)
    expect(f.head.position.y).toBeCloseTo(p.headY, 6)
  })

  it('moves the pelvis with its offset', () => {
    const pose = { ...restPose(), pelvisOffset: [0, -0.1, 0.05] as [number, number, number] }
    const f = forwardKinematics(pose, p)
    expect(f.ankleL.position.y).toBeCloseTo(p.ankleY - 0.1 * p.height, 6)
    expect(f.ankleL.position.z).toBeCloseTo(0.05 * p.height, 6)
  })
})

describe('reach (two-bone IK)', () => {
  const targets: [LimbEnd, Vector3][] = [
    ['wristL', new Vector3(0.35, 1.2, 0.35)],
    ['wristL', new Vector3(0.1, 1.5, 0.45)],
    ['wristR', new Vector3(-0.3, 1.0, 0.3)],
    ['ankleL', new Vector3(0.15, 0.3, 0.3)],
    ['ankleR', new Vector3(-0.12, 0.25, -0.15)]
  ]
  for (const [end, target] of targets) {
    it(`brings ${end} to ${target.toArray()}`, () => {
      for (const props of [p, child]) {
        const t = target.clone().multiplyScalar(props.height / 1.75)
        const pose = POSE_PRESETS.standing.make(props)
        const joints = solveReach(pose, props, end, t, { limits: false })
        expect(posAfter(pose, joints, end, props).distanceTo(t)).toBeLessThan(1e-3)
      }
    })
  }

  it('reaches within joint limits for natural targets', () => {
    const pose = POSE_PRESETS.standing.make(p)
    const t = new Vector3(0.3, 1.25, 0.35)
    const joints = solveReach(pose, p, 'wristL', t, { limits: true })
    for (const [j, r] of Object.entries(joints)) expect(withinLimits(j as never, r!)).toBe(true)
    expect(posAfter(pose, joints, 'wristL').distanceTo(t)).toBeLessThan(0.01)
  })

  it('points straight at a target out of reach', () => {
    const pose = restPose()
    const shoulder = forwardKinematics(pose, p).shoulderL.position
    const t = shoulder.clone().add(new Vector3(0, 0, 3))
    const wrist = posAfter(pose, solveReach(pose, p, 'wristL', t, { limits: false }), 'wristL')
    const dir = wrist.clone().sub(shoulder).normalize()
    expect(dir.z).toBeGreaterThan(0.999)
    expect(wrist.distanceTo(shoulder)).toBeCloseTo(p.upperArm + p.forearm, 2)
  })

  it('mirrors between the sides', () => {
    const pose = POSE_PRESETS.standing.make(p)
    const left = solveReach(pose, p, 'wristL', new Vector3(0.3, 1.1, 0.3), { limits: false })
    const right = solveReach(mirrorPose(pose), p, 'wristR', new Vector3(-0.3, 1.1, 0.3), { limits: false })
    const l = left.shoulderL!
    const r = right.shoulderR!
    expect(r[0]).toBeCloseTo(l[0], 2)
    expect(r[1]).toBeCloseTo(-l[1], 2)
    expect(r[2]).toBeCloseTo(-l[2], 2)
    expect(right.elbowR![0]).toBeCloseTo(left.elbowL![0], 2)
  })

  it('bends elbows forward and knees backward', () => {
    const pose = restPose()
    const arm = solveReach(pose, p, 'wristL', new Vector3(p.shoulderHalf, 1.25, 0.25), { limits: false })
    expect(arm.elbowL![0]).toBeLessThan(0)
    const leg = solveReach(pose, p, 'ankleL', new Vector3(p.hipHalf, 0.35, 0.1), { limits: false })
    expect(leg.kneeL![0]).toBeGreaterThan(0)
  })
})

describe('planted hands and feet', () => {
  it('keep their spot while the hips drop', () => {
    const base = POSE_PRESETS.standing.make(p)
    const plants = { ankleL: plantFromPose(base, p, 'ankleL'), ankleR: plantFromPose(base, p, 'ankleR') }
    const squat = { ...base, pelvisOffset: [0, -0.15, 0] as [number, number, number] }
    const posed = effectivePose({ pose: squat, plants, limits: true }, p, null)
    const f = forwardKinematics(posed, p)
    expect(f.ankleL.position.distanceTo(new Vector3(...plants.ankleL.position))).toBeLessThan(0.005)
    expect(f.ankleR.position.distanceTo(new Vector3(...plants.ankleR.position))).toBeLessThan(0.005)
    // The knees bend. Without limits the feet stay turned exactly as they were; with limits an
    // ankle that can't flex that far tips the foot (like lifting a heel), within its range.
    expect(posed.joints.kneeL[0]).toBeGreaterThan(30)
    const free = forwardKinematics(effectivePose({ pose: squat, plants, limits: false }, p, null), p)
    expect(free.ankleL.rotation.angleTo(forwardKinematics(base, p).ankleL.rotation)).toBeLessThan(0.01)
    expect(withinLimits('ankleL', posed.joints.ankleL)).toBe(true)
  })

  it('keep a foot up on a box beside the figure within joint limits (the knee turns out)', () => {
    const base = POSE_PRESETS.standing.make(p)
    const plants = { ankleL: { position: [0.547, 0.56, 0.446] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] } }
    const crouch = { ...base, pelvisOffset: [0.011, -0.113, 0.018] as [number, number, number] }
    const posed = effectivePose({ pose: crouch, plants, limits: true }, p, null)
    expect(forwardKinematics(posed, p).ankleL.position.distanceTo(new Vector3(...plants.ankleL.position))).toBeLessThan(0.03)
    for (const j of ['hipL', 'kneeL'] as const) expect(withinLimits(j, posed.joints[j])).toBe(true)
  })

  it('lists the joints the solver drives', () => {
    const plants = { wristR: plantFromPose(restPose(), p, 'wristR') }
    expect([...drivenJoints(plants, true)].sort()).toEqual(['elbowR', 'head', 'neck', 'shoulderR', 'wristR'])
    expect(drivenJoints({}, false).size).toBe(0)
  })
})

describe('look at', () => {
  it('turns the face toward the target and shares the turn', () => {
    const pose = POSE_PRESETS.standing.make(p)
    const target = new Vector3(2, 1.6, 1.5) // off to the figure's left and front
    const joints = solveLookAt(pose, p, target, true)
    const after = withJoints(pose, joints)
    const f = forwardKinematics(after, p)
    const forward = new Vector3(0, 0, 1).applyQuaternion(f.head.rotation)
    const want = target.clone().sub(eyePoint(f, p)).normalize()
    expect(forward.angleTo(want)).toBeLessThan((5 * Math.PI) / 180)
    // Everyone turns a bit to the left (+Y), the head most.
    expect(joints.chest![1]).toBeGreaterThan(0)
    expect(joints.neck![1]).toBeGreaterThan(0)
    expect(Math.abs(joints.head![1])).toBeGreaterThan(Math.abs(joints.chest![1]) * 0.5)
  })

  it('stops at the neck and head limits for a target behind', () => {
    const joints = solveLookAt(restPose(), p, new Vector3(0, 1.6, -3), true)
    expect(withinLimits('head', joints.head!)).toBe(true)
    expect(withinLimits('neck', joints.neck!)).toBe(true)
  })
})

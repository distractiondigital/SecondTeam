import { describe, expect, it } from 'vitest'
import {
  clampJoint,
  JOINT_NAMES,
  jointLimit,
  mirrorPose,
  POSE_PRESETS,
  PRESET_NAMES,
  proportions,
  withinLimits
} from './mannequin'

describe('proportions', () => {
  it('puts the top of the head at the figure height', () => {
    for (const h of [1.0, 1.4, 1.75, 2.0]) {
      const p = proportions(h, 0.5)
      expect(p.headY + p.headSize).toBeCloseTo(h, 6)
    }
  })

  it('gives children a bigger head and shorter legs relative to their height', () => {
    const child = proportions(1.1, 0.5)
    const adult = proportions(1.75, 0.5)
    expect(child.headSize / child.height).toBeGreaterThan(adult.headSize / adult.height)
    expect(child.hipY / child.height).toBeLessThan(adult.hipY / adult.height)
  })

  it('stacks the joints in the right order', () => {
    const p = proportions(1.75, 0.5)
    const order = [p.ankleY, p.kneeY, p.hipY, p.pelvisY, p.spineY, p.chestY, p.shoulderY, p.neckY, p.headY]
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('makes a broad build wider', () => {
    expect(proportions(1.75, 1).shoulderHalf).toBeGreaterThan(proportions(1.75, 0).shoulderHalf)
  })
})

describe('joint limits', () => {
  it('lets knees and elbows bend only one way', () => {
    expect(clampJoint('kneeL', [-40, 0, 0])).toEqual([0, 0, 0])
    expect(clampJoint('kneeR', [200, 0, 0])).toEqual([150, 0, 0])
    expect(clampJoint('elbowL', [30, 20, 10])).toEqual([0, 20, 0])
  })

  it('mirrors limits on the right side', () => {
    // Left arm can swing out to the left (+Z); the right arm swings out to the right (-Z).
    expect(clampJoint('shoulderL', [0, 0, 170])).toEqual([0, 0, 170])
    expect(clampJoint('shoulderR', [0, 0, 170])).toEqual([0, 0, 30])
    expect(clampJoint('shoulderR', [0, 0, -170])).toEqual([0, 0, -170])
  })

  it('leaves the pelvis free', () => {
    expect(jointLimit('pelvis')).toBeNull()
    expect(clampJoint('pelvis', [-90, 200, 0])).toEqual([-90, 200, 0])
  })
})

describe('poses', () => {
  const p = proportions(1.75, 0.5)

  it('every preset is a natural pose (inside the limits)', () => {
    for (const name of PRESET_NAMES) {
      const pose = POSE_PRESETS[name].make(p)
      for (const j of JOINT_NAMES) {
        expect(withinLimits(j, pose.joints[j]), `${name}: ${j} ${pose.joints[j]}`).toBe(true)
      }
    }
  })

  it('mirroring twice gives back the same pose', () => {
    for (const name of PRESET_NAMES) {
      const pose = POSE_PRESETS[name].make(p)
      expect(mirrorPose(mirrorPose(pose))).toEqual(pose)
    }
  })

  it('mirroring a right-hand point makes a left-hand point', () => {
    const pointing = POSE_PRESETS.pointing.make(p)
    const mirrored = mirrorPose(pointing)
    expect(mirrored.joints.shoulderL[0]).toBe(pointing.joints.shoulderR[0])
    expect(mirrored.joints.shoulderL[2]).toBe(-pointing.joints.shoulderR[2])
    expect(mirrored.joints.chest[1]).toBe(-pointing.joints.chest[1])
  })

  it('sitting lowers the hips to knee height', () => {
    const sitting = POSE_PRESETS.sitting.make(p)
    expect(p.hipY + sitting.pelvisOffset[1] * p.height).toBeCloseTo(p.kneeY, 6)
  })
})

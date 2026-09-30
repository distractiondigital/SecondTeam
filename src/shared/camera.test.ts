import { describe, expect, it } from 'vitest'
import {
  cameraAngle,
  compareShotNumbers,
  deliveryFrame,
  fieldOfView,
  guideRatio,
  nextShotName,
  nextShotNumber,
  renumberShot,
  shotLetterIndex,
  shotLetters,
  panTiltRoll,
  rotationFromPanTiltRoll,
  SENSOR_PRESETS,
  shotSize,
  type CameraOptics
} from './camera'

const ff = (over: Partial<CameraOptics> = {}): CameraOptics => ({
  sensor: { preset: 'ff', ...SENSOR_PRESETS.ff },
  focalLength: 35,
  squeeze: 1,
  delivery: 'sensor',
  ...over
})

describe('field of view', () => {
  it('matches known lenses on full frame', () => {
    expect(fieldOfView(ff()).horizontal).toBeCloseTo(54.43, 1)
    expect(fieldOfView(ff({ focalLength: 50 })).vertical).toBeCloseTo(26.99, 1)
  })

  it('anamorphic squeeze widens the horizontal view', () => {
    const plain = deliveryFrame(ff())
    const squeezed = deliveryFrame(ff({ squeeze: 2 }))
    expect(squeezed.width).toBeCloseTo(plain.width * 2)
    expect(squeezed.height).toBeCloseTo(plain.height)
    expect(fieldOfView(ff({ squeeze: 2 })).horizontal).toBeGreaterThan(fieldOfView(ff()).horizontal)
  })

  it('crops the delivery frame to the chosen guide', () => {
    const wide = deliveryFrame(ff({ delivery: '2.39' })) // wider than 3:2: full width, less height
    expect(wide.width).toBeCloseTo(36)
    expect(wide.height).toBeCloseTo(36 / 2.39)
    const tall = deliveryFrame(ff({ delivery: '9:16' })) // taller: full height, less width
    expect(tall.height).toBeCloseTo(24)
    expect(tall.width).toBeCloseTo(24 * (9 / 16))
    expect(guideRatio('custom:2.2')).toBe(2.2)
    expect(guideRatio('nonsense')).toBeNull()
  })
})

describe('shot numbers', () => {
  it('sorts naturally', () => {
    const shots = ['13', '12B', '2', 'Insert', '12', '12A']
    expect([...shots].sort(compareShotNumbers)).toEqual(['2', '12', '12A', '12B', '13', 'Insert'])
  })

  it('letters shots A-Z without I and O, then AA', () => {
    expect([0, 1, 7, 8, 12, 13, 23, 24, 25].map(shotLetters)).toEqual(['A', 'B', 'H', 'J', 'N', 'P', 'Z', 'AA', 'AB'])
    for (const n of [0, 5, 23, 24, 100, 600]) expect(shotLetterIndex(shotLetters(n))).toBe(n)
    expect(shotLetterIndex('I')).toBe(-1)
  })

  it('names the next shot in a scene and renumbers shots with their scene', () => {
    expect(nextShotName(1, [])).toBe('1A')
    expect(nextShotName(1, ['1A', '1B', '2A', 'Insert'])).toBe('1C')
    expect(nextShotName(3, ['3H'])).toBe('3J')
    expect(renumberShot('3B', 3, 5)).toBe('5B')
    expect(renumberShot('Insert', 3, 5)).toBe('Insert')
    expect(['1AA', '1Z', '1B', '2A', '1A'].sort(compareShotNumbers)).toEqual(['1A', '1B', '1Z', '1AA', '2A'])
  })

  it('suggests the next number', () => {
    expect(nextShotNumber([])).toBe('1')
    expect(nextShotNumber(['1', '12A', '3'])).toBe('13')
  })
})

describe('pan, tilt and roll', () => {
  it('round-trips through the stored rotation', () => {
    for (const [pan, tilt, roll] of [
      [30, -10, 0],
      [-120, 25, 8],
      [0, 0, -12]
    ]) {
      const back = panTiltRoll(rotationFromPanTiltRoll(pan, tilt, roll))
      expect(back.pan).toBeCloseTo(pan, 3)
      expect(back.tilt).toBeCloseTo(tilt, 3)
      expect(back.roll).toBeCloseTo(roll, 3)
    }
  })

  it('reads a plain tilt down as negative tilt', () => {
    expect(panTiltRoll([-20, 0, 0]).tilt).toBeCloseTo(-20)
  })
})

describe('shot size and angle', () => {
  it('names shot sizes from how much of the subject is in frame', () => {
    const h = 1.75
    expect(shotSize(0.15, h).short).toBe('ECU')
    expect(shotSize(0.35, h).short).toBe('CU')
    expect(shotSize(0.6, h).short).toBe('MCU')
    expect(shotSize(0.9, h).short).toBe('MS')
    expect(shotSize(1.3, h).short).toBe('MWS')
    expect(shotSize(2.2, h).short).toBe('WS')
    expect(shotSize(4, h).short).toBe('EWS')
  })

  it('names camera angles', () => {
    expect(cameraAngle(0, 1.6, 1.62, 0)).toBe('Eye level')
    expect(cameraAngle(-12, 2, 1.6, 0)).toBe('Slight high angle')
    expect(cameraAngle(0, 0.6, 1.6, 0)).toBe('Slight low angle')
    expect(cameraAngle(35, 0.3, 1.6, 0)).toBe('Low angle')
    expect(cameraAngle(-80, 5, 1.6, 0)).toBe('Overhead')
    expect(cameraAngle(0, 1.6, null, 12)).toBe('Eye level, Dutch')
  })
})

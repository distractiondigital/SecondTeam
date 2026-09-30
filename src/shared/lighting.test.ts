import { describe, expect, it } from 'vitest'
import {
  describeLighting,
  illuminanceAt,
  kelvinToRgb,
  STANDARD_ILLUMINANCE,
  threeIntensity,
  type CameraBasis,
  type LightSample
} from './lighting'

// Camera at +Z looking toward the origin (-Z); camera right is +X, camera left is -X.
const camera: CameraBasis = { forward: [0, 0, -1], right: [1, 0, 0] }
const subject: [number, number, number] = [0, 1.6, 0]

let n = 0
const light = (over: Partial<LightSample>): LightSample => ({
  id: `l${n++}`,
  kind: 'point',
  position: [0, 1.6, 2],
  direction: [0, 0, -1],
  stops: 0,
  kelvin: 5600,
  softness: 0.5,
  coneAngle: 40,
  falloff: 0.3,
  ...over
})

describe('colour temperature', () => {
  it('is warm at tungsten and about white at 6,500 K', () => {
    const [r, g, b] = kelvinToRgb(3200)
    expect(r).toBe(1)
    expect(b).toBeLessThan(0.75)
    expect(g).toBeLessThan(r)
    const white = kelvinToRgb(6500)
    for (const c of white) expect(c).toBeGreaterThan(0.9)
    expect(kelvinToRgb(9000)[2]).toBe(1)
  })
})

describe('brightness', () => {
  it('doubles per stop and gives a standard key at 2 m', () => {
    expect(threeIntensity('sun', 1)).toBeCloseTo(STANDARD_ILLUMINANCE * 2)
    expect(illuminanceAt(light({ position: [0, 1.6, 2] }), subject)).toBeCloseTo(STANDARD_ILLUMINANCE)
    expect(illuminanceAt(light({ position: [0, 1.6, 4] }), subject)).toBeCloseTo(STANDARD_ILLUMINANCE / 4)
  })

  it('spots light only inside their cone', () => {
    const aimed = light({ kind: 'spot', position: [0, 1.6, 2], direction: [0, 0, -1] })
    const away = light({ kind: 'spot', position: [0, 1.6, 2], direction: [0, 0, 1] })
    expect(illuminanceAt(aimed, subject)).toBeCloseTo(STANDARD_ILLUMINANCE)
    expect(illuminanceAt(away, subject)).toBe(0)
  })
})

describe('lighting description', () => {
  it('names the side the key comes from, relative to camera', () => {
    expect(describeLighting([light({ position: [-2, 1.6, 0] })], subject, camera)).toMatch(/from camera left/)
    expect(describeLighting([light({ position: [2, 1.6, 0] })], subject, camera)).toMatch(/from camera right/)
    expect(describeLighting([light({ position: [-1.4, 1.6, 1.4] })], subject, camera)).toMatch(
      /three-quarter from camera left/
    )
    expect(describeLighting([light({ position: [0, 1.6, 2] })], subject, camera)).toMatch(/from the front/)
  })

  it('spots a rim, a backlight, a top light and a sun', () => {
    const key = light({ position: [-2, 1.6, 0] })
    const rim = light({ position: [0.3, 2, -2] })
    expect(describeLighting([key, rim], subject, camera)).toMatch(/rim light from behind/)
    expect(describeLighting([light({ position: [0, 1.8, -2] })], subject, camera)).toMatch(/^Backlight|backlight/i)
    expect(describeLighting([light({ position: [0.2, 4, 0.1] })], subject, camera)).toMatch(/top light/i)
    expect(describeLighting([light({ kind: 'sun', direction: [1, -0.3, 0] })], subject, camera)).toMatch(
      /sunlight from camera left/i
    )
  })

  it('describes quality, colour and contrast', () => {
    const hardWarm = light({ position: [-2, 1.6, 0], softness: 0.1, kelvin: 3200 })
    expect(describeLighting([hardWarm], subject, camera)).toBe(
      'Hard key light from camera left, warm tungsten, high contrast'
    )
    const soft = light({ position: [-2, 1.6, 0], softness: 0.9, kelvin: 8000 })
    const fill = light({ kind: 'ambient', stops: 2 })
    expect(describeLighting([soft, fill], subject, camera)).toBe(
      'Soft key light from camera left, cool daylight, flat, low contrast'
    )
  })

  it('handles ambient only and no lights', () => {
    expect(describeLighting([light({ kind: 'ambient' })], subject, camera)).toMatch(/ambient/)
    expect(describeLighting([], subject, camera)).toBe('')
  })
})

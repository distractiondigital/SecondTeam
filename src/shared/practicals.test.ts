import { describe, expect, it } from 'vitest'
import { cleanPractical, fairyLightCount, glowLevel, lampLight, practicalDefaults, practicalRig, practicalWords, shadeOf, strandPoints, type PracticalSettings } from './practicals'

const lamp = (over: Partial<PracticalSettings> = {}): PracticalSettings => ({ kind: 'lamp', ...practicalDefaults('lamp'), ...over })

describe('practicals', () => {
  it("fits a lamp's beams to its shade's openings", () => {
    const p = lamp({ height: 0.6, size: 0.4, shape: 'drum' })
    const s = shadeOf(p)
    const { down, up } = lampLight(p)
    // The edge of each beam passes exactly through the rim of its opening.
    expect(Math.tan(((down / 2) * Math.PI) / 180) * (s.bulbY - s.bottom)).toBeCloseTo(s.bottomRadius, 6)
    expect(Math.tan(((up / 2) * Math.PI) / 180) * (s.top - s.bulbY)).toBeCloseTo(s.topRadius, 6)
    // The bulb sits below the middle, so the downward pool is the wider one.
    expect(down).toBeGreaterThan(up)
  })

  it('narrows the top beam of a cone shade', () => {
    expect(lampLight(lamp({ shape: 'cone' })).up).toBeLessThan(lampLight(lamp({ shape: 'drum' })).up)
  })

  it('lets less light through a thicker shade, none through an opaque one', () => {
    expect(lampLight(lamp({ density: 0.2 })).glowShare).toBeGreaterThan(lampLight(lamp({ density: 0.8 })).glowShare)
    expect(lampLight(lamp({ density: 1 })).glowShare).toBe(0)
    // Even a sheer shade passes only the light that reaches it (not what goes out the openings).
    expect(lampLight(lamp({ density: 0 })).glowShare).toBeLessThan(1)
  })

  it('builds a lamp from a base, stem, bulb and shade, lit by two beams and the glow', () => {
    const rig = practicalRig(lamp())
    expect(rig.parts.map((p) => p.look)).toEqual(['body', 'body', 'glow', 'shade'])
    expect(rig.lights.map((l) => l.kind)).toEqual(['spot', 'spot', 'point'])
    expect(rig.lights[2].tinted).toBe(true)
    expect(rig.lights[2].castShadow).toBe(false)
  })

  it('gives no light at all when switched off', () => {
    expect(practicalRig(lamp({ on: false })).lights).toHaveLength(0)
    expect(glowLevel({ on: false, stops: 3, density: 0 })).toEqual({ glow: 0, shade: 0 })
  })

  it("aims a flashlight down its -Z, as wide as its beam", () => {
    const f = practicalRig({ kind: 'flashlight', ...practicalDefaults('flashlight'), coneAngle: 15 })
    expect(f.lights).toHaveLength(1)
    expect(f.lights[0].direction).toEqual([0, 0, -1])
    expect(f.lights[0].coneAngle).toBe(15)
  })

  it('hangs fairy lights in a sag and lights them with a few shared lights', () => {
    const pts = strandPoints(4, 0.3, 5)
    expect(pts[0]).toEqual([-2, -0, 0])
    expect(pts[2][1]).toBeCloseTo(-0.3)
    expect(pts[4][0]).toBe(2)
    const rig = practicalRig({ kind: 'fairy', ...practicalDefaults('fairy'), length: 6, count: 40 })
    const n = fairyLightCount(6)
    expect(rig.lights).toHaveLength(n)
    expect(rig.lights.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1)
    const bulbs = rig.parts.find((p) => p.shape === 'spheres')
    expect(bulbs && bulbs.shape === 'spheres' ? bulbs.positions.length : 0).toBe(40)
    expect(fairyLightCount(0.5)).toBe(2)
    expect(fairyLightCount(30)).toBe(4)
  })

  it('keeps settings in range and fills in missing ones', () => {
    const p = cleanPractical({ kind: 'lamp', stops: 99, size: -1, shape: 'star' as never, count: 1.5 as never })
    expect(p.stops).toBe(6)
    expect(p.size).toBe(0.1)
    expect(p.shape).toBe('drum')
    expect(p.on).toBe(true)
    expect(p.color).toBe(practicalDefaults('lamp').color)
  })

  it('names them for the prompt', () => {
    expect(practicalWords({ kind: 'lamp', height: 1.6 })).toBe('practical floor lamp')
    expect(practicalWords({ kind: 'lamp', height: 0.5 })).toBe('practical table lamp')
    expect(practicalWords({ kind: 'fairy', height: 0 })).toBe('string lights')
  })
})

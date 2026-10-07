import { describe, expect, it } from 'vitest'
import { anamorphicRatio, filmGaugeFor, MIN_LAMP_RADIUS, pointAsSpots, skyRadianceScale, sunDisc } from './pathLights'

describe('path tracer lights', () => {
  it('makes the sun a disc that looks as big and lights as much', () => {
    const sin = Math.sin((0.53 / 2) * (Math.PI / 180)) // the real sun's angular radius
    const { radius, radiance } = sunDisc(sin, 3, 100)
    // Seen from 100 m, the disc spans the sun's angle.
    expect(2 * Math.atan(radius / 100) * (180 / Math.PI)).toBeCloseTo(0.53, 3)
    // A disc of angular radius θ delivers π·L·sin²θ.
    expect(Math.PI * radiance * sin * sin).toBeCloseTo(3, 6)
  })

  it('never gives the sun a zero-size disc', () => {
    expect(sunDisc(0, 1).radius).toBeGreaterThan(0)
    expect(Number.isFinite(sunDisc(0, 1).radiance)).toBe(true)
  })

  it('turns a sized point light into two half-sphere spots', () => {
    const spots = pointAsSpots(0.3)!
    expect(spots).toHaveLength(2)
    for (const s of spots) {
      expect(s.radius).toBe(0.3)
      expect(s.angle).toBeCloseTo(Math.PI / 2)
    }
    expect(pointAsSpots(MIN_LAMP_RADIUS / 2)).toBeNull()
  })

  it('matches the sky fill', () => {
    expect(skyRadianceScale(Math.PI)).toBeCloseTo(1)
  })

  it('stretches blur upright for anamorphic', () => {
    expect(anamorphicRatio(2)).toBe(0.5)
    expect(anamorphicRatio(1)).toBe(1)
  })

  it('makes three.js report the real focal length', () => {
    // three: focal = 0.5 · filmHeight / tan(vfov/2), filmHeight = gauge / max(aspect, 1).
    const gauge = filmGaugeFor(50, 27, 1.85)
    const filmHeight = gauge / 1.85
    expect((0.5 * filmHeight) / Math.tan((27 * Math.PI) / 360)).toBeCloseTo(50, 6)
  })
})

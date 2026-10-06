import { describe, expect, it } from 'vitest'
import { type CameraOptics } from './camera'
import { acceptableBlur, blurCircle, blurPixels, clampStop, focusRange, focusWords, shotFocus, stopLabel } from './depthOfField'

const ff = (over: Partial<CameraOptics> = {}): CameraOptics => ({
  sensor: { preset: 'ff', width: 36, height: 24 },
  focalLength: 50,
  squeeze: 1,
  delivery: 'sensor',
  ...over
})

describe('depth of field', () => {
  it('matches the standard depth-of-field tables for a 50 mm at T2.8 focused at 3 m', () => {
    expect(acceptableBlur(ff())).toBeCloseTo(0.0288, 3)
    const r = focusRange(ff(), 2.8, 3)
    expect(r.near).toBeCloseTo(2.74, 2)
    expect(r.far).toBeCloseTo(3.32, 2)
    expect(r.hyperfocal).toBeCloseTo(31.0, 1)
  })

  it('is sharp to infinity from the hyperfocal distance', () => {
    const { hyperfocal } = focusRange(ff(), 8, 3)
    const r = focusRange(ff(), 8, hyperfocal)
    expect(r.far).toBe(Infinity)
    expect(r.near).toBeCloseTo(hyperfocal / 2, 1)
  })

  it('blurs nothing at the focus distance, more away from it, up to f² / (N·s) at infinity', () => {
    expect(blurCircle(50, 2.8, 3, 3)).toBeCloseTo(0, 6)
    expect(blurCircle(50, 2.8, 3, 6)).toBeGreaterThan(blurCircle(50, 2.8, 3, 4))
    expect(blurCircle(50, 2.8, 3, 1e6)).toBeCloseTo((50 * 50) / (2.8 * (3000 - 50)), 3)
    // A wider stop blurs more; a longer lens blurs more.
    expect(blurCircle(50, 1.4, 3, 10)).toBeCloseTo(2 * blurCircle(50, 2.8, 3, 10), 6)
    expect(blurCircle(85, 2.8, 3, 10)).toBeGreaterThan(blurCircle(35, 2.8, 3, 10))
  })

  it('a smaller sensor has a smaller acceptable blur, so less is in focus at the same framing size', () => {
    const s35 = ff({ sensor: { preset: 's35', width: 24.89, height: 18.66 } })
    expect(acceptableBlur(s35)).toBeLessThan(acceptableBlur(ff()))
  })

  it('turns sensor millimetres into picture pixels through the delivery frame', () => {
    // 24 mm frame height shown 1080 px tall: 45 px per mm.
    expect(blurPixels(ff(), 0.1, 1080)).toBeCloseTo(4.5, 6)
  })

  it('focuses where told, else on the subject, else at infinity', () => {
    expect(shotFocus(2, 5)).toBe(2)
    expect(shotFocus(null, 5)).toBe(5)
    expect(shotFocus(null, null)).toBe(Infinity)
  })

  it('tells the AI about a shallow focus, not a deep one', () => {
    expect(focusWords(ff({ focalLength: 85 }), 1.4, 2)).toContain('shallow depth of field')
    expect(focusWords(ff({ focalLength: 24 }), 8, 3)).toBe('')
    expect(focusWords(ff(), 2.8, Infinity)).toBe('')
  })

  it('keeps stops in range and labels them like a lens', () => {
    expect(clampStop(0.1)).toBe(0.7)
    expect(clampStop(Number.NaN)).toBe(2.8)
    expect(stopLabel(2.8)).toBe('T2.8')
    expect(stopLabel(11)).toBe('T11')
  })
})

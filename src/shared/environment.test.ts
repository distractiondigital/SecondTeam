import { describe, expect, it } from 'vitest'
import { clockText, DEFAULT_ENVIRONMENT, repairEnvironment, skyAt, timeLabel, timePhrase } from './environment'

describe('environment', () => {
  it('names the time of day round the clock', () => {
    expect(timeLabel(0)).toBe('Night')
    expect(timeLabel(6.5)).toBe('Sunrise')
    expect(timeLabel(12)).toBe('Midday')
    expect(timeLabel(18.4)).toBe('Sunset')
    expect(timeLabel(19.8)).toBe('Dusk')
    expect(timeLabel(23)).toBe('Night')
    expect(timePhrase(18.5)).toContain('sunset')
  })

  it('blends sky colours between keyframes, darker at night', () => {
    expect(skyAt(12).zenith).toBe('#3b7bcb')
    expect(skyAt(0)).toEqual(skyAt(24))
    const brightness = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)
    expect(brightness(skyAt(2).horizon)).toBeLessThan(brightness(skyAt(12).horizon))
    expect(skyAt(2).fillIntensity).toBeLessThan(skyAt(12).fillIntensity)
    const mid = skyAt(10.5).zenith // between morning and midday
    expect(mid).toMatch(/^#[0-9a-f]{6}$/)
    expect(mid).not.toBe(skyAt(9).zenith)
  })

  it('repairs bad values and formats the clock', () => {
    expect(repairEnvironment(undefined)).toEqual(DEFAULT_ENVIRONMENT)
    expect(repairEnvironment({ time: 30, ground: 'red' })).toEqual({ time: 24, ground: DEFAULT_ENVIRONMENT.ground })
    expect(repairEnvironment({ time: 6, ground: '#AABBCC' })).toEqual({ time: 6, ground: '#aabbcc' })
    expect(clockText(18.5)).toBe('18:30')
    expect(clockText(24)).toBe('00:00')
  })
})

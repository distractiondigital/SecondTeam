import { describe, expect, it } from 'vitest'
import {
  buildPrompt,
  DEFAULT_GENERATION,
  MAX_TAKES,
  repairGeneration,
  strictnessToControl,
  takeSeeds
} from './prompt'

describe('prompt', () => {
  const parts = {
    description: 'a detective in a trench coat stands in a warehouse',
    size: 'Medium close-up',
    angle: 'Low angle',
    focalLength: 35,
    squeeze: 1,
    lighting: 'Hard key light from camera left, high contrast',
    style: 'moody 16mm film still'
  }

  it('joins description, shot, lens, lighting and style in order', () => {
    expect(buildPrompt(parts)).toBe(
      'a detective in a trench coat stands in a warehouse, medium close-up, low angle, 35mm lens, hard key light from camera left, high contrast, moody 16mm film still'
    )
  })

  it('skips empty parts and trailing commas, and notes anamorphic lenses', () => {
    expect(
      buildPrompt({ ...parts, description: '  a street, ', size: null, angle: null, lighting: '', style: '', squeeze: 2, focalLength: 49.6 })
    ).toBe('a street, 50mm anamorphic lens')
  })
})

describe('strictness', () => {
  it('maps loose to strict onto ControlNet strength and end', () => {
    expect(strictnessToControl(0)).toEqual({ strength: 0.35, start: 0, end: 0.4 })
    expect(strictnessToControl(0.5)).toEqual({ strength: 0.63, start: 0, end: 0.7 })
    expect(strictnessToControl(1)).toEqual({ strength: 0.9, start: 0, end: 1 })
    expect(strictnessToControl(7).strength).toBe(0.9)
  })
})

describe('seeds and settings', () => {
  it('gives each take its own seed', () => {
    expect(takeSeeds(10, 3)).toEqual([10, 11, 12])
    expect(takeSeeds(2 ** 32 - 1, 2)).toEqual([2 ** 32 - 1, 0])
  })

  it('repairs missing or out-of-range settings', () => {
    expect(repairGeneration(undefined)).toEqual(DEFAULT_GENERATION)
    const r = repairGeneration({ steps: 999, takes: 50, start: 0.8, end: 0.2, strictness: null, cfg: 'x' })
    expect(r.steps).toBe(150)
    expect(r.takes).toBe(MAX_TAKES)
    expect(r.end).toBe(0.8)
    expect(r.strictness).toBeNull()
    expect(r.cfg).toBe(DEFAULT_GENERATION.cfg)
  })
})

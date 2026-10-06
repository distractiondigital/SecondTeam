import { describe, expect, it } from 'vitest'
import type { SceneNode } from './project'
import {
  materialWords,
  buildPrompt,
  depthBlur,
  facingPhrase,
  regionPrompt,
  DEFAULT_GENERATION,
  MAX_TAKES,
  repairGeneration,
  strictnessToControl,
  takeSeeds
} from './prompt'

describe('prompt', () => {
  const parts = {
    description: 'a detective in a trench coat stands in a warehouse',
    facing: 'facing the camera',
    size: 'Medium close-up',
    angle: 'Low angle',
    focalLength: 35,
    squeeze: 1,
    lighting: 'Hard key light from camera left, high contrast',
    style: 'moody 16mm film still'
  }

  it('joins description, shot, lens, lighting and style in order', () => {
    expect(buildPrompt(parts)).toBe(
      'a detective in a trench coat stands in a warehouse, facing the camera, medium close-up, low angle, 35mm lens, hard key light from camera left, high contrast, moody 16mm film still'
    )
  })

  it('skips empty parts and trailing commas, and notes anamorphic lenses', () => {
    expect(
      buildPrompt({ ...parts, description: '  a street, ', facing: null, size: null, angle: null, lighting: '', style: '', squeeze: 2, focalLength: 49.6 })
    ).toBe('a street, 50mm anamorphic lens')
  })

  it('puts the depth-of-field words right after the lens', () => {
    expect(buildPrompt({ ...parts, focus: 'shallow depth of field, soft out-of-focus background' })).toContain(
      '35mm lens, shallow depth of field, soft out-of-focus background, hard key light'
    )
  })
})

describe('region prompts', () => {
  it('give a cast member their own facing and the context of the shot', () => {
    expect(
      regionPrompt('man in his 50s, beige trench coat', 'in profile, facing camera right', {
        size: 'Medium shot',
        angle: 'Eye level',
        focalLength: 75,
        squeeze: 1,
        lighting: 'Soft key light from camera right',
        style: 'D&D artbook style'
      })
    ).toBe('man in his 50s, beige trench coat, in profile, facing camera right, medium shot, eye level, 75mm lens, soft key light from camera right, D&D artbook style')
  })
})

describe('strictness', () => {
  it('maps loose to strict onto ControlNet strength and end', () => {
    expect(strictnessToControl(0)).toEqual({ strength: 0.35, start: 0, end: 0.4 })
    expect(strictnessToControl(0.5)).toEqual({ strength: 0.6, start: 0, end: 0.65 })
    expect(strictnessToControl(1)).toEqual({ strength: 0.85, start: 0, end: 0.9 })
    expect(strictnessToControl(7).strength).toBe(0.85)
  })

  it('keeps the depth guide in step with strictness, even in older projects', () => {
    const old = repairGeneration({ strictness: 0.5, strength: 0.63, end: 0.7 })
    expect([old.strength, old.end]).toEqual([0.6, 0.65])
    const custom = repairGeneration({ strictness: null, strength: 0.63, end: 0.7 })
    expect([custom.strength, custom.end]).toEqual([0.63, 0.7])
  })

  it('softens the depth pass in proportion to the image width', () => {
    expect(depthBlur(1664)).toEqual({ radius: 9, sigma: 3 })
    expect(depthBlur(1024).radius).toBe(6)
    expect(depthBlur(100000).radius).toBe(31)
  })
})

describe('facing', () => {
  // Camera on +Z looking toward -Z: its right is +X, and the lens is toward +Z from the figure.
  const toCamera: [number, number, number] = [0, 0.2, 5]
  const right: [number, number, number] = [1, 0, 0]
  it('describes which way the figure faces, as the camera sees it', () => {
    expect(facingPhrase([0, 0, 1], toCamera, right)).toBe('facing the camera')
    expect(facingPhrase([0, 0, -1], toCamera, right)).toBe('seen from behind, back to the camera')
    expect(facingPhrase([1, 0, 0], toCamera, right)).toBe('in profile, facing camera right')
    expect(facingPhrase([-1, 0, 0], toCamera, right)).toBe('in profile, facing camera left')
    expect(facingPhrase([0.7, 0, 0.7], toCamera, right)).toBe('three-quarter view, facing camera right')
    expect(facingPhrase([-0.7, 0, -0.7], toCamera, right)).toBe('seen from behind at three-quarters, turned away to camera left')
    expect(facingPhrase([0, 1, 0], toCamera, right)).toBeNull()
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

describe('material words', () => {
  const prim = (id: string, material: string, parentId: string | null = null) =>
    ({ id, type: 'primitive', material, parentId }) as unknown as SceneNode
  const nodes: Record<string, SceneNode> = {
    a: prim('a', 'metal', 'g'),
    b: prim('b', 'glass', 'g'),
    c: prim('c', 'matte', 'g'),
    d: prim('d', 'metal', 'g'),
    g: { id: 'g', type: 'group', childIds: ['a', 'b', 'c', 'd'], parentId: null } as unknown as SceneNode,
    m: prim('m', 'matte')
  }
  it('names an object material, the different ones in a group, and nothing for matte', () => {
    expect(materialWords(nodes, 'a')).toBe('metal')
    expect(materialWords(nodes, 'm')).toBe('')
    expect(materialWords(nodes, 'g')).toBe('metal and glass')
    expect(materialWords(nodes, 'missing')).toBe('')
  })
})

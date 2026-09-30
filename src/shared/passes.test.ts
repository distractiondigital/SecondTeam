import { describe, expect, it } from 'vitest'
import {
  COCO_KEYPOINTS,
  COCO_LIMBS,
  depthToGrey,
  figureKeypoints,
  idLegend,
  isSafeId,
  sdxlSize,
  type FigurePoints,
  type HeadFrame
} from './passes'
import type { SceneNode } from './project'

describe('render size', () => {
  it('picks SDXL sizes: multiples of 64, about a megapixel, the right shape', () => {
    expect(sdxlSize(16 / 9)).toEqual({ width: 1344, height: 768 })
    expect(sdxlSize(2.39)).toEqual({ width: 1536, height: 640 })
    expect(sdxlSize(1)).toEqual({ width: 1024, height: 1024 })
    expect(sdxlSize(9 / 16)).toEqual({ width: 768, height: 1344 })
    expect(sdxlSize(1.85)).toEqual({ width: 1408, height: 768 })
    for (const r of [1.33, 1.5, 2, 2.76, 0.8]) {
      const { width, height } = sdxlSize(r)
      expect(width % 64).toBe(0)
      expect(height % 64).toBe(0)
      expect(width * height).toBeGreaterThan(0.8e6)
      expect(width * height).toBeLessThan(1.3e6)
      expect(Math.abs(width / height / r - 1)).toBeLessThan(0.05)
    }
  })
})

// A figure standing at the origin facing +Z (its left is +X), seen by a camera on +Z. The fake
// projection is a straight-on orthographic view: 100 px per metre, origin at (500, 1000).
const figure: FigurePoints = {
  nose: [0, 1.62, 0.1],
  eyeL: [0.03, 1.66, 0.08],
  eyeR: [-0.03, 1.66, 0.08],
  earL: [0.08, 1.64, 0],
  earR: [-0.08, 1.64, 0],
  shoulderL: [0.2, 1.45, 0],
  elbowL: [0.25, 1.15, 0],
  wristL: [0.27, 0.9, 0],
  shoulderR: [-0.2, 1.45, 0],
  elbowR: [-0.25, 1.15, 0],
  wristR: [-0.27, 0.9, 0],
  hipL: [0.1, 0.95, 0],
  kneeL: [0.1, 0.5, 0],
  ankleL: [0.1, 0.08, 0],
  hipR: [-0.1, 0.95, 0],
  kneeR: [-0.1, 0.5, 0],
  ankleR: [-0.1, 0.08, 0]
}
const facingCamera: HeadFrame = { forward: [0, 0, 1], left: [1, 0, 0] }
const project = (p: [number, number, number]): [number, number] => [500 + p[0] * 100, 1000 - p[1] * 100]
const at = (name: (typeof COCO_KEYPOINTS)[number]): number => COCO_KEYPOINTS.indexOf(name)

describe('pose keypoints', () => {
  it('maps a figure to COCO-18 in order, with the neck between the shoulders', () => {
    const k = figureKeypoints(figure, facingCamera, [0, 1.5, 5], project, 1000, 1000)
    expect(k).toHaveLength(18)
    expect(k.every((p) => p !== null)).toBe(true)
    expect(k[at('neck')]).toEqual([500, 855])
    // The figure's own right is on the image's left when it faces the camera.
    expect(k[at('rWrist')]![0]).toBeLessThan(500)
    expect(k[at('lWrist')]![0]).toBeGreaterThan(500)
    expect(k[at('rAnkle')]).toEqual(project(figure.ankleR))
    expect(COCO_LIMBS).toHaveLength(17)
  })

  it('leaves out the face when the figure faces away', () => {
    const away: HeadFrame = { forward: [0, 0, -1], left: [-1, 0, 0] }
    const k = figureKeypoints(figure, away, [0, 1.5, 5], project, 1000, 1000)
    for (const f of ['nose', 'rEye', 'lEye'] as const) expect(k[at(f)]).toBeNull()
    expect(k[at('lEar')]).not.toBeNull()
    expect(k[at('rEar')]).not.toBeNull()
    expect(k[at('neck')]).not.toBeNull()
  })

  it('drops the far ear and eye in profile', () => {
    // Head turned to its left: the camera on +Z sees the right side of the face.
    const profile: HeadFrame = { forward: [1, 0, 0], left: [0, 0, -1] }
    const k = figureKeypoints(figure, profile, [0, 1.5, 5], project, 1000, 1000)
    expect(k[at('rEar')]).not.toBeNull()
    expect(k[at('lEar')]).toBeNull()
    expect(k[at('rEye')]).not.toBeNull()
    expect(k[at('lEye')]).toBeNull()
    expect(k[at('nose')]).not.toBeNull()
  })

  it('drops points outside the frame or behind the camera', () => {
    const k = figureKeypoints(figure, facingCamera, [0, 1.5, 5], project, 1000, 900)
    expect(k[at('nose')]).not.toBeNull()
    expect(k[at('rAnkle')]).toBeNull() // y = 992 px, below a 900 px frame
    const behind = figureKeypoints(figure, facingCamera, [0, 1.5, 5], () => null, 1000, 1000)
    expect(behind.every((p) => p === null)).toBe(true)
  })
})

describe('depth', () => {
  it('maps nearest to white, farthest and empty to black, on an inverse curve', () => {
    const { grey, near, far } = depthToGrey(new Float32Array([1, 2, 4, 0]))
    expect([near, far]).toEqual([1, 4])
    expect(grey[0]).toBe(255)
    expect(grey[2]).toBe(0)
    expect(grey[3]).toBe(0)
    // 2 m is a third of the way in disparity: (1/2 - 1/4) / (1 - 1/4)
    expect(grey[1]).toBe(Math.round((0.25 / 0.75) * 255))
  })

  it('copes with a flat or empty frame', () => {
    expect(depthToGrey(new Float32Array([3, 3])).grey[0]).toBe(255)
    expect(depthToGrey(new Float32Array([0, 0])).far).toBe(0)
  })
})

describe('object ID', () => {
  const base = { parentId: null, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], hidden: false, locked: false }
  const nodes = {
    a: { ...base, id: 'a', name: 'Table', type: 'primitive', primitive: 'box' },
    g: { ...base, id: 'g', name: 'Chairs', type: 'group', childIds: ['c'] },
    c: { ...base, id: 'c', name: 'Chair', type: 'primitive', primitive: 'box', parentId: 'g' },
    m: { ...base, id: 'm', name: 'Maribel', type: 'mannequin' },
    h: { ...base, id: 'h', name: 'Hidden', type: 'primitive', hidden: true },
    l: { ...base, id: 'l', name: 'Key', type: 'light' },
    k: { ...base, id: 'k', name: 'Shot 1A', type: 'camera' },
    e: { ...base, id: 'e', name: 'Empty group', type: 'group', childIds: [] }
  } as unknown as Record<string, SceneNode>

  it('gives each visible top-level object, group and figure its own colour', () => {
    const legend = idLegend(['a', 'g', 'm', 'h', 'l', 'k', 'e'], nodes)
    expect(legend.map((e) => e.name)).toEqual(['Table', 'Chairs', 'Maribel'])
    expect(new Set(legend.map((e) => e.color)).size).toBe(3)
    expect(legend.every((e) => /^#[0-9a-f]{6}$/.test(e.color) && e.color !== '#000000')).toBe(true)
  })

  it('keeps colours distinct past the palette', () => {
    const many: Record<string, SceneNode> = {}
    const ids = Array.from({ length: 40 }, (_, i) => `n${i}`)
    for (const id of ids) many[id] = { ...nodes.a, id } as SceneNode
    expect(new Set(idLegend(ids, many).map((e) => e.color)).size).toBe(40)
  })
})

describe('safe folder ids', () => {
  it('only accepts plain ids', () => {
    expect(isSafeId(crypto.randomUUID())).toBe(true)
    for (const bad of ['..', '../x', 'a\\b', 'a b', '', 'C:', 42, null]) expect(isSafeId(bad)).toBe(false)
  })
})

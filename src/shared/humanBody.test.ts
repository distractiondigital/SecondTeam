import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { AVERAGE_BODY, ageSlider, corneaPoints, ageYears, boneRest, morph, parseBody, targetWeights, type BodyData, type BodyJson } from './humanBody'

const json = JSON.parse(readFileSync('figures/body.json', 'utf-8')) as BodyJson
const bin = readFileSync('figures/body.bin')
const body: BodyData = parseBody(json, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength))

/** Body height (crown above the soles) in metres. */
function heightOf(positions: Float32Array): number {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < body.bodyIndices.length; i++) {
    const y = positions[body.bodyIndices[i] * 3 + 1]
    lo = Math.min(lo, y)
    hi = Math.max(hi, y)
  }
  return (hi - lo) / 10
}

const shoulderWidth = (positions: Float32Array) => {
  const rest = boneRest(body, positions)
  return (rest.get('upperarm_l')!.head[0] - rest.get('upperarm_r')!.head[0]) / 10
}

describe('human body data', () => {
  it('has the base mesh, rig and targets', () => {
    expect(body.vertexCount).toBe(19158)
    expect(body.bones.length).toBe(53)
    expect(body.bones[0].parent).toBeNull()
    expect(body.targets.size).toBeGreaterThan(90)
    for (const name of targetWeights(AVERAGE_BODY).keys()) expect(body.targets.has(name) || name.includes('averagemuscle-averageweight'), name).toBe(true)
  })

  it('gives every vertex skin weights that add up to exactly 1', () => {
    for (let v = 0; v < body.vertexCount; v++) {
      const sum = body.skinWeight[v * 4] + body.skinWeight[v * 4 + 1] + body.skinWeight[v * 4 + 2] + body.skinWeight[v * 4 + 3]
      if (sum !== 255) throw new Error(`vertex ${v} weights add up to ${sum}/255`)
    }
  })

  it('turns sliders into target weights that add up', () => {
    const w = targetWeights({ ...AVERAGE_BODY, gender: 1, age: 0.5, muscle: 0.5, weight: 0.5 })
    expect(w.get('race-male-young')).toBeCloseTo(1)
    expect(w.has('race-female-young')).toBe(false)
    const mixed = targetWeights({ ...AVERAGE_BODY, gender: 0.3, age: 0.75, muscle: 0.25, weight: 1 })
    const races = [...mixed].filter(([k]) => k.startsWith('race-')).reduce((s, [, v]) => s + v, 0)
    expect(races).toBeCloseTo(1)
    expect(mixed.get('race-female-young')).toBeCloseTo(0.7 * 0.5)
    expect(mixed.get('universal-male-old-minmuscle-maxweight')).toBeCloseTo(0.3 * 0.5 * 0.5 * 1)
  })

  it('shapes breasts with the MakeHuman targets, only when asked', () => {
    // As modelled: no chest shapes at all.
    expect([...targetWeights({ ...AVERAGE_BODY, gender: 0 }).keys()].some((k) => k.startsWith('breast-'))).toBe(false)
    const w = targetWeights({ ...AVERAGE_BODY, gender: 0, breastSize: 1, breastFirmness: 0.25 })
    // Female, young, average muscle and weight, max cup, between min and average firmness.
    expect(w.get('breast-female-young-averagemuscle-averageweight-maxcup-minfirmness')).toBeCloseTo(0.5)
    expect(w.get('breast-female-young-averagemuscle-averageweight-maxcup-averagefirmness')).toBeCloseTo(0.5)
    // Every breast shape the sliders ask for exists in the data.
    for (const k of w.keys()) if (k.startsWith('breast-')) expect(body.targets.has(k), k).toBe(true)
    // A male body barely gets any.
    const male = targetWeights({ ...AVERAGE_BODY, gender: 1, breastSize: 1 })
    expect([...male.keys()].some((k) => k.startsWith('breast-female'))).toBe(false)
  })

  it('maps years to the age slider and back', () => {
    expect(ageSlider(25)).toBeCloseTo(0.5)
    expect(ageSlider(11)).toBeCloseTo(0.1875)
    expect(ageSlider(90)).toBe(1)
    expect(ageYears(ageSlider(40))).toBeCloseTo(40)
    expect(ageYears(ageSlider(6))).toBeCloseTo(6)
  })

  it('makes different bodies: men taller and broader, children smaller', () => {
    const man = morph(body, targetWeights({ ...AVERAGE_BODY, gender: 1 }))
    const woman = morph(body, targetWeights({ ...AVERAGE_BODY, gender: 0 }))
    const child = morph(body, targetWeights({ ...AVERAGE_BODY, age: ageSlider(8) }))
    expect(heightOf(man)).toBeGreaterThan(heightOf(woman))
    expect(heightOf(man)).toBeGreaterThan(1.6)
    expect(heightOf(man)).toBeLessThan(2.0)
    expect(shoulderWidth(man)).toBeGreaterThan(shoulderWidth(woman))
    expect(heightOf(child)).toBeLessThan(heightOf(woman) * 0.8)
  })

  it('places the skeleton inside the body', () => {
    const rest = boneRest(body, morph(body, targetWeights(AVERAGE_BODY)))
    const y = (name: string) => rest.get(name)!.head[1]
    expect(y('head')).toBeGreaterThan(y('neck_01'))
    expect(y('neck_01')).toBeGreaterThan(y('spine_03'))
    expect(y('spine_01')).toBeGreaterThan(y('pelvis') - 0.5)
    expect(y('thigh_l')).toBeGreaterThan(y('calf_l'))
    expect(y('calf_l')).toBeGreaterThan(y('foot_l'))
    expect(rest.get('upperarm_l')!.head[0]).toBeGreaterThan(0) // left is +X
  })
})

describe('cornea points', () => {
  it('finds the most forward point of each eye', () => {
    // Two "eyeballs": a back and a front vertex on each side.
    const positions = Float32Array.from([0.3, 1, 0, 0.3, 1, 0.12, -0.3, 1, 0.02, -0.3, 1.01, 0.11])
    expect(corneaPoints(positions)).toEqual([
      [expect.closeTo(0.3), 1, expect.closeTo(0.12)],
      [expect.closeTo(-0.3), expect.closeTo(1.01), expect.closeTo(0.11)]
    ])
  })
  it('needs both eyes', () => {
    expect(corneaPoints(Float32Array.from([0.3, 1, 0.1]))).toBeNull()
  })
})

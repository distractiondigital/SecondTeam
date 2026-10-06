import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import {
  AVERAGE_BODY,
  ageSlider,
  bodyExtent,
  bodyPositions,
  centroid,
  EXPRESSIONS,
  figureSkin,
  partColor,
  sanitizeAppearance,
  skinColor,
  fitProxy,
  parseBody,
  parseProxy,
  proxySkin,
  visibleBody,
  type BodyJson,
  type ProxyInfo
} from './humanBody'

const bufferOf = (file: string) => {
  const b = readFileSync(file)
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}
const body = parseBody(JSON.parse(readFileSync('figures/body.json', 'utf-8')) as BodyJson, bufferOf('figures/body.bin'))
const catalogue = (JSON.parse(readFileSync('figures/proxies.json', 'utf-8')) as { items: ProxyInfo[] }).items
const proxy = (id: string) => {
  const info = catalogue.find((i) => i.id === id)!
  return parseProxy(info, bufferOf(`figures/proxies/${id}.bin`))
}
const yRange = (p: Float32Array) => {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 1; i < p.length; i += 3) {
    lo = Math.min(lo, p[i])
    hi = Math.max(hi, p[i])
  }
  return [lo, hi]
}

describe('eyes, hair and clothes', () => {
  it('lists every item with a commercial-use licence and existing files', () => {
    expect(catalogue.length).toBeGreaterThan(20)
    for (const item of catalogue) {
      expect(['CC0', 'CC-BY'], item.id).toContain(item.license)
      expect(item.source, item.id).toMatch(/^https:\/\//)
      if (item.license === 'CC-BY') expect(item.author, `${item.id} needs a credited author`).toBeTruthy()
      readFileSync(`figures/proxies/${item.id}.bin`)
      if (item.mask) readFileSync(`figures/proxies/${item.mask}`)
    }
  })

  for (const [label, sliders] of [
    ['a man', { ...AVERAGE_BODY, gender: 1 }],
    ['a child', { ...AVERAGE_BODY, age: ageSlider(8) }]
  ] as const) {
    it(`fits them to ${label}`, () => {
      const positions = bodyPositions(body, sliders)
      const { soles, crown } = bodyExtent(body, positions)
      const h = crown - soles
      const [shoeLo, shoeHi] = yRange(fitProxy(proxy('shoes-1'), positions))
      expect(shoeLo).toBeLessThan(soles + 0.05 * h)
      expect(shoeHi).toBeLessThan(soles + 0.15 * h)
      const [hairLo, hairHi] = yRange(fitProxy(proxy('hair-short02'), positions))
      expect(hairLo).toBeGreaterThan(soles + 0.75 * h)
      expect(hairHi).toBeGreaterThan(crown - 0.02 * h)
      const eyes = fitProxy(proxy('eyes'), positions)
      const eyeCentre = centroid(eyes, Array.from({ length: eyes.length / 3 }, (_, i) => i))
      const sockets = centroid(positions, [...body.cubes['joint-l-eye'], ...body.cubes['joint-r-eye']])
      expect(Math.hypot(eyeCentre[0] - sockets[0], eyeCentre[1] - sockets[1], eyeCentre[2] - sockets[2])).toBeLessThan(0.1)
    })
  }

  it('builds every expression from face units that exist', () => {
    for (const [name, e] of Object.entries(EXPRESSIONS)) {
      for (const unit of Object.keys(e.units)) expect(body.targets.has(`expression-${unit}`), `${name}: ${unit}`).toBe(true)
    }
    const neutral = bodyPositions(body, AVERAGE_BODY)
    const smile = bodyPositions(body, AVERAGE_BODY, 'smile')
    let moved = 0
    for (let i = 0; i < neutral.length; i++) moved = Math.max(moved, Math.abs(neutral[i] - smile[i]))
    expect(moved).toBeGreaterThan(0.02) // decimetres: the mouth corners move a few millimetres
  })

  it('skins items to the body and hides the skin under clothes', () => {
    const suit = proxy('outfit-male-suit')
    const { skinWeight } = proxySkin(suit, body)
    for (let v = 0; v < skinWeight.length / 4; v++) {
      const s = skinWeight[v * 4] + skinWeight[v * 4 + 1] + skinWeight[v * 4 + 2] + skinWeight[v * 4 + 3]
      if (Math.abs(s - 1) > 1e-4) throw new Error(`vertex ${v} weights add up to ${s}`)
    }
    const all = body.bodyIndices.length
    const dressed = visibleBody(body, [suit]).length
    expect(dressed).toBeLessThan(all * 0.85)
    expect(dressed).toBeGreaterThan(0)
    expect(visibleBody(body, [proxy('eyes')]).length).toBe(all)
  })
})

describe('figure colours', () => {
  const look = { hair: 'hair-short02', eyebrows: null, garments: { top: 'top-polo' }, colors: {}, skinTone: 0, eyeColor: 'brown' }
  it('goes from fair to dark skin', () => {
    expect(skinColor(0)).toBe('#f5d6c1')
    expect(skinColor(1)).toBe('#352217')
    const lum = (hex: string) => [1, 3, 5].reduce((s, i) => s + parseInt(hex.slice(i, i + 2), 16), 0)
    expect(lum(skinColor(0.3))).toBeGreaterThan(lum(skinColor(0.7)))
  })
  it('natural colours by default, the figure colour with the overlay, a picked colour always', () => {
    expect(figureSkin(look, '#c98f6f', 'natural')).toBe(skinColor(0))
    expect(figureSkin(look, '#c98f6f', 'overlay')).toBe('#c98f6f')
    expect(partColor(look, 'top', '#c98f6f', 'natural', 'top-polo')).toBe('#2f3d5c')
    expect(partColor(look, 'top', '#c98f6f', 'overlay', 'top-polo')).not.toBe('#2f3d5c')
    const picked = { ...look, colors: { top: '#ff0000' } }
    expect(partColor(picked, 'top', '#c98f6f', 'natural', 'top-polo')).toBe('#ff0000')
    expect(partColor(picked, 'top', '#c98f6f', 'overlay', 'top-polo')).toBe('#ff0000')
  })
  it('older files get a default skin tone', () => {
    expect(sanitizeAppearance({ hair: null, garments: {}, colors: {} }, 0).skinTone).toBe(0.3)
  })
})

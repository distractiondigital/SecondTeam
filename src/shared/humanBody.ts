// Human figures: MakeHuman's CC0 body data (figures/body.json + body.bin, made by
// scripts/figures/build-figure-data.mjs), turned into a body for given slider values.
// Our own implementation of the published data format: a base mesh plus "targets" (lists of
// per-vertex offsets) blended with weights from the sliders; joints sit at the centre of small
// marker shapes in the mesh, so the skeleton always fits the body. Pure; tested.

import { clampHeight, proportions as mannequinProportions, type Proportions } from './mannequin'

export interface TargetInfo {
  name: string
  count: number
  /** Deltas are stored as int16; multiply by this to get decimetres. */
  scale: number
}

export interface BonePoint {
  cube?: string
  verts?: number[]
}

export interface BoneDef {
  name: string
  parent: string | null
  head: BonePoint
  tail: BonePoint
}

interface Section {
  offset: number
  length: number
  type: string
}

export interface BodyJson {
  vertexCount: number
  sections: Record<string, Section>
  targets: TargetInfo[]
  cubes: Record<string, number[]>
  modestyRegion?: number[]
  bones: BoneDef[]
}

export interface Target {
  indices: Uint16Array
  deltas: Int16Array
  scale: number
}

export interface BodyData {
  vertexCount: number
  /** Base mesh, decimetres, Y up, facing +Z. */
  base: Float32Array
  bodyIndices: Uint16Array
  skinIndex: Uint8Array
  skinWeight: Uint8Array
  targets: Map<string, Target>
  cubes: Record<string, number[]>
  /** Vertices smoothed flat for modesty. */
  modestyRegion: number[]
  /** Parents before children. */
  bones: BoneDef[]
}

const TYPES = { Float32Array, Uint16Array, Uint8Array, Int16Array } as const

export function parseBody(json: BodyJson, bin: ArrayBuffer): BodyData {
  const section = <T extends keyof typeof TYPES>(name: string, type: T): InstanceType<(typeof TYPES)[T]> => {
    const s = json.sections[name]
    if (!s || s.type !== type) throw new Error(`Figure data is missing ${name}`)
    return new TYPES[type](bin, s.offset, s.length) as InstanceType<(typeof TYPES)[T]>
  }
  const targets = new Map<string, Target>()
  for (const t of json.targets) {
    targets.set(t.name, { indices: section(`t:${t.name}:i`, 'Uint16Array'), deltas: section(`t:${t.name}:d`, 'Int16Array'), scale: t.scale })
  }
  return {
    vertexCount: json.vertexCount,
    base: section('positions', 'Float32Array'),
    bodyIndices: section('bodyIndices', 'Uint16Array'),
    skinIndex: section('skinIndex', 'Uint8Array'),
    skinWeight: section('skinWeight', 'Uint8Array'),
    targets,
    cubes: json.cubes,
    modestyRegion: json.modestyRegion ?? [],
    bones: json.bones
  }
}

// ---------- Sliders ----------

/** MakeHuman's macro sliders, each 0-1 (0.5 = average). */
export interface BodySliders {
  /** 0 female … 1 male */
  gender: number
  /** 0 baby (1 yr) … 0.1875 child (11) … 0.5 young adult (25) … 1 old (90) */
  age: number
  /** 0 minimal … 0.5 average … 1 very muscular */
  muscle: number
  /** 0 thin … 0.5 average … 1 heavy */
  weight: number
}

export const AVERAGE_BODY: BodySliders = { gender: 0.5, age: 0.5, muscle: 0.5, weight: 0.5 }

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5)

/**
 * A slider value as weights of the named shapes around it (two neighbours of a piecewise-linear
 * scale), e.g. age 0.35 → { child: 0.48, young: 0.52 }.
 */
function between(value: number, stops: [number, string][]): Record<string, number> {
  const v = clamp01(value)
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, low] = stops[i]
    const [b, high] = stops[i + 1]
    if (v <= b || i === stops.length - 2) {
      const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
      return { [low]: 1 - t, [high]: t }
    }
  }
  return {}
}

/** Age in years ↔ the age slider (MakeHuman's scale: 1 yr, 11, 25 and 90 at 0, 0.1875, 0.5, 1). */
export function ageSlider(years: number): number {
  const y = Math.min(90, Math.max(1, years))
  if (y <= 11) return ((y - 1) / 10) * 0.1875
  if (y <= 25) return 0.1875 + ((y - 11) / 14) * 0.3125
  return 0.5 + ((y - 25) / 65) * 0.5
}

export function ageYears(slider: number): number {
  const s = clamp01(slider)
  if (s <= 0.1875) return 1 + (s / 0.1875) * 10
  if (s <= 0.5) return 11 + ((s - 0.1875) / 0.3125) * 14
  return 25 + ((s - 0.5) / 0.5) * 65
}

/** How much of each stored target makes this body. */
export function targetWeights(s: BodySliders): Map<string, number> {
  const gender = { female: 1 - clamp01(s.gender), male: clamp01(s.gender) }
  const age = between(s.age, [
    [0, 'baby'],
    [0.1875, 'child'],
    [0.5, 'young'],
    [1, 'old']
  ])
  const muscle = between(s.muscle, [
    [0, 'minmuscle'],
    [0.5, 'averagemuscle'],
    [1, 'maxmuscle']
  ])
  const weight = between(s.weight, [
    [0, 'minweight'],
    [0.5, 'averageweight'],
    [1, 'maxweight']
  ])
  const out = new Map<string, number>()
  for (const [g, gw] of Object.entries(gender)) {
    for (const [a, aw] of Object.entries(age)) {
      if (gw * aw === 0) continue
      out.set(`race-${g}-${a}`, gw * aw)
      for (const [m, mw] of Object.entries(muscle)) {
        for (const [w, ww] of Object.entries(weight)) {
          const v = gw * aw * mw * ww
          if (v > 0) out.set(`universal-${g}-${a}-${m}-${w}`, v)
        }
      }
    }
  }
  return out
}

/** The base mesh with the weighted targets added (decimetres). Unknown target names are skipped. */
export function morph(body: BodyData, weights: Map<string, number>): Float32Array {
  const out = new Float32Array(body.base)
  for (const [name, w] of weights) {
    const t = body.targets.get(name)
    if (!t || !w) continue
    const k = w * t.scale
    for (let e = 0; e < t.indices.length; e++) {
      const v = t.indices[e] * 3
      out[v] += t.deltas[e * 3] * k
      out[v + 1] += t.deltas[e * 3 + 1] * k
      out[v + 2] += t.deltas[e * 3 + 2] * k
    }
  }
  return out
}

/** The centre of a set of vertices. */
export function centroid(positions: Float32Array, verts: number[]): [number, number, number] {
  let x = 0
  let y = 0
  let z = 0
  for (const v of verts) {
    x += positions[v * 3]
    y += positions[v * 3 + 1]
    z += positions[v * 3 + 2]
  }
  const n = Math.max(1, verts.length)
  return [x / n, y / n, z / n]
}

export function bonePoint(body: BodyData, positions: Float32Array, p: BonePoint): [number, number, number] {
  const verts = p.cube ? body.cubes[p.cube] : p.verts
  return centroid(positions, verts ?? [])
}

/** Head and tail of every bone for this body (decimetres, same space as the mesh). */
export function boneRest(body: BodyData, positions: Float32Array): Map<string, { head: [number, number, number]; tail: [number, number, number] }> {
  return new Map(body.bones.map((b) => [b.name, { head: bonePoint(body, positions, b.head), tail: bonePoint(body, positions, b.tail) }]))
}

// ---------- Modesty ----------

const neighbours = new WeakMap<BodyData, Map<number, number[]>>()

/** Which vertices share an edge with each vertex of the visible body (worked out once). */
function adjacency(body: BodyData): Map<number, number[]> {
  let map = neighbours.get(body)
  if (!map) {
    const sets = new Map<number, Set<number>>()
    const link = (a: number, b: number) => {
      let s = sets.get(a)
      if (!s) sets.set(a, (s = new Set()))
      s.add(b)
    }
    const idx = body.bodyIndices
    for (let t = 0; t < idx.length; t += 3) {
      for (const [a, b] of [
        [idx[t], idx[t + 1]],
        [idx[t + 1], idx[t + 2]],
        [idx[t + 2], idx[t]]
      ]) {
        link(a, b)
        link(b, a)
      }
    }
    map = new Map([...sets].map(([v, s]) => [v, [...s]]))
    neighbours.set(body, map)
  }
  return map
}

/**
 * Smooth an area by moving each vertex toward the average of its neighbours, a few times.
 * `strength` (0-1 per vertex, default 1) fades the effect toward the edge so no crease forms.
 */
export function smoothRegion(body: BodyData, positions: Float32Array, region: number[], iterations = 6, strength?: Map<number, number>): void {
  const adj = adjacency(body)
  for (let it = 0; it < iterations; it++) {
    const next: [number, number, number, number][] = []
    for (const v of region) {
      const n = adj.get(v)
      if (!n?.length) continue
      let x = 0
      let y = 0
      let z = 0
      for (const u of n) {
        x += positions[u * 3]
        y += positions[u * 3 + 1]
        z += positions[u * 3 + 2]
      }
      const k = strength?.get(v) ?? 1
      next.push([
        v,
        positions[v * 3] + (x / n.length - positions[v * 3]) * k,
        positions[v * 3 + 1] + (y / n.length - positions[v * 3 + 1]) * k,
        positions[v * 3 + 2] + (z / n.length - positions[v * 3 + 2]) * k
      ])
    }
    for (const [v, x, y, z] of next) {
      positions[v * 3] = x
      positions[v * 3 + 1] = y
      positions[v * 3 + 2] = z
    }
  }
}

const modestyAreas = new WeakMap<BodyData, Map<number, number>>()

/**
 * The nipple area plus four rings of neighbours, each vertex with how strongly it's smoothed:
 * fully in the middle, fading out over the rings so the breast stays round with no edge.
 */
function modestyArea(body: BodyData): Map<number, number> {
  let area = modestyAreas.get(body)
  if (!area) {
    const adj = adjacency(body)
    const FADE = [1, 0.85, 0.6, 0.35, 0.15]
    area = new Map(body.modestyRegion.map((v) => [v, FADE[0]]))
    let ring = [...area.keys()]
    for (let r = 1; r < FADE.length; r++) {
      const next: number[] = []
      for (const v of ring) {
        for (const u of adj.get(v) ?? []) {
          if (!area.has(u)) {
            area.set(u, FADE[r])
            next.push(u)
          }
        }
      }
      ring = next
    }
    modestyAreas.set(body, area)
  }
  return area
}

/** The body for these sliders (and facial expression), with modesty applied (no nipples): decimetres. */
export function bodyPositions(body: BodyData, sliders: BodySliders, expression = 'neutral'): Float32Array {
  const weights = targetWeights(sliders)
  for (const [unit, w] of Object.entries(EXPRESSIONS[expression]?.units ?? {})) weights.set(`expression-${unit}`, w)
  weights.set('modesty-nipple-size-decr', 1)
  weights.set('modesty-nipple-point-decr', 1)
  weights.set('modesty-breast-point-decr', 0.6)
  const positions = morph(body, weights)
  if (body.modestyRegion.length) {
    const area = modestyArea(body)
    smoothRegion(body, positions, [...area.keys()], 30, area)
  }
  return positions
}

// ---------- Fitting the posing skeleton ----------

/** Soles and crown of the visible body (decimetres). */
export function bodyExtent(body: BodyData, positions: Float32Array): { soles: number; crown: number } {
  let soles = Infinity
  let crown = -Infinity
  const idx = body.bodyIndices
  for (let i = 0; i < idx.length; i++) {
    const y = positions[idx[i] * 3 + 1]
    if (y < soles) soles = y
    if (y > crown) crown = y
  }
  return { soles, crown }
}

export interface HumanFit {
  /** Decimetres, as in the data. */
  positions: Float32Array
  rest: ReturnType<typeof boneRest>
  /** Decimetres → metres at the requested height. */
  scale: number
  /** Sole height in the data (decimetres). */
  ground: number
  /**
   * Where our 17 posing joints go for this body (metres, standing, limbs straight), in the same
   * shape as the mannequin's proportions so the mannequin skeleton can be built from it.
   */
  proportions: Proportions
}

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

export function fitHuman(body: BodyData, sliders: BodySliders, height: number, expression = 'neutral'): HumanFit {
  const positions = bodyPositions(body, sliders, expression)
  const rest = boneRest(body, positions)
  const { soles, crown } = bodyExtent(body, positions)
  const scale = clampHeight(height) / (crown - soles)
  const head = (name: string) => rest.get(name)!.head
  const tail = (name: string) => rest.get(name)!.tail
  const m = (dm: number) => dm * scale
  const y = (name: string) => m(head(name)[1] - soles)

  // The spine keeps the body's natural posture, so its joints sit at the body's own heights; the
  // limbs are straightened when posed, so the legs chain their bone lengths downward.
  const pelvisY = y('pelvis')
  const spineY = y('spine_01')
  const chestY = y('spine_03')
  const neckY = y('neck_01')
  const headY = y('head')
  const hipY = pelvisY + (y('thigh_l') - y('pelvis'))
  const thigh = m(dist(head('thigh_l'), head('calf_l')))
  const shin = m(dist(head('calf_l'), head('foot_l')))
  const ankleY = Math.max(0.02, hipY - thigh - shin)
  const base = mannequinProportions(height, 0.5 + (sliders.weight - 0.5) * 0.8)
  const proportions: Proportions = {
    ...base,
    pelvisY,
    spineY,
    chestY,
    neckY,
    headY,
    shoulderY: chestY + (y('upperarm_l') - y('spine_03')),
    hipY,
    kneeY: hipY - thigh,
    ankleY,
    shoulderHalf: m(head('upperarm_l')[0]),
    hipHalf: m(head('thigh_l')[0]),
    upperArm: m(dist(head('upperarm_l'), head('lowerarm_l'))),
    forearm: m(dist(head('lowerarm_l'), head('hand_l'))),
    hand: m(dist(head('hand_l'), tail('middle_03_l'))),
    footLength: m(Math.abs(tail('ball_l')[2] - head('foot_l')[2])) * 1.4,
    headSize: Math.max(0.05, clampHeight(height) - headY)
  }
  return { positions, rest, scale, ground: soles, proportions }
}

/** Body sliders from a file (missing or bad values become average). */
export function sanitizeBody(raw: unknown, fallback: Partial<BodySliders> = {}): BodySliders {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof BodySliders, unknown>>
  const pick = (k: keyof BodySliders) => {
    const v = r[k] ?? fallback[k]
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : AVERAGE_BODY[k]
  }
  return { gender: pick('gender'), age: pick('age'), muscle: pick('muscle'), weight: pick('weight') }
}

// ---------- Proxies: eyes, eyebrows, hair, clothes ----------

export type ProxyKind = 'eyes' | 'eyebrows' | 'hair' | 'clothes'
export type GarmentSlot = 'outfit' | 'top' | 'bottom' | 'outer' | 'shoes' | 'hat'

export interface ProxyInfo {
  id: string
  kind: ProxyKind
  slot: GarmentSlot | null
  label: string
  vertexCount: number
  /** Axis scale references: [vertex a, vertex b, distance in the reference body]. */
  scales: Partial<Record<'x' | 'y' | 'z', [number, number, number]>>
  sections: Record<string, Section>
  /** Transparency mask file (hair, eyebrows), or null. */
  mask: string | null
  license: string
  /** Who to credit (CC-BY items). */
  author: string | null
  source: string
}

export interface ProxyData {
  info: ProxyInfo
  refs: Uint16Array
  weights: Float32Array
  offsets: Float32Array
  uv: Float32Array
  indices: Uint16Array | Uint32Array
  /** Base-mesh vertices this item covers (the skin there is hidden while it's worn). */
  deleteVerts: Uint16Array
}

export function parseProxy(info: ProxyInfo, bin: ArrayBuffer): ProxyData {
  const get = (name: string) => {
    const s = info.sections[name]
    const T = { Float32Array, Uint16Array, Uint32Array }[s.type as 'Float32Array' | 'Uint16Array' | 'Uint32Array']
    return new T(bin, s.offset, s.length)
  }
  return {
    info,
    refs: get('refs') as Uint16Array,
    weights: get('weights') as Float32Array,
    offsets: get('offsets') as Float32Array,
    uv: get('uv') as Float32Array,
    indices: get('indices') as Uint16Array | Uint32Array,
    deleteVerts: get('deleteVerts') as Uint16Array
  }
}

/** The item's vertices on this body (decimetres): weighted body points plus a size-scaled offset. */
export function fitProxy(proxy: ProxyData, positions: Float32Array): Float32Array {
  const axisScale = (axis: 'x' | 'y' | 'z', k: number) => {
    const s = proxy.info.scales[axis]
    if (!s || !s[2]) return 1
    return Math.abs(positions[s[0] * 3 + k] - positions[s[1] * 3 + k]) / s[2]
  }
  const sx = axisScale('x', 0)
  const sy = axisScale('y', 1)
  const sz = axisScale('z', 2)
  const n = proxy.refs.length / 3
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      let v = 0
      for (let r = 0; r < 3; r++) v += proxy.weights[i * 3 + r] * positions[proxy.refs[i * 3 + r] * 3 + k]
      out[i * 3 + k] = v + proxy.offsets[i * 3 + k] * (k === 0 ? sx : k === 1 ? sy : sz)
    }
  }
  return out
}

/** Skin weights for the item: each vertex blends its reference vertices' weights (top 4 kept). */
export function proxySkin(proxy: ProxyData, body: BodyData): { skinIndex: Uint16Array; skinWeight: Float32Array } {
  const n = proxy.refs.length / 3
  const skinIndex = new Uint16Array(n * 4)
  const skinWeight = new Float32Array(n * 4)
  const acc = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    acc.clear()
    for (let r = 0; r < 3; r++) {
      const w = proxy.weights[i * 3 + r]
      if (!w) continue
      const v = proxy.refs[i * 3 + r]
      for (let k = 0; k < 4; k++) {
        const bw = body.skinWeight[v * 4 + k] / 255
        if (bw) acc.set(body.skinIndex[v * 4 + k], (acc.get(body.skinIndex[v * 4 + k]) ?? 0) + w * bw)
      }
    }
    const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4)
    const total = top.reduce((s, [, w]) => s + w, 0) || 1
    top.forEach(([b, w], k) => {
      skinIndex[i * 4 + k] = b
      skinWeight[i * 4 + k] = w / total
    })
    if (!top.length) skinWeight[i * 4] = 1
  }
  return { skinIndex, skinWeight }
}

/** The body's visible triangles with the skin under the worn items left out. */
export function visibleBody(body: BodyData, worn: ProxyData[]): Uint16Array {
  if (!worn.some((p) => p.deleteVerts.length)) return body.bodyIndices
  const hidden = new Uint8Array(body.vertexCount)
  for (const p of worn) for (const v of p.deleteVerts) hidden[v] = 1
  const idx = body.bodyIndices
  const out: number[] = []
  for (let t = 0; t < idx.length; t += 3) {
    if (!hidden[idx[t]] && !hidden[idx[t + 1]] && !hidden[idx[t + 2]]) out.push(idx[t], idx[t + 1], idx[t + 2])
  }
  return new Uint16Array(out)
}

// ---------- Appearance ----------

export const GARMENT_SLOTS: GarmentSlot[] = ['outfit', 'top', 'bottom', 'outer', 'shoes', 'hat']
export type AppearancePart = 'hair' | 'eyes' | GarmentSlot

/** What a human figure wears. Ids refer to figures/proxies.json; a missing colour = the figure's colour. */
export interface FigureAppearance {
  hair: string | null
  eyebrows: string | null
  garments: Partial<Record<GarmentSlot, string>>
  colors: Partial<Record<AppearancePart, string>>
}

/** A dressed starting look (one colour: everything follows the figure's colour until changed). */
export function defaultAppearance(gender: number): FigureAppearance {
  return gender >= 0.5
    ? { hair: 'hair-short02', eyebrows: 'eyebrows-1', garments: { outfit: 'outfit-male-casual-1', shoes: 'shoes-1' }, colors: {} }
    : { hair: 'hair-ponytail01', eyebrows: 'eyebrows-1', garments: { outfit: 'outfit-female-casual-1', shoes: 'shoes-2' }, colors: {} }
}

const ID = /^[a-z0-9-]{1,60}$/
const HEX = /^#[0-9a-f]{6}$/i
const PARTS: AppearancePart[] = ['hair', 'eyes', ...GARMENT_SLOTS]

export function sanitizeAppearance(raw: unknown, gender: number): FigureAppearance {
  if (!raw || typeof raw !== 'object') return defaultAppearance(gender)
  const r = raw as Partial<Record<keyof FigureAppearance, unknown>>
  const id = (v: unknown) => (typeof v === 'string' && ID.test(v) ? v : null)
  const garments: FigureAppearance['garments'] = {}
  const g = (r.garments && typeof r.garments === 'object' ? r.garments : {}) as Record<string, unknown>
  for (const slot of GARMENT_SLOTS) {
    const v = id(g[slot])
    if (v) garments[slot] = v
  }
  const colors: FigureAppearance['colors'] = {}
  const c = (r.colors && typeof r.colors === 'object' ? r.colors : {}) as Record<string, unknown>
  for (const part of PARTS) {
    const v = c[part]
    if (typeof v === 'string' && HEX.test(v)) colors[part] = v.toLowerCase()
  }
  return { hair: id(r.hair), eyebrows: id(r.eyebrows), garments, colors }
}

/** Everything a figure shows besides its body, in drawing order. */
export function wornIds(a: FigureAppearance): string[] {
  const ids = ['eyes']
  if (a.eyebrows) ids.push(a.eyebrows)
  if (a.hair) ids.push(a.hair)
  for (const slot of GARMENT_SLOTS) {
    const id = a.garments[slot]
    // A full outfit replaces a separate top and bottom.
    if (id && !((slot === 'top' || slot === 'bottom') && a.garments.outfit)) ids.push(id)
  }
  return ids
}

/**
 * How dark each part is by default compared with the figure's colour, so clothes read as clothes
 * while the figure stays one colour family. Any part can be given its own colour instead.
 */
const DEFAULT_SHADE: Record<AppearancePart, number> = { hair: 0.4, eyes: 0.4, outfit: 0.6, top: 0.62, bottom: 0.5, outer: 0.55, shoes: 0.35, hat: 0.5 }

/** The colour a part shows: its own, or a shade of the figure's colour. */
export function partColor(appearance: FigureAppearance, part: AppearancePart, figureColor: string): string {
  const own = appearance.colors[part]
  if (own) return own
  const k = DEFAULT_SHADE[part]
  const hex = HEX.test(figureColor) ? figureColor : '#999999'
  return (
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(parseInt(hex.slice(i, i + 2), 16) * k)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

/** Which appearance part an item belongs to (eyebrows go with the hair). */
export function partOf(info: ProxyInfo): AppearancePart | null {
  return info.kind === 'hair' || info.kind === 'eyebrows' ? 'hair' : info.kind === 'eyes' ? 'eyes' : info.slot
}

// ---------- Expressions and hands ----------

/** Facial expressions as blends of MakeHuman's face units (each 0-1). */
export const EXPRESSIONS: Record<string, { label: string; units: Record<string, number> }> = {
  neutral: { label: 'Neutral', units: {} },
  smile: { label: 'Smile', units: { 'mouth-corner-puller': 0.75, 'eye-left-slit': 0.25, 'eye-right-slit': 0.25 } },
  laugh: {
    label: 'Laugh',
    units: { 'mouth-corner-puller': 1, 'mouth-open': 0.55, 'eye-left-slit': 0.55, 'eye-right-slit': 0.55, 'eyebrows-left-up': 0.2, 'eyebrows-right-up': 0.2 }
  },
  sad: {
    label: 'Sad',
    units: { 'mouth-depression': 0.7, 'eyebrows-left-inner-up': 0.8, 'eyebrows-right-inner-up': 0.8, 'eye-left-slit': 0.2, 'eye-right-slit': 0.2 }
  },
  angry: {
    label: 'Angry',
    units: { 'eyebrows-left-down': 1, 'eyebrows-right-down': 1, 'mouth-compression': 0.5, 'nose-left-elevation': 0.3, 'nose-right-elevation': 0.3, 'eye-left-slit': 0.3, 'eye-right-slit': 0.3 }
  },
  surprised: {
    label: 'Surprised',
    units: { 'eyebrows-left-up': 1, 'eyebrows-right-up': 1, 'eye-left-opened-up': 0.8, 'eye-right-opened-up': 0.8, 'mouth-open': 0.6 }
  },
  scared: {
    label: 'Scared',
    units: {
      'eyebrows-left-inner-up': 0.8,
      'eyebrows-right-inner-up': 0.8,
      'eyebrows-left-up': 0.4,
      'eyebrows-right-up': 0.4,
      'eye-left-opened-up': 0.7,
      'eye-right-opened-up': 0.7,
      'mouth-retraction': 0.6,
      'mouth-open': 0.3
    }
  },
  talking: { label: 'Talking', units: { 'mouth-open': 0.35, 'mouth-parling': 0.3 } },
  disgusted: {
    label: 'Disgusted',
    units: { 'nose-left-elevation': 0.8, 'nose-right-elevation': 0.8, 'mouth-upward-retraction': 0.6, 'eyebrows-left-down': 0.4, 'eyebrows-right-down': 0.4 }
  }
}

/** Words for the prompt ('' for neutral). */
export function expressionPhrase(expression: string): string {
  const words: Record<string, string> = {
    smile: 'smiling',
    laugh: 'laughing',
    sad: 'sad expression',
    angry: 'angry expression',
    surprised: 'surprised expression',
    scared: 'scared expression',
    talking: 'talking',
    disgusted: 'disgusted expression'
  }
  return words[expression] ?? ''
}

export type HandShape = 'relaxed' | 'fist' | 'open' | 'point' | 'grip'
export const HAND_SHAPES: Record<HandShape, string> = { relaxed: 'Relaxed', fist: 'Fist', open: 'Open', point: 'Point', grip: 'Grip' }

/**
 * Curl of each finger joint in degrees (base, middle, tip), and the thumb's two outer joints.
 * Pure data; HumanView turns it into bone rotations.
 */
export const HAND_CURL: Record<HandShape, { fingers: [number, number, number]; index?: [number, number, number]; thumb: [number, number] }> = {
  relaxed: { fingers: [15, 25, 15], thumb: [10, 10] },
  fist: { fingers: [85, 100, 70], thumb: [35, 45] },
  open: { fingers: [0, 0, 0], thumb: [0, 0] },
  point: { fingers: [85, 100, 70], index: [0, 0, 0], thumb: [35, 45] },
  grip: { fingers: [45, 60, 40], thumb: [25, 30] }
}

export interface Hands {
  left: HandShape
  right: HandShape
}

export const DEFAULT_HANDS: Hands = { left: 'relaxed', right: 'relaxed' }

export function sanitizeHands(raw: unknown): Hands {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<'left' | 'right', unknown>>
  const one = (v: unknown): HandShape => (typeof v === 'string' && v in HAND_SHAPES ? (v as HandShape) : 'relaxed')
  return { left: one(r.left), right: one(r.right) }
}

export function sanitizeExpression(raw: unknown): string {
  return typeof raw === 'string' && raw in EXPRESSIONS ? raw : 'neutral'
}

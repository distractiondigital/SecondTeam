// Human figures: MakeHuman's CC0 body data (figures/body.json + body.bin, made by
// scripts/figures/build-figure-data.mjs), turned into a body for given slider values.
// Our own implementation of the published data format: a base mesh plus "targets" (lists of
// per-vertex offsets) blended with weights from the sliders; joints sit at the centre of small
// marker shapes in the mesh, so the skeleton always fits the body. Pure; tested.

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

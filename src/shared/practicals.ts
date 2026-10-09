import type { Vec3 } from './project'

// Practicals: lights that live in the set (lamps, bare bulbs, flashlights, fairy lights). Each is
// one object with settings, drawn as a few shapes plus ordinary lights, so Clay and the Render
// treat it like any other light and agree with each other (no light really passes through a shade;
// see practicalRig). Pure and tested.

export const PRACTICAL_KINDS = ['lamp', 'bulb', 'flashlight', 'fairy'] as const
export type PracticalKind = (typeof PRACTICAL_KINDS)[number]

export const PRACTICAL_LABELS: Record<PracticalKind, string> = {
  lamp: 'Lamp',
  bulb: 'Bare bulb',
  flashlight: 'Flashlight',
  fairy: 'Fairy lights'
}

export const SHADE_SHAPES = ['drum', 'cone'] as const
export type ShadeShape = (typeof SHADE_SHAPES)[number]

/** A practical's settings (the node's own fields; see PracticalNode in project.ts). */
export interface PracticalSettings {
  kind: PracticalKind
  on: boolean
  /** Brightness in stops, like a light: 0 lights a subject 2 m away like a standard key. */
  stops: number
  kelvin: number
  /** Lamp: the shade's colour (tints the light through it). Others: body, cord or wire. */
  color: string
  shadows: boolean
  /** Lamp: overall height. Bulb: cord length above the bulb (0 = no cord). (m) */
  height: number
  /** Lamp: shade width at the bottom. Bulb: bulb diameter. Flashlight: lens diameter. Fairy: bulb diameter. (m) */
  size: number
  /** Lamp: shade shape. */
  shape: ShadeShape
  /** Lamp: how much light the shade holds back, 0 (sheer) to 1 (opaque). */
  density: number
  /** Flashlight: beam angle (degrees, full). */
  coneAngle: number
  /** Fairy lights: strand length (m). */
  length: number
  /** Fairy lights: how far the middle of the strand hangs below its ends (m). */
  sag: number
  /** Fairy lights: number of bulbs. */
  count: number
}

/** Defaults per kind; the table and floor lamp differ only in size. */
export function practicalDefaults(kind: PracticalKind, preset?: 'table' | 'floor'): Omit<PracticalSettings, 'kind'> {
  const base = { on: true, kelvin: 2700, shadows: true, shape: 'drum' as ShadeShape, density: 0.6, coneAngle: 20, length: 3, sag: 0.25, count: 30 }
  switch (kind) {
    case 'lamp':
      return preset === 'floor'
        ? { ...base, stops: 0, color: '#efe6d2', height: 1.6, size: 0.45 }
        : { ...base, stops: -1, color: '#efe6d2', height: 0.55, size: 0.35 }
    case 'bulb':
      return { ...base, stops: -0.5, color: '#2b2b2b', height: 0.5, size: 0.07 }
    case 'flashlight':
      return { ...base, stops: 1.5, kelvin: 5000, color: '#2a2d31', height: 0, size: 0.05 }
    case 'fairy':
      return { ...base, stops: -1.5, kelvin: 2400, color: '#3a4a2e', shadows: false, height: 0, size: 0.018 }
  }
}

/** Where a new practical goes above the surface it's added on (m): lamps stand, the rest hang. */
export function practicalLift(kind: PracticalKind): number {
  return kind === 'bulb' ? 2.3 : kind === 'flashlight' ? 1 : kind === 'fairy' ? 2.4 : 0
}

// ---------- Ranges ----------

const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback

export const PRACTICAL_RANGES = {
  height: { lamp: [0.15, 2.5], bulb: [0, 3] } as Record<string, [number, number]>,
  size: { lamp: [0.1, 1.2], bulb: [0.02, 0.3], flashlight: [0.02, 0.2], fairy: [0.005, 0.06] } as Record<PracticalKind, [number, number]>,
  coneAngle: [3, 90] as [number, number],
  length: [0.5, 20] as [number, number],
  sag: [0, 3] as [number, number],
  count: [2, 200] as [number, number]
}

/** Keep every setting in range (and fill missing ones with the kind's defaults). */
export function cleanPractical(raw: Partial<PracticalSettings> & { kind: PracticalKind }): PracticalSettings {
  const d = practicalDefaults(raw.kind)
  const k = raw.kind
  const hr = PRACTICAL_RANGES.height[k] ?? [0, 3]
  const sr = PRACTICAL_RANGES.size[k]
  return {
    kind: k,
    on: raw.on !== false,
    stops: Math.round(clamp(raw.stops, -6, 6, d.stops) * 100) / 100,
    kelvin: Math.round(clamp(raw.kelvin, 1800, 10000, d.kelvin)),
    color: typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : d.color,
    shadows: typeof raw.shadows === 'boolean' ? raw.shadows : d.shadows,
    height: clamp(raw.height, hr[0], hr[1], d.height),
    size: clamp(raw.size, sr[0], sr[1], d.size),
    shape: SHADE_SHAPES.includes(raw.shape as ShadeShape) ? (raw.shape as ShadeShape) : d.shape,
    density: clamp(raw.density, 0, 1, d.density),
    coneAngle: clamp(raw.coneAngle, ...PRACTICAL_RANGES.coneAngle, d.coneAngle),
    length: clamp(raw.length, ...PRACTICAL_RANGES.length, d.length),
    sag: clamp(raw.sag, ...PRACTICAL_RANGES.sag, d.sag),
    count: Math.round(clamp(raw.count, ...PRACTICAL_RANGES.count, d.count))
  }
}

// ---------- The rig ----------

/**
 * A shape of the practical, in its own space (Y up). 'cylinder' may be open-ended and tapered
 * (a shade); 'sphere' is a bulb; 'tube' runs through points (a cord, a strand's wire).
 * look: 'body' = its colour, matte; 'shade' = its colour, lit from inside (glows with the light that
 * gets through); 'glow' = the light's own colour, fully bright (a bulb, a lens).
 */
export type RigPart =
  | { shape: 'cylinder'; position: Vec3; rotation: Vec3; radiusTop: number; radiusBottom: number; height: number; open: boolean; look: RigLook }
  | { shape: 'sphere'; position: Vec3; radius: number; look: RigLook }
  | { shape: 'tube'; points: Vec3[]; radius: number; look: RigLook }
  | { shape: 'spheres'; positions: Vec3[]; radius: number; look: RigLook }
export type RigLook = 'body' | 'shade' | 'glow'

/** One of the practical's lights, in its own space. */
export interface RigLight {
  kind: 'point' | 'spot'
  position: Vec3
  /** Which way a spot shines. */
  direction: Vec3
  /** Of the practical's brightness (1 = all of it, as a light of the same stops). */
  share: number
  /** Source diameter (m). */
  size: number
  /** Spot: full cone angle (degrees) and how soft its edge is (0-1). */
  coneAngle: number
  falloff: number
  castShadow: boolean
  /** Coloured by the shade (light that came through it). */
  tinted: boolean
}

export interface Rig {
  parts: RigPart[]
  lights: RigLight[]
}

const DEG = 180 / Math.PI

/** A lamp shade's measurements (m, in the lamp's space). */
export function shadeOf(p: Pick<PracticalSettings, 'height' | 'size' | 'shape'>) {
  const bottomRadius = p.size / 2
  const topRadius = p.shape === 'cone' ? bottomRadius * 0.6 : bottomRadius
  const shadeHeight = p.size * 0.75
  const top = p.height
  const bottom = p.height - shadeHeight
  // The bulb sits a little below the middle of the shade.
  const bulbY = bottom + shadeHeight * 0.4
  return { bottomRadius, topRadius, shadeHeight, top, bottom, bulbY }
}

/** Solid angle of a cone of half-angle `half` (steradians). */
const coneSolidAngle = (half: number) => 2 * Math.PI * (1 - Math.cos(half))

/**
 * A lamp's light: the bulb shines straight out of the shade's two openings (two spots, their cones
 * fitting the openings exactly: the hard pools above and below), and the rest of its light reaches
 * the shade, which lets (1 − density) of it through as a soft glow the size of the shade (a soft
 * light at the shade's middle, coloured by it). All three carry the bulb's brightness per direction,
 * so together they're as bright as the bare bulb would be, less what the shade holds back.
 */
export function lampLight(p: PracticalSettings): { down: number; up: number; glowShare: number } {
  const s = shadeOf(p)
  const down = Math.atan(s.bottomRadius / Math.max(1e-3, s.bulbY - s.bottom))
  const up = Math.atan(s.topRadius / Math.max(1e-3, s.top - s.bulbY))
  const open = (coneSolidAngle(down) + coneSolidAngle(up)) / (4 * Math.PI)
  return { down: 2 * down * DEG, up: 2 * up * DEG, glowShare: Math.max(0, 1 - open) * (1 - p.density) }
}

/** Points along a hanging strand of `length` (m) sagging `sag` in the middle, ends at y = 0. */
export function strandPoints(length: number, sag: number, n: number): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1)
    const x = (t - 0.5) * length
    const u = (2 * x) / length
    out.push([x, -sag * (1 - u * u), 0])
  }
  return out
}

/** How many lights stand in for a strand of fairy lights. */
export function fairyLightCount(length: number): number {
  return Math.min(4, Math.max(2, Math.round(length / 1.5)))
}

/** A practical as shapes and lights (in its own space; nothing lights when it's off). */
export function practicalRig(p: PracticalSettings): Rig {
  const parts: RigPart[] = []
  const lights: RigLight[] = []
  const light = (l: Partial<RigLight> & Pick<RigLight, 'kind' | 'position'>) => {
    if (p.on) lights.push({ direction: [0, -1, 0], share: 1, size: 0.05, coneAngle: 90, falloff: 0.1, castShadow: p.shadows, tinted: false, ...l })
  }
  switch (p.kind) {
    case 'lamp': {
      const s = shadeOf(p)
      const baseR = Math.max(0.06, p.size * 0.3)
      parts.push({ shape: 'cylinder', position: [0, 0.0125, 0], rotation: [0, 0, 0], radiusTop: baseR, radiusBottom: baseR, height: 0.025, open: false, look: 'body' })
      parts.push({ shape: 'cylinder', position: [0, s.bulbY / 2, 0], rotation: [0, 0, 0], radiusTop: 0.012, radiusBottom: 0.012, height: s.bulbY, open: false, look: 'body' })
      parts.push({ shape: 'sphere', position: [0, s.bulbY, 0], radius: 0.03, look: 'glow' })
      parts.push({ shape: 'cylinder', position: [0, (s.top + s.bottom) / 2, 0], rotation: [0, 0, 0], radiusTop: s.topRadius, radiusBottom: s.bottomRadius, height: s.shadeHeight, open: true, look: 'shade' })
      const l = lampLight(p)
      const bulb: Vec3 = [0, s.bulbY, 0]
      light({ kind: 'spot', position: bulb, direction: [0, -1, 0], size: 0.06, coneAngle: l.down, falloff: 0.12 })
      light({ kind: 'spot', position: bulb, direction: [0, 1, 0], size: 0.06, coneAngle: l.up, falloff: 0.12 })
      if (l.glowShare > 0.001) {
        // Dim and soft: no shadow in Clay (a point light's shadow costs six renders a frame).
        light({ kind: 'point', position: [0, (s.top + s.bottom) / 2, 0], share: l.glowShare, size: (s.topRadius + s.bottomRadius), castShadow: false, tinted: true })
      }
      break
    }
    case 'bulb': {
      const r = p.size / 2
      parts.push({ shape: 'sphere', position: [0, 0, 0], radius: r, look: 'glow' })
      parts.push({ shape: 'cylinder', position: [0, r + 0.02, 0], rotation: [0, 0, 0], radiusTop: r * 0.45, radiusBottom: r * 0.45, height: 0.04, open: false, look: 'body' })
      if (p.height > 0) parts.push({ shape: 'tube', points: [[0, r + 0.04, 0], [0, r + 0.04 + p.height, 0]], radius: 0.004, look: 'body' })
      light({ kind: 'point', position: [0, 0, 0], size: p.size })
      break
    }
    case 'flashlight': {
      // Shines down its -Z, like a spot (rotate the node to aim it).
      const r = p.size / 2
      const along: Vec3 = [Math.PI / 2, 0, 0] // a Y cylinder turned to lie along Z
      parts.push({ shape: 'cylinder', position: [0, 0, 0.06], rotation: along, radiusTop: r * 0.7, radiusBottom: r * 0.7, height: 0.16, open: false, look: 'body' })
      parts.push({ shape: 'cylinder', position: [0, 0, -0.04], rotation: along, radiusTop: r * 1.15, radiusBottom: r * 0.75, height: 0.05, open: false, look: 'body' })
      parts.push({ shape: 'cylinder', position: [0, 0, -0.0655], rotation: along, radiusTop: r, radiusBottom: r, height: 0.002, open: false, look: 'glow' })
      light({ kind: 'spot', position: [0, 0, -0.067], direction: [0, 0, -1], size: p.size, coneAngle: p.coneAngle, falloff: 0.35 })
      break
    }
    case 'fairy': {
      const wire = strandPoints(p.length, p.sag, 24)
      parts.push({ shape: 'tube', points: wire, radius: 0.0015, look: 'body' })
      parts.push({ shape: 'spheres', positions: strandPoints(p.length, p.sag, p.count).map(([x, y, z]) => [x, y - p.size * 0.6, z] as Vec3), radius: p.size / 2, look: 'glow' })
      const n = fairyLightCount(p.length)
      // Each stands for its stretch of the strand: as wide as that stretch, a share of the light.
      for (const at of strandPoints(p.length * (1 - 1 / n), p.sag * (1 - 1 / (n * n)), n)) {
        light({ kind: 'point', position: [at[0], at[1] - 0.02, at[2]], share: 1 / n, size: Math.min(1.5, p.length / n), castShadow: false })
      }
      break
    }
  }
  return { parts, lights }
}

/**
 * How bright a practical's glowing parts look (an emissive strength): the bulb or lens itself
 * (`glow`), and a lamp shade lit from inside (`shade`, by what gets through it).
 */
export function glowLevel(p: Pick<PracticalSettings, 'on' | 'stops' | 'density'>): { glow: number; shade: number } {
  if (!p.on) return { glow: 0, shade: 0 }
  const gain = Math.pow(2, p.stops)
  return { glow: Math.min(4, 2 * gain), shade: Math.min(2, 0.9 * gain * (1 - p.density) + 0.05) }
}

/** Words for the prompt: "practical table lamp", "string lights"… */
export function practicalWords(p: Pick<PracticalSettings, 'kind' | 'height'>): string {
  switch (p.kind) {
    case 'lamp':
      return p.height > 1 ? 'practical floor lamp' : 'practical table lamp'
    case 'bulb':
      return 'bare hanging bulb'
    case 'flashlight':
      return 'flashlight beam'
    case 'fairy':
      return 'string lights'
  }
}

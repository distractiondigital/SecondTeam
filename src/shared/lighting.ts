import type { Vec3 } from './project'

// Lights: colour temperature, brightness in stops, how much light reaches a point, and the
// plain-English lighting description used in the prompt ("Soft key light from camera left…").
// Pure maths so it can be tested without a 3D scene.

export const LIGHT_KINDS = ['sun', 'point', 'spot', 'ambient'] as const
export type LightKind = (typeof LIGHT_KINDS)[number]

export const LIGHT_LABELS: Record<LightKind, string> = {
  sun: 'Sun',
  point: 'Point',
  spot: 'Spot',
  ambient: 'Ambient'
}

export const MIN_STOPS = -6
export const MAX_STOPS = 6
export const MIN_KELVIN = 1800
export const MAX_KELVIN = 10000
export const MIN_CONE = 5
export const MAX_CONE = 120

export const KELVIN_PRESETS = [
  { label: 'Candle', kelvin: 1900 },
  { label: 'Tungsten', kelvin: 3200 },
  { label: 'Daylight', kelvin: 5600 },
  { label: 'Overcast', kelvin: 6500 },
  { label: 'Shade', kelvin: 7500 }
]

const clamp = (v: number, lo: number, hi: number, fallback: number) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback

export const clampStops = (s: number) => Math.round(clamp(s, MIN_STOPS, MAX_STOPS, 0) * 100) / 100
export const clampKelvin = (k: number) => Math.round(clamp(k, MIN_KELVIN, MAX_KELVIN, 5600))
export const clampUnit = (v: number) => clamp(v, 0, 1, 0.5)
export const clampCone = (deg: number) => clamp(deg, MIN_CONE, MAX_CONE, 40)

/**
 * Colour of a light at a colour temperature, as RGB 0–1 (Tanner Helland's blackbody fit).
 * ~6,600 K is white; lower is warmer (orange), higher is cooler (blue).
 */
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = clampKelvin(kelvin) / 100
  let r: number
  let g: number
  let b: number
  if (t <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(t) - 161.1195681661
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492)
    b = 255
  }
  const c = (v: number) => Math.min(255, Math.max(0, v)) / 255
  return [c(r), c(g), c(b)]
}

// Brightness. A light at 0 stops lights a subject like a standard key; +1 stop doubles it.
// Point and spot lights reach that standard at 2 m and fall off with the square of distance.
export const STANDARD_ILLUMINANCE = 2.5 // three.js units at the subject for a 0-stop key
const REFERENCE_DISTANCE = 2 // metres
const AMBIENT_BASE = 0.9

/** The three.js `intensity` for a light kind at a brightness in stops. */
export function threeIntensity(kind: LightKind, stops: number): number {
  const gain = Math.pow(2, stops)
  if (kind === 'sun') return STANDARD_ILLUMINANCE * gain
  if (kind === 'ambient') return AMBIENT_BASE * gain
  // Candela-like: illuminance = intensity / distance², so this gives the standard at 2 m.
  return STANDARD_ILLUMINANCE * REFERENCE_DISTANCE * REFERENCE_DISTANCE * gain
}

/** A light placed in the world, for measuring (all vectors in world space). */
export interface LightSample {
  id: string
  kind: LightKind
  position: Vec3
  /** The direction the light travels (sun and spot). */
  direction: Vec3
  stops: number
  kelvin: number
  softness: number
  coneAngle: number
  falloff: number
}

type V = [number, number, number]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: V) => Math.sqrt(dot(a, a))
const norm = (a: V): V => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const neg = (a: V): V => [-a[0], -a[1], -a[2]]

/** How much light reaches a point (same units as STANDARD_ILLUMINANCE; facing ignored). */
export function illuminanceAt(light: LightSample, point: Vec3): number {
  const intensity = threeIntensity(light.kind, light.stops)
  if (light.kind === 'sun' || light.kind === 'ambient') return intensity
  const toPoint = sub(point, light.position)
  const d2 = Math.max(0.01, dot(toPoint, toPoint))
  let e = intensity / d2
  if (light.kind === 'spot') {
    // Full inside the cone's core, fading across the soft edge, nothing outside.
    const cos = dot(norm(light.direction), norm(toPoint))
    const outer = Math.cos(((light.coneAngle / 2) * Math.PI) / 180)
    const inner = Math.cos((((light.coneAngle / 2) * (1 - light.falloff)) * Math.PI) / 180)
    if (cos <= outer) return 0
    if (cos < inner) e *= (cos - outer) / Math.max(1e-6, inner - outer)
  }
  return e
}

/** Direction from a point toward a light (for the sun: against the way its light travels). */
function towardLight(light: LightSample, point: Vec3): V {
  return light.kind === 'sun' ? norm(neg(light.direction)) : norm(sub(light.position, point))
}

export interface CameraBasis {
  /** Where the lens points (world). */
  forward: Vec3
  /** The frame's right-hand side (world). */
  right: Vec3
}

/** Where a light is as seen from the camera: azimuth (0 = from the camera, ±180 = from behind,
 *  negative = camera left) and elevation (degrees above the horizon). */
export function lightAngles(light: LightSample, point: Vec3, camera: CameraBasis) {
  const L = towardLight(light, point)
  const back = neg(norm(camera.forward)) // pointing from the subject back toward the camera
  const azimuth = (Math.atan2(dot(L, norm(camera.right)), dot(L, back)) * 180) / Math.PI
  const elevation = (Math.asin(Math.max(-1, Math.min(1, L[1]))) * 180) / Math.PI
  return { azimuth, elevation }
}

function directionWords(azimuth: number): string {
  const a = Math.abs(azimuth)
  const side = azimuth < 0 ? 'camera left' : 'camera right'
  if (a < 25) return 'from the front'
  if (a < 65) return `three-quarter from ${side}`
  if (a < 115) return `from ${side}`
  return 'from behind'
}

/**
 * The lighting in plain words, e.g. "Soft key light from camera left, rim light from behind,
 * warm tungsten, high contrast". Lights are measured at `subject` as seen from `camera`.
 */
export function describeLighting(lights: LightSample[], subject: Vec3, camera: CameraBasis): string {
  if (lights.length === 0) return ''
  const measured = lights.map((l) => ({ light: l, e: illuminanceAt(l, subject) }))
  const directional = measured.filter((m) => m.light.kind !== 'ambient' && m.e > 0)
  const ambientTotal = measured.filter((m) => m.light.kind === 'ambient').reduce((s, m) => s + m.e, 0)

  if (directional.length === 0) {
    return ambientTotal > 0 ? 'Soft even ambient light, flat, no strong shadows' : ''
  }

  const key = directional.reduce((a, b) => (b.e > a.e ? b : a))
  const { azimuth, elevation } = lightAngles(key.light, subject, camera)
  const parts: string[] = []

  const quality = key.light.softness < 0.35 ? 'hard' : key.light.softness > 0.65 ? 'soft' : ''
  const height = elevation > 60 ? 'top' : elevation > 30 ? 'high' : elevation < -10 ? 'low' : ''
  if (Math.abs(azimuth) >= 115) {
    parts.push([quality, 'backlight'].filter(Boolean).join(' ') + (height === 'top' ? ' from above' : ''))
  } else if (height === 'top') {
    parts.push([quality, 'top light'].filter(Boolean).join(' '))
  } else {
    const kind = key.light.kind === 'sun' ? 'sunlight' : 'key light'
    parts.push([quality, height === 'high' ? 'high' : '', kind, directionWords(azimuth)].filter(Boolean).join(' '))
    if (height === 'low') parts.push('underlit')
  }

  // A rim: another light from behind, at least 30% of the key.
  const rim = directional.find(
    (m) => m !== key && m.e >= key.e * 0.3 && Math.abs(lightAngles(m.light, subject, camera).azimuth) >= 120
  )
  if (rim && Math.abs(azimuth) < 115) parts.push('rim light from behind')

  if (key.light.kelvin < 4000) parts.push('warm tungsten')
  else if (key.light.kelvin > 6500) parts.push('cool daylight')

  // Contrast: key + fill against fill alone, in stops.
  const fill = ambientTotal + directional.filter((m) => m !== key && m !== rim).reduce((s, m) => s + m.e, 0)
  const ratio = fill > 0 ? Math.log2((key.e + fill) / fill) : Infinity
  if (ratio >= 3) parts.push('high contrast')
  else if (ratio <= 1) parts.push('flat, low contrast')

  const text = parts.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Key-to-fill ratio in stops at a point (Infinity when there's no fill at all). */
export function contrastStops(lights: LightSample[], subject: Vec3): number {
  const es = lights.map((l) => illuminanceAt(l, subject))
  const key = Math.max(0, ...es)
  const fill = es.reduce((s, e) => s + e, 0) - key
  return fill > 0 ? Math.log2((key + fill) / fill) : Infinity
}

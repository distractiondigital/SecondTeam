import { Euler, MathUtils, Quaternion } from 'three'
import type { Vec3 } from './project'

// Real-camera maths: sensors, anamorphic squeeze, frame guides, field of view, shot numbers,
// and the shot-size / camera-angle words used for prompts.
//
// A shot camera looks down its local -Z axis with +Y up (the three.js camera convention).

// ---------- Sensors ----------

export const SENSOR_PRESETS = {
  s35: { label: 'Super 35', width: 24.89, height: 18.66 },
  ff: { label: 'Full Frame', width: 36, height: 24 },
  // 12,288 x 8,040 photosites across a 36 mm-wide full-frame sensor
  pyxis12k: { label: 'Blackmagic PYXIS 12K', width: 36, height: 23.56 },
  alexa35: { label: 'ARRI ALEXA 35', width: 27.99, height: 19.22 },
  custom: { label: 'Custom', width: 36, height: 24 }
} as const
export type SensorPreset = keyof typeof SENSOR_PRESETS
export const SENSOR_PRESET_IDS = Object.keys(SENSOR_PRESETS) as SensorPreset[]

export interface Sensor {
  preset: SensorPreset
  /** Millimetres. */
  width: number
  height: number
}

// ---------- Frame guides ----------

export const GUIDE_PRESETS: { id: string; label: string; ratio: number }[] = [
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '1.85', label: '1.85', ratio: 1.85 },
  { id: '2:1', label: '2:1', ratio: 2 },
  { id: '2.35', label: '2.35', ratio: 2.35 },
  { id: '2.39', label: '2.39', ratio: 2.39 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 }
]

/** Aspect ratio (width / height) of a guide id such as "2.39" or "custom:2.2", or null if unknown. */
export function guideRatio(id: string): number | null {
  const preset = GUIDE_PRESETS.find((g) => g.id === id)
  if (preset) return preset.ratio
  const custom = id.match(/^custom:(\d*\.?\d+)$/)
  if (custom) {
    const r = Number(custom[1])
    return r >= 0.2 && r <= 5 ? r : null
  }
  return null
}

export function guideLabel(id: string): string {
  if (id === 'sensor') return 'Full sensor'
  return GUIDE_PRESETS.find((g) => g.id === id)?.label ?? id.replace(/^custom:/, '')
}

// ---------- Lens and frame ----------

export interface CameraOptics {
  sensor: Sensor
  focalLength: number
  squeeze: number
  delivery: string
}

export const MIN_FOCAL = 8
export const MAX_FOCAL = 600

export const clampFocal = (f: number) => (Number.isFinite(f) ? Math.min(MAX_FOCAL, Math.max(MIN_FOCAL, f)) : 35)
export const clampSqueeze = (s: number) =>
  Number.isFinite(s) ? Math.min(2, Math.max(1, Math.round(s * 10) / 10)) : 1
export const clampSensorSize = (mm: number) => (Number.isFinite(mm) ? Math.min(100, Math.max(1, mm)) : 36)

/** Size of the de-squeezed image the sensor records, in "spherical-equivalent" millimetres. */
export function imageSize(c: Pick<CameraOptics, 'sensor' | 'squeeze'>): { width: number; height: number } {
  return { width: c.sensor.width * c.squeeze, height: c.sensor.height }
}

/** The largest frame of `ratio` (width/height) that fits in the image; the whole image if null. */
export function frameIn(
  image: { width: number; height: number },
  ratio: number | null
): { width: number; height: number; ratio: number } {
  const imageRatio = image.width / image.height
  if (ratio === null) return { ...image, ratio: imageRatio }
  if (ratio >= imageRatio) return { width: image.width, height: image.width / ratio, ratio }
  return { width: image.height * ratio, height: image.height, ratio }
}

/** The delivery frame (what gets rendered), in millimetres on the de-squeezed image. */
export function deliveryFrame(c: CameraOptics) {
  const ratio = c.delivery === 'sensor' ? null : guideRatio(c.delivery)
  return frameIn(imageSize(c), ratio)
}

/** Horizontal and vertical field of view of the delivery frame, in degrees. */
export function fieldOfView(c: CameraOptics): { horizontal: number; vertical: number } {
  const f = deliveryFrame(c)
  return {
    horizontal: MathUtils.radToDeg(2 * Math.atan(f.width / (2 * c.focalLength))),
    vertical: MathUtils.radToDeg(2 * Math.atan(f.height / (2 * c.focalLength)))
  }
}

// ---------- Shot numbers ----------

function splitShot(s: string): [number, string] {
  const m = s.trim().match(/^(\d+)(.*)$/)
  return m ? [Number(m[1]), m[2].trim().toUpperCase()] : [Number.POSITIVE_INFINITY, s.trim().toUpperCase()]
}

/** Natural order for shot numbers: 2, 9, 12, 12A, 12B, 13, then anything without a number. */
export function compareShotNumbers(a: string, b: string): number {
  const [na, sa] = splitShot(a)
  const [nb, sb] = splitShot(b)
  if (na !== nb) return na - nb
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

/** One more than the highest shot number in use ("1" if none). */
export function nextShotNumber(existing: string[]): string {
  const numbers = existing.map((s) => splitShot(s)[0]).filter(Number.isFinite)
  return String(numbers.length ? Math.max(...numbers) + 1 : 1)
}

// ---------- Pan / tilt / roll ----------

/**
 * A camera's rotation (stored as XYZ Euler degrees like every node) as an operator would say it:
 * pan (turn left +), tilt (up +) and roll (horizon clockwise +), applied in that order.
 */
export function panTiltRoll(rotation: Vec3): { pan: number; tilt: number; roll: number } {
  const q = new Quaternion().setFromEuler(new Euler(...(rotation.map(MathUtils.degToRad) as Vec3), 'XYZ'))
  const e = new Euler().setFromQuaternion(q, 'YXZ')
  const deg = (r: number) => Math.round(MathUtils.radToDeg(r) * 10000) / 10000 || 0
  return { pan: deg(e.y), tilt: deg(e.x), roll: deg(-e.z) }
}

export function rotationFromPanTiltRoll(pan: number, tilt: number, roll: number): Vec3 {
  const q = new Quaternion().setFromEuler(
    new Euler(MathUtils.degToRad(tilt), MathUtils.degToRad(pan), MathUtils.degToRad(-roll), 'YXZ')
  )
  const e = new Euler().setFromQuaternion(q, 'XYZ')
  return [e.x, e.y, e.z].map((r) => Math.round(MathUtils.radToDeg(r) * 10000) / 10000 || 0) as Vec3
}

// ---------- Shot size and angle ----------

export interface ShotSize {
  label: string
  short: string
}

const SHOT_SIZES: { upTo: number; label: string; short: string }[] = [
  { upTo: 0.12, label: 'Extreme close-up', short: 'ECU' },
  { upTo: 0.25, label: 'Close-up', short: 'CU' },
  { upTo: 0.4, label: 'Medium close-up', short: 'MCU' },
  { upTo: 0.6, label: 'Medium shot', short: 'MS' },
  { upTo: 0.85, label: 'Medium wide shot', short: 'MWS' },
  { upTo: 1.6, label: 'Wide shot', short: 'WS' },
  { upTo: Number.POSITIVE_INFINITY, label: 'Extreme wide shot', short: 'EWS' }
]

/**
 * Shot size from how much of the subject fits in frame:
 * `frameHeight` is the height the frame covers at the subject's distance (metres).
 */
export function shotSize(frameHeight: number, subjectHeight: number): ShotSize {
  const r = frameHeight / Math.max(subjectHeight, 0.01)
  const size = SHOT_SIZES.find((s) => r < s.upTo)!
  return { label: size.label, short: size.short }
}

/**
 * Camera angle words from the tilt (degrees, up +), and, when there's a subject, how high the
 * lens is compared with the subject's eyes. Adds "Dutch" when the horizon is rolled over 5°.
 */
export function cameraAngle(tilt: number, cameraY: number, eyeY: number | null, roll: number): string {
  let angle: string
  if (tilt <= -60) angle = 'Overhead'
  else if (tilt <= -25) angle = 'High angle'
  else if (tilt >= 60) angle = "Worm's-eye"
  else if (tilt >= 25) angle = 'Low angle'
  else if (tilt <= -8 || (eyeY !== null && cameraY > eyeY + 0.3)) angle = 'Slight high angle'
  else if (tilt >= 8 || (eyeY !== null && cameraY < eyeY - 0.3)) angle = 'Slight low angle'
  else angle = 'Eye level'
  return Math.abs(roll) > 5 ? `${angle}, Dutch` : angle
}

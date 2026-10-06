import { Euler, MathUtils, Quaternion } from 'three'
import type { Vec3 } from './project'

// Real-camera maths: sensors, anamorphic squeeze, frame guides, field of view, shot numbers,
// and the shot-size / camera-angle words used for prompts.
//
// A shot camera looks down its local -Z axis with +Y up (the three.js camera convention).

// ---------- Sensors ----------

/** One recording format of one camera: the sensor area it records, in millimetres. */
export interface SensorFormat {
  id: string
  brand: string
  camera: string
  /** Empty when the camera has one format. */
  format: string
  width: number
  height: number
}

// Image areas from the makers' and rental houses' specifications (checked 2026-10-06): the area
// each format records, so a lens's field of view matches the real camera. Ids are stored in project
// files, so never rename one (s35, ff, pyxis12k and alexa35 date from before this list).
// A Speed Booster shrinks the lens's image, so it acts like a sensor 1 / its factor larger.
export const SENSOR_FORMATS: SensorFormat[] = [
  { id: 's16', brand: 'Film', camera: 'Super 16', format: '', width: 12.52, height: 7.41 },
  { id: 's35', brand: 'Film', camera: 'Super 35 (4-perf)', format: '', width: 24.89, height: 18.66 },
  { id: 'ff', brand: 'Film', camera: 'Full Frame', format: '', width: 36, height: 24 },

  { id: 'alexa35', brand: 'ARRI', camera: 'ALEXA 35', format: '4.6K 3:2 Open Gate', width: 27.99, height: 19.22 },
  { id: 'alexa35-46k-169', brand: 'ARRI', camera: 'ALEXA 35', format: '4.6K 16:9', width: 27.99, height: 15.75 },
  { id: 'alexa35-4k-169', brand: 'ARRI', camera: 'ALEXA 35', format: '4K 16:9', width: 24.88, height: 14 },
  { id: 'alexa35-4k-21', brand: 'ARRI', camera: 'ALEXA 35', format: '4K 2:1', width: 24.88, height: 12.44 },
  { id: 'alexa35-33k-65', brand: 'ARRI', camera: 'ALEXA 35', format: '3.3K 6:5 (anamorphic)', width: 20.22, height: 16.95 },
  { id: 'alexa-lf-og', brand: 'ARRI', camera: 'ALEXA Mini LF / LF', format: '4.5K LF Open Gate', width: 36.7, height: 25.54 },
  { id: 'alexa-lf-169', brand: 'ARRI', camera: 'ALEXA Mini LF / LF', format: '3.8K LF 16:9 (UHD)', width: 31.68, height: 17.82 },
  { id: 'alexa-lf-239', brand: 'ARRI', camera: 'ALEXA Mini LF / LF', format: '4.5K LF 2.39:1', width: 36.7, height: 15.31 },
  { id: 'alexa-mini-og', brand: 'ARRI', camera: 'ALEXA Mini', format: '3.4K Open Gate', width: 28.25, height: 18.17 },
  { id: 'alexa-mini-32k', brand: 'ARRI', camera: 'ALEXA Mini', format: '3.2K 16:9', width: 26.4, height: 14.85 },
  { id: 'alexa-mini-28k-169', brand: 'ARRI', camera: 'ALEXA Mini', format: '2.8K / HD 16:9', width: 23.76, height: 13.37 },
  { id: 'alexa-mini-28k-43', brand: 'ARRI', camera: 'ALEXA Mini', format: '2.8K 4:3 (anamorphic)', width: 23.76, height: 17.82 },
  { id: 'alexa-mini-s16', brand: 'ARRI', camera: 'ALEXA Mini', format: 'S16 HD', width: 13.2, height: 7.43 },
  { id: 'alexa265-og', brand: 'ARRI', camera: 'ALEXA 265', format: '6.5K Open Gate', width: 54.12, height: 25.58 },
  { id: 'alexa265-51k', brand: 'ARRI', camera: 'ALEXA 265', format: '5.1K 1.65:1', width: 42.24, height: 25.58 },
  { id: 'alexa265-lf', brand: 'ARRI', camera: 'ALEXA 265', format: '4.5K LF 3:2', width: 36.7, height: 25.54 },
  { id: 'alexa65-og', brand: 'ARRI', camera: 'ALEXA 65', format: '6.5K Open Gate', width: 54.12, height: 25.58 },
  { id: 'alexa65-51k', brand: 'ARRI', camera: 'ALEXA 65', format: '5.1K 16:9', width: 42.24, height: 23.76 },
  { id: 'alexa65-43k', brand: 'ARRI', camera: 'ALEXA 65', format: '4.3K 3:2', width: 35.64, height: 23.76 },

  { id: 'red-vraptor-vv', brand: 'RED', camera: 'V-RAPTOR [X] / XL 8K VV', format: '', width: 40.96, height: 21.6 },
  { id: 'red-vraptor-s35', brand: 'RED', camera: 'V-RAPTOR [X] / XL 8K S35', format: '', width: 26.21, height: 13.82 },
  { id: 'red-komodo', brand: 'RED', camera: 'KOMODO 6K / KOMODO-X', format: '', width: 27.03, height: 14.26 },

  { id: 'sony-venice2-86k', brand: 'Sony', camera: 'VENICE 2 8.6K', format: '8.6K 3:2 Full Frame', width: 35.9, height: 23.93 },
  { id: 'sony-venice-6k', brand: 'Sony', camera: 'VENICE / VENICE 2 6K', format: '6K 3:2 Full Frame', width: 35.9, height: 24 },
  { id: 'sony-venice-4k-s35', brand: 'Sony', camera: 'VENICE / VENICE 2 6K', format: '4K 4:3 Super 35 (anamorphic)', width: 24.3, height: 18 },
  { id: 'sony-burano', brand: 'Sony', camera: 'BURANO', format: '8.6K 3:2 Full Frame', width: 35.9, height: 24 },
  { id: 'sony-burano-169', brand: 'Sony', camera: 'BURANO', format: '8.6K 16:9', width: 35.9, height: 20.2 },
  { id: 'sony-fx9', brand: 'Sony', camera: 'FX9', format: '6K Full Frame', width: 35.7, height: 18.8 },
  { id: 'sony-fx6', brand: 'Sony', camera: 'FX6', format: '', width: 35.6, height: 20 },
  { id: 'sony-fx5', brand: 'Sony', camera: 'FX5', format: '3:2 Open Gate', width: 35.9, height: 24 },
  { id: 'sony-fx5-169', brand: 'Sony', camera: 'FX5', format: '16:9', width: 35.9, height: 20.2 },
  { id: 'sony-fx3', brand: 'Sony', camera: 'FX3', format: '', width: 35.6, height: 20 },

  { id: 'canon-c500ii', brand: 'Canon', camera: 'EOS C500 Mark II', format: '5.9K Full Frame', width: 38.1, height: 20.1 },
  { id: 'canon-c400', brand: 'Canon', camera: 'EOS C400 / C80', format: '6K Full Frame', width: 36, height: 19 },
  { id: 'canon-r5c', brand: 'Canon', camera: 'EOS R5 C', format: '8K Full Frame', width: 36, height: 19 },
  { id: 'canon-c300iii', brand: 'Canon', camera: 'EOS C300 Mark III / C70', format: '4K Super 35', width: 26.2, height: 13.8 },

  { id: 'bm-ursa17k', brand: 'Blackmagic', camera: 'URSA Cine 17K 65', format: '17K Open Gate', width: 50.81, height: 23.32 },
  { id: 'pyxis12k', brand: 'Blackmagic', camera: 'URSA Cine 12K LF / PYXIS 12K', format: '12K 3:2 Open Gate', width: 35.64, height: 23.32 },
  { id: 'bm-pyxis6k', brand: 'Blackmagic', camera: 'PYXIS 6K', format: '6K 3:2 Open Gate', width: 36, height: 24 },
  { id: 'bm-cinema6k', brand: 'Blackmagic', camera: 'Cinema Camera 6K (Full Frame)', format: '6K 3:2 Open Gate', width: 36, height: 24 },
  { id: 'bm-pocket6k', brand: 'Blackmagic', camera: 'Pocket Cinema Camera 6K / 6K Pro / 6K G2', format: '6K Super 35', width: 23.1, height: 12.99 },
  { id: 'bm-pocket4k', brand: 'Blackmagic', camera: 'Pocket Cinema Camera 4K', format: 'Four Thirds, no adapter', width: 18.96, height: 10 },
  { id: 'bm-pocket4k-sb071', brand: 'Blackmagic', camera: 'Pocket Cinema Camera 4K', format: 'Metabones Speed Booster Ultra 0.71×', width: 26.7, height: 14.08 },
  { id: 'bm-pocket4k-sb064', brand: 'Blackmagic', camera: 'Pocket Cinema Camera 4K', format: 'Metabones Speed Booster XL 0.64×', width: 29.63, height: 15.63 },

  { id: 'nikon-zr', brand: 'Nikon', camera: 'ZR', format: '6K 16:9', width: 35.9, height: 20.2 }
]

export const sensorFormat = (id: string): SensorFormat | undefined => SENSOR_FORMATS.find((f) => f.id === id)

export interface SensorCamera {
  brand: string
  camera: string
  formats: SensorFormat[]
}

/** The cameras in list order, each with its formats (for the Camera and Format pickers). */
export const SENSOR_CAMERAS: SensorCamera[] = SENSOR_FORMATS.reduce((list, f) => {
  const last = list[list.length - 1]
  if (last && last.brand === f.brand && last.camera === f.camera) last.formats.push(f)
  else list.push({ brand: f.brand, camera: f.camera, formats: [f] })
  return list
}, [] as SensorCamera[])

/** "ARRI ALEXA 35 · 4K 16:9", "Super 16", or the size of a custom sensor. */
export function sensorLabel(sensor: Sensor): string {
  const f = sensorFormat(sensor.preset)
  if (!f) return `${sensor.width}×${sensor.height} mm`
  const camera = f.brand === 'Film' ? f.camera : `${f.brand} ${f.camera}`
  return f.format ? `${camera} · ${f.format}` : camera
}

/** An id from SENSOR_FORMATS, or 'custom'. */
export type SensorPreset = string

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

// ---------- Project camera kit ----------

/** The camera body and format shared by every shot in the project (the lens is per shot). */
export interface CameraKit {
  sensor: Sensor
  squeeze: number
  guides: string[]
  delivery: string
  thirds: boolean
}

export const DEFAULT_KIT: CameraKit = {
  sensor: { preset: 'ff', width: 36, height: 24 },
  squeeze: 1,
  guides: [],
  delivery: 'sensor',
  thirds: false
}

/** Full optics for one shot: the project's camera body plus that shot's lens. */
export function opticsFor(kit: CameraKit, focalLength: number): CameraOptics & CameraKit {
  return { ...kit, focalLength }
}

/** Keep a camera kit valid: sensor sizes, squeeze in range, known guides, delivery among them. */
export function repairKit(raw: Partial<CameraKit> | undefined): CameraKit {
  const k = raw ?? {}
  const preset = k.sensor && (k.sensor.preset === 'custom' || sensorFormat(k.sensor.preset)) ? k.sensor.preset : 'ff'
  const known = sensorFormat(preset) ?? sensorFormat('ff')!
  const guides = Array.isArray(k.guides) ? [...new Set(k.guides.filter((g) => guideRatio(g) !== null))] : []
  const delivery = typeof k.delivery === 'string' && (k.delivery === 'sensor' || guides.includes(k.delivery)) ? k.delivery : 'sensor'
  return {
    sensor: {
      preset,
      width: clampSensorSize(k.sensor?.width ?? known.width),
      height: clampSensorSize(k.sensor?.height ?? known.height)
    },
    squeeze: clampSqueeze(k.squeeze ?? 1),
    guides,
    delivery,
    thirds: k.thirds === true
  }
}

// ---------- Shot numbers ----------

// Shot letters skip I and O so they can't be misread as 1 and 0 on slates and reports.
const SHOT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Letters for the n-th shot of a scene (0 → A, 23 → Z, 24 → AA, 25 → AB…). */
export function shotLetters(n: number): string {
  let s = ''
  let k = n + 1
  while (k > 0) {
    k--
    s = SHOT_ALPHABET[k % SHOT_ALPHABET.length] + s
    k = Math.floor(k / SHOT_ALPHABET.length)
  }
  return s
}

/** Position of a letter run in the shot sequence (A → 0, AA → 24), or -1 if it isn't one. */
export function shotLetterIndex(letters: string): number {
  if (!letters || [...letters].some((c) => !SHOT_ALPHABET.includes(c))) return -1
  let n = 0
  for (const c of letters) n = n * SHOT_ALPHABET.length + SHOT_ALPHABET.indexOf(c) + 1
  return n - 1
}

/** The next shot name in a scene: 1A, 1B… after the highest one in use. */
export function nextShotName(sceneNumber: number, existing: string[]): string {
  const prefix = String(sceneNumber)
  let highest = -1
  for (const s of existing) {
    const m = s.trim().toUpperCase().match(/^(\d+)([A-Z]+)$/)
    if (m && m[1] === prefix) highest = Math.max(highest, shotLetterIndex(m[2]))
  }
  return prefix + shotLetters(highest + 1)
}

/** A shot name after its scene is renumbered: "3B" → "5B". Names that don't follow the pattern are kept. */
export function renumberShot(name: string, oldScene: number, newScene: number): string {
  const m = name.trim().match(/^(\d+)([A-Za-z]+)$/)
  return m && Number(m[1]) === oldScene ? `${newScene}${m[2].toUpperCase()}` : name
}

function splitShot(s: string): [number, string] {
  const m = s.trim().match(/^(\d+)(.*)$/)
  return m ? [Number(m[1]), m[2].trim().toUpperCase()] : [Number.POSITIVE_INFINITY, s.trim().toUpperCase()]
}

/** Natural order for shot numbers: 2, 9, 12, 12A, 12B, 12Z, 12AA, 13, then anything without a number. */
export function compareShotNumbers(a: string, b: string): number {
  const [na, sa] = splitShot(a)
  const [nb, sb] = splitShot(b)
  if (na !== nb) return na - nb
  // Letter runs sort like spreadsheet columns: Z comes before AA.
  if (/^[A-Z]*$/.test(sa) && /^[A-Z]*$/.test(sb) && sa.length !== sb.length) return sa.length - sb.length
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

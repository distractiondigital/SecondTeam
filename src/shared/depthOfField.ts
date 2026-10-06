import { deliveryFrame, type CameraOptics } from './camera'

// Depth of field from the real optics (thin-lens model): focal length, stop, focus distance and
// the sensor. Distances are measured along the lens axis, in metres; sensor sizes in millimetres.
// The stop is a T-stop on the lens; for depth of field it's used as the f-number (they differ by
// a few percent at most, from the light lost in the glass).

export const DEFAULT_STOP = 2.8
export const MIN_STOP = 0.7
export const MAX_STOP = 32

/** Cinema T-stops in third stops, T1.3 to T22. */
export const STOPS = [1.3, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22]

export const clampStop = (n: number) => (Number.isFinite(n) ? Math.min(MAX_STOP, Math.max(MIN_STOP, n)) : DEFAULT_STOP)

/** "T2.8", "T11". */
export const stopLabel = (n: number) => `T${Number(n.toFixed(1))}`

/**
 * Diameter of the blur circle on the sensor (mm) for something `distance` metres away when the lens
 * is focused at `focus` metres (Infinity allowed). 0 when it's exactly in focus.
 */
export function blurCircle(focalLength: number, stop: number, focus: number, distance: number): number {
  const f = focalLength
  const d = Math.max(distance * 1000, f * 1.001)
  if (!Number.isFinite(focus)) return (f * f) / (stop * d)
  const s = Math.max(focus * 1000, f * 1.001)
  return ((f * f) / (stop * (s - f))) * (Math.abs(d - s) / d)
}

/** Sharp enough to call "in focus": the delivery frame's diagonal / 1500 (≈0.029 mm on full frame). */
export function acceptableBlur(optics: CameraOptics): number {
  const frame = deliveryFrame(optics)
  return Math.hypot(frame.width / optics.squeeze, frame.height) / 1500
}

export interface FocusRange {
  /** Nearest and farthest sharp distance (m); far is Infinity past the hyperfocal distance. */
  near: number
  far: number
  /** Focus here and everything from half this distance to infinity is sharp (m). */
  hyperfocal: number
}

/** What's acceptably sharp at this stop and focus. */
export function focusRange(optics: CameraOptics, stop: number, focus: number): FocusRange {
  const f = optics.focalLength
  const c = acceptableBlur(optics)
  const h = (f * f) / (stop * c) + f // mm
  if (!Number.isFinite(focus)) return { near: h / 2000, far: Infinity, hyperfocal: h / 1000 }
  const s = focus * 1000
  const near = (s * (h - f)) / (h + s - 2 * f)
  const far = s >= h ? Infinity : (s * (h - f)) / (h - s)
  return { near: near / 1000, far: far / 1000, hyperfocal: h / 1000 }
}

/** Blur circle (mm on the sensor) to pixels in a picture `heightPx` tall showing the delivery frame. */
export function blurPixels(optics: CameraOptics, blurMm: number, heightPx: number): number {
  return (blurMm * heightPx) / deliveryFrame(optics).height
}

/** The focus distance a shot uses: its own, else its subject's, else infinity. */
export function shotFocus(focusDistance: number | null, subjectDepth: number | null | undefined): number {
  return focusDistance ?? subjectDepth ?? Infinity
}

/** Words for the AI prompt when only a shallow slice is sharp (the background falls off). */
export function focusWords(optics: CameraOptics, stop: number, focus: number): string {
  if (!Number.isFinite(focus)) return ''
  const { far } = focusRange(optics, stop, focus)
  return far < focus * 2 ? 'shallow depth of field, soft out-of-focus background' : ''
}

/** "2.6–3.8 m", "4.1 m–∞". */
export function rangeLabel(r: FocusRange, format: (m: number) => string): string {
  return `${format(r.near)}–${Number.isFinite(r.far) ? format(r.far) : '∞'}`
}

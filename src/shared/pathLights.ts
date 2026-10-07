// How our lights become the path tracer's (viewport/pathTrace.ts). Pure and tested.
//
// The path tracer only gives spot lights a size; its suns and point lights are infinitely small
// (hard shadows). So, keeping each light's real size and the light it delivers:
//   sun   → a round area light far away, as wide as the sun looks;
//   point → two spots back to back (each lights half the sphere), each with the bulb's radius;
//   spot  → a spot with the source's radius.
// The sky's fill becomes an environment of the same strength.

/** How far away the stand-in for the sun sits (m): far beyond any set, so its light is parallel. */
export const SUN_DISC_DISTANCE = 100

/** Smallest sun the path tracer gets (sine of its angular radius): ~0.1°, still sharp, never a zero-size disc. */
const MIN_SUN_SIN = 0.002

/**
 * The disc standing in for a sun of angular radius asin(sinRadius) that delivers `irradiance`
 * (light on a surface square to it, as the sun's three.js intensity): its radius at `distance`,
 * and the radiance (brightness) it must glow with. A disc of angular radius θ gives E = π·L·sin²θ.
 */
export function sunDisc(sinRadius: number, irradiance: number, distance = SUN_DISC_DISTANCE): { radius: number; radiance: number } {
  const s = Math.min(0.5, Math.max(MIN_SUN_SIN, sinRadius))
  const tan = s / Math.sqrt(1 - s * s)
  return { radius: distance * tan, radiance: irradiance / (Math.PI * s * s) }
}

/** Below this radius (m) a point light stays a plain point light. */
export const MIN_LAMP_RADIUS = 0.005

/**
 * A point light with a size as two back-to-back spots: each covers just over a half of the sphere
 * (90°, with the smallest softening so the halves meet), same intensity, the bulb's radius.
 */
export function pointAsSpots(radius: number): { angle: number; penumbra: number; radius: number }[] | null {
  if (radius < MIN_LAMP_RADIUS) return null
  const half = { angle: Math.PI / 2, penumbra: 0.002, radius }
  return [half, { ...half }]
}

/**
 * The sky environment's strength for a hemisphere fill of `intensity`. three.js lights a surface
 * facing the sky with irradiance = colour × intensity and reflects it × albedo/π; a sky of uniform
 * radiance L lights the same surface with π·L. So L = intensity / π for the same result.
 */
export function skyRadianceScale(intensity: number): number {
  return intensity / Math.PI
}

/** The path tracer's anamorphic setting for a lens squeeze: blur ovals as tall as the squeeze, upright. */
export function anamorphicRatio(squeeze: number): number {
  return 1 / Math.max(1, squeeze)
}

/**
 * three.js's film gauge (the frame's longer side, mm) that makes a camera of vertical field of
 * view `vfovDeg` and `aspect` report `focalLength` mm (the path tracer sizes its aperture as
 * focal length / stop).
 */
export function filmGaugeFor(focalLength: number, vfovDeg: number, aspect: number): number {
  return 2 * focalLength * Math.tan((vfovDeg * Math.PI) / 360) * Math.max(1, aspect)
}

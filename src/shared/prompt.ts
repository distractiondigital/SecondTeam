// Generation settings and the prompt (Milestone 6). Pure, tested.
// The prompt is assembled from the shot (what's in frame, size/angle, lens, lighting) plus the
// project's style text; the settings are project-wide.

export interface GenerationSettings {
  /** Checkpoint file name (as in backend/manifest.json); null = the first one installed. */
  checkpoint: string | null
  negative: string
  steps: number
  cfg: number
  /** 0 = loose … 1 = traces the blocking. null = Custom (strength/start/end set by hand). */
  strictness: number | null
  /** ControlNet strength, 0–1.5. */
  strength: number
  /** ControlNet start and end, as fractions of the steps. */
  start: number
  end: number
  /** Pose guide (the figures' OpenPose skeletons): strength and end, as fractions of the steps. */
  poseStrength: number
  poseEnd: number
  /** Style reference images' strength (low: a look, not a copy). */
  styleStrength: number
  /** Softness of each cast member's / prop's mask edge, in pixels. */
  feather: number
  /**
   * How much a cast member's / prop's own description outweighs the whole-frame prompt inside its
   * area (1 = equal: the frame description can leak onto it, e.g. "a young woman" onto a detective).
   */
  regionStrength: number
  /** Where cast and prop references stop guiding, as a fraction of the steps. */
  referenceEnd: number
  /** Takes per Generate. */
  takes: number
  seed: number
  /** Locked: every Generate starts from `seed`. Unlocked: a new random seed each time. */
  seedLocked: boolean
}

export const DEFAULT_NEGATIVE =
  'blurry, lowres, jpeg artifacts, deformed, disfigured, bad anatomy, extra limbs, extra fingers, text, watermark, signature, frame, border'

export const DEFAULT_GENERATION: GenerationSettings = {
  checkpoint: null,
  negative: DEFAULT_NEGATIVE,
  steps: 30,
  cfg: 5,
  strictness: 0.5,
  ...strictnessToControl(0.5),
  poseStrength: 0.7,
  poseEnd: 0.8,
  styleStrength: 0.35,
  feather: 16,
  regionStrength: 1.8,
  referenceEnd: 0.8,
  takes: 2,
  seed: 1,
  seedLocked: false
}

export const MAX_TAKES = 8
const MAX_SEED = 2 ** 32 - 1

/**
 * Strictness 0–1 as depth-guide settings: stronger, and guiding more of the steps, the stricter it
 * is. (The pose guide has its own strength: figures follow their skeletons at any strictness.)
 */
export function strictnessToControl(s: number): { strength: number; start: number; end: number } {
  const t = clamp(s, 0, 1)
  return { strength: round(0.35 + 0.5 * t), start: 0, end: round(0.4 + 0.5 * t) }
}

/**
 * How much to soften the depth pass before it guides the image (Gaussian blur, in pixels for the
 * given width): enough to lose the mannequin's ball joints, not the shapes of the set.
 */
export function depthBlur(width: number): { radius: number; sigma: number } {
  const radius = Math.round(clamp(width / 185, 1, 31))
  return { radius, sigma: round(clamp(radius / 3, 0.1, 10)) }
}

/** Feather (px) as mask operations: grow the mask by half, then blur by the full amount. */
export function featherMask(feather: number): { grow: number; blurRadius: number; blurSigma: number } {
  const f = clamp(feather, 0, 64)
  return { grow: Math.round(f / 2), blurRadius: Math.round(clamp(f, 1, 31)), blurSigma: round(clamp(f / 3, 0.1, 10)) }
}

/** Most cast members / props whose reference images are used in one take (graphics-card memory). */
export const MAX_REFERENCED = 6

export function repairGeneration(raw: unknown): GenerationSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<GenerationSettings>
  const d = DEFAULT_GENERATION
  const num = (v: unknown, fallback: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback
  const strictness = r.strictness === null ? null : num(r.strictness, d.strictness!, 0, 1)
  // With a strictness set, the depth guide always follows it (so a remapped slider updates old projects).
  const fromStrictness = strictness === null ? null : strictnessToControl(strictness)
  const start = fromStrictness?.start ?? num(r.start, d.start, 0, 1)
  return {
    checkpoint: typeof r.checkpoint === 'string' && r.checkpoint ? r.checkpoint : null,
    negative: typeof r.negative === 'string' ? r.negative : d.negative,
    steps: Math.round(num(r.steps, d.steps, 1, 150)),
    cfg: num(r.cfg, d.cfg, 1, 20),
    strictness,
    strength: fromStrictness?.strength ?? num(r.strength, d.strength, 0, 1.5),
    start,
    end: fromStrictness?.end ?? Math.max(start, num(r.end, d.end, 0, 1)),
    poseStrength: num(r.poseStrength, d.poseStrength, 0, 1.5),
    poseEnd: num(r.poseEnd, d.poseEnd, 0, 1),
    styleStrength: num(r.styleStrength, d.styleStrength, 0, 1.5),
    feather: Math.round(num(r.feather, d.feather, 0, 64)),
    regionStrength: num(r.regionStrength, d.regionStrength, 0.5, 4),
    referenceEnd: num(r.referenceEnd, d.referenceEnd, 0.1, 1),
    takes: Math.round(num(r.takes, d.takes, 1, MAX_TAKES)),
    seed: Math.round(num(r.seed, d.seed, 0, MAX_SEED)),
    seedLocked: r.seedLocked === true
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * MAX_SEED)
}

/** One seed per take: seed, seed + 1, … (wrapping), so any take can be reproduced on its own. */
export function takeSeeds(seed: number, takes: number): number[] {
  return Array.from({ length: takes }, (_, i) => (seed + i) % (MAX_SEED + 1))
}

export interface PromptParts {
  /** What's in the frame, written for the shot. */
  description: string
  /** Which way the subject figure faces, e.g. 'facing the camera' (null = no figure). */
  facing: string | null
  /** e.g. 'Medium close-up' (the override if set). */
  size: string | null
  /** e.g. 'Low angle'. */
  angle: string | null
  focalLength: number
  /** Anamorphic squeeze of the camera body. */
  squeeze: number
  lighting: string
  style: string
}

/** The positive prompt: description, shot size and angle, lens, lighting, style. Empty parts are skipped. */
export function buildPrompt(p: PromptParts): string {
  const lens = `${Math.round(p.focalLength)}mm ${p.squeeze >= 1.3 ? 'anamorphic ' : ''}lens`
  const shot = [p.size, p.angle]
    .filter(Boolean)
    .map((s) => s!.toLowerCase())
    .join(', ')
  return [p.description, p.facing, shot, lens, p.lighting.toLowerCase(), p.style]
    .map((s) => (s ?? '').trim().replace(/[\s,]+$/, ''))
    .filter(Boolean)
    .join(', ')
}

type V3 = [number, number, number]

/**
 * Which way a figure faces as the camera sees it, from its body's forward direction, the direction
 * from the figure to the lens, and the camera's right. Only the horizontal part counts.
 */
export function facingPhrase(bodyForward: V3, toCamera: V3, cameraRight: V3): string | null {
  const flat = (v: V3): [number, number] | null => {
    const l = Math.hypot(v[0], v[2])
    return l < 1e-6 ? null : [v[0] / l, v[2] / l]
  }
  const f = flat(bodyForward)
  const c = flat(toCamera)
  const r = flat(cameraRight)
  if (!f || !c || !r) return null
  const toward = f[0] * c[0] + f[1] * c[1] // 1 = straight at the lens, -1 = straight away
  const side = f[0] * r[0] + f[1] * r[1] > 0 ? 'right' : 'left'
  if (toward > 0.82) return 'facing the camera'
  if (toward < -0.82) return 'seen from behind, back to the camera'
  if (Math.abs(toward) < 0.42) return `in profile, facing camera ${side}`
  return toward > 0 ? `three-quarter view, facing camera ${side}` : `seen from behind at three-quarters, turned away to camera ${side}`
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}

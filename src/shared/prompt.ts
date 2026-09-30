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
  takes: 2,
  seed: 1,
  seedLocked: false
}

export const MAX_TAKES = 8
const MAX_SEED = 2 ** 32 - 1

/** Strictness 0–1 as ControlNet settings: stronger, and guiding more of the steps, the stricter it is. */
export function strictnessToControl(s: number): { strength: number; start: number; end: number } {
  const t = clamp(s, 0, 1)
  return { strength: round(0.35 + 0.55 * t), start: 0, end: round(0.4 + 0.6 * t) }
}

export function repairGeneration(raw: unknown): GenerationSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<GenerationSettings>
  const d = DEFAULT_GENERATION
  const num = (v: unknown, fallback: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback
  const start = num(r.start, d.start, 0, 1)
  return {
    checkpoint: typeof r.checkpoint === 'string' && r.checkpoint ? r.checkpoint : null,
    negative: typeof r.negative === 'string' ? r.negative : d.negative,
    steps: Math.round(num(r.steps, d.steps, 1, 150)),
    cfg: num(r.cfg, d.cfg, 1, 20),
    strictness: r.strictness === null ? null : num(r.strictness, d.strictness!, 0, 1),
    strength: num(r.strength, d.strength, 0, 1.5),
    start,
    end: Math.max(start, num(r.end, d.end, 0, 1)),
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
  return [p.description, shot, lens, p.lighting.toLowerCase(), p.style]
    .map((s) => (s ?? '').trim().replace(/[\s,]+$/, ''))
    .filter(Boolean)
    .join(', ')
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}

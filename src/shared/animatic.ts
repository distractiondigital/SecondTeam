// The animatic (Milestone 18): the project's shots cut together on a timeline, each held for its
// own length. Its own edit, apart from the Board: shots can be left out or used more than once.
// Lengths are whole frames at the project's frame rate. Pure, tested.

/** One use of a shot on the timeline. */
export interface AnimaticClip {
  id: string
  /** The shot's camera id. */
  shotId: string
  /** Length in frames (at the animatic's fps). */
  frames: number
}

export interface Animatic {
  /** Frames per second: one of FPS_OPTIONS. */
  fps: number
  clips: AnimaticClip[]
}

export const FPS_OPTIONS = [23.976, 24, 25, 30] as const
export const DEFAULT_FPS = 24
/** A new clip's length (seconds). */
export const DEFAULT_CLIP_SECONDS = 3
/** The longest a clip can be (seconds). */
export const MAX_CLIP_SECONDS = 600

export function emptyAnimatic(): Animatic {
  return { fps: DEFAULT_FPS, clips: [] }
}

/** The real frame rate: 23.976 is 24000/1001. */
export function realFps(fps: number): number {
  return fps === 23.976 ? 24000 / 1001 : fps
}

/** Frames counted per timecode second: 23.976 counts like 24 (non-drop). */
export function timecodeBase(fps: number): number {
  return Math.round(fps)
}

export function cleanFps(raw: unknown): number {
  return FPS_OPTIONS.find((f) => f === raw) ?? DEFAULT_FPS
}

/** Seconds → whole frames (at least one). */
export function framesFor(seconds: number, fps: number): number {
  return Math.max(1, Math.round(seconds * realFps(fps)))
}

export function secondsFor(frames: number, fps: number): number {
  return frames / realFps(fps)
}

/** A clip length kept between one frame and MAX_CLIP_SECONDS. */
export function clampFrames(frames: number, fps: number): number {
  if (!Number.isFinite(frames)) return framesFor(DEFAULT_CLIP_SECONDS, fps)
  return Math.min(framesFor(MAX_CLIP_SECONDS, fps), Math.max(1, Math.round(frames)))
}

/** 'HH:MM:SS:FF' */
export function timecode(frames: number, fps: number): string {
  const base = timecodeBase(fps)
  const f = Math.max(0, Math.floor(frames))
  const p = (n: number) => String(n).padStart(2, '0')
  const totalSeconds = Math.floor(f / base)
  return `${p(Math.floor(totalSeconds / 3600))}:${p(Math.floor(totalSeconds / 60) % 60)}:${p(totalSeconds % 60)}:${p(f % base)}`
}

/** '3.0 s', '12.5 s', '1:05.0' */
export function lengthLabel(frames: number, fps: number): string {
  const s = secondsFor(frames, fps)
  if (s < 60) return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}

export interface ClipTime {
  clip: AnimaticClip
  index: number
  /** First frame. */
  start: number
  /** One past the last frame. */
  end: number
}

/** Where each clip starts and ends on the timeline. */
export function clipTimes(clips: AnimaticClip[]): ClipTime[] {
  let at = 0
  return clips.map((clip, index) => {
    const t = { clip, index, start: at, end: at + clip.frames }
    at = t.end
    return t
  })
}

export function totalFrames(clips: AnimaticClip[]): number {
  return clips.reduce((sum, c) => sum + c.frames, 0)
}

/** The clip showing at a frame (the last one at or past the end; null when there are none). */
export function clipAt(clips: AnimaticClip[], frame: number): ClipTime | null {
  const times = clipTimes(clips)
  if (!times.length) return null
  return times.find((t) => frame < t.end) ?? times[times.length - 1]
}

/** Lengths at a new frame rate: each clip keeps its length in seconds (to the nearest frame). */
export function changeFps(clips: AnimaticClip[], from: number, to: number): AnimaticClip[] {
  return clips.map((c) => ({ ...c, frames: clampFrames(framesFor(secondsFor(c.frames, from), to), to) }))
}

/** Clips inserted before index `at` (at the end when it's past it). */
export function insertClips(clips: AnimaticClip[], added: AnimaticClip[], at: number): AnimaticClip[] {
  const i = Math.max(0, Math.min(clips.length, Math.round(at)))
  return [...clips.slice(0, i), ...added, ...clips.slice(i)]
}

/** A clip moved before another (or to the end when `beforeId` is null). */
export function moveClip(clips: AnimaticClip[], id: string, beforeId: string | null): AnimaticClip[] {
  const moving = clips.find((c) => c.id === id)
  if (!moving || id === beforeId) return clips
  const rest = clips.filter((c) => c.id !== id)
  const at = beforeId === null ? rest.length : rest.findIndex((c) => c.id === beforeId)
  rest.splice(at < 0 ? rest.length : at, 0, moving)
  return rest
}

/** Shots (in the given order) that aren't in the animatic. */
export function missingShots(clips: AnimaticClip[], shotIds: string[]): string[] {
  const used = new Set(clips.map((c) => c.shotId))
  return shotIds.filter((id) => !used.has(id))
}

/** The insertion index for a point on the timeline: before the clip whose middle is past it. */
export function dropIndex(clips: AnimaticClip[], frame: number): number {
  const i = clipTimes(clips).findIndex((t) => frame < (t.start + t.end) / 2)
  return i < 0 ? clips.length : i
}

/** A loaded animatic, checked: known fps, clips of shots that exist, sane lengths, unique ids. */
export function sanitizeAnimatic(raw: unknown, shotIds: Set<string>): Animatic {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { fps?: unknown; clips?: unknown }
  const fps = cleanFps(r.fps)
  const seen = new Set<string>()
  const clips: AnimaticClip[] = []
  for (const c of Array.isArray(r.clips) ? r.clips : []) {
    if (!c || typeof c !== 'object') continue
    const { id, shotId, frames } = c as Record<string, unknown>
    if (typeof id !== 'string' || !id || seen.has(id) || typeof shotId !== 'string' || !shotIds.has(shotId)) continue
    seen.add(id)
    clips.push({ id, shotId, frames: clampFrames(typeof frames === 'number' ? frames : NaN, fps) })
  }
  return { fps, clips }
}

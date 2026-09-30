// What the UI and the main process exchange about generation: the job, its progress events,
// finished takes and the backend's status. (Types only; the work happens in src/main/backend.)

export type BackendState = 'not-installed' | 'starting' | 'ready' | 'error' | 'stopped'

export interface BackendStatus {
  state: BackendState
  message: string
  /** http://127.0.0.1:<port> once running. */
  url: string | null
  comfyVersion: string | null
  logFile: string
}

/** A checkpoint from the manifest that's installed. */
export interface InstalledModel {
  file: string
  name: string
  license: string
  style: string
}

export interface GenerationJob {
  /** Project folder (must be one chosen through Save/Open). */
  folder: string
  sceneId: string
  shotId: string
  shotName: string
  width: number
  height: number
  /** The shot's depth and pose passes as PNG data URLs. */
  depthPng: string
  posePng: string
  /** False when no figure is in frame: the pose guide is skipped. */
  hasPose: boolean
  positive: string
  negative: string
  checkpoint: string
  steps: number
  cfg: number
  strength: number
  start: number
  end: number
  poseStrength: number
  poseEnd: number
  /** One take per seed. */
  seeds: number[]
  /** Anything else worth keeping in each take's sidecar (lens, shot size…). */
  extra: Record<string, unknown>
}

export interface TakeInfo {
  id: string
  shotId: string
  createdAt: string
  seed: number
  checkpoint: string
  /** Small JPEG data URL for the take strip. */
  thumbnail: string
}

/** Everything saved next to a take's PNG (<id>.json). */
export interface TakeMeta {
  format: 'secondteam-take'
  version: 1
  id: string
  createdAt: string
  scene: { id: string }
  shot: { id: string; name: string }
  seed: number
  width: number
  height: number
  positive: string
  negative: string
  model: { file: string; name: string; license: string }
  controlnet: {
    file: string
    license: string
    depth: { strength: number; start: number; end: number; blur: number }
    pose: { strength: number; end: number } | null
  }
  sampler: { steps: number; cfg: number; sampler: string; scheduler: string }
  workflow: string
  backend: { comfyui: string | null }
  extra: Record<string, unknown>
}

export type GenerationEvent =
  | { type: 'take-start'; index: number; total: number; seed: number }
  | { type: 'progress'; index: number; value: number; max: number }
  | { type: 'preview'; index: number; dataUrl: string }
  | { type: 'take-done'; index: number; take: TakeInfo }
  | { type: 'finished'; cancelled: boolean; error: string | null }

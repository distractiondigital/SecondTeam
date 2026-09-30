import { create } from 'zustand'
import { buildPrompt, randomSeed, takeSeeds } from '../../../shared/prompt'
import type { BackendStatus, GenerationEvent, InstalledModel, TakeInfo, TakeMeta } from '../../../shared/takes'
import { activeScene, sceneForShot, useDocument } from './documentStore'
import { renderAndSavePasses } from './passes'
import { useUi } from './uiStore'

// Generating takes: the AI engine's status, the installed models, the running job and its live
// progress, each shot's takes (read from the project folder), and the take viewer.
// None of this is part of the document (not saved in project.json, not undoable).

export interface RunningJob {
  sceneId: string
  shotId: string
  shotName: string
  total: number
  /** Take being made (0-based). */
  index: number
  seed: number
  step: number
  steps: number
  preview: string | null
  cancelling: boolean
}

export interface OpenTake {
  shotId: string
  takeId: string
  image: string | null
  meta: TakeMeta | null
}

interface GenerationState {
  status: BackendStatus | null
  models: InstalledModel[]
  job: RunningJob | null
  /** Takes per shot id, newest first. */
  takes: Record<string, TakeInfo[]>
  viewer: OpenTake | null
  /** Last error from a Generate, shown in the take strip. */
  error: string | null
}

export const useGeneration = create<GenerationState>()(() => ({
  status: null,
  models: [],
  job: null,
  takes: {},
  viewer: null,
  error: null
}))

const api = () => window.secondTeam

/** Hook up the backend status and generation events (once, at startup). Returns a cleanup. */
export function connectGeneration(): () => void {
  const refreshModels = async () => useGeneration.setState({ models: await api().installedModels() })
  const onStatus = (status: BackendStatus) => {
    const was = useGeneration.getState().status?.state
    useGeneration.setState({ status })
    if (status.state === 'ready' && was !== 'ready') void refreshModels()
  }
  void api().backendStatus().then(onStatus)
  const offStatus = api().onBackendStatus(onStatus)
  const offEvents = api().onGenerationEvent(onEvent)
  return () => {
    offStatus()
    offEvents()
  }
}

function onEvent(e: GenerationEvent): void {
  const { job } = useGeneration.getState()
  if (!job) return
  if (e.type === 'take-start') {
    useGeneration.setState({ job: { ...job, index: e.index, seed: e.seed, step: 0, preview: null } })
  } else if (e.type === 'progress') {
    useGeneration.setState({ job: { ...job, step: e.value, steps: e.max } })
  } else if (e.type === 'preview') {
    useGeneration.setState({ job: { ...job, preview: e.dataUrl } })
  } else if (e.type === 'take-done') {
    const takes = useGeneration.getState().takes
    useGeneration.setState({ takes: { ...takes, [e.take.shotId]: [e.take, ...(takes[e.take.shotId] ?? [])] } })
  } else if (e.type === 'finished') {
    useGeneration.setState({ job: null, error: e.cancelled ? null : e.error })
  }
}

/** Load a shot's takes from the project folder. */
export async function loadTakes(shotId: string): Promise<void> {
  const folder = useUi.getState().projectPath
  const sceneId = useDocument.getState().sceneId
  const takes = folder ? await api().listTakes(folder, sceneId, shotId) : []
  useGeneration.setState((s) => ({ takes: { ...s.takes, [shotId]: takes } }))
}

/** The checkpoint Generate will use: the project's choice if installed, else the first installed. */
export function currentModel(): InstalledModel | null {
  const { models } = useGeneration.getState()
  const wanted = useDocument.getState().project.generation.checkpoint
  return models.find((m) => m.file === wanted) ?? models[0] ?? null
}

/** The positive prompt for a shot, as it will be sent. */
export function shotPrompt(shotId: string): string {
  const state = useDocument.getState()
  const shot = sceneForShot(state, shotId)[shotId]
  if (!shot || shot.type !== 'camera') return ''
  const info = useUi.getState().shotInfo[shotId]
  return buildPrompt({
    description: shot.description,
    facing: info?.facing ?? null,
    size: shot.sizeOverride ?? info?.size?.label ?? null,
    angle: shot.angleOverride ?? info?.angle ?? null,
    focalLength: shot.focalLength,
    squeeze: state.project.camera.squeeze,
    lighting: shot.lightingOverride ?? info?.lighting ?? '',
    style: state.project.styleText
  })
}

/** Why Generate can't run right now (null = it can). */
export function generateBlocker(): string | null {
  const { status, job } = useGeneration.getState()
  if (job) return 'Already generating.'
  if (!useUi.getState().projectPath) return 'Save the project first: takes are stored in the project folder.'
  if (!status || status.state !== 'ready') return status?.message || 'The AI engine is starting…'
  if (!currentModel()) return 'No model is installed. Run: node scripts/fetch-backend.mjs'
  return null
}

/** Render the shot's passes and generate its takes. */
export async function generateShot(shotId: string): Promise<void> {
  const blocker = generateBlocker()
  const model = currentModel()
  const folder = useUi.getState().projectPath
  if (blocker || !model || !folder) {
    if (blocker) useGeneration.setState({ error: blocker })
    return
  }
  const state = useDocument.getState()
  const scene = activeScene(state)
  const shot = sceneForShot(state, shotId)[shotId]
  if (!shot || shot.type !== 'camera') return
  const settings = state.project.generation
  const seeds = takeSeeds(settings.seedLocked ? settings.seed : randomSeed(), settings.takes)

  useGeneration.setState({
    error: null,
    job: {
      sceneId: scene.id,
      shotId,
      shotName: shot.shotNumber,
      total: seeds.length,
      index: 0,
      seed: seeds[0],
      step: 0,
      steps: settings.steps,
      preview: null,
      cancelling: false
    }
  })
  // Let the strip show the job before the (briefly blocking) pass render.
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  const passes = await renderAndSavePasses(shotId)
  if (!passes) {
    useGeneration.setState({ job: null, error: "Couldn't render the shot's depth pass." })
    return
  }
  const info = useUi.getState().shotInfo[shotId]
  await api().generate({
    folder,
    sceneId: scene.id,
    shotId,
    shotName: shot.shotNumber,
    width: passes.result.width,
    height: passes.result.height,
    depthPng: passes.result.images.depth,
    posePng: passes.result.images.pose,
    hasPose: passes.result.figures > 0,
    positive: shotPrompt(shotId),
    negative: settings.negative,
    checkpoint: model.file,
    steps: settings.steps,
    cfg: settings.cfg,
    strength: settings.strength,
    start: settings.start,
    end: settings.end,
    poseStrength: settings.poseStrength,
    poseEnd: settings.poseEnd,
    seeds,
    extra: {
      focalLength: shot.focalLength,
      shotSize: shot.sizeOverride ?? info?.size?.label ?? null,
      angle: shot.angleOverride ?? info?.angle ?? null,
      lighting: shot.lightingOverride ?? info?.lighting ?? '',
      description: shot.description,
      facing: info?.facing ?? null,
      style: state.project.styleText,
      strictness: settings.strictness
    }
  })
}

export async function cancelGeneration(): Promise<void> {
  const { job } = useGeneration.getState()
  if (!job) return
  useGeneration.setState({ job: { ...job, cancelling: true } })
  await api().cancelGeneration()
}

/** Open a take in the viewer (loading its full image). */
export async function openTake(shotId: string, takeId: string): Promise<void> {
  const folder = useUi.getState().projectPath
  if (!folder) return
  useGeneration.setState({ viewer: { shotId, takeId, image: null, meta: null } })
  const r = await api().readTake(folder, useDocument.getState().sceneId, shotId, takeId)
  if (useGeneration.getState().viewer?.takeId !== takeId) return
  if ('error' in r) useGeneration.setState({ viewer: null, error: r.error })
  else useGeneration.setState({ viewer: { shotId, takeId, image: r.image, meta: r.meta } })
}

/** Flip to the next (older) or previous (newer) take in the viewer. */
export function stepTake(direction: 1 | -1): void {
  const { viewer, takes } = useGeneration.getState()
  if (!viewer) return
  const list = takes[viewer.shotId] ?? []
  const i = list.findIndex((t) => t.id === viewer.takeId)
  const next = list[i + direction]
  if (next) void openTake(viewer.shotId, next.id)
}

export function closeTake(): void {
  useGeneration.setState({ viewer: null })
}

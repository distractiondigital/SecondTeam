import { create } from 'zustand'
import { expressionPhrase } from '../../../shared/humanBody'
import { buildPrompt, materialWords, randomSeed, regionPrompt, takeSeeds } from '../../../shared/prompt'
import type { IdEntry } from '../../../shared/passes'
import { descriptionFor, type CameraNode, type SceneNode } from '../../../shared/project'
import { opticsFor, type CameraKit } from '../../../shared/camera'
import { focusWords, shotFocus } from '../../../shared/depthOfField'
import type { ShotInfo } from '../viewport/shotInfo'
import type { BackendStatus, GenerationEvent, InstalledModel, JobEntity, TakeInfo, TakeMeta } from '../../../shared/takes'
import { activeScene, sceneForShot, sceneOfShot, useDocument } from './documentStore'
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
  /** A second take of the same shot, shown beside (or wiped against) this one. */
  compare: CompareTake | null
}

export interface CompareTake {
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
  /** How two takes are compared: side by side, or one frame with a wipe divider. */
  compareMode: 'side' | 'wipe'
  /** Last error from a Generate, shown in the take strip. */
  error: string | null
  /** A heads-up from the last Generate (e.g. references left out). */
  notice: string | null
}

export const useGeneration = create<GenerationState>()(() => ({
  status: null,
  models: [],
  job: null,
  takes: {},
  viewer: null,
  compareMode: 'side',
  error: null,
  notice: null
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
  if (e.type === 'notice') {
    useGeneration.setState({ notice: e.message })
  } else if (e.type === 'take-start') {
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
/** Load a shot's takes from the project folder (a shot in another scene needs its scene id). */
export async function loadTakes(shotId: string, sceneId = useDocument.getState().sceneId): Promise<void> {
  const folder = useUi.getState().projectPath
  const takes = folder ? await api().listTakes(folder, sceneId, shotId) : []
  useGeneration.setState((s) => ({ takes: { ...s.takes, [shotId]: takes } }))
}

/** The checkpoint Generate will use: the project's choice if installed, else the first installed. */
export function currentModel(): InstalledModel | null {
  const { models } = useGeneration.getState()
  const wanted = useDocument.getState().project.generation.checkpoint
  return models.find((m) => m.file === wanted) ?? models[0] ?? null
}

/** 'shallow depth of field, …' when only a thin slice around the focus is sharp. */
function shotFocusWords(shot: CameraNode, kit: CameraKit, info: ShotInfo | undefined): string {
  return focusWords(opticsFor(kit, shot.focalLength), shot.aperture, shotFocus(shot.focusDistance, info?.subjectDepth))
}

/** The positive prompt for a shot, as it will be sent. */
export function shotPrompt(shotId: string): string {
  const state = useDocument.getState()
  const shot = sceneForShot(state, shotId)[shotId]
  if (!shot || shot.type !== 'camera') return ''
  const info = useUi.getState().shotInfo[shotId]
  return buildPrompt({
    description: shot.description,
    // Which way each figure faces goes in that figure's own prompt, not the shot's.
    facing: null,
    size: shot.sizeOverride ?? info?.size?.label ?? null,
    angle: shot.angleOverride ?? info?.angle ?? null,
    focalLength: shot.focalLength,
    squeeze: state.project.camera.squeeze,
    focus: shotFocusWords(shot, state.project.camera, info),
    lighting: shot.lightingOverride ?? info?.lighting ?? '',
    style: state.project.styleText
  })
}

/** Why Generate can't run right now (null = it can). */
export function generateBlocker(): string | null {
  const { status, job } = useGeneration.getState()
  if (job) return 'Already generating.'
  if (!useUi.getState().projectPath) return 'Save the project first: takes are stored in the project folder.'
  if (status?.state === 'unavailable') return 'AI on Mac is coming soon (or connect your own ComfyUI in Engine settings → Advanced).'
  if (!status || status.state !== 'ready') return status?.message || 'The AI engine is starting…'
  if (!currentModel()) return 'No model is installed: open Engine settings (the AI light) to add one.'
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
    notice: null,
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
    // The full depth (so objects hidden behind people stay hidden); the figures' own areas skip it.
    depthPng: passes.result.images.depth,
    posePng: passes.result.images.pose,
    hasPose: passes.result.figures > 0,
    idPng: passes.result.images.id,
    entities: jobEntities(passes.result.legend, shotId, passes.result.facings),
    style: state.project.styleImages.length ? { images: state.project.styleImages, strength: settings.styleStrength } : null,
    feather: settings.feather,
    referenceEnd: settings.referenceEnd,
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
      style: state.project.styleText,
      strictness: settings.strictness
    }
  })
}

/** The cast members, props and described objects in frame, with their prompts and reference images. */
function jobEntities(legend: IdEntry[], shotId: string, facings: Record<string, string | null>): JobEntity[] {
  const state = useDocument.getState()
  const { project } = state
  const nodes: Record<string, SceneNode> = sceneForShot(state, shotId)
  const shot = nodes[shotId]
  const info = useUi.getState().shotInfo[shotId]
  const context = {
    size: shot?.type === 'camera' ? (shot.sizeOverride ?? info?.size?.label ?? null) : null,
    angle: shot?.type === 'camera' ? (shot.angleOverride ?? info?.angle ?? null) : null,
    focalLength: shot?.type === 'camera' ? shot.focalLength : 35,
    squeeze: project.camera.squeeze,
    focus: shot?.type === 'camera' ? shotFocusWords(shot, project.camera, info) : '',
    lighting: shot?.type === 'camera' ? (shot.lightingOverride ?? info?.lighting ?? '') : '',
    style: project.styleText
  }
  // Its own full prompt: description, which way its figure faces, and the shot's context.
  const own = (description: string, e: IdEntry): string | null => {
    const figure = e.nodeIds.find((id) => nodes[id]?.type === 'mannequin')
    // An extra (a figure with no cast member or description) is still a person.
    const text = description.trim() || (figure ? 'a person' : '')
    if (!text) return null
    // A human figure's expression goes with its own description ("…, smiling").
    const f = figure ? nodes[figure] : undefined
    const phrase = f?.type === 'mannequin' && f.style === 'human' ? expressionPhrase(f.expression) : ''
    // A little extra weight (ComfyUI's "(words:1.3)"), or a small face change gets lost in a wide frame.
    const expression = phrase ? `(${phrase}:1.3)` : ''
    return regionPrompt([text, expression].filter(Boolean).join(', '), figure ? (facings[figure] ?? null) : null, context)
  }
  const isFigure = (e: IdEntry) => e.nodeIds.some((id) => nodes[id]?.type === 'mannequin')
  // This scene's / this shot's own text for a cast member or prop, if it has one.
  const scene = sceneOfShot(state, shotId)
  const text = (entity: { id: string; description: string }) => descriptionFor(entity, scene, shot?.type === 'camera' ? shot : null)
  // What it's made of: "…, metal" (objects and props; figures have no material).
  const withMaterial = (description: string, ids: string[]) => {
    const words = [...new Set(ids.map((id) => materialWords(nodes, id)).filter(Boolean))].join(', ')
    return [description.trim(), words].filter(Boolean).join(', ')
  }
  const out: JobEntity[] = []
  for (const e of legend) {
    if (!e.pixels) continue // not in frame
    if (e.kind === 'cast') {
      const c = project.cast.find((x) => x.id === e.refId)
      if (c) out.push({ name: c.name, kind: 'cast', ownerId: c.id, color: e.color, text: own(text(c), e), images: c.images, strength: c.strength, figure: isFigure(e) })
    } else if (e.kind === 'prop') {
      const p = project.props.find((x) => x.id === e.refId)
      if (p) out.push({ name: p.name, kind: 'props', ownerId: p.id, color: e.color, text: own(withMaterial(text(p), e.nodeIds), e), images: p.images, strength: p.strength, figure: isFigure(e) })
    } else {
      const n = nodes[e.refId]
      const description = n && 'description' in n ? n.description : ''
      const own_ = own(description.trim() ? withMaterial(description, [e.refId]) : '', e)
      if (own_) out.push({ name: e.name, kind: 'object', ownerId: e.refId, color: e.color, text: own_, images: [], strength: 0, figure: isFigure(e) })
    }
  }
  return out
}

export async function cancelGeneration(): Promise<void> {
  const { job } = useGeneration.getState()
  if (!job) return
  useGeneration.setState({ job: { ...job, cancelling: true } })
  await api().cancelGeneration()
}

/** Open a take in the viewer (loading its full image). `keepCompare` keeps a second take beside it. */
export async function openTake(shotId: string, takeId: string, keepCompare = false): Promise<void> {
  const folder = useUi.getState().projectPath
  if (!folder) return
  const before = useGeneration.getState().viewer
  const compare = keepCompare && before?.shotId === shotId ? before.compare : null
  useGeneration.setState({ viewer: { shotId, takeId, image: null, meta: null, compare } })
  const r = await api().readTake(folder, useDocument.getState().sceneId, shotId, takeId)
  const now = useGeneration.getState().viewer
  if (now?.takeId !== takeId) return
  if ('error' in r) useGeneration.setState({ viewer: null, error: r.error })
  else useGeneration.setState({ viewer: { ...now, image: r.image, meta: r.meta } })
}

/**
 * Compare a take with the one open in the viewer (same shot), side by side or with a wipe. If the
 * viewer isn't open on that shot, it just opens the take.
 */
export async function openCompare(shotId: string, takeId: string): Promise<void> {
  const folder = useUi.getState().projectPath
  const viewer = useGeneration.getState().viewer
  if (!folder) return
  if (!viewer || viewer.shotId !== shotId) return openTake(shotId, takeId)
  if (viewer.takeId === takeId) return
  useGeneration.setState({ viewer: { ...viewer, compare: { takeId, image: null, meta: null } } })
  const r = await api().readTake(folder, useDocument.getState().sceneId, shotId, takeId)
  const now = useGeneration.getState().viewer
  if (now?.compare?.takeId !== takeId) return
  if ('error' in r) useGeneration.setState({ viewer: { ...now, compare: null }, error: r.error })
  else useGeneration.setState({ viewer: { ...now, compare: { takeId, image: r.image, meta: r.meta } } })
}

/** Back to one take in the viewer. */
export function closeCompare(): void {
  const viewer = useGeneration.getState().viewer
  if (viewer) useGeneration.setState({ viewer: { ...viewer, compare: null } })
}

/**
 * Flip to the next (older) or previous (newer) take in the viewer. When comparing, `side` says
 * which one flips: 'b' (the second take) or 'a' (the first); it skips over the other one.
 */
export function stepTake(direction: 1 | -1, side: 'a' | 'b' = 'a'): void {
  const { viewer, takes } = useGeneration.getState()
  if (!viewer) return
  const list = takes[viewer.shotId] ?? []
  const current = side === 'b' && viewer.compare ? viewer.compare.takeId : viewer.takeId
  const other = side === 'b' ? viewer.takeId : viewer.compare?.takeId
  let i = list.findIndex((t) => t.id === current) + direction
  if (list[i]?.id === other) i += direction
  const next = list[i]
  if (!next) return
  if (side === 'b' && viewer.compare) void openCompare(viewer.shotId, next.id)
  else void openTake(viewer.shotId, next.id, true)
}

/** The shot's circle take, or null. */
export function circleTakeOf(shotId: string): string | null {
  const n = activeScene(useDocument.getState()).nodes[shotId]
  return n?.type === 'camera' ? n.circleTake : null
}

/** Circle this take (the one the storyboard uses), or un-circle it if it already is. Undoable. */
export function toggleCircleTake(shotId: string, takeId: string): void {
  useDocument.getState().updateNode(shotId, { circleTake: circleTakeOf(shotId) === takeId ? null : takeId })
}

/**
 * Move a take to the Recycle Bin and drop it from the strip. If it was the circle take, the shot has
 * none afterwards; if it's open in the viewer, the viewer moves on to the next one.
 */
export async function deleteTake(shotId: string, takeId: string): Promise<void> {
  const folder = useUi.getState().projectPath
  if (!folder) return
  const list = useGeneration.getState().takes[shotId] ?? []
  const i = list.findIndex((t) => t.id === takeId)
  const r = await api().deleteTake(folder, useDocument.getState().sceneId, shotId, takeId)
  if ('error' in r) {
    useGeneration.setState({ error: r.error })
    return
  }
  const rest = (useGeneration.getState().takes[shotId] ?? []).filter((t) => t.id !== takeId)
  useGeneration.setState((s) => ({ takes: { ...s.takes, [shotId]: rest } }))
  if (circleTakeOf(shotId) === takeId) useDocument.getState().updateNode(shotId, { circleTake: null })
  const viewer = useGeneration.getState().viewer
  if (viewer?.compare?.takeId === takeId) closeCompare()
  if (viewer?.takeId === takeId) {
    const next = rest[Math.min(Math.max(i, 0), rest.length - 1)]
    if (next) void openTake(shotId, next.id)
    else closeTake()
  }
}

export function closeTake(): void {
  useGeneration.setState({ viewer: null })
}

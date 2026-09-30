import { readFileSync } from 'fs'
import { join } from 'path'
import { depthBlur, featherMask, MAX_REFERENCED } from '../../shared/prompt'
import { readAssetAsPng } from '../assetFiles'
import type { BackendStatus, GenerationEvent, GenerationJob, InstalledModel, TakeMeta } from '../../shared/takes'
import { ComfyClient } from './comfyClient'
import { ComfyProcess } from './comfyProcess'
import { newTakeId, saveTake, takesFolder } from './takeFiles'
import { composeWorkflow, parseFragment, parseTemplate, type ComposeInput, type WorkflowTemplate } from './workflow'

// The generation layer. The app only talks to a GenerationBackend, so other model families or
// backends can be added later; ComfyBackend runs the SDXL + depth ControlNet workflow on the
// managed ComfyUI.

export interface GenerationBackend {
  status(): BackendStatus
  /** Installed checkpoints the user can pick. */
  models(): Promise<InstalledModel[]>
  /** Run a job, reporting progress through `emit`. Resolves when it's finished or cancelled. */
  generate(job: GenerationJob, emit: (e: GenerationEvent) => void): Promise<void>
  cancel(): Promise<void>
}

interface ManifestModel {
  id: string
  name: string
  kind: 'checkpoint' | 'controlnet' | 'ipadapter' | 'clip_vision'
  file: string
  license: string
  style: string
}

/** A PNG data URL's bytes. */
function pngBytes(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
}

interface Run {
  cancelled: boolean
  promptId: string | null
  /** Re-checks whether the current prompt is over (used by cancel). */
  wake: (() => void) | null
}

const WORKFLOW = 'sdxl-continuity'
const FRAGMENTS = ['mask', 'region', 'image', 'batch', 'reference', 'style', 'union', 'background', 'figure-region'] as const
/** Figures' weak, softened depth: how far away each is (tested on Spencer's 75mm two-shot). */
const FIGURE_DEPTH = { strength: 0.35, end: 0.4, soften: 0.05 }
const SAMPLER = { sampler: 'dpmpp_2m', scheduler: 'karras' }

export class ComfyBackend implements GenerationBackend {
  private client: ComfyClient | null = null
  private running: Run | null = null
  private readonly manifestModels: ManifestModel[]
  private readonly template: WorkflowTemplate
  private readonly fragments: ComposeInput['fragments']

  constructor(
    private readonly process: ComfyProcess,
    backendDir: string
  ) {
    const manifest = JSON.parse(readFileSync(join(backendDir, 'manifest.json'), 'utf-8')) as { models: ManifestModel[] }
    this.manifestModels = manifest.models
    this.template = parseTemplate(readFileSync(join(backendDir, 'workflows', `${WORKFLOW}.json`), 'utf-8'))
    const loaded = Object.fromEntries(
      FRAGMENTS.map((n) => [n, parseFragment(readFileSync(join(backendDir, 'workflows', 'fragments', `${n}.json`), 'utf-8'))])
    )
    this.fragments = { ...loaded, figureRegion: loaded['figure-region'] } as ComposeInput['fragments']
  }

  status(): BackendStatus {
    return this.process.current
  }

  private async connected(): Promise<ComfyClient> {
    const url = this.process.current.url
    if (this.process.current.state !== 'ready' || !url) throw new Error('The AI engine isn\'t ready yet.')
    if (!this.client || this.client.baseUrl !== url) {
      this.client?.close()
      this.client = new ComfyClient(url)
    }
    await this.client.connect()
    return this.client
  }

  async models(): Promise<InstalledModel[]> {
    if (this.process.current.state !== 'ready') return []
    const client = await this.connected()
    const present = new Set(await client.models('checkpoints'))
    return this.manifestModels
      .filter((m) => m.kind === 'checkpoint' && present.has(m.file))
      .map((m) => ({ file: m.file, name: m.name, license: m.license, style: m.style }))
  }

  async generate(job: GenerationJob, emit: (e: GenerationEvent) => void): Promise<void> {
    if (this.running) throw new Error('Already generating.')
    const run: Run = { cancelled: false, promptId: null, wake: null }
    this.running = run
    let error: string | null = null
    try {
      const dir = takesFolder(job.folder, job.sceneId, job.shotId)
      const client = await this.connected()
      const model = this.manifestModels.find((m) => m.kind === 'checkpoint' && m.file === job.checkpoint)
      const controlnet = this.manifestModels.find((m) => m.kind === 'controlnet')
      if (!model) throw new Error(`The model "${job.checkpoint}" isn't installed.`)
      if (!controlnet) throw new Error('The ControlNet model is missing from the manifest.')
      const ipadapter = this.manifestModels.find((m) => m.kind === 'ipadapter')
      const clipVision = this.manifestModels.find((m) => m.kind === 'clip_vision')

      const depth = pngBytes(job.depthPng)
      const depthName = await client.upload(`secondteam-depth-${job.shotId}.png`, depth)
      const pose = pngBytes(job.posePng)
      const poseName = await client.upload(`secondteam-pose-${job.shotId}.png`, pose)
      const idName = await client.upload(`secondteam-id-${job.shotId}.png`, pngBytes(job.idPng))

      // Reference images: each entity's, and the project style images, uploaded once per Generate.
      const needsReferences = job.entities.some((e) => e.images.length) || Boolean(job.style?.images.length)
      if (needsReferences && (!ipadapter || !clipVision)) {
        throw new Error('Reference images need the IP-Adapter models. Run: node scripts/fetch-backend.mjs')
      }
      const entities: ComposeInput['entities'] = []
      for (const e of job.entities) {
        const images: string[] = []
        if (e.kind !== 'object') {
          for (const [i, file] of e.images.entries()) {
            images.push(await client.upload(`secondteam-ref-${e.ownerId}-${i}.png`, await readAssetAsPng(job.folder, e.kind, e.ownerId, file)))
          }
        }
        entities.push({ name: e.name, color: parseInt(e.color.slice(1), 16), text: e.text, images, weight: e.strength, figure: e.figure })
      }
      let style: ComposeInput['style'] = null
      if (job.style?.images.length) {
        const images: string[] = []
        for (const [i, file] of job.style.images.entries()) {
          images.push(await client.upload(`secondteam-style-${i}.png`, await readAssetAsPng(job.folder, 'style', null, file)))
        }
        style = { images, weight: job.style.strength }
      }

      const blur = depthBlur(job.width)
      // No figure in frame: a pose guide of strength 0 is skipped.
      const poseStrength = job.hasPose ? job.poseStrength : 0

      for (let index = 0; index < job.seeds.length && !run.cancelled; index++) {
        const seed = job.seeds[index]
        emit({ type: 'take-start', index, total: job.seeds.length, seed })
        const { prompt, skipped } = composeWorkflow({
          base: this.template,
          fragments: this.fragments,
          entities,
          style,
          feather: featherMask(job.feather),
          referenceEnd: job.referenceEnd,
          maxReferences: MAX_REFERENCED,
          // The frame prompt stays out of cast and props' areas (each has its own full prompt), so it
          // can't leak onto them ("a young woman" onto the detective).
          frameOutsideRegions: true,
          figureDepth: FIGURE_DEPTH,
          // Keep each reference image's detail (an outfit shot and a face close-up both count).
          combineEmbeds: 'concat',
          values: {
            checkpoint: model.file,
            controlnet: controlnet.file,
            ipadapter: ipadapter?.file ?? '',
            clip_vision: clipVision?.file ?? '',
            id_image: idName,
            positive: job.positive,
            negative: job.negative,
            depth_image: depthName,
            depth_blur_radius: blur.radius,
            depth_blur_sigma: blur.sigma,
            figure_depth_soft: FIGURE_DEPTH.soften,
            cn_strength: job.strength,
            cn_start: job.start,
            cn_end: job.end,
            pose_image: poseName,
            pose_strength: poseStrength,
            pose_end: job.poseEnd,
            width: job.width,
            height: job.height,
            seed,
            steps: job.steps,
            cfg: job.cfg
          }
        })
        if (skipped.length && index === 0) {
          emit({
            type: 'notice',
            message: `Too many references for one take: left out ${skipped.join(', ')} (their prompts still apply). The limit is ${MAX_REFERENCED}.`
          })
        }
        const png = await this.runOne(client, prompt, index, emit, run)
        if (!png) break // cancelled

        const meta: TakeMeta = {
          format: 'secondteam-take',
          version: 1,
          id: newTakeId(),
          createdAt: new Date().toISOString(),
          scene: { id: job.sceneId },
          shot: { id: job.shotId, name: job.shotName },
          seed,
          width: job.width,
          height: job.height,
          positive: job.positive,
          negative: job.negative,
          model: { file: model.file, name: model.name, license: model.license },
          controlnet: {
            file: controlnet.file,
            license: controlnet.license,
            depth: { strength: job.strength, start: job.start, end: job.end, blur: blur.radius },
            pose: poseStrength > 0 ? { strength: poseStrength, end: job.poseEnd } : null
          },
          sampler: { steps: job.steps, cfg: job.cfg, ...SAMPLER },
          continuity: {
            entities: job.entities.map((e) => ({ name: e.name, kind: e.kind, text: e.text, images: e.images, strength: e.strength, figure: e.figure })),
            style: job.style,
            feather: job.feather,
            referenceEnd: job.referenceEnd,
            skipped
          },
          workflow: WORKFLOW,
          backend: { comfyui: this.process.current.comfyVersion },
          extra: job.extra
        }
        const take = await saveTake(dir, meta, png)
        emit({ type: 'take-done', index, take })
      }
    } catch (err) {
      error = (err as Error).message
    } finally {
      this.running = null
      emit({ type: 'finished', cancelled: run.cancelled, error })
    }
  }

  /** Queue one prompt and wait for its image (null if it was cancelled). */
  private async runOne(
    client: ComfyClient,
    prompt: unknown,
    index: number,
    emit: (e: GenerationEvent) => void,
    run: Run
  ): Promise<Buffer | null> {
    // Listen before queueing, and remember endings for any prompt: a cached prompt can finish
    // before we even learn its id.
    const ended = new Map<string, { kind: 'finished' | 'interrupted' } | { kind: 'failed'; message: string }>()
    let settle: (() => void) | null = null
    const stop = client.onMessage((m) => {
      if (m.type === 'finished' || m.type === 'interrupted') ended.set(m.promptId, { kind: m.type })
      else if (m.type === 'failed') ended.set(m.promptId, { kind: 'failed', message: m.message })
      else if (m.promptId && m.promptId !== run.promptId) return
      else if (m.type === 'progress') emit({ type: 'progress', index, value: m.value, max: m.max })
      else if (m.type === 'preview') {
        emit({ type: 'preview', index, dataUrl: `data:${m.mime};base64,${Buffer.from(m.data).toString('base64')}` })
      }
      settle?.()
    })
    try {
      run.promptId = await client.queue(prompt)
      if (run.cancelled) await client.interrupt([run.promptId])
      await new Promise<void>((resolve) => {
        settle = () => {
          if (run.cancelled || (run.promptId && ended.has(run.promptId))) resolve()
        }
        run.wake = settle
        settle()
      })
    } finally {
      stop()
      run.wake = null
    }
    const end = ended.get(run.promptId)
    if (run.cancelled || !end || end.kind === 'interrupted') return null
    if (end.kind === 'failed') throw new Error(end.message)
    const [image] = await client.outputs(run.promptId, this.template.output)
    if (!image) throw new Error('The AI engine finished without an image.')
    return client.image(image)
  }

  async cancel(): Promise<void> {
    const run = this.running
    if (!run) return
    run.cancelled = true
    if (this.client) await this.client.interrupt(run.promptId ? [run.promptId] : [])
    run.wake?.() // also stops waiting for a prompt that was still queued (it never reports back)
  }
}

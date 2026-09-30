// Workflow templates (backend/workflows/*.json): ComfyUI "API format" graphs with {{placeholders}}
// the app fills in. A value that is exactly "{{name}}" becomes the value itself (so numbers stay
// numbers, and "{{in:model}}" can become a link to another node); a placeholder inside longer text
// is substituted as text.
//
// Because the number of cast members and props varies per shot, the base graph is extended with
// fragments (backend/workflows/fragments/*.json), each instantiated once per entity with its node
// ids prefixed and wired into the model chain (references) and the prompt chain (regional prompts).

export type Link = [string, number]
type Node = { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }
export type Graph = Record<string, Node>

export interface WorkflowTemplate {
  name: string
  description: string
  /** Node id of the image output. */
  output: string
  prompt: Graph
}

export interface Fragment {
  name: string
  description: string
  /** Named outputs: which local node and output index. */
  outputs: Record<string, Link>
  nodes: Graph
}

export type TemplateValue = string | number | boolean | Link
export type TemplateValues = Record<string, TemplateValue>

const WHOLE = /^\{\{([\w:]+)\}\}$/
const INNER = /\{\{([\w:]+)\}\}/g

export function parseTemplate(json: string): WorkflowTemplate {
  const t = JSON.parse(json) as Partial<WorkflowTemplate>
  if (!t || typeof t.prompt !== 'object' || typeof t.output !== 'string' || !(t.output in t.prompt!)) {
    throw new Error('Workflow template is missing its prompt or output node.')
  }
  return t as WorkflowTemplate
}

export function parseFragment(json: string): Fragment {
  const f = JSON.parse(json) as Partial<Fragment>
  if (!f || typeof f.nodes !== 'object' || typeof f.outputs !== 'object') throw new Error('Workflow fragment is damaged.')
  return f as Fragment
}

/** Fill every placeholder in a graph. Throws (naming them) if any has no value. */
function fillGraph(graph: Graph, values: TemplateValues, what: string): Graph {
  const missing = new Set<string>()
  const fill = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const whole = WHOLE.exec(v)
      if (whole) {
        if (!(whole[1] in values)) missing.add(whole[1])
        return values[whole[1]]
      }
      return v.replace(INNER, (_, key: string) => {
        if (!(key in values)) missing.add(key)
        return String(values[key] ?? '')
      })
    }
    if (Array.isArray(v)) return v.map(fill)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]))
    return v
  }
  const filled = fill(structuredClone(graph)) as Graph
  if (missing.size) throw new Error(`Workflow "${what}" needs: ${[...missing].join(', ')}`)
  return filled
}

/** The template's graph with every placeholder filled. Throws if one has no value. */
export function fillTemplate(template: WorkflowTemplate, values: TemplateValues): Graph {
  return fillGraph(template.prompt, values, template.name)
}

/**
 * One copy of a fragment: node ids become `<prefix>.<id>`, links between its own nodes follow,
 * and placeholders are filled (including `in:` links to nodes outside it).
 */
export function instantiate(fragment: Fragment, prefix: string, values: TemplateValues): { nodes: Graph; outputs: Record<string, Link> } {
  const local = new Set(Object.keys(fragment.nodes))
  const rename = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      if (v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number' && local.has(v[0])) return [`${prefix}.${v[0]}`, v[1]]
      return v.map(rename)
    }
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rename(x)]))
    return v
  }
  const renamed: Graph = {}
  for (const [id, node] of Object.entries(fragment.nodes)) renamed[`${prefix}.${id}`] = rename(node) as Node
  const outputs = Object.fromEntries(Object.entries(fragment.outputs).map(([k, [id, i]]) => [k, [`${prefix}.${id}`, i] as Link]))
  return { nodes: fillGraph(renamed, values, `${fragment.name} (${prefix})`), outputs }
}

/** A cast member, prop or described object in frame. */
export interface ComposeEntity {
  name: string
  /** Its flat colour in the Object ID pass, as 0xRRGGBB. */
  color: number
  /** Its own prompt, applied only inside its mask (null = none). */
  text: string | null
  /** Uploaded reference image names (empty = none). */
  images: string[]
  /** Reference strength. */
  weight: number
  /**
   * A figure: its area follows its pose skeleton and prompt, not the depth pass (so the mannequin's
   * shape can't show through), while the set around it still follows depth.
   */
  figure?: boolean
}

export interface ComposeInput {
  base: WorkflowTemplate
  fragments: Record<'mask' | 'region' | 'image' | 'batch' | 'reference' | 'style', Fragment> & {
    union?: Fragment
    background?: Fragment
    figureRegion?: Fragment
  }
  /** Values for the base graph's placeholders (not its in: links). */
  values: TemplateValues
  entities: ComposeEntity[]
  style: { images: string[]; weight: number } | null
  feather: { grow: number; blurRadius: number; blurSigma: number }
  /** Where references stop guiding, as a fraction of the steps. */
  referenceEnd: number
  /** Most entities whose references are used (graphics-card memory). */
  maxReferences: number
  /**
   * How strongly each regional prompt counts against the whole-frame prompt inside its area
   * (they're averaged by strength there). Above 1 so a character's own description wins.
   */
  regionStrength?: number
  /** How several reference images of one entity are combined: 'concat' keeps each one's detail. */
  combineEmbeds?: 'concat' | 'average'
  /**
   * Apply the frame prompt only outside the cast's and props' areas (each area then has only its own
   * prompt, which should carry the shared context: shot, lens, lighting, style).
   */
  frameOutsideRegions?: boolean
  /**
   * Figures' weak, softened depth guide (how far away each is, not the mannequin's shape).
   * Without it a prop can drift in front of a figure it should be behind.
   */
  figureDepth?: { strength: number; end: number }
}

// Where the base graph's chains start.
const MODEL: Link = ['1', 0]
const CLIP: Link = ['1', 1]
const POSITIVE: Link = ['2', 0]
const IPADAPTER: Link = ['20', 0]
const CLIP_VISION: Link = ['21', 0]
const ID_IMAGE: Link = ['22', 0]
const DEPTH_APPLIED: Link = ['7', 0]
const NEGATIVE: Link = ['3', 0]
const VAE: Link = ['1', 2]
const DEPTH_CN: Link = ['6', 0]
const SOFT_DEPTH: Link = ['28', 0]

/**
 * The full graph for a take: the base, plus a style reference, and per entity a mask from the ID
 * pass, a regional prompt and a masked reference. Returns the names of entities whose references
 * were left out to stay within `maxReferences`.
 */
export function composeWorkflow(input: ComposeInput): { prompt: Graph; skipped: string[] } {
  const { fragments: f } = input
  const graph: Graph = {}
  const add = (x: { nodes: Graph; outputs: Record<string, Link> }) => {
    Object.assign(graph, x.nodes)
    return x.outputs
  }
  /** Load images and batch them into one input. */
  const images = (prefix: string, names: string[]): Link => {
    let batch: Link | null = null
    names.forEach((image, i) => {
      const loaded = add(instantiate(f.image, `${prefix}.img${i}`, { image })).image
      batch = batch ? add(instantiate(f.batch, `${prefix}.batch${i}`, { 'in:a': batch, 'in:b': loaded })).image : loaded
    })
    return batch!
  }

  let model: Link = MODEL
  let positive: Link = POSITIVE
  if (input.style && input.style.images.length) {
    model = add(
      instantiate(f.style, 'style', {
        'in:model': model,
        'in:ipadapter': IPADAPTER,
        'in:clip_vision': CLIP_VISION,
        'in:image': images('style', input.style.images),
        weight: input.style.weight
      })
    ).model
  }

  const skipped: string[] = []
  let referenced = 0
  // Each entity's mask (only for those that need one: a prompt or references in use).
  const plans = input.entities.map((e, i) => {
    const useImages = e.images.length > 0 && referenced < input.maxReferences
    if (useImages) referenced++
    else if (e.images.length > 0) skipped.push(e.name)
    if (!e.text && !useImages) return null
    const mask = add(
      instantiate(f.mask, `e${i}.mask`, {
        'in:id_image': ID_IMAGE,
        color: e.color,
        grow: input.feather.grow,
        blur_radius: input.feather.blurRadius,
        blur_sigma: input.feather.blurSigma
      })
    ).mask
    return { e, i, mask, useImages }
  })

  // The frame prompt, optionally kept out of every cast member's / prop's area.
  const regions = plans.filter((p): p is NonNullable<typeof p> => Boolean(p?.e.text))
  if (input.frameOutsideRegions && regions.length && f.union && f.background) {
    let union = regions[0].mask
    regions.slice(1).forEach((r) => {
      union = add(instantiate(f.union!, `e${r.i}.union`, { 'in:a': union, 'in:b': r.mask })).mask
    })
    positive = add(instantiate(f.background, 'frame', { 'in:positive': positive, 'in:mask': union })).positive
  }

  // Set and props first: their prompts join the frame prompt before the depth guide. Figures come
  // after it (see below), so the depth guide never shapes them.
  const addRegion = (plan: NonNullable<(typeof plans)[number]>, onto: Link): Link => {
    const common = { 'in:clip': CLIP, 'in:mask': plan.mask, 'in:positive': onto, text: plan.e.text!, strength: input.regionStrength ?? 1 }
    if (plan.e.figure && input.figureDepth && f.figureRegion) {
      return add(
        instantiate(f.figureRegion, `e${plan.i}.region`, {
          ...common,
          'in:negative': NEGATIVE,
          'in:depth_cn': DEPTH_CN,
          'in:soft_depth': SOFT_DEPTH,
          'in:vae': VAE,
          depth_strength: input.figureDepth.strength,
          depth_end: input.figureDepth.end
        })
      ).positive
    }
    return add(instantiate(f.region, `e${plan.i}.region`, common)).positive
  }
  const figureRegions = regions.filter((r) => r.e.figure)
  for (const r of regions) if (!r.e.figure) positive = addRegion(r, positive)
  // The depth guide (node 7) takes `positive`; the pose guide (node 14) takes that plus the figures.
  let posed: Link = DEPTH_APPLIED
  for (const r of figureRegions) posed = addRegion(r, posed)

  // References (IP-Adapter) patch the model, each inside its own mask.
  for (const plan of plans) {
    if (!plan) continue
    const { e, i, mask, useImages } = plan
    const prefix = `e${i}`
    if (useImages) {
      model = add(
        instantiate(f.reference, `${prefix}.ref`, {
          'in:model': model,
          'in:ipadapter': IPADAPTER,
          'in:clip_vision': CLIP_VISION,
          'in:image': images(`${prefix}.ref`, e.images),
          'in:mask': mask,
          weight: e.weight,
          end: input.referenceEnd,
          combine: input.combineEmbeds ?? 'average'
        })
      ).model
    }
  }

  const base = fillTemplate(input.base, { ...input.values, 'in:model': model, 'in:positive': positive, 'in:posed': posed })
  Object.assign(graph, base)
  return { prompt: prune(graph, input.base.output), skipped }
}

/** Only the nodes the output needs (ComfyUI would otherwise check unused loaders too). */
function prune(graph: Graph, output: string): Graph {
  const keep = new Set<string>()
  const visit = (id: string) => {
    if (keep.has(id) || !graph[id]) return
    keep.add(id)
    for (const v of Object.values(graph[id].inputs)) {
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number') visit(v[0])
    }
  }
  visit(output)
  return Object.fromEntries(Object.entries(graph).filter(([id]) => keep.has(id)))
}

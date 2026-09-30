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
}

export interface ComposeInput {
  base: WorkflowTemplate
  fragments: Record<'mask' | 'region' | 'image' | 'batch' | 'reference' | 'style', Fragment>
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
}

// Where the base graph's chains start.
const MODEL: Link = ['1', 0]
const CLIP: Link = ['1', 1]
const POSITIVE: Link = ['2', 0]
const IPADAPTER: Link = ['20', 0]
const CLIP_VISION: Link = ['21', 0]
const ID_IMAGE: Link = ['22', 0]

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
  input.entities.forEach((e, i) => {
    const prefix = `e${i}`
    const useImages = e.images.length > 0 && referenced < input.maxReferences
    if (e.images.length > 0 && !useImages) skipped.push(e.name)
    if (!e.text && !useImages) return
    const mask = add(
      instantiate(f.mask, `${prefix}.mask`, {
        'in:id_image': ID_IMAGE,
        color: e.color,
        grow: input.feather.grow,
        blur_radius: input.feather.blurRadius,
        blur_sigma: input.feather.blurSigma
      })
    ).mask
    if (e.text) {
      positive = add(
        instantiate(f.region, `${prefix}.region`, {
          'in:clip': CLIP,
          'in:mask': mask,
          'in:positive': positive,
          text: e.text,
          strength: input.regionStrength ?? 1
        })
      ).positive
    }
    if (useImages) {
      referenced++
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
  })

  const base = fillTemplate(input.base, { ...input.values, 'in:model': model, 'in:positive': positive })
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

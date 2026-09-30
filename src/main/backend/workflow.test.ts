import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { composeWorkflow, fillTemplate, parseFragment, parseTemplate, type ComposeInput } from './workflow'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf-8')

const template = parseTemplate(read('backend/workflows/sdxl-continuity.json'))
const fragments = Object.fromEntries(
  ['mask', 'region', 'image', 'batch', 'reference', 'style', 'union', 'background'].map((n) => [n, parseFragment(read(`backend/workflows/fragments/${n}.json`))])
) as ComposeInput['fragments']
const values = {
  checkpoint: 'RealVisXL_V5.0_fp16.safetensors',
  controlnet: 'controlnet-union-sdxl-promax.safetensors',
  ipadapter: 'ip-adapter-plus_sdxl_vit-h.safetensors',
  clip_vision: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
  positive: 'a street at night',
  negative: 'blurry',
  depth_image: 'st-depth.png',
  id_image: 'st-id.png',
  depth_blur_radius: 9,
  depth_blur_sigma: 3,
  pose_image: 'st-pose.png',
  pose_strength: 0.7,
  pose_end: 0.8,
  cn_strength: 0.6,
  cn_start: 0,
  cn_end: 0.7,
  width: 1536,
  height: 640,
  seed: 42,
  steps: 30,
  cfg: 5
}
const compose = (over: Partial<ComposeInput> = {}) =>
  composeWorkflow({
    base: template,
    fragments,
    values,
    entities: [],
    style: null,
    feather: { grow: 8, blurRadius: 15, blurSigma: 5 },
    referenceEnd: 0.8,
    maxReferences: 6,
    ...over
  })

describe('workflow templates', () => {
  it('with no cast or props: depth + pose guides straight from the checkpoint and prompt', () => {
    const { prompt: p, skipped } = compose()
    expect(skipped).toEqual([])
    expect(p['9'].inputs.seed).toBe(42)
    expect(p['8'].inputs.width).toBe(1536)
    expect(p['2'].inputs.text).toBe('a street at night')
    expect(p['9'].inputs.model).toEqual(['1', 0])
    expect(p['7'].inputs.positive).toEqual(['2', 0])
    // Depth (softened) feeds the pose guide, which feeds the sampler.
    expect(p['7'].inputs.image).toEqual(['15', 0])
    expect(p['14'].inputs.positive).toEqual(['7', 0])
    expect(p['9'].inputs.positive).toEqual(['14', 0])
    expect(p['13'].inputs.type).toBe('openpose')
    // Unused loaders are left out.
    expect(p['20']).toBeUndefined()
    expect(p['22']).toBeUndefined()
    expect(JSON.stringify(p)).not.toContain('{{')
    expect(template.prompt['9'].inputs.seed).toBe('{{seed}}')
  })

  it('refuses to run with a value missing', () => {
    const { seed: _, ...rest } = values
    expect(() => compose({ values: rest })).toThrow('needs: seed')
  })

  it('adds a masked prompt and masked reference per entity, chained in order', () => {
    const { prompt: p } = compose({
      entities: [
        { name: 'Maribel', color: 0xe6194b, text: 'woman, olive raincoat', images: ['m1.png', 'm2.png'], weight: 0.8 },
        { name: 'Crate', color: 0x3cb44b, text: 'wooden crate', images: [], weight: 0.6 }
      ],
      style: { images: ['still.png'], weight: 0.35 }
    })
    // Model chain: checkpoint → style → Maribel's reference → sampler.
    expect(p['style.apply'].inputs.model).toEqual(['1', 0])
    expect(p['style.apply'].inputs.weight_type).toBe('style transfer')
    expect(p['e0.ref.apply'].inputs.model).toEqual(['style.apply', 0])
    expect(p['9'].inputs.model).toEqual(['e0.ref.apply', 0])
    expect(p['e0.ref.apply'].inputs.attn_mask).toEqual(['e0.mask.mask', 0])
    expect(p['e0.ref.apply'].inputs.end_at).toBe(0.8)
    expect(p['e0.region.masked'].inputs.strength).toBe(1)
    // Two reference images are batched.
    expect(p['e0.ref.batch1.batch'].inputs).toEqual({ image1: ['e0.ref.img0.load', 0], image2: ['e0.ref.img1.load', 0] })
    // Prompt chain: global → Maribel → Crate → ControlNets.
    expect(p['e0.region.combine'].inputs.conditioning_1).toEqual(['2', 0])
    expect(p['e1.region.combine'].inputs.conditioning_1).toEqual(['e0.region.combine', 0])
    expect(p['7'].inputs.positive).toEqual(['e1.region.combine', 0])
    expect(p['e1.mask.pick'].inputs).toMatchObject({ image: ['22', 0], color: 0x3cb44b })
    expect(p['e1.ref.apply']).toBeUndefined()
    expect(JSON.stringify(p)).not.toContain('{{')
    // Every link points at a node that exists.
    for (const node of Object.values(p)) {
      for (const v of Object.values(node.inputs)) {
        if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string') expect(p[v[0]], String(v[0])).toBeDefined()
      }
    }
  })

  it('can keep the frame prompt out of the areas of the cast and props', () => {
    const { prompt: p } = compose({
      frameOutsideRegions: true,
      entities: [
        { name: 'Maribel', color: 1, text: 'young woman', images: [], weight: 1 },
        { name: 'Detective', color: 2, text: 'man in his 50s', images: [], weight: 1 }
      ]
    })
    // The frame prompt is masked to everything outside both areas, then the regions are added.
    expect(p['e1.union.add'].inputs).toMatchObject({ destination: ['e0.mask.mask', 0], source: ['e1.mask.mask', 0], operation: 'add' })
    expect(p['frame.invert'].inputs.mask).toEqual(['e1.union.add', 0])
    expect(p['frame.masked'].inputs.conditioning).toEqual(['2', 0])
    expect(p['e0.region.combine'].inputs.conditioning_1).toEqual(['frame.masked', 0])
    expect(p['7'].inputs.positive).toEqual(['e1.region.combine', 0])
  })

  it('lets figures skip the depth guide while the set and props follow it', () => {
    const { prompt: p } = compose({
      frameOutsideRegions: true,
      entities: [
        { name: 'Maribel', color: 1, text: 'young woman', images: [], weight: 1, figure: true },
        { name: 'Crate', color: 2, text: 'wooden crate', images: [], weight: 1 }
      ]
    })
    // Frame (outside all areas) + crate go into the depth guide; Maribel joins after it.
    expect(p['e1.region.combine'].inputs.conditioning_1).toEqual(['frame.masked', 0])
    expect(p['7'].inputs.positive).toEqual(['e1.region.combine', 0])
    expect(p['e0.region.combine'].inputs.conditioning_1).toEqual(['7', 0])
    expect(p['14'].inputs.positive).toEqual(['e0.region.combine', 0])
    expect(p['14'].inputs.negative).toEqual(['7', 1])
  })

  it('keeps references within the memory limit and names who was left out', () => {
    const entities = ['A', 'B', 'C'].map((name, i) => ({ name, color: i + 1, text: null, images: ['x.png'], weight: 1 }))
    const { prompt: p, skipped } = compose({ entities, maxReferences: 2 })
    expect(skipped).toEqual(['C'])
    expect(p['e1.ref.apply']).toBeDefined()
    expect(p['e2.ref.apply']).toBeUndefined()
    expect(p['e2.mask.pick']).toBeUndefined() // no prompt, no reference: nothing needed
  })

  it('substitutes placeholders inside longer text', () => {
    const t = parseTemplate('{"name":"t","description":"","output":"1","prompt":{"1":{"class_type":"X","inputs":{"a":"shot {{n}} of {{m}}"}}}}')
    expect(fillTemplate(t, { n: 2, m: 4 })['1'].inputs.a).toBe('shot 2 of 4')
  })
})

describe('model manifest', () => {
  const manifest = JSON.parse(read('backend/manifest.json'))

  it('records a commercial-use licence, checksum, size and source for every model', () => {
    expect(manifest.models.length).toBeGreaterThan(0)
    for (const m of [manifest.comfyui, ...manifest.models, ...manifest.customNodes]) {
      expect(m.license, m.name).toMatch(/\S/)
      expect(m.licenseUrl, m.name).toMatch(/^https:\/\//)
      expect(m.url, m.name).toMatch(/^https:\/\//)
      expect(m.sha256, m.name).toMatch(/^[0-9a-f]{64}$/)
      expect(m.size, m.name).toBeGreaterThan(1000)
    }
    for (const m of manifest.models) {
      // Hard rule: outputs are used for paying clients.
      expect(m.commercial, `${m.name} must allow commercial use`).toBe(true)
      expect(['checkpoint', 'controlnet', 'ipadapter', 'clip_vision']).toContain(m.kind)
      expect(m.file).toMatch(/^[\w.-]+\.safetensors$/)
    }
    expect(new Set(manifest.models.map((m: { id: string }) => m.id)).size).toBe(manifest.models.length)
    for (const n of manifest.customNodes) {
      // Add-ons are pinned to an exact commit.
      expect(n.version, n.name).toMatch(/^[0-9a-f]{40}$/)
      expect(n.url, n.name).toContain(n.version)
    }
  })
})

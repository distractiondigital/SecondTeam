import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { fillTemplate, parseTemplate } from './workflow'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf-8')

describe('workflow templates', () => {
  const template = parseTemplate(read('backend/workflows/sdxl-depth.json'))
  const values = {
    checkpoint: 'RealVisXL_V5.0_fp16.safetensors',
    controlnet: 'controlnet-union-sdxl-promax.safetensors',
    positive: 'a street at night',
    negative: 'blurry',
    depth_image: 'st-depth.png',
    cn_strength: 0.6,
    cn_start: 0,
    cn_end: 0.7,
    width: 1536,
    height: 640,
    seed: 42,
    steps: 30,
    cfg: 5
  }

  it('fills every placeholder and keeps numbers as numbers', () => {
    const p = fillTemplate(template, values)
    expect(p['9'].inputs.seed).toBe(42)
    expect(p['8'].inputs.width).toBe(1536)
    expect(p['2'].inputs.text).toBe('a street at night')
    expect(p['9'].inputs.model).toEqual(['1', 0])
    expect(JSON.stringify(p)).not.toContain('{{')
    // The template itself is untouched.
    expect(template.prompt['9'].inputs.seed).toBe('{{seed}}')
  })

  it('refuses to run with a value missing', () => {
    const { seed: _, ...rest } = values
    expect(() => fillTemplate(template, rest)).toThrow('needs: seed')
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
    for (const m of [manifest.comfyui, ...manifest.models]) {
      expect(m.license, m.name).toMatch(/\S/)
      expect(m.licenseUrl, m.name).toMatch(/^https:\/\//)
      expect(m.url, m.name).toMatch(/^https:\/\//)
      expect(m.sha256, m.name).toMatch(/^[0-9a-f]{64}$/)
      expect(m.size, m.name).toBeGreaterThan(1e6)
    }
    for (const m of manifest.models) {
      // Hard rule: outputs are used for paying clients.
      expect(m.commercial, `${m.name} must allow commercial use`).toBe(true)
      expect(['checkpoint', 'controlnet']).toContain(m.kind)
      expect(m.file).toMatch(/^[\w.-]+\.safetensors$/)
    }
    expect(new Set(manifest.models.map((m: { id: string }) => m.id)).size).toBe(manifest.models.length)
  })
})

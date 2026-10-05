import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { chosenIds, formatBytes, hasCheckpoint, installItems, itemChecks, itemState, readyToGenerate, type Manifest, type Probe } from './backendManifest'

const manifest = JSON.parse(readFileSync('backend/manifest.json', 'utf-8')) as Manifest
const items = installItems(manifest)

/** A fake disk: path -> contents (or a size). */
const disk = (files: Record<string, string | number>): Probe => ({
  size: (p) => (p in files ? (typeof files[p] === 'number' ? (files[p] as number) : (files[p] as string).length) : null),
  read: (p) => (typeof files[p] === 'string' ? (files[p] as string) : null)
})

describe('backend manifest', () => {
  it('lists the engine first, then models and add-ons, with the right ones required', () => {
    expect(items[0].kind).toBe('engine')
    expect(items[0].required).toBe(true)
    expect(items[0].diskSize).toBeGreaterThan(items[0].size) // room to unpack
    const byId = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(byId['controlnet-union-sdxl-promax'].required).toBe(true)
    expect(byId['comfyui-ipadapter-plus'].required).toBe(true)
    expect(byId['realvisxl-v5'].required).toBe(false)
    expect(byId['realvisxl-v5'].default).toBe(true)
    expect(items.every((i) => i.license && i.size > 0)).toBe(true)
  })

  it('always includes required pieces and needs at least one checkpoint', () => {
    const ids = chosenIds(items, ['sdxl-base-1.0', 'nonsense'])
    expect(ids).toContain('comfyui')
    expect(ids).toContain('sdxl-base-1.0')
    expect(ids).not.toContain('realvisxl-v5')
    expect(ids).not.toContain('nonsense')
    expect(hasCheckpoint(items, ids)).toBe(true)
    expect(hasCheckpoint(items, chosenIds(items, []))).toBe(false)
  })

  it('knows when each piece is installed, missing or damaged', () => {
    const model = manifest.models[0]
    const modelPath = `ComfyUI/models/${model.folder}/${model.file}`
    const addon = manifest.customNodes[0]
    const addonPath = `ComfyUI/custom_nodes/${addon.folder}/.secondteam-version`
    expect(itemChecks(manifest, model.id)[0].path).toBe(modelPath)
    expect(itemState(manifest, model.id, disk({}))).toBe('missing')
    expect(itemState(manifest, model.id, disk({ [modelPath]: model.size }))).toBe('installed')
    expect(itemState(manifest, model.id, disk({ [modelPath]: 1000 }))).toBe('damaged') // cut short
    expect(itemState(manifest, addon.id, disk({ [addonPath]: addon.version + '\n' }))).toBe('installed')
    expect(itemState(manifest, addon.id, disk({ [addonPath]: 'old' }))).toBe('damaged')
    expect(itemState(manifest, 'comfyui', disk({ 'python_embeded/python.exe': 1 }))).toBe('damaged')
    expect(itemState(manifest, 'comfyui', disk({ 'python_embeded/python.exe': 1, 'ComfyUI/main.py': 1 }))).toBe('installed')
  })

  it('is ready to generate with every required piece and one checkpoint', () => {
    const all = Object.fromEntries(items.map((i) => [i.id, 'installed' as const]))
    expect(readyToGenerate(manifest, all)).toBe(true)
    expect(readyToGenerate(manifest, { ...all, 'realvisxl-v5': 'missing' })).toBe(true)
    expect(readyToGenerate(manifest, { ...all, 'realvisxl-v5': 'missing', 'sdxl-base-1.0': 'missing' })).toBe(false)
    expect(readyToGenerate(manifest, { ...all, comfyui: 'damaged' })).toBe(false)
    expect(formatBytes(6938065488)).toBe('6.9 GB')
    expect(formatBytes(306422)).toBe('306 KB')
  })
})

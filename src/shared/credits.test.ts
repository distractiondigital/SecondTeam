import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { CREDITS } from './credits'

const credits = CREDITS.flatMap((s) => s.items)
const creditsMd = readFileSync('CREDITS.md', 'utf-8')

describe('credits', () => {
  it('credits every CC-BY figure item by its author, in the app and in CREDITS.md', () => {
    const items = (JSON.parse(readFileSync('figures/proxies.json', 'utf-8')) as { items: { label: string; license: string; author?: string }[] }).items
    for (const item of items.filter((i) => i.license !== 'CC0')) {
      expect(credits.some((c) => c.name === item.label && c.by === item.author && c.license === item.license), item.label).toBe(true)
      expect(creditsMd, item.label).toContain(`${item.label}** by ${item.author}`)
    }
  })

  it('credits every download in the backend manifest', () => {
    const m = JSON.parse(readFileSync('backend/manifest.json', 'utf-8')) as {
      comfyui: { licenseUrl: string }
      models: { licenseUrl: string }[]
      customNodes: { licenseUrl: string }[]
    }
    // Same site, owner and repository as the licence link.
    const repo = (url: string) => url.split('/').slice(2, 5).join('/')
    for (const d of [m.comfyui, ...m.models, ...m.customNodes]) {
      expect(credits.some((c) => repo(c.url) === repo(d.licenseUrl)), d.licenseUrl).toBe(true)
      expect(creditsMd, d.licenseUrl).toContain(repo(d.licenseUrl))
    }
  })
})

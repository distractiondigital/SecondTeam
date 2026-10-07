import { describe, expect, it } from 'vitest'
import { currentRender, hashText, isRenderQuality, parseRenderMeta, renderFileNames } from './renders'

describe('saved renders', () => {
  it('names the files by quality', () => {
    expect(renderFileNames('draft')).toEqual({ image: 'draft.png', meta: 'draft.json' })
    expect(renderFileNames('final')).toEqual({ image: 'final.png', meta: 'final.json' })
    expect(isRenderQuality('final')).toBe(true)
    expect(isRenderQuality('../x')).toBe(false)
  })

  it('reads its info, and rejects damaged files', () => {
    const meta = { print: 'abc', width: 640, height: 360, samples: 64, date: '2026-10-07' }
    expect(parseRenderMeta(JSON.stringify(meta))).toEqual(meta)
    expect(parseRenderMeta('{')).toBeNull()
    expect(parseRenderMeta(JSON.stringify({ ...meta, print: '' }))).toBeNull()
    expect(parseRenderMeta(JSON.stringify({ ...meta, width: -1 }))).toBeNull()
  })

  it('shows an up-to-date Final over a Draft, and nothing out of date', () => {
    const renders = { draft: { print: 'new', id: 'd' }, final: { print: 'old', id: 'f' } }
    expect(currentRender(renders, 'new')?.id).toBe('d')
    expect(currentRender(renders, 'old')?.quality).toBe('final')
    expect(currentRender({ ...renders, final: { print: 'new', id: 'f2' } }, 'new')?.id).toBe('f2')
    expect(currentRender(renders, 'other')).toBeNull()
    expect(currentRender(undefined, 'x')).toBeNull()
  })

  it('fingerprints text stably', () => {
    expect(hashText('a shot')).toBe(hashText('a shot'))
    expect(hashText('a shot')).not.toBe(hashText('a shot!'))
  })
})

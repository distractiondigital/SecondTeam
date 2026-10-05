import { describe, expect, it } from 'vitest'
import { ComfyClient, parseBinaryMessage, parseTextMessage } from './comfyClient'

function frame(parts: (number | Uint8Array)[]): ArrayBuffer {
  const size = parts.reduce<number>((n, p) => n + (typeof p === 'number' ? 4 : p.length), 0)
  const buffer = new ArrayBuffer(size)
  const view = new DataView(buffer)
  let at = 0
  for (const p of parts) {
    if (typeof p === 'number') {
      view.setUint32(at, p)
      at += 4
    } else {
      new Uint8Array(buffer, at, p.length).set(p)
      at += p.length
    }
  }
  return buffer
}

describe('ComfyUI messages', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])

  it('decodes classic preview frames', () => {
    const m = parseBinaryMessage(frame([1, 1, jpeg]))
    expect(m).toMatchObject({ type: 'preview', mime: 'image/jpeg', promptId: null })
    expect(m?.type === 'preview' && Array.from(m.data)).toEqual(Array.from(jpeg))
    expect(parseBinaryMessage(frame([1, 2, jpeg]))).toMatchObject({ mime: 'image/png' })
  })

  it('decodes previews with metadata (prompt id)', () => {
    const meta = new TextEncoder().encode(JSON.stringify({ prompt_id: 'p1', image_type: 'image/jpeg' }))
    const m = parseBinaryMessage(frame([4, meta.length, meta, jpeg]))
    expect(m).toMatchObject({ type: 'preview', promptId: 'p1', mime: 'image/jpeg' })
    expect(m?.type === 'preview' && m.data.length).toBe(4)
  })

  it('ignores other or short frames', () => {
    expect(parseBinaryMessage(frame([3, 0]))).toBeNull()
    expect(parseBinaryMessage(new ArrayBuffer(3))).toBeNull()
  })

  it('reads progress, finish, errors and interrupts', () => {
    const msg = (type: string, data: object) => parseTextMessage(JSON.stringify({ type, data }))
    expect(msg('progress', { value: 3, max: 30, prompt_id: 'p1' })).toEqual({ type: 'progress', promptId: 'p1', value: 3, max: 30 })
    expect(msg('executing', { node: null, prompt_id: 'p1' })).toEqual({ type: 'finished', promptId: 'p1' })
    expect(msg('executing', { node: '9', prompt_id: 'p1' })).toBeNull()
    expect(msg('execution_error', { prompt_id: 'p1', exception_message: 'Out of memory\n' })).toEqual({
      type: 'failed',
      promptId: 'p1',
      message: 'Out of memory'
    })
    expect(msg('execution_interrupted', { prompt_id: 'p1' })).toEqual({ type: 'interrupted', promptId: 'p1' })
    expect(parseTextMessage('not json')).toBeNull()
  })
})

describe('fetching a finished prompt\'s image', () => {
  it('waits for ComfyUI to record the prompt (it says "finished" a moment before)', async () => {
    const realFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      // Not in the history for the first two asks.
      const body = calls < 3 ? {} : { p1: { outputs: { '11': { images: [{ filename: 'a.png', subfolder: '', type: 'output' }] } } } }
      return new Response(JSON.stringify(body))
    }) as typeof fetch
    try {
      const images = await new ComfyClient('http://127.0.0.1:1').outputs('p1', '11')
      expect(images).toEqual([{ filename: 'a.png', subfolder: '', type: 'output' }])
      expect(calls).toBe(3)
      // Never recorded: gives up after the wait, with no image.
      calls = -100
      expect(await new ComfyClient('http://127.0.0.1:1').outputs('p1', '11', 300)).toEqual([])
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

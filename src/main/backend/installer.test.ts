import { spawnSync } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { createServer, type Server } from 'http'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Manifest } from '../../shared/backendManifest'
import type { SetupProgress } from '../../shared/setup'
import { findExistingInstall, gpuAdvice, install, installStates, isReady, parseNvidiaSmi, partialBytes, verify } from './installer'

// A tiny backend served from localhost: a fake engine (.7z), two models and an add-on (.zip).
// The installer (and these tests) use Windows' own tar.exe, so they only run on Windows.
const onWindows = process.platform === 'win32'

const tar = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe')
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
let root: string
let server: Server
let base: string
let files: Record<string, Buffer>
let manifest: Manifest
let requests: { path: string; range?: string }[] = []

function archive(kind: '7z' | 'zip', folder: string, contents: Record<string, string>): Buffer {
  const src = mkdtempSync(join(root, 'src-'))
  for (const [rel, text] of Object.entries(contents)) {
    mkdirSync(join(src, folder, rel, '..'), { recursive: true })
    writeFileSync(join(src, folder, rel), text)
  }
  const out = join(root, `a-${Math.random().toString(36).slice(2)}.${kind}`)
  const args = kind === '7z' ? ['-cf', out, '--format', '7zip', '-C', src, folder] : ['-a', '-cf', out, '-C', src, folder]
  const r = spawnSync(tar, args)
  if (r.status !== 0) throw new Error(String(r.stderr))
  return readFileSync(out)
}

beforeAll(async () => {
  if (!onWindows) return
  root = mkdtempSync(join(tmpdir(), 'st-installer-'))
  files = {
    '/engine.7z': archive('7z', 'ComfyUI_windows_portable', {
      'python_embeded/python.exe': 'not really python',
      'ComfyUI/main.py': 'print("hi")',
      'ComfyUI/models/checkpoints/put_checkpoints_here': ''
    }),
    '/model-a.safetensors': Buffer.alloc(300_000, 7),
    '/model-b.safetensors': Buffer.alloc(120_000, 3),
    '/addon.zip': archive('zip', 'Addon-abc', { '__init__.py': '# add-on' })
  }
  server = createServer((req, res) => {
    const body = files[req.url ?? '']
    requests.push({ path: req.url ?? '', range: req.headers.range })
    if (!body) return res.writeHead(404).end()
    const m = /bytes=(\d+)-/.exec(req.headers.range ?? '')
    if (m) {
      const start = Number(m[1])
      res.writeHead(206, { 'Content-Length': body.length - start })
      return res.end(body.subarray(start))
    }
    res.writeHead(200, { 'Content-Length': body.length })
    res.end(body)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const address = server.address()
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  const entry = (id: string, path: string) => ({
    id,
    name: id,
    url: base + path,
    sha256: sha(files[path]),
    size: files[path].length,
    license: 'test',
    licenseUrl: 'https://example.com'
  })
  manifest = {
    manifestVersion: 1,
    comfyui: { ...entry('comfyui', '/engine.7z'), version: '1', archiveFolder: 'ComfyUI_windows_portable', installedSize: 100 },
    models: [
      { ...entry('model-a', '/model-a.safetensors'), kind: 'checkpoint', family: 'sdxl', file: 'a.safetensors', folder: 'checkpoints', commercial: true, style: '', default: true },
      { ...entry('model-b', '/model-b.safetensors'), kind: 'controlnet', family: 'sdxl', file: 'b.safetensors', folder: 'controlnet', commercial: true, style: '', required: true }
    ],
    customNodes: [{ ...entry('addon', '/addon.zip'), version: 'abc', archiveFolder: 'Addon-abc', folder: 'Addon' }]
  }
})

afterAll(() => {
  if (!onWindows) return
  server.close()
  rmSync(root, { recursive: true, force: true })
})

const all = () => ['comfyui', 'model-a', 'model-b', 'addon']

describe.skipIf(!onWindows)('installer', () => {
  it('downloads, checks and unpacks everything into place', async () => {
    const dir = join(root, 'backend one')
    const events: SetupProgress[] = []
    expect(await install(manifest, dir, all(), (e) => events.push(e), new AbortController().signal)).toBe('done')
    expect(readFileSync(join(dir, 'ComfyUI', 'main.py'), 'utf-8')).toBe('print("hi")')
    expect(existsSync(join(dir, 'ComfyUI', 'models', 'checkpoints', 'a.safetensors'))).toBe(true)
    expect(readFileSync(join(dir, 'ComfyUI', 'custom_nodes', 'Addon', '__init__.py'), 'utf-8')).toBe('# add-on')
    expect(existsSync(join(dir, '_downloads'))).toBe(false)
    expect(isReady(manifest, dir)).toBe(true)
    expect(events.at(-1)?.phase).toBe('finished')
    expect(events.some((e) => e.phase === 'unpack')).toBe(true)
    // Running again downloads nothing.
    requests = []
    await install(manifest, dir, all(), () => undefined, new AbortController().signal)
    expect(requests).toEqual([])
  })

  it('resumes a partly downloaded file', async () => {
    const dir = join(root, 'resume')
    const part = join(dir, 'ComfyUI', 'models', 'checkpoints', 'a.safetensors.part')
    mkdirSync(join(part, '..'), { recursive: true })
    writeFileSync(part, files['/model-a.safetensors'].subarray(0, 100_000))
    expect(partialBytes(manifest, dir)['model-a']).toBe(100_000)
    requests = []
    await install(manifest, dir, ['model-a'], () => undefined, new AbortController().signal)
    expect(requests).toEqual([{ path: '/model-a.safetensors', range: 'bytes=100000-' }])
    expect(installStates(manifest, dir)['model-a']).toBe('installed')
  })

  it('throws away a damaged download', async () => {
    const dir = join(root, 'damaged')
    const original = files['/model-b.safetensors']
    files['/model-b.safetensors'] = Buffer.alloc(original.length, 9) // same size, wrong bytes
    try {
      await expect(install(manifest, dir, ['model-b'], () => undefined, new AbortController().signal)).rejects.toThrow(/checksum/)
      expect(existsSync(join(dir, 'ComfyUI', 'models', 'controlnet', 'b.safetensors.part'))).toBe(false)
    } finally {
      files['/model-b.safetensors'] = original
    }
  })

  it('pauses when asked and keeps what it has', async () => {
    const dir = join(root, 'paused')
    const stop = new AbortController()
    stop.abort()
    expect(await install(manifest, dir, ['model-a'], () => undefined, stop.signal)).toBe('paused')
    expect(installStates(manifest, dir)['model-a']).toBe('missing')
  })

  it('finds an existing install and spots a damaged model', async () => {
    const dir = join(root, 'backend one')
    expect(findExistingInstall(dir)).toBe(dir)
    const wrapper = join(root, 'wrapper')
    mkdirSync(wrapper, { recursive: true })
    expect(findExistingInstall(wrapper)).toBeNull()
    // Same size, different bytes: only the full check notices.
    writeFileSync(join(dir, 'ComfyUI', 'models', 'checkpoints', 'a.safetensors'), Buffer.alloc(300_000, 1))
    expect((await verify(manifest, dir, false, () => undefined, new AbortController().signal)).damaged).toEqual([])
    const full = await verify(manifest, dir, true, () => undefined, new AbortController().signal)
    expect(full.damaged).toEqual(['model-a'])
    expect(full.states['model-a']).toBe('damaged')
  })

  it('reads the graphics card and gives plain advice', () => {
    expect(parseNvidiaSmi('NVIDIA GeForce RTX 5070 Ti, 595.79, 16303\n')).toEqual({ name: 'NVIDIA GeForce RTX 5070 Ti', driver: '595.79', vramMB: 16303 })
    expect(parseNvidiaSmi('')).toBeNull()
    expect(gpuAdvice(null).problem).toMatch(/No NVIDIA/)
    expect(gpuAdvice({ name: 'x', driver: '552.12', vramMB: 12000 }).problem).toMatch(/too old/)
    expect(gpuAdvice({ name: 'x', driver: '595.79', vramMB: 6000 }).note).toMatch(/video memory/)
    expect(gpuAdvice({ name: 'x', driver: '595.79', vramMB: 16303 })).toEqual({ problem: null, note: null })
  })
})

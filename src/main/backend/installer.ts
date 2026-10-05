import { spawn, spawnSync } from 'child_process'
import { createHash } from 'crypto'
import { createReadStream, createWriteStream, existsSync, readFileSync, statSync } from 'fs'
import { mkdir, readdir, rename, rm, stat, statfs, unlink, writeFile } from 'fs/promises'
import { release } from 'os'
import { basename, dirname, join, parse } from 'path'
import {
  itemChecks,
  itemState,
  readyToGenerate,
  type ItemState,
  type Manifest,
  type Probe
} from '../../shared/backendManifest'
import type { GpuInfo, SetupProgress, SystemCheck, VerifyResult } from '../../shared/setup'

// Installs the AI backend described by the pinned manifest into a folder: downloads (resumable
// .part files, SHA256-checked), unpacks the engine and add-ons with Windows' own tar.exe (7-Zip as
// a fallback), and puts each piece where ComfyUI expects it. Only the manifest's URLs are fetched,
// and nothing is written outside `dir`. The same job as scripts/fetch-backend.mjs, with progress.

const MIN_DRIVER = 580 // the portable engine uses CUDA 13.0
const MIN_VRAM_MB = 8000
const SEVEN_ZIP = ['C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe']

function tarPath(): string {
  return join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe')
}

// ---------- What's installed ----------

/** The real files under `dir`. */
export function diskProbe(dir: string): Probe {
  return {
    size: (p) => {
      try {
        return statSync(join(dir, p)).size
      } catch {
        return null
      }
    },
    read: (p) => {
      try {
        return readFileSync(join(dir, p), 'utf-8')
      } catch {
        return null
      }
    }
  }
}

export function installStates(m: Manifest, dir: string): Record<string, ItemState> {
  const probe = diskProbe(dir)
  const ids = [m.comfyui.id, ...m.models.map((x) => x.id), ...m.customNodes.map((x) => x.id)]
  return Object.fromEntries(ids.map((id) => [id, itemState(m, id, probe)]))
}

export function isReady(m: Manifest, dir: string): boolean {
  return readyToGenerate(m, installStates(m, dir))
}

/** Where each item's download goes while it's in progress. */
function downloadTarget(m: Manifest, dir: string, id: string): string {
  if (id === m.comfyui.id) return join(dir, '_downloads', basename(new URL(m.comfyui.url).pathname))
  const model = m.models.find((x) => x.id === id)
  if (model) return join(dir, 'ComfyUI', 'models', model.folder, model.file)
  return join(dir, '_downloads', `${id}.zip`)
}

/** Bytes already downloaded (a paused or interrupted download), by item. */
export function partialBytes(m: Manifest, dir: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of [m.comfyui.id, ...m.models.map((x) => x.id), ...m.customNodes.map((x) => x.id)]) {
    const target = downloadTarget(m, dir, id)
    for (const file of [`${target}.part`, id === m.comfyui.id ? target : null]) {
      if (file && existsSync(file)) out[id] = Math.max(out[id] ?? 0, statSync(file).size)
    }
  }
  return out
}

/**
 * A folder the user says already has the files: itself, or its `ComfyUI` subfolder (so picking
 * the folder above a portable install works too). Null if neither has the engine.
 */
export function findExistingInstall(chosen: string): string | null {
  for (const dir of [chosen, join(chosen, 'ComfyUI'), join(chosen, 'ComfyUI_windows_portable')]) {
    if (existsSync(join(dir, 'python_embeded', 'python.exe')) && existsSync(join(dir, 'ComfyUI', 'main.py'))) return dir
  }
  return null
}

// ---------- This PC ----------

export function parseNvidiaSmi(output: string): GpuInfo | null {
  const line = output.split(/\r?\n/).find((l) => l.trim())
  if (!line) return null
  const [name, driver, memory] = line.split(',').map((s) => s.trim())
  const vramMB = parseInt(memory, 10)
  if (!name || !driver || !Number.isFinite(vramMB)) return null
  return { name, driver, vramMB }
}

export function gpuAdvice(gpu: GpuInfo | null): { problem: string | null; note: string | null } {
  if (!gpu) {
    return {
      problem:
        "No NVIDIA graphics card was found. The AI engine needs one (RTX 30-series or newer recommended). Everything else in Second Team works without it.",
      note: null
    }
  }
  const major = parseInt(gpu.driver, 10)
  const problem =
    Number.isFinite(major) && major < MIN_DRIVER
      ? `The graphics driver (${gpu.driver}) is too old for the AI engine. Update it to version ${MIN_DRIVER} or newer from nvidia.com or the NVIDIA app, then come back.`
      : null
  const note =
    gpu.vramMB < MIN_VRAM_MB
      ? `This card has ${(gpu.vramMB / 1024).toFixed(0)} GB of video memory; 8 GB or more is recommended. Generating may be slow or fail.`
      : null
  return { problem, note }
}

/** Free space on the drive that holds `dir` (or the nearest folder above it that exists). */
async function freeSpace(dir: string): Promise<number | null> {
  let probe = dir
  while (!existsSync(probe)) {
    const up = dirname(probe)
    if (up === probe) break
    probe = up
  }
  try {
    const s = await statfs(probe || parse(dir).root)
    return s.bavail * s.bsize
  } catch {
    return null
  }
}

function unpacker(): 'tar' | '7zip' | null {
  // Windows 11's tar (libarchive with liblzma) reads .7z; Windows 10's doesn't.
  const tar = spawnSync(tarPath(), ['--version'], { windowsHide: true, encoding: 'utf-8' })
  if (tar.status === 0 && /liblzma/i.test(tar.stdout ?? '')) return 'tar'
  if (SEVEN_ZIP.some((p) => existsSync(p))) return '7zip'
  return null
}

export async function checkSystem(dir: string): Promise<SystemCheck> {
  const smi = spawnSync('nvidia-smi', ['--query-gpu=name,driver_version,memory.total', '--format=csv,noheader,nounits'], {
    windowsHide: true,
    encoding: 'utf-8',
    timeout: 15000
  })
  const gpu = smi.status === 0 ? parseNvidiaSmi(smi.stdout ?? '') : null
  const { problem, note } = gpuAdvice(gpu)
  const build = parseInt(release().split('.')[2] ?? '0', 10)
  return {
    gpu,
    gpuProblem: problem,
    gpuNote: note,
    freeBytes: await freeSpace(dir),
    windows: `Windows ${build >= 22000 ? '11' : '10'} (build ${build})`,
    unpacker: unpacker()
  }
}

// ---------- Installing ----------

type Emit = (p: SetupProgress) => void

class Paused extends Error {}

async function sha256(file: string, onBytes?: (n: number) => void, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file, { highWaterMark: 8 * 1024 * 1024 })) {
    if (signal?.aborted) throw new Paused()
    hash.update(chunk as Buffer)
    onBytes?.((chunk as Buffer).length)
  }
  return hash.digest('hex')
}

interface Item {
  id: string
  name: string
  url: string
  size: number
  sha256: string
}

/** Download `item` to `target` via `target.part` (resuming it), check its SHA256, then rename. */
async function download(item: Item, target: string, report: (done: number, phase: 'download' | 'verify') => void, signal: AbortSignal): Promise<void> {
  const part = `${target}.part`
  await mkdir(dirname(target), { recursive: true })
  let have = existsSync(part) ? statSync(part).size : 0
  if (have > item.size) {
    await unlink(part)
    have = 0
  }
  if (have < item.size) {
    let res: Response
    try {
      res = await fetch(item.url, { headers: have ? { Range: `bytes=${have}-` } : {}, signal })
    } catch (err) {
      if (signal.aborted) throw new Paused()
      throw new Error(`Couldn't reach the download for ${item.name}. Check the internet connection and try again. (${(err as Error).message})`)
    }
    if (!res.ok || !res.body) throw new Error(`The download of ${item.name} failed (HTTP ${res.status}). Try again later.`)
    if (have && res.status !== 206) have = 0 // the server ignored the resume: start over
    const out = createWriteStream(part, { flags: have ? 'a' : 'w' })
    let done = have
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r()))
        done += chunk.length
        report(done, 'download')
      }
    } catch (err) {
      if (signal.aborted) throw new Paused()
      throw new Error(`The download of ${item.name} was interrupted. Click Download to carry on from where it stopped. (${(err as Error).message})`)
    } finally {
      await new Promise<void>((r) => out.end(() => r()))
    }
  }
  const size = statSync(part).size
  if (size !== item.size) throw new Error(`${item.name} downloaded ${size} of ${item.size} bytes. Click Download to carry on.`)
  let checked = 0
  report(0, 'verify')
  const digest = await sha256(part, (n) => report((checked += n), 'verify'), signal)
  if (digest !== item.sha256) {
    await unlink(part)
    throw new Error(`${item.name} was damaged while downloading (checksum mismatch), so it was deleted. Click Download to fetch it again.`)
  }
  await rename(part, target)
}

/** Run a program, resolving with its exit code (killed if the signal fires). */
function run(exe: string, args: string[], signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, stdio: 'ignore' })
    const stop = () => child.kill()
    signal.addEventListener('abort', stop, { once: true })
    child.on('error', reject)
    child.on('exit', (code) => {
      signal.removeEventListener('abort', stop)
      if (signal.aborted) reject(new Paused())
      else resolve(code ?? 1)
    })
  })
}

/** Unpack a .7z or .zip into `dest` with Windows' tar, falling back to 7-Zip. */
export async function unpack(archive: string, dest: string, signal: AbortSignal): Promise<void> {
  await mkdir(dest, { recursive: true })
  if ((await run(tarPath(), ['-xf', archive, '-C', dest], signal)) === 0) return
  const sevenZip = SEVEN_ZIP.find((p) => existsSync(p))
  if (sevenZip && (await run(sevenZip, ['x', archive, `-o${dest}`, '-y', '-bso0', '-bsp0'], signal)) === 0) return
  throw new Error(
    `Couldn't unpack ${basename(archive)}. On Windows 10, install 7-Zip (7-zip.org) and click Download again.`
  )
}

/** Move everything in `from` into `to`, merging folders that already exist (files are replaced). */
async function mergeMove(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true })
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const src = join(from, entry.name)
    const dst = join(to, entry.name)
    if (existsSync(dst) && entry.isDirectory() && (await stat(dst)).isDirectory()) {
      await mergeMove(src, dst)
    } else {
      await rm(dst, { recursive: true, force: true })
      await rename(src, dst)
    }
  }
}

/**
 * Install `ids` into `dir`. Already-installed pieces are skipped; a paused download resumes.
 * Resolves 'paused' if the signal fires (partial files are kept).
 */
export async function install(m: Manifest, dir: string, ids: string[], emit: Emit, signal: AbortSignal): Promise<'done' | 'paused'> {
  const states = installStates(m, dir)
  const todo = ids.filter((id) => states[id] !== 'installed')
  const sizeOf = (id: string) =>
    id === m.comfyui.id ? m.comfyui.size : (m.models.find((x) => x.id === id) ?? m.customNodes.find((x) => x.id === id))?.size ?? 0
  const partial = partialBytes(m, dir)
  const overallTotal = todo.reduce((s, id) => s + sizeOf(id), 0)
  let finished = 0 // bytes of items already done in this run
  let current: string | null = null
  let lastEmit = 0
  const window: { t: number; bytes: number }[] = []
  let speed = 0
  let downloaded = 0 // of the current item

  const progress = (phase: SetupProgress['phase'], itemDone: number, itemTotal: number, message = '', force = false) => {
    const now = Date.now()
    if (phase === 'download') {
      downloaded = itemDone
      window.push({ t: now, bytes: itemDone })
      while (window.length > 2 && now - window[0].t > 5000) window.shift()
      const first = window[0]
      speed = now > first.t ? Math.max(0, ((itemDone - first.bytes) * 1000) / (now - first.t)) : speed
    }
    if (!force && now - lastEmit < 250) return
    lastEmit = now
    // Checking and unpacking come after an item's download; a pause or error keeps what's downloaded.
    const ofCurrent = phase === 'download' ? itemDone : phase === 'verify' || phase === 'unpack' ? (current ? sizeOf(current) : 0) : downloaded
    const overallDone = finished + ofCurrent
    emit({ phase, id: current, itemDone, itemTotal, overallDone, overallTotal, speed, message })
  }

  try {
    await mkdir(dir, { recursive: true })
    for (const id of todo) {
      current = id
      window.length = 0
      speed = 0
      downloaded = partial[id] ?? 0
      const total = sizeOf(id)
      const report = (done: number, phase: 'download' | 'verify') => progress(phase, done, total)
      progress('download', partial[id] ?? 0, total, '', true)

      if (id === m.comfyui.id) {
        const c = m.comfyui
        const archive = downloadTarget(m, dir, id)
        if (!existsSync(archive)) await download(c, archive, report, signal)
        progress('unpack', 0, 0, 'Unpacking the AI engine (a few minutes)…', true)
        const staging = join(dir, '_unpack')
        await rm(staging, { recursive: true, force: true })
        await unpack(archive, staging, signal)
        await mergeMove(join(staging, c.archiveFolder), dir)
        await rm(staging, { recursive: true, force: true })
        await unlink(archive)
      } else if (m.models.some((x) => x.id === id)) {
        const model = m.models.find((x) => x.id === id)!
        await download(model, downloadTarget(m, dir, id), report, signal)
      } else {
        const addon = m.customNodes.find((x) => x.id === id)
        if (!addon) continue
        const archive = downloadTarget(m, dir, id)
        if (!existsSync(archive)) await download(addon, archive, report, signal)
        progress('unpack', 0, 0, `Unpacking ${addon.name}…`, true)
        const staging = join(dir, '_unpack')
        const target = join(dir, 'ComfyUI', 'custom_nodes', addon.folder)
        await rm(staging, { recursive: true, force: true })
        await unpack(archive, staging, signal)
        await rm(target, { recursive: true, force: true })
        await mkdir(dirname(target), { recursive: true })
        await rename(join(staging, addon.archiveFolder), target)
        await rm(staging, { recursive: true, force: true })
        await writeFile(join(target, '.secondteam-version'), addon.version)
        await unlink(archive)
      }
      finished += total
    }
    await rm(join(dir, '_downloads'), { recursive: true, force: true })
    current = null
    progress('finished', 0, 0, 'Installed', true)
    return 'done'
  } catch (err) {
    if (err instanceof Paused || signal.aborted) {
      await rm(join(dir, '_unpack'), { recursive: true, force: true }).catch(() => undefined)
      progress('paused', 0, 0, 'Paused. What’s downloaded is kept; it carries on from here.', true)
      return 'paused'
    }
    progress('error', 0, 0, (err as Error).message, true)
    throw err
  }
}

/**
 * Check what's installed. With `full`, also recompute every model's checksum (several minutes for
 * ~20 GB); a model that doesn't match is reported damaged so Repair re-downloads it.
 */
export async function verify(m: Manifest, dir: string, full: boolean, emit: Emit, signal: AbortSignal): Promise<VerifyResult> {
  const states = installStates(m, dir)
  const damaged: string[] = []
  if (full) {
    const models = m.models.filter((x) => states[x.id] === 'installed')
    const total = models.reduce((s, x) => s + x.size, 0)
    let done = 0
    for (const model of models) {
      const check = itemChecks(m, model.id)[0]
      let last = 0
      const digest = await sha256(
        join(dir, ...check.path.split('/')),
        (n) => {
          done += n
          if (Date.now() - last > 250) {
            last = Date.now()
            emit({ phase: 'verify', id: model.id, itemDone: 0, itemTotal: model.size, overallDone: done, overallTotal: total, speed: 0, message: `Checking ${model.name}…` })
          }
        },
        signal
      )
      if (digest !== model.sha256) {
        damaged.push(model.id)
        states[model.id] = 'damaged'
      }
    }
  }
  return { states, damaged }
}

/** Remove a damaged model file so Repair downloads it again. */
export async function removeDamaged(m: Manifest, dir: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    const check = itemChecks(m, id)[0]
    if (check && m.models.some((x) => x.id === id)) await rm(join(dir, ...check.path.split('/')), { force: true })
  }
}

export { Paused }

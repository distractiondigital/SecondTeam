// Downloads the AI backend (ComfyUI portable + add-ons + models) listed in backend/manifest.json into the
// project's ComfyUI folder, resuming partial downloads and checking every file's SHA256.
//
//   node scripts/fetch-backend.mjs            everything marked "default"
//   node scripts/fetch-backend.mjs <id> ...   only these manifest ids (e.g. sdxl-base-1.0)
//
// A development tool (Milestone 6). The app itself uses the setup wizard (src/main/backend/installer.ts,
// Milestone 9), which does the same job with progress and without needing 7-Zip on Windows 11.
// The only network calls are the URLs in the manifest.

import { createHash } from 'crypto'
import { createReadStream, createWriteStream, existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { mkdir, readdir, rename, rm, unlink } from 'fs/promises'
import { spawnSync } from 'child_process'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'backend', 'manifest.json'), 'utf-8'))
const comfyRoot = join(root, 'ComfyUI')
const downloads = join(comfyRoot, '_downloads')
const SEVEN_ZIP = ['C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe'].find(existsSync)

const gb = (n) => `${(n / 1e9).toFixed(2)} GB`

async function sha256(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file, { highWaterMark: 8 * 1024 * 1024 })) hash.update(chunk)
  return hash.digest('hex')
}

/** Download `url` to `target`, resuming a `.part` file if there is one. */
async function download(item, target) {
  const part = `${target}.part`
  await mkdir(dirname(target), { recursive: true })
  let have = existsSync(part) ? statSync(part).size : 0
  if (have > item.size) {
    await unlink(part)
    have = 0
  }
  if (have < item.size) {
    const res = await fetch(item.url, { headers: have ? { Range: `bytes=${have}-` } : {} })
    if (!res.ok) throw new Error(`${item.name}: download failed (HTTP ${res.status})`)
    if (have && res.status !== 206) have = 0 // server ignored the resume: start over
    const out = createWriteStream(part, { flags: have ? 'a' : 'w' })
    let done = have
    let lastPrint = 0
    for await (const chunk of res.body) {
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r))
      done += chunk.length
      if (Date.now() - lastPrint > 2000) {
        lastPrint = Date.now()
        process.stdout.write(`  ${item.name}: ${gb(done)} / ${gb(item.size)}\r`)
      }
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())))
    process.stdout.write('\n')
  }
  const size = statSync(part).size
  if (size !== item.size) throw new Error(`${item.name}: got ${size} bytes, expected ${item.size}. Run again to resume.`)
  console.log(`  checking ${item.name}…`)
  const digest = await sha256(part)
  if (digest !== item.sha256) {
    await unlink(part)
    throw new Error(`${item.name}: checksum mismatch (the download was damaged). Deleted it; run again.`)
  }
  await rename(part, target)
}

async function installComfy() {
  const c = manifest.comfyui
  const marker = join(comfyRoot, 'python_embeded', 'python.exe')
  if (existsSync(marker)) return console.log(`✓ ${c.name} already installed`)
  if (!SEVEN_ZIP) throw new Error('7-Zip is needed to unpack ComfyUI (https://www.7-zip.org).')
  const archive = join(downloads, c.url.split('/').pop())
  if (!existsSync(archive)) {
    console.log(`↓ ${c.name} ${c.version} (${gb(c.size)})`)
    await download(c, archive)
  }
  console.log(`  unpacking ${c.name}…`)
  const staging = join(comfyRoot, '_unpack')
  await rm(staging, { recursive: true, force: true })
  const r = spawnSync(SEVEN_ZIP, ['x', archive, `-o${staging}`, '-y', '-bso0', '-bsp0'], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error('Unpacking ComfyUI failed.')
  const inner = join(staging, c.archiveFolder)
  for (const entry of await readdir(inner)) await rename(join(inner, entry), join(comfyRoot, entry))
  await rm(staging, { recursive: true, force: true })
  await unlink(archive)
  console.log(`✓ ${c.name} installed`)
}

async function installModel(m) {
  const target = join(comfyRoot, 'ComfyUI', 'models', m.folder, m.file)
  if (existsSync(target) && statSync(target).size === m.size) return console.log(`✓ ${m.name} already downloaded`)
  console.log(`↓ ${m.name} (${gb(m.size)}, ${m.license})`)
  await download(m, target)
  console.log(`✓ ${m.name}`)
}

/** A ComfyUI add-on (custom node), unpacked into ComfyUI\ComfyUI\custom_nodes\<folder>. */
async function installCustomNode(n) {
  const target = join(comfyRoot, 'ComfyUI', 'custom_nodes', n.folder)
  const marker = join(target, '.secondteam-version')
  if (existsSync(marker) && readFileSync(marker, 'utf-8').trim() === n.version) return console.log(`✓ ${n.name} already installed`)
  if (!SEVEN_ZIP) throw new Error('7-Zip is needed to unpack add-ons (https://www.7-zip.org).')
  const archive = join(downloads, `${n.id}.zip`)
  console.log(`↓ ${n.name} (${n.license})`)
  await download(n, archive)
  const staging = join(comfyRoot, '_unpack')
  await rm(staging, { recursive: true, force: true })
  const r = spawnSync(SEVEN_ZIP, ['x', archive, `-o${staging}`, '-y', '-bso0', '-bsp0'], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`Unpacking ${n.name} failed.`)
  await rm(target, { recursive: true, force: true })
  await rename(join(staging, n.archiveFolder), target)
  await rm(staging, { recursive: true, force: true })
  writeFileSync(marker, n.version)
  console.log(`✓ ${n.name}`)
}

const wanted = process.argv.slice(2)
const pick = (id, isDefault) => (wanted.length ? wanted.includes(id) : isDefault)
try {
  await mkdir(downloads, { recursive: true })
  if (pick('comfyui', true) || !existsSync(join(comfyRoot, 'python_embeded'))) await installComfy()
  for (const m of manifest.models) if (pick(m.id, m.default)) await installModel(m)
  for (const n of manifest.customNodes ?? []) if (pick(n.id, n.default)) await installCustomNode(n)
  await rm(downloads, { recursive: true, force: true })
  console.log('All done.')
} catch (err) {
  console.error(`\n✗ ${err.message}`)
  process.exit(1)
}

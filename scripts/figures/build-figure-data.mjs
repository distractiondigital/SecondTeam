// Converts MakeHuman's CC0 data into the compact files Second Team's human figures load at runtime
// (figures/body.json + figures/body.bin). Development tool: the output is committed, so this only
// needs re-running when the figure data changes.
//
//   node scripts/figures/build-figure-data.mjs
//
// Input (downloaded once into tools/makehuman/, which Git ignores):
//   mpfb-2.0.17.zip                     MakeHuman's Blender add-on; only its CC0 data folder is read
//                                       (base mesh, targets, rig + weights). No add-on code is used.
//   makehuman_system_assets_cc0.zip     clothes, hair, eyes… (CC0), used by later steps
//
// What's kept (to stay a few MB): the base mesh, the body targets for baby → child → young → old
// (MakeHuman's "macro" blends of gender/age/muscle/weight, with its three ethnic face sets averaged
// into one), the face-expression units (also averaged), the game-engine rig and its skin weights.

import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { gunzipSync } from 'zlib'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const source = join(root, 'tools', 'makehuman')
const extract = join(source, '_extract')
const out = join(root, 'figures')
const TAR = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')

function unzip(zip, dest, patterns) {
  mkdirSync(dest, { recursive: true })
  const r = spawnSync(TAR, ['-xf', join(source, zip), '-C', dest, ...patterns], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`Couldn't unpack ${zip}`)
}

if (!existsSync(join(source, 'mpfb-2.0.17.zip'))) {
  throw new Error('Put mpfb-2.0.17.zip (from extensions.blender.org/add-ons/mpfb) in tools/makehuman first.')
}
const mpfb = join(extract, 'mpfb')
unzip('mpfb-2.0.17.zip', mpfb, ['data/3dobjs/*', 'data/targets/macrodetails/*', 'data/targets/expression/*', 'data/targets/breast/nipple-*', 'data/targets/breast/breast-point-decr.target.gz', 'data/rigs/standard/*game_engine.json'])
const data = join(mpfb, 'data')

// ---------- Base mesh ----------

const obj = readFileSync(join(data, '3dobjs', 'base.obj'), 'utf-8').split(/\r?\n/)
const positions = []
const bodyTriangles = []
const groupVerts = {} // group name -> Set of vertex indices
let group = ''
for (const line of obj) {
  if (line.startsWith('v ')) {
    const [, x, y, z] = line.split(/\s+/)
    positions.push(+x, +y, +z)
  } else if (line.startsWith('g ')) {
    group = line.slice(2).trim()
  } else if (line.startsWith('f ')) {
    const idx = line.slice(2).trim().split(/\s+/).map((t) => parseInt(t.split('/')[0], 10) - 1)
    ;(groupVerts[group] ??= new Set())
    for (const i of idx) groupVerts[group].add(i)
    if (group === 'body') {
      for (let k = 1; k + 1 < idx.length; k++) bodyTriangles.push(idx[0], idx[k], idx[k + 1])
    }
  }
}
const vertexCount = positions.length / 3
if (vertexCount > 65535) throw new Error('Base mesh too big for 16-bit indices')

/** The joint marker shapes the rig is positioned from: group name -> vertex indices. */
const cubes = Object.fromEntries(
  Object.entries(groupVerts)
    .filter(([g]) => g.startsWith('joint-'))
    .map(([g, set]) => [g, [...set].sort((a, b) => a - b)])
)

// ---------- Targets ----------

function readTarget(file) {
  const deltas = new Map()
  for (const line of gunzipSync(readFileSync(file)).toString('utf-8').split(/\r?\n/)) {
    const t = line.trim().split(/\s+/)
    if (t.length < 4 || t[0].startsWith('#')) continue
    deltas.set(+t[0], [+t[1], +t[2], +t[3]])
  }
  return deltas
}

/** Average several targets (missing vertices count as zero). */
function average(maps) {
  const sum = new Map()
  for (const m of maps) {
    for (const [i, d] of m) {
      const s = sum.get(i) ?? [0, 0, 0]
      sum.set(i, [s[0] + d[0], s[1] + d[1], s[2] + d[2]])
    }
  }
  for (const [i, s] of sum) sum.set(i, s.map((v) => v / maps.length))
  return sum
}

const targets = [] // { name, deltas: Map }
const macro = join(data, 'targets', 'macrodetails')
const AGES = ['baby', 'child', 'young', 'old']
for (const gender of ['female', 'male']) {
  for (const age of AGES) {
    // Ethnic face/body sets, averaged: one neutral "human" per gender and age.
    const races = ['african', 'asian', 'caucasian'].map((r) => readTarget(join(macro, `${r}-${gender}-${age}.target.gz`)))
    targets.push({ name: `race-${gender}-${age}`, deltas: average(races) })
    for (const muscle of ['minmuscle', 'averagemuscle', 'maxmuscle']) {
      for (const weight of ['minweight', 'averageweight', 'maxweight']) {
        const name = `universal-${gender}-${age}-${muscle}-${weight}`
        const deltas = readTarget(join(macro, `${name}.target.gz`))
        if (deltas.size) targets.push({ name, deltas })
      }
    }
  }
}
const unitsDir = join(data, 'targets', 'expression', 'units')
for (const unit of readdirSync(join(unitsDir, 'caucasian')).map((f) => f.replace('.target.gz', ''))) {
  const races = ['african', 'asian', 'caucasian'].map((r) => readTarget(join(unitsDir, r, `${unit}.target.gz`)))
  targets.push({ name: `expression-${unit}`, deltas: average(races) })
}

// Modesty: the nipple targets (applied at full strength) and the area they touch, which the app
// also smooths flat, so figures on client boards have none.
const modestyRegion = new Set()
for (const name of ['nipple-size-decr', 'nipple-point-decr']) {
  const deltas = readTarget(join(data, 'targets', 'breast', `${name}.target.gz`))
  for (const i of deltas.keys()) modestyRegion.add(i)
  targets.push({ name: `modesty-${name}`, deltas })
}
// Rounds off the breast tip around the nipple (only the target, not part of the smoothed area).
targets.push({ name: 'modesty-breast-point-decr', deltas: readTarget(join(data, 'targets', 'breast', 'breast-point-decr.target.gz')) })

// ---------- Rig + skin weights ----------

const rig = JSON.parse(readFileSync(join(data, 'rigs', 'standard', 'rig.game_engine.json'), 'utf-8'))
const point = (p) =>
  p.strategy === 'CUBE' ? { cube: p.cube_name } : p.strategy === 'MEAN' ? { verts: p.vertex_indices } : { verts: p.vertex_indices ?? [] }
const bones = Object.entries(rig).map(([name, b]) => ({ name, parent: b.parent || null, head: point(b.head), tail: point(b.tail) }))
// Parents before children.
const ordered = []
const placed = new Set()
while (ordered.length < bones.length) {
  for (const b of bones) {
    if (!placed.has(b.name) && (!b.parent || placed.has(b.parent))) {
      ordered.push(b)
      placed.add(b.name)
    }
  }
}
const boneIndex = Object.fromEntries(ordered.map((b, i) => [b.name, i]))
const weightsFile = JSON.parse(readFileSync(join(data, 'rigs', 'standard', 'weights.game_engine.json'), 'utf-8'))
if (weightsFile.license !== 'CC0') throw new Error(`Unexpected weights licence: ${weightsFile.license}`)
const perVertex = Array.from({ length: vertexCount }, () => [])
for (const [bone, list] of Object.entries(weightsFile.weights)) {
  for (const [v, w] of list) perVertex[v].push([boneIndex[bone], w])
}
const skinIndex = new Uint8Array(vertexCount * 4)
const skinWeight = new Uint8Array(vertexCount * 4)
for (let v = 0; v < vertexCount; v++) {
  const top = perVertex[v].sort((a, b) => b[1] - a[1]).slice(0, 4)
  const total = top.reduce((s, [, w]) => s + w, 0)
  if (!total) {
    skinIndex[v * 4] = boneIndex.pelvis
    skinWeight[v * 4] = 255
    continue
  }
  // Quantise to 0-255 and give any rounding difference to the strongest bone, so they add up to 255.
  const q = top.map(([, w]) => Math.round((w / total) * 255))
  q[0] += 255 - q.reduce((s, x) => s + x, 0)
  top.forEach(([b], k) => {
    skinIndex[v * 4 + k] = b
    skinWeight[v * 4 + k] = q[k]
  })
}

// ---------- Write ----------

const chunks = []
let offset = 0
const sections = {}
function add(name, typed) {
  const pad = (4 - (offset % 4)) % 4
  if (pad) {
    chunks.push(Buffer.alloc(pad))
    offset += pad
  }
  sections[name] = { offset, length: typed.length, type: typed.constructor.name }
  chunks.push(Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength))
  offset += typed.byteLength
}

add('positions', new Float32Array(positions))
add('bodyIndices', new Uint16Array(bodyTriangles))
add('skinIndex', skinIndex)
add('skinWeight', skinWeight)
const targetIndex = []
for (const t of targets) {
  const entries = [...t.deltas].filter(([, d]) => d.some((x) => x !== 0)).sort((a, b) => a[0] - b[0])
  const maxAbs = Math.max(1e-9, ...entries.flatMap(([, d]) => d.map(Math.abs)))
  const scale = maxAbs / 32767
  const idx = new Uint16Array(entries.map(([i]) => i))
  const deltas = new Int16Array(entries.flatMap(([, d]) => d.map((x) => Math.round(x / scale))))
  add(`t:${t.name}:i`, idx)
  add(`t:${t.name}:d`, deltas)
  targetIndex.push({ name: t.name, count: entries.length, scale })
}

mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'body.bin'), Buffer.concat(chunks))
writeFileSync(
  join(out, 'body.json'),
  JSON.stringify(
    {
      source: 'MakeHuman base mesh, targets, game-engine rig and weights (CC0), via MPFB 2.0.17 data',
      units: 'decimetres, Y up, facing +Z',
      vertexCount,
      sections,
      targets: targetIndex,
      cubes,
      modestyRegion: [...modestyRegion].sort((a, b) => a - b),
      bones: ordered
    },
    null,
    1
  )
)
console.log(`figures/body.bin: ${(offset / 1e6).toFixed(1)} MB, ${vertexCount} vertices, ${bodyTriangles.length / 3} body triangles, ${targets.length} targets, ${ordered.length} bones`)

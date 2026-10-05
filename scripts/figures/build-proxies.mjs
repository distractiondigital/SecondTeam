// Converts MakeHuman "proxies" (eyes, eyebrows, hair, clothes: CC0 / CC-BY) into the small files
// the app loads on demand: figures/proxies.json (the catalogue) + figures/proxies/<id>.bin
// (+ <id>.png, a transparency mask for hair and eyebrows). Development tool; output is committed.
//
//   node scripts/figures/build-proxies.mjs
//
// A proxy vertex sits on the body: three base-mesh vertices with weights, plus an offset scaled by
// the body's size (MakeHuman's .mhclo format), so it re-fits any body shape. Each item also lists
// the base-mesh vertices it covers ("delete_verts"), so the skin under clothes can be hidden.

import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const source = join(root, 'tools', 'makehuman')
const extract = join(source, '_extract')
const out = join(root, 'figures')
const TAR = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')

/** Source packs: zip in tools/makehuman/, its licence, and where it came from. */
const PACKS = {
  sys: {
    zip: 'makehuman_system_assets_cc0.zip',
    license: 'CC0',
    url: 'https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html'
  }
}

/**
 * The catalogue: what the app offers. kind = eyes | eyebrows | hair | clothes;
 * slot (clothes) = outfit (top + bottom) | top | bottom | outer | shoes | hat.
 */
const ITEMS = [
  { id: 'eyes', pack: 'sys', dir: 'eyes/low-poly', kind: 'eyes', label: 'Eyes' },
  { id: 'eyebrows-1', pack: 'sys', dir: 'eyebrows/eyebrow001', kind: 'eyebrows', label: 'Eyebrows', texture: 'eyebrow001.png' },
  ...[
    ['short01', 'Short (cropped)'],
    ['short02', 'Short (textured)'],
    ['short03', 'Short (side part)'],
    ['short04', 'Short (swept)'],
    ['bob01', 'Bob'],
    ['bob02', 'Bob (chin)'],
    ['long01', 'Long'],
    ['ponytail01', 'Ponytail'],
    ['braid01', 'Braid'],
    ['afro01', 'Afro']
  ].map(([name, label]) => ({ id: `hair-${name}`, pack: 'sys', dir: `hair/${name}`, kind: 'hair', label, texture: name === 'afro01' ? 'afro_diffuse.png' : `${name}_diffuse.png` })),
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `outfit-male-casual-${n}`, pack: 'sys', dir: `clothes/male_casualsuit0${n}`, kind: 'clothes', slot: 'outfit', label: `Casual (men's) ${n}` })),
  { id: 'outfit-male-suit', pack: 'sys', dir: 'clothes/male_elegantsuit01', kind: 'clothes', slot: 'outfit', label: "Suit (men's)" },
  { id: 'outfit-work', pack: 'sys', dir: 'clothes/male_worksuit01', kind: 'clothes', slot: 'outfit', label: 'Work clothes' },
  ...[1, 2].map((n) => ({ id: `outfit-female-casual-${n}`, pack: 'sys', dir: `clothes/female_casualsuit0${n}`, kind: 'clothes', slot: 'outfit', label: `Casual (women's) ${n}` })),
  { id: 'outfit-female-suit', pack: 'sys', dir: 'clothes/female_elegantsuit01', kind: 'clothes', slot: 'outfit', label: "Suit (women's)" },
  { id: 'outfit-sport', pack: 'sys', dir: 'clothes/female_sportsuit01', kind: 'clothes', slot: 'outfit', label: 'Sportswear' },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `shoes-${n}`, pack: 'sys', dir: `clothes/shoes0${n}`, kind: 'clothes', slot: 'shoes', label: `Shoes ${n}` })),
  { id: 'hat-fedora', pack: 'sys', dir: 'clothes/fedora01', kind: 'clothes', slot: 'hat', label: 'Fedora' }
]

function unpackPacks() {
  for (const [name, pack] of Object.entries(PACKS)) {
    const dest = join(extract, name)
    if (existsSync(dest)) continue
    if (!existsSync(join(source, pack.zip))) throw new Error(`Put ${pack.zip} (${pack.url}) in tools/makehuman first.`)
    mkdirSync(dest, { recursive: true })
    const r = spawnSync(TAR, ['-xf', join(source, pack.zip), '-C', dest], { stdio: 'inherit' })
    if (r.status !== 0) throw new Error(`Couldn't unpack ${pack.zip}`)
  }
}

/** Parse a .mhclo: scale references, per-vertex refs/weights/offsets, and covered body vertices. */
function parseMhclo(text) {
  const scales = {}
  const refs = []
  let objFile = null
  let section = 'header'
  const deleteVerts = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line === 'verts 0' || line.startsWith('verts ')) {
      section = 'verts'
      continue
    }
    if (line === 'delete_verts') {
      section = 'delete'
      continue
    }
    const t = line.split(/\s+/)
    if (section === 'header') {
      if (t[0] === 'obj_file') objFile = t[1]
      if (t[0] === 'x_scale' || t[0] === 'y_scale' || t[0] === 'z_scale') scales[t[0][0]] = [+t[1], +t[2], +t[3]]
    } else if (section === 'verts') {
      if (t.length >= 9) refs.push({ v: [+t[0], +t[1], +t[2]], w: [+t[3], +t[4], +t[5]], o: [+t[6], +t[7], +t[8]] })
      else if (t.length === 1) refs.push({ v: [+t[0], +t[0], +t[0]], w: [1, 0, 0], o: [0, 0, 0] })
      // Other keywords (e.g. "material") can appear among the vertex lines: skip them.
    } else if (section === 'delete') {
      for (let i = 0; i < t.length; i++) {
        if (t[i + 1] === '-') {
          for (let v = +t[i]; v <= +t[i + 2]; v++) deleteVerts.push(v)
          i += 2
        } else if (/^\d+$/.test(t[i])) deleteVerts.push(+t[i])
      }
    }
  }
  return { scales, refs, objFile, deleteVerts }
}

/** Parse an .obj into triangles over unique (vertex, uv) corners; `vertex` maps back to the obj vertex. */
function parseObj(text) {
  const uvs = []
  const corners = new Map() // "v/vt" -> new index
  const vertex = []
  const uv = []
  const tris = []
  let objVerts = 0
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('v ')) objVerts++
    else if (line.startsWith('vt ')) {
      const [, u, v] = line.trim().split(/\s+/)
      uvs.push([+u, +v])
    } else if (line.startsWith('f ')) {
      const ids = line
        .slice(2)
        .trim()
        .split(/\s+/)
        .map((c) => {
          let k = corners.get(c)
          if (k === undefined) {
            const [v, t] = c.split('/')
            k = vertex.length
            corners.set(c, k)
            vertex.push(+v - 1)
            const tv = t ? uvs[+t - 1] : [0, 0]
            uv.push(tv[0], tv[1])
          }
          return k
        })
      for (let i = 1; i + 1 < ids.length; i++) tris.push(ids[0], ids[i], ids[i + 1])
    }
  }
  return { objVerts, vertex, uv, tris }
}

function build() {
  unpackPacks()
  const dir = join(out, 'proxies')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const catalogue = []
  let total = 0
  for (const item of ITEMS) {
    const pack = PACKS[item.pack]
    const base = join(extract, item.pack, item.dir)
    const mhcloName = readdirSafe(base).find((f) => f.endsWith('.mhclo'))
    const mhclo = parseMhclo(readFileSync(join(base, mhcloName), 'utf-8'))
    const obj = parseObj(readFileSync(join(base, mhclo.objFile), 'utf-8'))
    if (obj.objVerts !== mhclo.refs.length) throw new Error(`${item.id}: ${obj.objVerts} obj vertices but ${mhclo.refs.length} refs`)
    // One entry per (vertex, uv) corner.
    const n = obj.vertex.length
    const refs = new Uint16Array(n * 3)
    const weights = new Float32Array(n * 3)
    const offsets = new Float32Array(n * 3)
    obj.vertex.forEach((v, k) => {
      const r = mhclo.refs[v]
      refs.set(r.v, k * 3)
      weights.set(r.w, k * 3)
      offsets.set(r.o, k * 3)
    })
    const indices = n > 65535 ? new Uint32Array(obj.tris) : new Uint16Array(obj.tris)
    const sections = []
    let offset = 0
    const chunks = []
    for (const [name, typed] of [
      ['refs', refs],
      ['weights', weights],
      ['offsets', offsets],
      ['uv', new Float32Array(obj.uv)],
      ['indices', indices],
      ['deleteVerts', new Uint16Array(mhclo.deleteVerts)]
    ]) {
      const pad = (4 - (offset % 4)) % 4
      if (pad) chunks.push(Buffer.alloc(pad))
      offset += pad
      sections.push({ name, offset, length: typed.length, type: typed.constructor.name })
      chunks.push(Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength))
      offset += typed.byteLength
    }
    writeFileSync(join(dir, `${item.id}.bin`), Buffer.concat(chunks))
    total += offset
    let mask = null
    if (item.texture) {
      mask = `${item.id}.png`
      const r = spawnSync(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'figures', 'alpha-mask.ps1'), '-In', join(base, item.texture), '-Out', join(dir, mask), '-Size', item.kind === 'hair' ? '1024' : '256'],
        { stdio: 'inherit' }
      )
      if (r.status !== 0) throw new Error(`Couldn't make the mask for ${item.id}`)
    }
    catalogue.push({
      id: item.id,
      kind: item.kind,
      slot: item.slot ?? null,
      label: item.label,
      vertexCount: n,
      scales: mhclo.scales,
      sections: Object.fromEntries(sections.map((s) => [s.name, { offset: s.offset, length: s.length, type: s.type }])),
      mask,
      license: pack.license,
      source: `${pack.url} (${item.dir})`
    })
  }
  writeFileSync(join(out, 'proxies.json'), JSON.stringify({ items: catalogue }, null, 1))
  console.log(`figures/proxies: ${catalogue.length} items, ${(total / 1e6).toFixed(1)} MB of geometry`)
}

function readdirSafe(d) {
  return existsSync(d) ? readdirSync(d).sort() : []
}

build()

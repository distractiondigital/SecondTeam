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
  },
  shirts01: { zip: 'shirts01_cc0.zip', license: 'CC0', url: 'https://static.makehumancommunity.org/assets/assetpacks/shirts01.html' },
  shirts02: { zip: 'shirts02_ccby.zip', license: 'CC-BY', url: 'https://static.makehumancommunity.org/assets/assetpacks/shirts02.html' },
  pants01: { zip: 'pants01_cc0.zip', license: 'CC0', url: 'https://static.makehumancommunity.org/assets/assetpacks/pants01.html' },
  dress01: { zip: 'dress01_cc0.zip', license: 'CC0', url: 'https://static.makehumancommunity.org/assets/assetpacks/dress01.html' },
  suits01: { zip: 'suits01_cc0.zip', license: 'CC0', url: 'https://static.makehumancommunity.org/assets/assetpacks/suits01.html' }
}

/** Authors to credit for CC-BY items (by the asset's name prefix). */
const AUTHORS = { elvs: 'Elvaerwyn', mindfront: 'Mindfront', ews: 'EWS', punkduck: 'punkduck', janexx: 'janexx' }

/** An item from one of the community packs: clothes/<name>. */
const pack = (packName, name, id, slot, label) => ({ id, pack: packName, dir: `clothes/${name}`, kind: 'clothes', slot, label, author: AUTHORS[name.split('_')[0]] ?? null })

/**
 * The catalogue: what the app offers. kind = eyes | eyebrows | hair | clothes;
 * slot (clothes) = outfit (top + bottom) | top | bottom | outer | shoes | hat.
 */
const ITEMS = [
  // The eyes wear MakeHuman's brown eye texture (white, iris, pupil) in its own colours.
  { id: 'eyes', pack: 'sys', dir: 'eyes/low-poly', kind: 'eyes', label: 'Eyes', colorTexture: '../materials/brown_eye.png' },
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
  { id: 'hat-fedora', pack: 'sys', dir: 'clothes/fedora01', kind: 'clothes', slot: 'hat', label: 'Fedora' },
  // Tops
  pack('shirts01', 'toigo_basic_tucked_t-shirt', 'top-tshirt-tucked', 'top', 'T-shirt (tucked)'),
  pack('shirts01', 'elvs_crude_t-shirt_male', 'top-tshirt-men', 'top', "T-shirt (men's)"),
  pack('shirts01', 'joepal_crude_t-shirt_female', 'top-tshirt-women', 'top', "T-shirt (women's)"),
  pack('shirts01', 'namuhekam_male_polo_shirt', 'top-polo', 'top', 'Polo shirt'),
  pack('shirts01', 'toigo_fisherman_sweater', 'top-fisherman-sweater', 'top', 'Fisherman sweater'),
  pack('shirts01', 'toigo_camisole_top', 'top-camisole', 'top', 'Camisole'),
  pack('shirts01', 'toigo_keyhole_tank_top', 'top-tank', 'top', 'Tank top'),
  pack('shirts02', 'elvs_male_shirt_untucked_bd1', 'top-shirt-untucked', 'top', 'Shirt (untucked)'),
  pack('shirts02', 'elvs_male_shirt_tie_tucked1', 'top-shirt-tie', 'top', 'Shirt and tie'),
  pack('shirts02', 'ews_striped_shirt', 'top-striped-shirt', 'top', 'Striped shirt'),
  pack('shirts02', 'mindfront_knitted_sweater_01', 'top-knit-sweater', 'top', 'Knitted sweater'),
  pack('shirts02', 'punkduck_lace_up_blouse', 'top-blouse', 'top', 'Blouse'),
  pack('shirts02', 'janexx_old_female_sweater', 'top-cardigan-sweater', 'top', 'Sweater (older)'),
  // Outerwear
  pack('shirts02', 'elvs_hooded_sweat_jacket1', 'outer-hoodie', 'outer', 'Hooded jacket'),
  pack('shirts02', 'mindfront_cardigan_long_open_front', 'outer-long-cardigan', 'outer', 'Long cardigan'),
  // Bottoms
  pack('pants01', 'toigo_wool_pants', 'bottom-trousers', 'bottom', 'Trousers'),
  pack('pants01', 'cortu_cargo_pants', 'bottom-cargo', 'bottom', 'Cargo pants'),
  pack('pants01', 'cortu_jeans_shorts', 'bottom-denim-shorts', 'bottom', 'Denim shorts'),
  // Shorts made from the long pants by cutting the legs (see `cut`).
  { ...pack('pants01', 'toigo_wool_pants', 'bottom-shorts', 'bottom', 'Shorts'), cut: -3.0 },
  { ...pack('pants01', 'cortu_cargo_pants', 'bottom-cargo-shorts', 'bottom', 'Cargo shorts'), cut: -3.55 },
  // Dresses (a whole outfit)
  pack('dress01', 'toigo_shift_dress', 'outfit-dress-shift', 'outfit', 'Shift dress'),
  pack('dress01', 'toigo_keyhole_neck_dress', 'outfit-dress-keyhole', 'outfit', 'Dress (keyhole neck)'),
  pack('dress01', 'toigo_halter_dress_knee_length', 'outfit-dress-halter', 'outfit', 'Halter dress'),
  pack('dress01', 'toigo_camisole_dress_with_full_skirt', 'outfit-dress-full-skirt', 'outfit', 'Dress (full skirt)'),
  pack('dress01', 'toigo_dress_with_tiered_skirt', 'outfit-dress-tiered', 'outfit', 'Dress (tiered skirt)'),
  pack('dress01', 'mindfront_kimono', 'outfit-kimono', 'outfit', 'Kimono'),
  // Suits
  pack('suits01', 'toigo_male_suit_tie_and_jacket', 'outfit-suit-tie', 'outfit', 'Suit and tie'),
  pack('suits01', 'toigo_male_suit_3', 'outfit-suit-3', 'outfit', 'Suit (open collar)'),
  pack('suits01', 'toigo_male_double-breasted_suit', 'outfit-suit-double', 'outfit', 'Double-breasted suit'),
  pack('suits01', 'toigo_suit_with_dinner_jacket', 'outfit-dinner-jacket', 'outfit', 'Dinner jacket'),
  pack('suits01', 'toigo_female_suit', 'outfit-womens-suit-1', 'outfit', "Women's suit 1"),
  pack('suits01', 'toigo_female_suit_2', 'outfit-womens-suit-2', 'outfit', "Women's suit 2"),
  pack('suits01', 'toigo_female_double-breasted_suit', 'outfit-womens-suit-double', 'outfit', "Women's double-breasted suit")
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

/** The base mesh's vertex positions (decimetres, Y up), to know how high each part sits. */
let baseVerts = null
function basePositions() {
  baseVerts ??= readFileSync(join(extract, 'mpfb', 'data', '3dobjs', 'base.obj'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l.startsWith('v '))
    .map((l) => l.trim().split(/\s+/).slice(1).map(Number))
  return baseVerts
}

/**
 * Cut a garment's legs off at a height on the base mesh (`cut`, decimetres; the crotch is about 0,
 * the knee about -4.3): drops the triangles reaching below it, and keeps the skin below it showing.
 */
function cutBelow(obj, mhclo, y) {
  const base = basePositions()
  const height = (k) => {
    const r = mhclo.refs[obj.vertex[k]]
    return r.v.reduce((sum, v, i) => sum + r.w[i] * base[v][1], 0)
  }
  const tris = []
  for (let i = 0; i < obj.tris.length; i += 3) {
    const t = obj.tris.slice(i, i + 3)
    // Whole triangles only, so the hem follows the garment's own edge ring just above the cut.
    if (Math.min(height(t[0]), height(t[1]), height(t[2])) >= y) tris.push(...t)
  }
  obj.tris = tris
  // Hide only skin well inside what's left, so no gap opens at the hem.
  mhclo.deleteVerts = mhclo.deleteVerts.filter((v) => base[v][1] > y + 0.3)
}

/**
 * Parse an .obj into triangles. With `keepUv` (cut-out cards: hair, eyebrows) vertices are split
 * wherever the texture layout has a seam, so each corner keeps its uv; otherwise (untextured
 * clothes) every obj vertex stays one vertex, so the surface shades smoothly across seams.
 * `vertex` maps each output vertex back to its obj vertex.
 */
function parseObj(text, keepUv) {
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
          const key = keepUv ? c : c.split('/')[0]
          let k = corners.get(key)
          if (k === undefined) {
            const [v, t] = c.split('/')
            k = vertex.length
            corners.set(key, k)
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
    const obj = parseObj(readFileSync(join(base, mhclo.objFile), 'utf-8'), Boolean(item.texture || item.colorTexture))
    if (obj.objVerts !== mhclo.refs.length) throw new Error(`${item.id}: ${obj.objVerts} obj vertices but ${mhclo.refs.length} refs`)
    if (item.cut !== undefined) cutBelow(obj, mhclo, item.cut)
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
    let map = null
    if (item.colorTexture) {
      map = `${item.id}-color.png`
      const r = spawnSync(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'figures', 'alpha-mask.ps1'), '-In', join(base, item.colorTexture), '-Out', join(dir, map), '-Size', '256', '-Color'],
        { stdio: 'inherit' }
      )
      if (r.status !== 0) throw new Error(`Couldn't make the texture for ${item.id}`)
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
      map,
      license: pack.license,
      author: item.author ?? null,
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

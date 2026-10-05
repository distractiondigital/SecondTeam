import { useEffect, useState } from 'react'
import { SRGBColorSpace, Texture, TextureLoader } from 'three'
import { parseBody, parseProxy, type BodyData, type BodyJson, type ProxyData, type ProxyInfo } from '../../../shared/humanBody'

// The human figures' data, loaded from the main process (the UI can't read files) and kept:
// the body once, the catalogue once, and each eyes/hair/clothes item the first time it's worn.

const api = () => window.secondTeam
const asBuffer = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

let bodyLoading: Promise<BodyData> | null = null
let bodyLoaded: BodyData | null = null

export function loadBodyData(): Promise<BodyData> {
  bodyLoading ??= (async () => {
    const [json, bin] = await Promise.all([api().readFigureFile('body.json'), api().readFigureFile('body.bin')])
    bodyLoaded = parseBody(JSON.parse(new TextDecoder().decode(json)) as BodyJson, asBuffer(bin))
    return bodyLoaded
  })()
  return bodyLoading
}

/** The body data if it has loaded already (no waiting), else null. */
export function bodyDataNow(): BodyData | null {
  return bodyLoaded
}

/** The body data, or null until it has loaded. */
export function useBodyData(): BodyData | null {
  const [data, setData] = useState<BodyData | null>(bodyLoaded)
  useEffect(() => {
    if (!data) void loadBodyData().then(setData)
  }, [data])
  return data
}

let catalogueLoading: Promise<ProxyInfo[]> | null = null
let catalogueLoaded: ProxyInfo[] | null = null

export function loadCatalogue(): Promise<ProxyInfo[]> {
  catalogueLoading ??= api()
    .readFigureFile('proxies.json')
    .then((b) => (catalogueLoaded = (JSON.parse(new TextDecoder().decode(b)) as { items: ProxyInfo[] }).items))
  return catalogueLoading
}

/** Eyes, eyebrows, hair and clothes on offer (empty until loaded). */
export function useCatalogue(): ProxyInfo[] {
  const [items, setItems] = useState<ProxyInfo[]>(catalogueLoaded ?? [])
  useEffect(() => {
    if (!catalogueLoaded) void loadCatalogue().then(setItems)
  }, [])
  return items
}

export interface LoadedProxy {
  data: ProxyData
  /** Cut-out mask for hair and eyebrows. */
  mask: Texture | null
}

const proxies = new Map<string, Promise<LoadedProxy | null>>()

async function maskTexture(file: string): Promise<Texture> {
  const bytes = await api().readFigureFile(`proxies/${file}`)
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }))
  try {
    const texture = await new TextureLoader().loadAsync(url)
    texture.colorSpace = SRGBColorSpace
    return texture
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** One item, or null if it's not in the catalogue (e.g. a project from a newer version). */
export function loadProxy(id: string): Promise<LoadedProxy | null> {
  let p = proxies.get(id)
  if (!p) {
    p = (async () => {
      const info = (await loadCatalogue()).find((i) => i.id === id)
      if (!info) return null
      const [bin, mask] = await Promise.all([api().readFigureFile(`proxies/${id}.bin`), info.mask ? maskTexture(info.mask) : null])
      return { data: parseProxy(info, asBuffer(bin)), mask }
    })()
    proxies.set(id, p)
  }
  return p
}

/**
 * The listed items once they're all loaded (unknown ids are left out). While a changed list
 * loads, the previous items stay (no flicker); null only before anything has loaded.
 */
export function useProxies(ids: string[]): LoadedProxy[] | null {
  const key = ids.join('|')
  const [state, setState] = useState<{ key: string; items: LoadedProxy[] } | null>(null)
  useEffect(() => {
    let live = true
    void Promise.all(key ? key.split('|').map(loadProxy) : []).then((items) => {
      if (live) setState({ key, items: items.filter((i): i is LoadedProxy => i !== null) })
    })
    return () => {
      live = false
    }
  }, [key])
  return state ? state.items : null
}

// Saved Renders (path-traced pictures of shots): what's stored and which one to show. Pure, tested.
//
// In the project folder, next to a shot's takes and passes:
//   Name.secondteam\scenes\<sceneId>\shots\<shotId>\render\draft.png + draft.json
//                                                          \final.png + final.json
// The .json says what the picture shows (the shot's fingerprint): when the shot changes, its render
// is out of date and isn't used any more (it stays on disk until replaced).

export type RenderQuality = 'draft' | 'final'
export const RENDER_QUALITIES: RenderQuality[] = ['draft', 'final']

export interface RenderMeta {
  /** The shot's fingerprint when it was rendered (shotFingerprint in the renderer). */
  print: string
  width: number
  height: number
  samples: number
  /** ISO date. */
  date: string
}

/** The two files of one saved render. */
export function renderFileNames(quality: RenderQuality): { image: string; meta: string } {
  return { image: `${quality}.png`, meta: `${quality}.json` }
}

export function isRenderQuality(q: unknown): q is RenderQuality {
  return q === 'draft' || q === 'final'
}

/** Read a render's .json (null if damaged). */
export function parseRenderMeta(text: string): RenderMeta | null {
  try {
    const r = JSON.parse(text) as Partial<RenderMeta>
    if (typeof r.print !== 'string' || !r.print) return null
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
    const width = n(r.width)
    const height = n(r.height)
    const samples = n(r.samples)
    if (!width || !height || !samples) return null
    return { print: r.print, width, height, samples, date: typeof r.date === 'string' ? r.date : '' }
  } catch {
    return null
  }
}

/** The render to show for a shot whose fingerprint is `print`: an up-to-date Final, else an up-to-date Draft, else none. */
export function currentRender<T extends { print: string }>(renders: Partial<Record<RenderQuality, T>> | undefined, print: string): (T & { quality: RenderQuality }) | null {
  for (const quality of ['final', 'draft'] as const) {
    const r = renders?.[quality]
    if (r && r.print === print) return { ...r, quality }
  }
  return null
}

/** A short, stable fingerprint of a long text (cyrb53; not for security, just "has this changed"). */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

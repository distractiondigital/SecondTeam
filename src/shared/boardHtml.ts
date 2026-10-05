// The storyboard PDF's pages, as one HTML document that Electron prints to PDF. Two layouts:
//   grid  landscape pages, 2-up / 3-up / 6-up (3 x 2), captions under each frame
//   rows  portrait pages, 2 / 3 / 4 panels stacked, frame left and captions right
// Caption styles follow Spencer's build_board.py: bold shot label, plain description, italic
// quoted dialogue, small grey notes; title and "Page X of Y" on every page, optional footer.

import { paginate, type BoardLayout } from './board'

export type PageSize = 'letter' | 'a4'
/** What the frames show: each shot's circle take, or its clay render. */
export type BoardSource = 'ai' | 'clay'

export interface BoardPanelData {
  sceneId: string
  shotId: string
  /** The circle take to print, or null (a "no circle take yet" box). */
  takeId: string | null
  shotName: string
  sceneTag: string
  /** '35mm · Medium shot · Eye level' */
  specs: string
  description: string
  dialogue: string
  notes: string
}

export interface BoardExportSpec {
  layout: BoardLayout
  perPage: number
  pageSize: PageSize
  title: string
  footer: string
  includeMissing: boolean
  source: BoardSource
  /** Clay renders (PNG data URLs) by shot id, sent by the UI when source is 'clay'. */
  clayImages?: Record<string, string>
  /** Frame shape (width / height) for the image boxes. */
  ratio: number
  panels: BoardPanelData[]
}

/** Page size in inches, by layout (grid pages are landscape, rows pages portrait). */
export function pageInches(size: PageSize, layout: BoardLayout): { w: number; h: number } {
  const [short, long] = size === 'a4' ? [8.27, 11.69] : [8.5, 11]
  return layout === 'grid' ? { w: long, h: short } : { w: short, h: long }
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** The panels that make it onto the board (in AI mode, shots without a circle take only if asked for). */
export function printedPanels(spec: BoardExportSpec): BoardPanelData[] {
  return spec.includeMissing || spec.source === 'clay' ? spec.panels : spec.panels.filter((p) => p.takeId)
}

/** The key a panel's picture is stored under in `images`: its circle take, or (clay) its shot. */
export function imageKey(spec: BoardExportSpec, p: BoardPanelData): string | null {
  return spec.source === 'clay' ? p.shotId : p.takeId
}

const MARGIN = 0.45 // inches
const HEADER = 0.42
const FOOTER = 0.28

/**
 * The whole document. `images` maps each panel's `imageKey` to an image data URL (already downscaled for print).
 */
export function boardHtml(spec: BoardExportSpec, images: Record<string, string>): string {
  const page = pageInches(spec.pageSize, spec.layout)
  const pages = paginate(printedPanels(spec), spec.perPage)
  const contentH = page.h - MARGIN * 2 - HEADER - FOOTER
  const contentW = page.w - MARGIN * 2
  const total = pages.length

  const caption = (p: BoardPanelData) => {
    const parts = [
      `<div class="label"><b>${escapeHtml(p.shotName)}</b><span class="scene">${escapeHtml(p.sceneTag)}</span></div>`,
      p.specs ? `<div class="specs">${escapeHtml(p.specs)}</div>` : '',
      p.description.trim() ? `<div class="desc">${escapeHtml(p.description.trim())}</div>` : '',
      p.dialogue.trim() ? `<div class="dialogue">“${escapeHtml(p.dialogue.trim())}”</div>` : '',
      p.notes.trim() ? `<div class="notes">${escapeHtml(p.notes.trim())}</div>` : ''
    ]
    return `<div class="caption">${parts.join('')}</div>`
  }
  const frame = (p: BoardPanelData) => {
    const key = imageKey(spec, p)
    const src = key ? images[key] : undefined
    if (src) return `<div class="frame"><img src="${src}" alt=""></div>`
    const why = spec.source === 'clay' ? 'Clay render not available' : p.takeId ? 'Circle take image not found' : 'No circle take yet'
    return `<div class="frame missing"><span>${why}</span></div>`
  }

  // Panel geometry, in inches, so frames keep the shot's shape and captions get what's left.
  let body = ''
  let panelCss = ''
  if (spec.layout === 'grid') {
    const cols = spec.perPage === 2 ? 2 : 3
    const rows = Math.ceil(spec.perPage / cols)
    const gap = 0.25
    const cellW = (contentW - gap * (cols - 1)) / cols
    const maxCellH = (contentH - gap * (rows - 1)) / rows
    const frameH = Math.min(cellW / spec.ratio, maxCellH * 0.66)
    const frameW = frameH * spec.ratio
    // Room for the captions (up to ~2in), then the block is centred on the page.
    const captionH = Math.min(maxCellH - frameH - 0.1, 2)
    const cellH = frameH + 0.1 + captionH
    panelCss = `
      .content { height: ${contentH}in; display: flex; flex-direction: column; justify-content: center; }
      .cells { display: grid; grid-template-columns: repeat(${cols}, ${cellW}in); grid-template-rows: repeat(${rows}, ${cellH}in); gap: ${gap}in; }
      .cell { display: flex; flex-direction: column; overflow: hidden; }
      .frame { width: ${frameW}in; height: ${frameH}in; }
      .caption { margin-top: 0.08in; max-height: ${captionH}in; overflow: hidden; }
      ${clampCss(captionH)}`
    body = pages
      .map((chunk, i) => pageHtml(spec, i, total, `<div class="cells">${chunk.map((p) => `<div class="cell">${frame(p)}${caption(p)}</div>`).join('')}</div>`))
      .join('')
  } else {
    const gap = 0.22
    const rowH = (contentH - gap * (spec.perPage - 1)) / spec.perPage
    const frameW = Math.min(contentW * 0.64, rowH * spec.ratio)
    const frameH = frameW / spec.ratio
    // Captions line up with the top of the frame and may run a little below it.
    const captionH = Math.min(rowH, frameH + 0.6)
    panelCss = `
      .rows { display: flex; flex-direction: column; gap: ${gap}in; }
      .row { display: flex; gap: 0.25in; height: ${rowH}in; align-items: flex-start; overflow: hidden; }
      .frame { flex: 0 0 auto; width: ${frameW}in; height: ${frameH}in; }
      .caption { flex: 1; max-height: ${captionH}in; overflow: hidden; }
      ${clampCss(captionH)}`
    body = pages
      .map((chunk, i) => pageHtml(spec, i, total, `<div class="rows">${chunk.map((p) => `<div class="row">${frame(p)}${caption(p)}</div>`).join('')}</div>`))
      .join('')
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(spec.title)}</title><style>
    @page { size: ${page.w}in ${page.h}in; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Helvetica, Arial, sans-serif; }
    .page { width: ${page.w}in; height: ${page.h}in; padding: ${MARGIN}in; position: relative; overflow: hidden; break-after: page; }
    .page:last-child { break-after: auto; }
    .header { height: ${HEADER}in; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 0.6pt solid #bfbfbf; margin-bottom: 0.12in; }
    .header .title { font-size: 12pt; font-weight: bold; }
    .header .pageno { font-size: 8.5pt; color: #666; }
    .footer { position: absolute; left: ${MARGIN}in; right: ${MARGIN}in; bottom: ${MARGIN - 0.1}in; font-size: 7.5pt; color: #808080; }
    .frame { border: 0.8pt solid #262626; background: #eee; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .frame.missing span { font-size: 8pt; color: #888; }
    .label { font-size: 10pt; margin-bottom: 2pt; }
    .label .scene { font-size: 7.5pt; color: #808080; margin-left: 6pt; font-weight: normal; }
    .specs { font-size: 7.5pt; color: #737373; margin-bottom: 3pt; }
    .desc { font-size: 8.5pt; line-height: 1.25; margin-bottom: 3pt; }
    .dialogue { font-size: 8.5pt; font-style: italic; color: #404040; line-height: 1.25; margin-bottom: 3pt; }
    .notes { font-size: 7.5pt; color: #737373; line-height: 1.25; }
    ${panelCss}
  </style></head><body>${body}</body></html>`
}

/**
 * Long captions end in "…" instead of being cut mid-line: each part gets a line limit that
 * fits the caption box (description gets most of it; dialogue and notes a few lines each).
 */
function clampCss(captionH: number): string {
  const line = (8.5 * 1.25) / 72 // inches per caption line
  const lines = Math.max(2, Math.floor((captionH - 0.35) / line)) // minus the label and specs
  const desc = Math.max(2, Math.round(lines * 0.6))
  const rest = Math.max(1, Math.floor((lines - desc) / 2))
  const clamp = (n: number) => `display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: ${n}; overflow: hidden;`
  return `.desc { ${clamp(desc)} } .dialogue, .notes { ${clamp(rest)} }`
}

function pageHtml(spec: BoardExportSpec, index: number, total: number, content: string): string {
  return `<section class="page"><div class="header"><span class="title">${escapeHtml(spec.title)}</span><span class="pageno">Page ${index + 1} of ${total}</span></div><div class="content">${content}</div>${
    spec.footer.trim() ? `<div class="footer">${escapeHtml(spec.footer.trim())}</div>` : ''
  }</section>`
}

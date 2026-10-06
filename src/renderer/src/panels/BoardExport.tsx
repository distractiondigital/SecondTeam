import { useState } from 'react'
import { FileDown, FolderOpen, Images, X } from 'lucide-react'
import { defaultBoardImage, LAYOUT_COUNTS, panelDescription, sceneTag, type BoardLayout, type BoardShot } from '../../../shared/board'
import { pageInches, type BoardExportSpec, type BoardSource, type PageSize } from '../../../shared/boardHtml'
import { deliveryFrame, opticsFor } from '../../../shared/camera'
import { useDocument } from '../state/documentStore'
import { useGeneration } from '../state/generation'
import { projectDisplayName } from '../state/projectIO'
import { useUi } from '../state/uiStore'
import { renderBoardClay } from '../viewport/boardClay'
import { getRenderer } from '../viewport/RendererHandle'

// Export the storyboard: a PDF (grid or rows, page size, title, footer) or a PNG sequence of the
// circle takes in board order. Both go into the project's exports folder.

interface Options {
  layout: BoardLayout
  perPage: number
  pageSize: PageSize
  footer: string
  includeMissing: boolean
}

const CLAY_EXPORT_WIDTH = 1920 // px: clay renders for the PNG sequence (the PDF downsizes them)

/** A tiny sketch of one page in the chosen layout: grey boxes for frames, bars for captions. */
function PagePreview({ layout, perPage, pageSize, ratio, footer }: Options & { ratio: number }) {
  const page = pageInches(pageSize, layout)
  const scale = 150 / Math.max(page.w, page.h) // px per inch
  const lines = (
    <div className="pp-lines">
      <i className="pp-label" />
      <i />
      <i className="pp-short" />
    </div>
  )
  // Same geometry as the PDF (boardHtml.ts), in px: header ~10, footer ~5, gaps 4.
  const pad = 0.45 * scale
  const contentW = page.w * scale - pad * 2
  const contentH = page.h * scale - pad * 2 - 10 - 5
  const gap = 4
  let frame: { width: number; height: number }
  if (layout === 'grid') {
    const cols = perPage === 2 ? 2 : 3
    const rows = Math.ceil(perPage / cols)
    const cellW = (contentW - gap * (cols - 1)) / cols
    const h = Math.min(cellW / ratio, ((contentH - gap * (rows - 1)) / rows) * 0.66)
    frame = { width: h * ratio, height: h }
  } else {
    const w = Math.min(contentW * 0.64, ((contentH - gap * (perPage - 1)) / perPage) * ratio)
    frame = { width: w, height: w / ratio }
  }
  const panels = Array.from({ length: perPage }, (_, i) => (
    <div key={i} className={layout === 'grid' ? 'pp-cell' : 'pp-row'}>
      <div className="pp-frame" style={frame} />
      {lines}
    </div>
  ))
  return (
    <div className="page-preview" style={{ width: page.w * scale, height: page.h * scale, padding: pad }} title="One page of the PDF">
      <div className="pp-header">
        <i className="pp-title" />
        <i className="pp-pageno" />
      </div>
      {layout === 'grid' ? (
        <div className="pp-grid" style={{ gridTemplateColumns: `repeat(${perPage === 2 ? 2 : 3}, 1fr)` }}>
          {panels}
        </div>
      ) : (
        <div className="pp-rows">{panels}</div>
      )}
      {footer.trim() && <i className="pp-footer" />}
    </div>
  )
}

// Remembered for this session.
let last: Options = { layout: 'grid', perPage: 3, pageSize: 'letter', footer: '', includeMissing: true }

export default function BoardExport({ shots, onClose }: { shots: BoardShot[]; onClose: () => void }) {
  const projectPath = useUi((s) => s.projectPath)
  const kit = useDocument((s) => s.project.camera)
  const takes = useGeneration((s) => s.takes)
  const [opts, setOpts] = useState<Options>(last)
  // Starts as whatever the board is showing.
  const [source, setSource] = useState<BoardSource>(() => useUi.getState().boardImage ?? defaultBoardImage(useDocument.getState().project))
  const [title, setTitle] = useState(projectDisplayName(projectPath))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ path: string; kind: 'pdf' | 'pngs' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<Options>) => {
    const next = { ...opts, ...patch }
    if (patch.layout && !LAYOUT_COUNTS[patch.layout].includes(next.perPage)) next.perPage = LAYOUT_COUNTS[patch.layout][1]
    last = next
    setOpts(next)
  }

  const ratio = deliveryFrame(opticsFor(kit, 50)).ratio
  const spec = (): BoardExportSpec => ({
    ...opts,
    source,
    title: title.trim() || 'Storyboard',
    ratio,
    panels: shots.map(({ scene, shot }) => {
      const take = shot.circleTake ? takes[shot.id]?.find((t) => t.id === shot.circleTake) : undefined
      return {
        sceneId: scene.id,
        shotId: shot.id,
        takeId: shot.circleTake,
        shotName: shot.shotNumber,
        sceneTag: sceneTag(scene),
        specs: [`${Math.round(shot.focalLength)}mm`, shot.sizeOverride ?? take?.shotSize, shot.angleOverride ?? take?.angle].filter(Boolean).join(' · '),
        description: panelDescription(shot),
        dialogue: shot.dialogue,
        notes: shot.notes
      }
    })
  })

  const run = async (kind: 'pdf' | 'pngs') => {
    if (!projectPath) return
    setBusy(true)
    setError(null)
    setResult(null)
    const s = spec()
    if (source === 'clay') {
      const gl = getRenderer()
      if (!gl) {
        setBusy(false)
        setError("The 3D view isn't ready; try again in a moment.")
        return
      }
      s.clayImages = renderBoardClay(gl, CLAY_EXPORT_WIDTH, 'image/png')
    }
    const r = kind === 'pdf' ? await window.secondTeam.exportBoardPdf(projectPath, s) : await window.secondTeam.exportBoardPngs(projectPath, s)
    setBusy(false)
    if ('error' in r) setError(r.error)
    else setResult({ path: r.path, kind })
  }

  return (
    <div className="board-export-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="board-export">
        <div className="board-export-head">
          <b>Export storyboard</b>
          <button className="pass-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="prop-title">Pictures</div>
        <div className="segmented">
          <button className={source === 'ai' ? 'active' : ''} onClick={() => setSource('ai')} title="Each shot's circle take">
            AI
          </button>
          <button className={source === 'clay' ? 'active' : ''} onClick={() => setSource('clay')} title="Each shot's clay render">
            Clay
          </button>
        </div>

        <div className="prop-title prop-title-spaced">Layout</div>
        <div className="segmented wide">
          {(['grid', 'rows'] as const).flatMap((layout) =>
            LAYOUT_COUNTS[layout].map((n) => (
              <button
                key={`${layout}${n}`}
                className={opts.layout === layout && opts.perPage === n ? 'active' : ''}
                onClick={() => set({ layout, perPage: n })}
                title={layout === 'grid' ? `Landscape pages, ${n} frames each, captions under` : `Portrait pages, ${n} rows each, captions beside`}
              >
                {layout === 'grid' ? 'Grid' : 'Rows'} {n}
              </button>
            ))
          )}
        </div>
        <div className="page-preview-slot">
          <PagePreview {...opts} ratio={ratio} />
        </div>

        <div className="prop-title prop-title-spaced">Page size</div>
        <div className="segmented">
          {(['letter', 'a4'] as const).map((p) => (
            <button key={p} className={opts.pageSize === p ? 'active' : ''} onClick={() => set({ pageSize: p })}>
              {p === 'letter' ? 'Letter' : 'A4'}
            </button>
          ))}
        </div>

        <div className="prop-title prop-title-spaced">Title</div>
        <input className="name-input plain" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="prop-title prop-title-spaced">Footer (optional)</div>
        <input
          className="name-input plain"
          value={opts.footer}
          placeholder="e.g. Distraction Digital · v1 · not for distribution"
          onChange={(e) => set({ footer: e.target.value })}
        />
        <label className="prop-check spaced">
          <input type="checkbox" checked={opts.includeMissing || source === 'clay'} disabled={source === 'clay'} onChange={(e) => set({ includeMissing: e.target.checked })} />
          Include shots without a circle take (as empty frames)
        </label>

        <div className="prop-actions">
          <button className="generate-button" disabled={busy || !projectPath} onClick={() => void run('pdf')}>
            <FileDown size={14} /> {busy ? 'Exporting…' : 'Export PDF'}
          </button>
          <button
            disabled={busy || !projectPath}
            onClick={() => void run('pngs')}
            title={source === 'clay' ? 'Clay renders of every shot, numbered in board order' : 'The full-resolution circle takes, numbered in board order'}
          >
            <Images size={14} /> Export PNGs
          </button>
        </div>
        {!projectPath && <p className="hint small">Save the project first: exports go in its folder.</p>}
        {error && <p className="hint small take-error">{error}</p>}
        {result && projectPath && (
          <div className="board-export-done">
            <span>Saved: {result.path.split(/[\\/]/).pop()}</span>
            {result.kind === 'pdf' && (
              <button onClick={() => void window.secondTeam.openExport(projectPath, result.path)}>
                <FileDown size={13} /> Open
              </button>
            )}
            <button onClick={() => void window.secondTeam.showExport(projectPath, result.path)}>
              <FolderOpen size={13} /> Show in folder
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

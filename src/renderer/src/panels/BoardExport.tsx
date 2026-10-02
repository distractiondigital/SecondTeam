import { useState } from 'react'
import { FileDown, FolderOpen, Images, X } from 'lucide-react'
import { LAYOUT_COUNTS, panelDescription, sceneTag, type BoardLayout, type BoardShot } from '../../../shared/board'
import type { BoardExportSpec, PageSize } from '../../../shared/boardHtml'
import { deliveryFrame, opticsFor } from '../../../shared/camera'
import { useDocument } from '../state/documentStore'
import { useGeneration } from '../state/generation'
import { projectDisplayName } from '../state/projectIO'
import { useUi } from '../state/uiStore'

// Export the storyboard: a PDF (grid or rows, page size, title, footer) or a PNG sequence of the
// circle takes in board order. Both go into the project's exports folder.

interface Options {
  layout: BoardLayout
  perPage: number
  pageSize: PageSize
  footer: string
  includeMissing: boolean
}

// Remembered for this session.
let last: Options = { layout: 'grid', perPage: 3, pageSize: 'letter', footer: '', includeMissing: true }

export default function BoardExport({ shots, onClose }: { shots: BoardShot[]; onClose: () => void }) {
  const projectPath = useUi((s) => s.projectPath)
  const kit = useDocument((s) => s.project.camera)
  const takes = useGeneration((s) => s.takes)
  const [opts, setOpts] = useState<Options>(last)
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

  const spec = (): BoardExportSpec => ({
    ...opts,
    title: title.trim() || 'Storyboard',
    ratio: deliveryFrame(opticsFor(kit, 50)).ratio,
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
    const r = kind === 'pdf' ? await window.secondTeam.exportBoardPdf(projectPath, spec()) : await window.secondTeam.exportBoardPngs(projectPath, spec())
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

        <div className="prop-title">Layout</div>
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
          <input type="checkbox" checked={opts.includeMissing} onChange={(e) => set({ includeMissing: e.target.checked })} />
          Include shots without a circle take (as empty frames)
        </label>

        <div className="prop-actions">
          <button className="generate-button" disabled={busy || !projectPath} onClick={() => void run('pdf')}>
            <FileDown size={14} /> {busy ? 'Exporting…' : 'Export PDF'}
          </button>
          <button disabled={busy || !projectPath} onClick={() => void run('pngs')} title="The full-resolution circle takes, numbered in board order">
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

import { useEffect } from 'react'
import { FolderOpen, RefreshCw, X } from 'lucide-react'
import { PASS_KINDS, PASS_LABELS } from '../../../shared/passes'
import { renderShotPasses, stepPass, usePasses } from '../state/passes'
import { useUi } from '../state/uiStore'

// The pass viewer: a large panel over the viewport showing a shot's five render passes.
// ← / → or 1–5 flip between them; Esc closes. While it's open, other shortcuts are paused.

const HINTS: Record<(typeof PASS_KINDS)[number], string> = {
  clay: 'The lit grey set, as the Clay view shows it.',
  depth: 'Near is white, far is black. Guides the layout and scale of the AI image.',
  normal: 'Which way each surface faces (blue/lilac = toward the lens). Guides shape and form.',
  id: 'One flat colour per object or figure. Aims prompts and reference images at each one.',
  pose: 'OpenPose skeleton of each figure. Guides how the people stand and move.'
}

export default function PassViewer() {
  const view = usePasses((s) => s.view)
  const tab = usePasses((s) => s.tab)
  const rendering = usePasses((s) => s.rendering)
  const projectPath = useUi((s) => s.projectPath)

  useEffect(() => {
    if (!view) return
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      // Captured before the app's own shortcuts, so Del, arrows etc. can't act on the set behind.
      e.stopImmediatePropagation()
      if (e.key === 'ArrowRight') stepPass(1)
      else if (e.key === 'ArrowLeft') stepPass(-1)
      else if (e.key === 'Escape') usePasses.getState().close()
      else if (/^[1-5]$/.test(e.key)) usePasses.getState().setTab(PASS_KINDS[Number(e.key) - 1])
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [view])

  if (!view) return null
  const { result } = view

  return (
    <div className="pass-viewer" onPointerDown={(e) => e.stopPropagation()}>
      <div className="pass-header">
        <span className="pass-title">
          Shot {view.shotName} <span>· render passes · {result.width} × {result.height}</span>
        </span>
        <div className="pass-tabs">
          {PASS_KINDS.map((k, i) => (
            <button
              key={k}
              className={k === tab ? 'active' : ''}
              onClick={() => usePasses.getState().setTab(k)}
              title={`${PASS_LABELS[k]} (${i + 1})`}
            >
              {PASS_LABELS[k]}
            </button>
          ))}
        </div>
        <button onClick={() => void renderShotPasses(view.shotId)} disabled={rendering} title="Render the passes again">
          <RefreshCw size={14} /> {rendering ? 'Rendering…' : 'Re-render'}
        </button>
        <button
          onClick={async () => {
            if (!projectPath) return
            const r = await window.secondTeam.showPassFolder(projectPath, view.sceneId, view.shotId)
            if ('error' in r) await window.secondTeam.showError(r.error)
          }}
          disabled={!view.savedTo}
          title={view.savedTo ?? 'Save the project to keep passes on disk'}
        >
          <FolderOpen size={14} /> Show in folder
        </button>
        <button className="pass-close" onClick={() => usePasses.getState().close()} title="Close (Esc)">
          <X size={16} />
        </button>
      </div>

      <div className="pass-image">
        <img src={result.images[tab]} alt={PASS_LABELS[tab]} draggable={false} />
      </div>

      <div className="pass-footer">
        <span>{HINTS[tab]}</span>
        {tab === 'depth' && result.depthRange.far > 0 && (
          <span className="pass-meta">
            {result.depthRange.near.toFixed(2)} m to {result.depthRange.far.toFixed(1)} m
          </span>
        )}
        {tab === 'id' && (
          <div className="pass-legend">
            {result.legend.length === 0 && <span>Nothing linked to cast or props, and no described objects</span>}
            {result.legend.map((e) => (
              <span key={e.key} title={e.pixels === 0 ? 'Not in frame' : undefined} className={e.pixels === 0 ? 'dim' : undefined}>
                <i style={{ background: e.color }} /> {e.name}
              </span>
            ))}
          </div>
        )}
        <span className="pass-save">
          {view.savedTo
            ? 'Saved in the project folder'
            : view.saveError
              ? `Not saved: ${view.saveError}`
              : 'Save the project to keep passes on disk'}
        </span>
        <span className="pass-keys">← → or 1–5 to flip · Esc to close</span>
      </div>
    </div>
  )
}

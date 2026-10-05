import { useEffect } from 'react'
import { ChevronDown, ChevronRight, Sparkles, Star, Trash2, X } from 'lucide-react'
import { activeScene, useDocument } from '../state/documentStore'
import {
  cancelGeneration,
  deleteTake,
  generateBlocker,
  generateShot,
  loadTakes,
  openCompare,
  openTake,
  toggleCircleTake,
  useGeneration
} from '../state/generation'
import { useUi } from '../state/uiStore'
import BackendStatus from './BackendStatus'
import { addKey } from '../platform'

// The take strip under the viewport: the takes of the selected (or active) shot, newest first,
// with the running Generate (live preview, progress, Cancel) at the front.

/** The shot the strip shows: a selected shot camera, else the shot being edited. */
function useDocumentShot(): { id: string; name: string } | null {
  const selection = useUi((s) => s.selection)
  const activeShotId = useDocument((s) => s.activeShotId)
  const id = useDocument((s) => {
    const nodes = activeScene(s).nodes
    return selection.length === 1 && nodes[selection[0]]?.type === 'camera' ? selection[0] : activeShotId
  })
  const name = useDocument((s) => {
    const n = id ? activeScene(s).nodes[id] : undefined
    return n?.type === 'camera' ? n.shotNumber : null
  })
  return id && name ? { id, name } : null
}

export default function TakeStrip() {
  const shot = useDocumentShot()
  const projectPath = useUi((s) => s.projectPath)
  const sceneId = useDocument((s) => s.sceneId)
  const takes = useGeneration((s) => (shot ? s.takes[shot.id] : undefined))
  const job = useGeneration((s) => s.job)
  const error = useGeneration((s) => s.error)
  const notice = useGeneration((s) => s.notice)
  // Re-render when anything that feeds the Generate blocker changes (the model list arrives after the engine is ready).
  useGeneration((s) => s.status)
  useGeneration((s) => s.models)
  useUi((s) => s.projectPath)
  useDocument((s) => s.project.generation)

  const shotId = shot?.id ?? null
  const loaded = takes !== undefined
  useEffect(() => {
    if (shotId && !loaded) void loadTakes(shotId)
  }, [shotId, loaded, projectPath])
  // A different project or scene: forget what was loaded.
  useEffect(() => {
    useGeneration.setState({ takes: {} })
  }, [projectPath, sceneId])

  const jobHere = job && shot && job.shotId === shot.id
  const circle = useDocument((s) => {
    const n = shot ? activeScene(s).nodes[shot.id] : undefined
    return n?.type === 'camera' ? n.circleTake : null
  })
  // Always newest on the left, oldest on the right (the circle take keeps its place and its star).
  const blocker = generateBlocker()
  // Folded down to its header bar when you're not using the AI; it opens while a take is being made.
  const open = useUi((s) => s.aiFolds.strip)
  const generating = Boolean(job)
  useEffect(() => {
    if (generating && !useUi.getState().aiFolds.strip) useUi.getState().setAiFold('strip', true)
  }, [generating])

  return (
    <div className={`take-strip${open ? '' : ' folded'}`}>
      <div className="take-strip-head">
        <button
          className="icon-button take-strip-fold"
          onClick={() => useUi.getState().setAiFold('strip', !open)}
          title={open ? 'Fold the takes away' : 'Show the takes'}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="take-strip-title">
          {shot ? `Shot ${shot.name} · takes` : 'Takes'}
          {!open && takes && takes.length > 0 && <span className="dim"> ({takes.length})</span>}
        </span>
        {shot && (
          <button
            className="generate-button small"
            disabled={Boolean(blocker)}
            title={blocker ?? `Generate takes for shot ${shot.name}`}
            onClick={() => void generateShot(shot.id)}
          >
            <Sparkles size={13} /> Generate
          </button>
        )}
        {error && <span className="take-error" title={error}>{error}</span>}
        {!error && notice && <span className="take-notice" title={notice}>{notice}</span>}
        <BackendStatus />
      </div>
      {open && (
        <div className="take-list">
          {!shot && <p className="hint">Select a shot to see its takes.</p>}
          {job && (
            <div className="take-card running" title={`Shot ${job.shotName}, seed ${job.seed}`}>
              {job.preview ? <img src={job.preview} alt="" /> : <div className="take-placeholder">Preparing…</div>}
              <div className="take-progress">
                <div style={{ width: `${Math.round((job.step / Math.max(1, job.steps)) * 100)}%` }} />
              </div>
              <div className="take-caption">
                {!jobHere && `${job.shotName} · `}Take {job.index + 1} of {job.total}
                <button onClick={() => void cancelGeneration()} disabled={job.cancelling} title="Stop generating">
                  <X size={12} /> {job.cancelling ? 'Stopping…' : 'Cancel'}
                </button>
              </div>
            </div>
          )}
          {shot &&
            takes?.map((t) => (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                className={`take-card${t.id === circle ? ' circled' : ''}`}
                // Ctrl+click: compare with the take already open.
                onClick={(e) => void (addKey(e) ? openCompare(shot.id, t.id) : openTake(shot.id, t.id))}
                onKeyDown={(e) => e.key === 'Enter' && void openTake(shot.id, t.id)}
                title={`Seed ${t.seed} · ${t.checkpoint} · ${new Date(t.createdAt).toLocaleString()} · Ctrl+click to compare with the open take`}
              >
                <img src={t.thumbnail} alt="" />
                <div className="take-caption">Seed {t.seed}</div>
                <button
                  className="circle-star"
                  title={t.id === circle ? 'Circle take (click to un-circle)' : 'Make this the circle take (used on the storyboard)'}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleCircleTake(shot.id, t.id)
                  }}
                >
                  <Star size={14} fill={t.id === circle ? 'currentColor' : 'none'} />
                </button>
                <button
                  className="delete-take"
                  title="Delete this take (moves it to the Recycle Bin)"
                  onClick={(e) => {
                    e.stopPropagation()
                    void deleteTake(shot.id, t.id)
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          {shot && takes?.length === 0 && !jobHere && (
            <p className="hint">{projectPath ? 'No takes yet. Press Generate.' : 'Save the project to generate takes.'}</p>
          )}
        </div>
      )}
    </div>
  )
}

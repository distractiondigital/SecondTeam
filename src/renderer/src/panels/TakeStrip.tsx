import { useEffect } from 'react'
import { Sparkles, Star, Trash2, X } from 'lucide-react'
import { activeScene, useDocument } from '../state/documentStore'
import {
  cancelGeneration,
  deleteTake,
  generateBlocker,
  generateShot,
  loadTakes,
  openTake,
  toggleCircleTake,
  useGeneration
} from '../state/generation'
import { useUi } from '../state/uiStore'
import BackendStatus from './BackendStatus'

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
  useGeneration((s) => s.status)

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

  return (
    <div className="take-strip">
      <div className="take-strip-head">
        <span className="take-strip-title">{shot ? `Shot ${shot.name} · takes` : 'Takes'}</span>
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
              onClick={() => void openTake(shot.id, t.id)}
              onKeyDown={(e) => e.key === 'Enter' && void openTake(shot.id, t.id)}
              title={`Seed ${t.seed} · ${t.checkpoint} · ${new Date(t.createdAt).toLocaleString()}`}
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
    </div>
  )
}

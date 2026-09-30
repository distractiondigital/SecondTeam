import { useEffect } from 'react'
import { Lock, Star, X } from 'lucide-react'
import type { TakeMeta } from '../../../shared/takes'
import { activeScene, useDocument } from '../state/documentStore'
import { closeTake, stepTake, toggleCircleTake, useGeneration } from '../state/generation'

// A take, large, over the viewport: with its seed, model and prompt. ← / → flip through the
// shot's takes (newer / older); Esc closes. Other shortcuts pause while it's open.

/** The guides a take used, in words. (Takes from before the pose guide stored depth only.) */
function guides(meta: TakeMeta): string {
  const c = meta.controlnet as TakeMeta['controlnet'] & { strength?: number; end?: number }
  const depth = c.depth ?? { strength: c.strength ?? 0, end: c.end ?? 0 }
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const parts = [`Depth ${depth.strength} for ${pct(depth.end)} of steps`]
  if (c.pose) parts.push(`pose ${c.pose.strength} for ${pct(c.pose.end)}`)
  return parts.join(' · ')
}

export default function TakeViewer() {
  const viewer = useGeneration((s) => s.viewer)
  const list = useGeneration((s) => (viewer ? s.takes[viewer.shotId] : undefined))
  const circled = useDocument((s) => {
    const n = viewer ? activeScene(s).nodes[viewer.shotId] : undefined
    return n?.type === 'camera' && viewer ? n.circleTake === viewer.takeId : false
  })

  useEffect(() => {
    if (!viewer) return
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      e.stopImmediatePropagation()
      if (e.key === 'ArrowRight') stepTake(1)
      else if (e.key === 'ArrowLeft') stepTake(-1)
      else if (e.key === 'Escape') closeTake()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [viewer])

  if (!viewer) return null
  const { meta } = viewer
  const index = list?.findIndex((t) => t.id === viewer.takeId) ?? -1

  return (
    <div className="pass-viewer take-viewer" onPointerDown={(e) => e.stopPropagation()}>
      <div className="pass-header">
        <span className="pass-title">
          Shot {meta?.shot.name ?? ''}{' '}
          <span>
            · take {list && index >= 0 ? list.length - index : ''} of {list?.length ?? ''}
            {meta && ` · ${meta.width} × ${meta.height}`}
          </span>
        </span>
        <span className="pass-tabs" />
        <button
          className={circled ? 'active circle-button' : 'circle-button'}
          onClick={() => viewer && toggleCircleTake(viewer.shotId, viewer.takeId)}
          title="The circle take is the one the storyboard uses (one per shot)"
        >
          <Star size={14} fill={circled ? 'currentColor' : 'none'} /> {circled ? 'Circle take' : 'Circle this take'}
        </button>
        {meta && (
          <button
            onClick={() => useDocument.getState().updateGeneration({ seed: meta.seed, seedLocked: true })}
            title="Lock this seed, so the next Generate starts from it (change strictness or the prompt and compare)"
          >
            <Lock size={14} /> Use this seed
          </button>
        )}
        <button className="pass-close" onClick={closeTake} title="Close (Esc)">
          <X size={16} />
        </button>
      </div>
      <div className="pass-image">
        {viewer.image ? <img src={viewer.image} alt="Take" draggable={false} /> : <p className="hint">Loading…</p>}
      </div>
      {meta && (
        <div className="pass-footer take-meta">
          <span>
            Seed <b>{meta.seed}</b>
          </span>
          <span>
            {meta.model.name} <span className="dim">({meta.model.license})</span>
          </span>
          <span>{guides(meta)}</span>
          <span>
            {meta.sampler.steps} steps · CFG {meta.sampler.cfg}
          </span>
          <span className="take-prompt" title={meta.positive}>
            {meta.positive}
          </span>
          <span className="pass-keys">← → newer / older · Esc to close</span>
        </div>
      )}
    </div>
  )
}

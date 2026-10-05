import { useEffect, useState } from 'react'
import { Columns2, Lock, SplitSquareHorizontal, Star, Trash2, X } from 'lucide-react'
import type { TakeMeta } from '../../../shared/takes'
import { activeScene, useDocument } from '../state/documentStore'
import { closeCompare, closeTake, deleteTake, openCompare, stepTake, toggleCircleTake, useGeneration, type CompareTake } from '../state/generation'

// A take, large, over the viewport: with its seed, model and prompt. ← / → flip through the
// shot's takes (newer / older); Esc closes. Other shortcuts pause while it's open.
// Compare (or Ctrl+click a second take in the strip): two takes side by side, or one frame with a
// wipe divider that follows the mouse. ← / → flip the second, Shift+← / → the first; Esc goes back
// to one take.

/** The guides a take used, in words. (Takes from before the pose guide stored depth only.) */
function guides(meta: TakeMeta): string {
  const c = meta.controlnet as TakeMeta['controlnet'] & { strength?: number; end?: number }
  const depth = c.depth ?? { strength: c.strength ?? 0, end: c.end ?? 0 }
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const parts = [`Depth ${depth.strength} for ${pct(depth.end)} of steps`]
  if (c.pose) parts.push(`pose ${c.pose.strength} for ${pct(c.pose.end)}`)
  return parts.join(' · ')
}

/** A take's number in the shot (1 = oldest), as the strip shows it. */
function takeNumber(list: { id: string }[] | undefined, takeId: string): string {
  const i = list?.findIndex((t) => t.id === takeId) ?? -1
  return list && i >= 0 ? String(list.length - i) : ''
}

function CircleButton({ shotId, takeId, circled, label = true }: { shotId: string; takeId: string; circled: boolean; label?: boolean }) {
  return (
    <button
      className={circled ? 'active circle-button' : 'circle-button'}
      onClick={() => toggleCircleTake(shotId, takeId)}
      title="The circle take is the one the storyboard uses (one per shot)"
    >
      <Star size={14} fill={circled ? 'currentColor' : 'none'} /> {label && (circled ? 'Circle take' : 'Circle this take')}
    </button>
  )
}

/** Two takes: side by side, or one frame with a wipe divider. */
function Compare({ shotId, a, b, mode, list, circle }: { shotId: string; a: CompareTake; b: CompareTake; mode: 'side' | 'wipe'; list: { id: string }[] | undefined; circle: string | null }) {
  const [wipe, setWipe] = useState(50)
  const [area, setArea] = useState<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!area) return
    const observer = new ResizeObserver(() => setSize({ width: area.clientWidth, height: area.clientHeight }))
    observer.observe(area)
    return () => observer.disconnect()
  }, [area])
  // The biggest frame of the takes' shape that fits.
  const aspect = a.meta ? a.meta.width / a.meta.height : 16 / 9
  const fitW = Math.min(size.width, size.height * aspect)
  const frame = { width: fitW, height: fitW / aspect }
  const half = (t: CompareTake, label: string) => (
    <div className="compare-half">
      <div className="compare-caption">
        <span>
          {label}: take {takeNumber(list, t.takeId)}
          {t.meta && <span className="dim"> · seed {t.meta.seed}</span>}
        </span>
        <CircleButton shotId={shotId} takeId={t.takeId} circled={circle === t.takeId} label={false} />
      </div>
      <div className="compare-image">{t.image ? <img src={t.image} alt={`Take ${label}`} draggable={false} /> : <p className="hint">Loading…</p>}</div>
    </div>
  )
  if (mode === 'side') {
    return (
      <div className="pass-image compare-side">
        {half(a, 'A')}
        {half(b, 'B')}
      </div>
    )
  }
  return (
    <div className="pass-image compare-wipe-wrap">
      <div className="compare-caption wipe-captions">
        <span>
          A: take {takeNumber(list, a.takeId)} <CircleButton shotId={shotId} takeId={a.takeId} circled={circle === a.takeId} label={false} />
        </span>
        <span>
          B: take {takeNumber(list, b.takeId)} <CircleButton shotId={shotId} takeId={b.takeId} circled={circle === b.takeId} label={false} />
        </span>
      </div>
      <div className="compare-wipe" ref={setArea}>
        {/* One frame the size of the picture, so the divider lines up with both takes. */}
        <div
          className="wipe-frame"
          style={frame}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            setWipe(Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100)))
          }}
        >
          {a.image && <img src={a.image} alt="Take A" draggable={false} />}
          {b.image && <img src={b.image} alt="Take B" draggable={false} style={{ clipPath: `inset(0 0 0 ${wipe}%)` }} />}
          <i className="wipe-line" style={{ left: `${wipe}%` }} />
        </div>
      </div>
    </div>
  )
}

export default function TakeViewer() {
  const viewer = useGeneration((s) => s.viewer)
  const mode = useGeneration((s) => s.compareMode)
  const list = useGeneration((s) => (viewer ? s.takes[viewer.shotId] : undefined))
  const circle = useDocument((s) => {
    const n = viewer ? activeScene(s).nodes[viewer.shotId] : undefined
    return n?.type === 'camera' ? n.circleTake : null
  })
  const circled = viewer ? circle === viewer.takeId : false
  const comparing = Boolean(viewer?.compare)

  useEffect(() => {
    if (!viewer) return
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      e.stopImmediatePropagation()
      const side = viewer.compare && !e.shiftKey ? 'b' : 'a'
      if (e.key === 'ArrowRight') stepTake(1, side)
      else if (e.key === 'ArrowLeft') stepTake(-1, side)
      else if (e.key === 'Escape') (viewer.compare ? closeCompare : closeTake)()
      else if (e.key === 'Delete' && !viewer.compare) void deleteTake(viewer.shotId, viewer.takeId)
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
            {viewer.compare
              ? ` · comparing take ${takeNumber(list, viewer.takeId)} and ${takeNumber(list, viewer.compare.takeId)} of ${list?.length ?? ''}`
              : ` · take ${list && index >= 0 ? list.length - index : ''} of ${list?.length ?? ''}`}
            {meta && ` · ${meta.width} × ${meta.height}`}
          </span>
        </span>
        <span className="pass-tabs" />
        {viewer.compare ? (
          <>
            <div className="segmented">
              <button className={mode === 'side' ? 'active' : ''} onClick={() => useGeneration.setState({ compareMode: 'side' })} title="Side by side">
                <Columns2 size={14} /> Side by side
              </button>
              <button className={mode === 'wipe' ? 'active' : ''} onClick={() => useGeneration.setState({ compareMode: 'wipe' })} title="One frame: move the mouse across it to wipe between the two">
                <SplitSquareHorizontal size={14} /> Wipe
              </button>
            </div>
            <button onClick={closeCompare} title="Back to one take (Esc)">
              One take
            </button>
          </>
        ) : (
          <>
            <CircleButton shotId={viewer.shotId} takeId={viewer.takeId} circled={circled} />
            {(list?.length ?? 0) > 1 && (
              <button
                onClick={() => {
                  // The next older take (or the newer one, from the oldest).
                  const other = list![index + 1] ?? list![index - 1]
                  if (other) void openCompare(viewer.shotId, other.id)
                }}
                title="Compare with another take (or Ctrl+click one in the strip)"
              >
                <Columns2 size={14} /> Compare
              </button>
            )}
          </>
        )}
        {meta && !comparing && (
          <button
            onClick={() => useDocument.getState().updateGeneration({ seed: meta.seed, seedLocked: true })}
            title="Lock this seed, so the next Generate starts from it (change strictness or the prompt and compare)"
          >
            <Lock size={14} /> Use this seed
          </button>
        )}
        {!comparing && (
          <button onClick={() => void deleteTake(viewer.shotId, viewer.takeId)} title="Delete this take (Del); it goes to the Recycle Bin">
            <Trash2 size={14} /> Delete
          </button>
        )}
        <button className="pass-close" onClick={closeTake} title="Close (Esc)">
          <X size={16} />
        </button>
      </div>
      {viewer.compare ? (
        <Compare
          shotId={viewer.shotId}
          a={{ takeId: viewer.takeId, image: viewer.image, meta: viewer.meta }}
          b={viewer.compare}
          mode={mode}
          list={list}
          circle={circle}
        />
      ) : (
        <div className="pass-image">
          {viewer.image ? <img src={viewer.image} alt="Take" draggable={false} /> : <p className="hint">Loading…</p>}
        </div>
      )}
      {viewer.compare && (
        <div className="pass-footer take-meta">
          <span className="pass-keys">← → flip B · Shift+← → flip A · ☆ circles a take · Esc: back to one take</span>
        </div>
      )}
      {meta && !comparing && (
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
          <span className="pass-keys">← → newer / older · Del to delete · Esc to close</span>
        </div>
      )}
    </div>
  )
}

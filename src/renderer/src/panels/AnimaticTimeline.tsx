import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronDown, ChevronUp, Film, Play, X } from 'lucide-react'
import {
  clipTimes,
  dropIndex,
  FPS_OPTIONS,
  framesFor,
  lengthLabel,
  missingShots,
  realFps,
  secondsFor,
  timecode,
  totalFrames,
  type AnimaticClip
} from '../../../shared/animatic'
import type { BoardShot } from '../../../shared/board'
import { useAnimatic } from '../state/animaticUi'
import { useDocument } from '../state/documentStore'
import { useBoardPicture } from './boardPictures'

// The animatic's timeline (Milestone 18), along the bottom of the board: the shots cut together,
// each held for its own length. Its own edit, apart from the board's order. Drag clips to reorder,
// drag a clip's right edge to change its length (whole frames), drag a board panel's grip onto it
// to add that shot, click or drag on the ruler to move the playhead. Play opens the player.

/** The drag type a board panel's grip carries (its shot id). */
export const SHOT_DRAG_TYPE = 'application/x-secondteam-shot'

/** Zoom: the timeline fits the strip, within these (pixels per second). */
const MIN_PX_PER_SECOND = 24
const MAX_PX_PER_SECOND = 160
/** A drag starts after the pointer moves this far (px); less is a click. */
const DRAG_THRESHOLD = 4

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

/** Ruler ticks: a step (in seconds) that leaves room for the labels. */
function tickStep(pxPerSecond: number): number {
  return [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s * pxPerSecond >= 70) ?? 600
}

function ClipView({ b, clip, fps, width, selected, dragging, onPointerDown, onTrim, onRemove }: { b: BoardShot | undefined; clip: AnimaticClip; fps: number; width: number; selected: boolean; dragging: boolean; onPointerDown: (e: ReactPointerEvent) => void; onTrim: (e: ReactPointerEvent) => void; onRemove: () => void }) {
  return (
    <div
      className={`animatic-clip${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}`}
      style={{ width }}
      onPointerDown={onPointerDown}
      title={b ? `${b.shot.shotNumber}: ${lengthLabel(clip.frames, fps)} (${clip.frames} frames). Drag to move, drag the right edge to change its length.` : undefined}
    >
      {b && <ClipPicture b={b} />}
      <div className="animatic-clip-label">
        <b>{b?.shot.shotNumber ?? '?'}</b>
        {width > 70 && <span>{lengthLabel(clip.frames, fps)}</span>}
      </div>
      {selected && width > 40 && (
        <button className="animatic-clip-remove" title="Take out of the animatic (Delete)" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove}>
          <X size={11} />
        </button>
      )}
      <div className="animatic-trim" onPointerDown={onTrim} title="Drag to change the length" />
    </div>
  )
}

function ClipPicture({ b }: { b: BoardShot }) {
  const pic = useBoardPicture(b)
  return pic.src ? <img src={pic.src} alt="" draggable={false} /> : null
}

type Drag =
  | { kind: 'move'; id: string; x0: number; started: boolean; target: number }
  | { kind: 'trim'; id: string; x0: number; frames0: number }
  | { kind: 'scrub' }

export default function AnimaticTimeline({ shots }: { shots: BoardShot[] }) {
  const animatic = useDocument((s) => s.project.animatic)
  const { fps, clips } = animatic
  const open = useAnimatic((s) => s.timelineOpen)
  const playhead = useAnimatic((s) => s.playhead)
  const selected = useAnimatic((s) => s.selectedClip)
  const byShot = useMemo(() => new Map(shots.map((b) => [b.shot.id, b])), [shots])
  const total = totalFrames(clips)
  const times = clipTimes(clips)
  const missing = missingShots(
    clips,
    shots.map((b) => b.shot.id)
  )

  // Zoom: fit the whole edit in the strip (kept while dragging, so the clips don't jump).
  const scrollRef = useRef<HTMLDivElement>(null)
  const [stripWidth, setStripWidth] = useState(800)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setStripWidth(el.clientWidth))
    observer.observe(el)
    setStripWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [open])
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const fitted = Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, (stripWidth - 60) / Math.max(1, secondsFor(total, fps))))
  const frozen = useRef(fitted)
  if (!drag) frozen.current = fitted
  const pxPerSecond = frozen.current
  const pxPerFrame = pxPerSecond / realFps(fps)
  const frameAt = (clientX: number) => {
    const el = scrollRef.current
    if (!el) return 0
    return Math.max(0, (clientX - el.getBoundingClientRect().left + el.scrollLeft - 8) / pxPerFrame)
  }

  // Board panels dropped on the timeline.
  const [boardDrop, setBoardDrop] = useState<number | null>(null)

  const doc = useDocument.getState
  const ui = useAnimatic.getState

  const onClipDown = (e: ReactPointerEvent, clip: AnimaticClip) => {
    if (e.button !== 0) return
    e.preventDefault()
    ui().selectClip(clip.id)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ kind: 'move', id: clip.id, x0: e.clientX, started: false, target: -1 })
  }
  const onTrimDown = (e: ReactPointerEvent, clip: AnimaticClip) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    ui().selectClip(clip.id)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    doc().beginGesture('animatic')
    setDrag({ kind: 'trim', id: clip.id, x0: e.clientX, frames0: clip.frames })
  }
  const onRulerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    ui().setPlayhead(Math.min(total, Math.floor(frameAt(e.clientX))))
    setDrag({ kind: 'scrub' })
  }
  const onMove = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'scrub') ui().setPlayhead(Math.min(total, Math.floor(frameAt(e.clientX))))
    else if (d.kind === 'trim') doc().setClipFrames(d.id, d.frames0 + Math.round((e.clientX - d.x0) / pxPerFrame))
    else {
      const started = d.started || Math.abs(e.clientX - d.x0) > DRAG_THRESHOLD
      if (started) setDrag({ ...d, started, target: dropIndex(clips, frameAt(e.clientX)) })
    }
  }
  const onUp = () => {
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'trim') doc().endGesture('animatic')
    else if (d.kind === 'move') {
      if (d.started && d.target >= 0) doc().moveAnimaticClip(d.id, clips[d.target]?.id ?? null)
      else {
        // A click: the playhead goes to the clip's start.
        const t = times.find((x) => x.clip.id === d.id)
        if (t) ui().setPlayhead(t.start)
      }
    }
    setDrag(null)
  }

  // Keys while the board shows (not while typing a caption): Space plays, Delete takes the
  // selected clip out, ← / → go to the previous / next cut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || useAnimatic.getState().playerOpen) return
      const a = useAnimatic.getState()
      const list = useDocument.getState().project.animatic.clips
      if (!list.length) return
      if (e.key === ' ') {
        e.preventDefault()
        a.openPlayer(true)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && a.selectedClip) {
        e.preventDefault()
        useDocument.getState().removeAnimaticClip(a.selectedClip)
        a.selectClip(null)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const cuts = clipTimes(list).map((t) => t.start)
        cuts.push(totalFrames(list))
        const next = e.key === 'ArrowRight' ? cuts.find((c) => c > a.playhead) : [...cuts].reverse().find((c) => c < a.playhead)
        if (next !== undefined) a.setPlayhead(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selectedClip = clips.find((c) => c.id === selected)
  const step = tickStep(pxPerSecond)
  const contentWidth = Math.max(stripWidth, total * pxPerFrame + 40)
  const ticks: number[] = []
  for (let s = 0; s * pxPerSecond <= contentWidth; s += step) ticks.push(s)
  const markerAt = (index: number) => (index >= clips.length ? total : times[index].start) * pxPerFrame
  const moveMarker = drag?.kind === 'move' && drag.started && drag.target >= 0 ? drag.target : null

  return (
    <div className={`animatic${open ? '' : ' closed'}`}>
      <div className="animatic-bar">
        <button className="animatic-toggle" onClick={() => ui().setTimelineOpen(!open)} title={open ? 'Tuck the timeline away' : 'Show the timeline'}>
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          <Film size={14} /> <b>Animatic</b>
        </button>
        <span className="animatic-tc" title="Playhead / total length (hours:minutes:seconds:frames)">
          {timecode(Math.min(playhead, total), fps)} <span className="dim">/ {timecode(total, fps)}</span>
        </span>
        <span className="dim">
          {clips.length} clip{clips.length === 1 ? '' : 's'}
        </span>
        <label className="animatic-fps" title="Frames per second (lengths keep their seconds when you change it)">
          <select value={fps} onChange={(e) => doc().setAnimaticFps(Number(e.target.value))}>
            {FPS_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </label>
        {selectedClip && <ClipLength clip={selectedClip} fps={fps} />}
        {missing.length > 0 && clips.length > 0 && (
          <span className="animatic-missing">
            {missing.length} shot{missing.length === 1 ? '' : 's'} not in the animatic ·{' '}
            <button className="link-button" onClick={() => doc().addAnimaticClips(missing)} title="Add them at the end">
              Add
            </button>
          </span>
        )}
        <span className="animatic-spacer" />
        {clips.length === 0 && shots.length > 0 && (
          <button className="generate-button small" onClick={() => doc().addAnimaticClips(shots.map((b) => b.shot.id))} title="Every shot, in board order, 3 seconds each">
            Fill from Board
          </button>
        )}
        <button className="generate-button small" disabled={!clips.length} onClick={() => ui().openPlayer(true)} title="Play the animatic (Space)">
          <Play size={13} /> Play
        </button>
      </div>
      {open && (
        <div
          ref={scrollRef}
          className={`animatic-strip${boardDrop !== null ? ' dropping' : ''}`}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(SHOT_DRAG_TYPE)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
            setBoardDrop(dropIndex(clips, frameAt(e.clientX)))
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setBoardDrop(null)
          }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(SHOT_DRAG_TYPE)
            setBoardDrop(null)
            if (!id) return
            e.preventDefault()
            const [added] = doc().addAnimaticClips([id], dropIndex(clips, frameAt(e.clientX)))
            if (added) ui().selectClip(added)
          }}
        >
          <div className="animatic-content" style={{ width: contentWidth }}>
            <div className="animatic-ruler" onPointerDown={onRulerDown} title="Click or drag to move the playhead">
              {ticks.map((s) => (
                <span key={s} className="animatic-tick" style={{ left: s * pxPerSecond }}>
                  {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
                </span>
              ))}
            </div>
            <div
              className="animatic-track"
              onPointerDown={(e) => {
                if (e.target !== e.currentTarget || e.button !== 0) return
                ui().selectClip(null)
                ui().setPlayhead(Math.min(total, Math.floor(frameAt(e.clientX))))
              }}
            >
              {clips.length === 0 ? (
                <div className="animatic-empty">
                  {shots.length ? 'Drag shots here by their grip (⋮⋮), or click Fill from Board.' : 'No shots yet. Add shots in the Set view.'}
                </div>
              ) : (
                clips.map((clip) => (
                  <ClipView
                    key={clip.id}
                    b={byShot.get(clip.shotId)}
                    clip={clip}
                    fps={fps}
                    width={clip.frames * pxPerFrame}
                    selected={clip.id === selected}
                    dragging={drag?.kind === 'move' && drag.started && drag.id === clip.id}
                    onPointerDown={(e) => onClipDown(e, clip)}
                    onTrim={(e) => onTrimDown(e, clip)}
                    onRemove={() => {
                      doc().removeAnimaticClip(clip.id)
                      ui().selectClip(null)
                    }}
                  />
                ))
              )}
            </div>
            {(moveMarker ?? boardDrop) !== null && <div className="animatic-insert" style={{ left: markerAt((moveMarker ?? boardDrop)!) }} />}
            {clips.length > 0 && (
              <div className="animatic-playhead" style={{ left: Math.min(playhead, total) * pxPerFrame }} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** The selected clip's length in seconds, typed (snaps to whole frames). */
function ClipLength({ clip, fps }: { clip: AnimaticClip; fps: number }) {
  const seconds = secondsFor(clip.frames, fps)
  const [text, setText] = useState(seconds.toFixed(2))
  useEffect(() => setText(seconds.toFixed(2)), [seconds])
  const cancelled = useRef(false)
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      setText(seconds.toFixed(2))
      return
    }
    const v = Number(text)
    if (Number.isFinite(v) && v > 0) useDocument.getState().setClipFrames(clip.id, framesFor(v, fps))
    else setText(seconds.toFixed(2))
  }
  return (
    <label className="animatic-length" title="The selected clip's length (snaps to whole frames)">
      Length
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            cancelled.current = true
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      s <span className="dim">· {clip.frames} fr</span>
    </label>
  )
}

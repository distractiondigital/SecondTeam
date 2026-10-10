import { useEffect, useMemo, useRef, useState } from 'react'
import { Captions, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
import { clipAt, clipTimes, realFps, timecode, totalFrames } from '../../../shared/animatic'
import { sceneTag, type BoardShot } from '../../../shared/board'
import { useAnimatic } from '../state/animaticUi'
import { useDocument } from '../state/documentStore'
import { boardPictureNow, loadSharpPicture, useBoardImage } from './boardPictures'

// The animatic player (Milestone 18): over the board, the shots in the animatic's order, each held
// for its length, in real time from the playhead. The sharp pictures (as the board shows them: AI,
// Clay or Render) are made first, so cuts land on time. Space plays / pauses, ← / → jump a shot,
// Esc closes.

export default function AnimaticPlayer({ shots }: { shots: BoardShot[] }) {
  const { fps, clips } = useDocument((s) => s.project.animatic)
  const playhead = useAnimatic((s) => s.playhead)
  const playing = useAnimatic((s) => s.playing)
  const captions = useAnimatic((s) => s.captions)
  const mode = useBoardImage()
  const byShot = useMemo(() => new Map(shots.map((b) => [b.shot.id, b])), [shots])
  const total = totalFrames(clips)
  const times = clipTimes(clips)
  const current = clipAt(clips, playhead)
  const b = current ? byShot.get(current.clip.shotId) : undefined

  // The sharp pictures of every shot in the animatic, made one at a time before playing.
  const shotIds = useMemo(() => [...new Set(clips.map((c) => c.shotId))].filter((id) => byShot.has(id)), [clips, byShot])
  const [pictures, setPictures] = useState<Record<string, string | null>>({})
  const [prepared, setPrepared] = useState(0)
  const ready = prepared >= shotIds.length
  useEffect(() => {
    let live = true
    setPrepared(0)
    void (async () => {
      const made: Record<string, string | null> = {}
      for (const [i, id] of shotIds.entries()) {
        const shot = byShot.get(id)!
        const pic = boardPictureNow(shot)
        made[id] = (await loadSharpPicture(shot, pic)) ?? pic.src
        if (!live) return
        setPictures({ ...made })
        setPrepared(i + 1)
        // Let the page draw between pictures (a Clay picture takes a moment).
        await new Promise((r) => setTimeout(r, 0))
      }
    })()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotIds.join(','), mode])

  // Playing: frame-accurate against the clock (never counts screen refreshes).
  const startRef = useRef<{ time: number; frame: number } | null>(null)
  useEffect(() => {
    if (!playing || !ready) {
      startRef.current = null
      return
    }
    const a = useAnimatic.getState()
    // At the end, Play starts again from the top.
    if (a.playhead >= total) a.setPlayhead(0)
    startRef.current = { time: performance.now(), frame: useAnimatic.getState().playhead }
    let raf = 0
    const tick = (now: number) => {
      const start = startRef.current
      if (!start) return
      const frame = start.frame + Math.floor(((now - start.time) / 1000) * realFps(fps))
      if (frame >= total) {
        useAnimatic.getState().setPlayhead(total)
        useAnimatic.getState().setPlaying(false)
        return
      }
      if (frame !== useAnimatic.getState().playhead) useAnimatic.getState().setPlayhead(frame)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, ready, fps, total])

  const close = () => useAnimatic.getState().closePlayer()
  const togglePlay = () => useAnimatic.getState().setPlaying(!useAnimatic.getState().playing)
  /** Jump to the previous / next cut (back from inside a shot goes to its start first). */
  const stepShot = (dir: -1 | 1) => {
    const a = useAnimatic.getState()
    const at = Math.min(a.playhead, total)
    const cuts = times.map((t) => t.start)
    const next = dir > 0 ? cuts.find((c) => c > at) : [...cuts].reverse().find((c) => c < at)
    if (next === undefined && dir > 0) return
    jump(next ?? 0)
  }
  /** Move the playhead (playing carries on from there). */
  const jump = (frame: number) => {
    useAnimatic.getState().setPlayhead(frame)
    if (startRef.current) startRef.current = { time: performance.now(), frame: useAnimatic.getState().playhead }
  }

  // Keys (before the board's own).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') close()
      else if (e.key === ' ') togglePlay()
      else if (e.key === 'ArrowLeft') stepShot(-1)
      else if (e.key === 'ArrowRight') stepShot(1)
      else if (e.key === 'Home') jump(0)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const shownIds = shotIds.filter((id) => pictures[id])

  return (
    <div className="animatic-player" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <button className="pass-close board-lightbox-close" onClick={close} title="Close (Esc)">
        <X size={18} />
      </button>
      <div className="animatic-screen">
        {/* Every picture stays loaded (only the current one shows), so cuts never wait to decode. */}
        {shownIds.map((id) => (
          <img key={id} src={pictures[id]!} alt="" draggable={false} style={{ visibility: ready && b?.shot.id === id ? 'visible' : 'hidden' }} />
        ))}
        {!ready && (
          <div className="animatic-preparing">
            Preparing pictures {Math.min(prepared + 1, shotIds.length)} of {shotIds.length}…
          </div>
        )}
        {ready && b && !pictures[b.shot.id] && <div className="animatic-preparing">No picture yet for {b.shot.shotNumber}</div>}
        {ready && captions && b?.shot.dialogue && <div className="animatic-subtitle">{b.shot.dialogue}</div>}
      </div>
      <div className="animatic-controls">
        <button onClick={() => stepShot(-1)} title="Previous shot (←)">
          <SkipBack size={16} />
        </button>
        <button className="animatic-play" onClick={togglePlay} disabled={!ready} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button onClick={() => stepShot(1)} title="Next shot (→)">
          <SkipForward size={16} />
        </button>
        <span className="animatic-tc">
          {timecode(Math.min(playhead, total), fps)} <span className="dim">/ {timecode(total, fps)}</span>
        </span>
        <input
          className="animatic-scrub"
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={Math.min(playhead, Math.max(0, total - 1))}
          onChange={(e) => jump(Number(e.target.value))}
          onKeyDown={(e) => e.preventDefault()}
          title="Scrub"
        />
        <span className="animatic-now">
          {b ? (
            <>
              <b>{b.shot.shotNumber}</b> <span className="dim">{sceneTag(b.scene)}</span>
            </>
          ) : null}
        </span>
        <button className={`animatic-cc${captions ? ' active' : ''}`} onClick={() => useAnimatic.getState().setCaptions(!captions)} title="Show the dialogue as captions">
          <Captions size={16} />
        </button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { defaultBoardImage, type BoardShot } from '../../../shared/board'
import { currentRender } from '../../../shared/renders'
import type { TakeInfo } from '../../../shared/takes'
import { useDocument } from '../state/documentStore'
import { loadTakes, useGeneration } from '../state/generation'
import { useRenders } from '../state/renders'
import { useUi } from '../state/uiStore'
import { focusOf } from '../viewport/boardClay'
import { figuresLoading, onFiguresLoading } from '../viewport/humanData'
import { getRenderer } from '../viewport/RendererHandle'
import { renderShot } from '../viewport/renderShot'
import { shotFingerprint } from '../viewport/shotFingerprint'
import { shotScenes } from '../viewport/ShotScenes'

// A shot's picture as the board shows it (AI, Clay or Render), shared by the board's panels, the
// big view (BoardLightbox), and the animatic's timeline and player. The small picture is there at
// once; a sharp one (the take's full image, a large Clay picture, or the Render) is made on request.

/** AI, Clay or Render as the board shows it now: picked, or automatic (Clay until the project has circle takes). */
export function useBoardImage(): 'ai' | 'clay' | 'render' {
  const picked = useUi((s) => s.boardImage)
  const auto = useDocument((s) => defaultBoardImage(s.project))
  return picked ?? auto
}

export interface BoardPicture {
  /** What it is: the shot's Render, its circle take, or its clay picture. */
  kind: 'render' | 'ai' | 'clay'
  /** The small picture (null while there's none yet). */
  src: string | null
  /** The circle take, when it's shown. */
  take: TakeInfo | undefined
  /** Render mode showing the clay picture while the Render is made: 'Rendering…' / 'Waiting to render'. */
  pending: string | null
  /** Why there's no picture: 'Rendering…', 'Loading…', 'No circle take yet'. */
  missing: string | null
  /** The cache key of the sharp picture (changes when the picture would). */
  key: string
}

interface PictureInputs {
  mode: 'ai' | 'clay' | 'render'
  takes: TakeInfo[] | undefined
  clay: string | undefined
  render: string | null
  rendering: boolean
}

function describePicture(b: BoardShot, { mode, takes, clay, render, rendering }: PictureInputs): BoardPicture {
  const { shot } = b
  const take = shot.circleTake ? takes?.find((t) => t.id === shot.circleTake) : undefined
  if (render) return { kind: 'render', src: render, take: undefined, pending: null, missing: null, key: `${shot.id}:render:${render}` }
  // In AI mode a shot without a circle take shows its clay render (marked as such).
  if (mode === 'clay' || mode === 'render' || (takes !== undefined && !take)) {
    return {
      kind: 'clay',
      src: clay ?? null,
      take: undefined,
      pending: clay && mode === 'render' ? (rendering ? 'Rendering…' : 'Waiting to render') : null,
      missing: clay ? null : 'Rendering…',
      key: `${shot.id}:clay:${shotFingerprint(shot.id)}`
    }
  }
  return {
    kind: 'ai',
    src: take?.thumbnail ?? null,
    take,
    pending: null,
    missing: take ? null : shot.circleTake && takes === undefined ? 'Loading…' : 'No circle take yet',
    key: `${shot.id}:ai:${take?.id ?? ''}`
  }
}

/** The shot's picture for the board's current AI | Clay | Render choice. */
export function useBoardPicture(b: BoardShot): BoardPicture {
  const { scene, shot } = b
  const takes = useGeneration((s) => s.takes[shot.id])
  const projectPath = useUi((s) => s.projectPath)
  useEffect(() => {
    if (projectPath && takes === undefined) void loadTakes(shot.id, scene.id)
  }, [projectPath, takes, shot.id, scene.id])
  const mode = useBoardImage()
  const clay = useUi((s) => s.boardClay[shot.id])
  // Render mode: the shot's up-to-date Render; until it's made, its clay picture.
  useDocument((s) => s.project) // (re-check when the project changes)
  // (Select the picture itself: a string, so the panel only updates when it changes.)
  const render = useRenders((s) => (mode === 'render' ? (currentRender(s.byShot[shot.id], shotFingerprint(shot.id))?.url ?? null) : null))
  const rendering = useRenders((s) => mode === 'render' && s.queue?.shotId === shot.id)
  return describePicture(b, { mode, takes, clay, render, rendering })
}

/** The same as useBoardPicture, read once (for pictures of shots that aren't on screen). */
export function boardPictureNow(b: BoardShot): BoardPicture {
  const ui = useUi.getState()
  const mode = ui.boardImage ?? defaultBoardImage(useDocument.getState().project)
  const renders = useRenders.getState()
  return describePicture(b, {
    mode,
    takes: useGeneration.getState().takes[b.shot.id],
    clay: ui.boardClay[b.shot.id],
    render: mode === 'render' ? (currentRender(renders.byShot[b.shot.id], shotFingerprint(b.shot.id))?.url ?? null) : null,
    rendering: mode === 'render' && renders.queue?.shotId === b.shot.id
  })
}

/** Width of the Clay picture made for the big view and the player (px). */
const CLAY_WIDTH = 1920
/** Sharp pictures kept (each a large JPEG data URL). */
const CACHE_SIZE = 40
const sharpCache = new Map<string, string>()

function remember(key: string, src: string): string {
  sharpCache.delete(key)
  sharpCache.set(key, src)
  while (sharpCache.size > CACHE_SIZE) sharpCache.delete(sharpCache.keys().next().value!)
  return src
}

function untilFiguresLoaded(): Promise<void> {
  if (!figuresLoading()) return Promise.resolve()
  return new Promise((resolve) => {
    const stop = onFiguresLoading(() => {
      if (figuresLoading()) return
      stop()
      resolve()
    })
  })
}

/** The sharp picture, if it's been made. */
export function sharpPictureNow(pic: BoardPicture): string | null {
  return pic.kind === 'render' ? pic.src : (sharpCache.get(pic.key) ?? null)
}

/**
 * Make (or fetch from the cache) the sharp picture: the take's full image, a 1920 px Clay picture
 * of the shot's hidden copy of the set, or the Render as saved. Null when it can't be made now.
 */
export async function loadSharpPicture(b: BoardShot, pic: BoardPicture): Promise<string | null> {
  const now = sharpPictureNow(pic)
  if (now) return now
  if (pic.kind === 'ai') {
    const projectPath = useUi.getState().projectPath
    if (!pic.take || !projectPath) return null
    const r = await window.secondTeam.readTake(projectPath, b.scene.id, b.shot.id, pic.take.id)
    return 'error' in r ? null : remember(pic.key, r.image)
  }
  await untilFiguresLoaded()
  const gl = getRenderer()
  const scene = shotScenes.get(b.shot.id)
  if (!gl || !scene) return null
  scene.updateMatrixWorld(true)
  const canvas = renderShot(gl, scene, b.shot, useDocument.getState().project.camera, CLAY_WIDTH, focusOf(b.shot, scene))
  return canvas ? remember(pic.key, canvas.toDataURL('image/jpeg', 0.92)) : null
}

/** The sharp picture once it's ready (the small one until then). */
export function useSharpPicture(b: BoardShot | undefined, pic: BoardPicture | null): string | null {
  const [sharp, setSharp] = useState<{ key: string; src: string } | null>(null)
  const key = pic?.key ?? ''
  useEffect(() => {
    if (!b || !pic) return
    let live = true
    void loadSharpPicture(b, pic).then((src) => live && src && setSharp({ key: pic.key, src }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!pic) return null
  return (sharp?.key === key ? sharp.src : null) ?? sharpPictureNow(pic) ?? pic.src
}

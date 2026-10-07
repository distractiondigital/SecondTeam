import { create } from 'zustand'
import { currentRender, type RenderMeta, type RenderQuality } from '../../../shared/renders'
import { sceneOfShot, useDocument } from './documentStore'
import { useUi } from './uiStore'

// Renders (path-traced pictures of shots, viewport/pathTrace.ts) kept for the open project: shown
// on the Board, as shot thumbnails and in exports while they're up to date (their fingerprint
// matches the shot's, viewport/shotFingerprint.ts). Saved into the project folder
// (main/renderFiles.ts); in an unsaved project they wait in memory until the first save.

export interface ShotRender {
  url: string // PNG data URL
  print: string
  width: number
  height: number
  samples: number
}

const QUALITY_KEY = 'secondteam.renderQuality'

interface RendersState {
  /** By shot, then quality. */
  byShot: Record<string, Partial<Record<RenderQuality, ShotRender>>>
  /** Camera view: Render on. */
  live: boolean
  /** The quality the camera view renders at. */
  quality: RenderQuality
  /** The camera view's progress (for the HUD). */
  liveSamples: number
  liveTarget: number
  /** The board's background renders: how many shots are done of how many need one (null = idle). */
  queue: { done: number; total: number; shotId: string | null } | null
}

export const useRenders = create<RendersState>()(() => ({
  byShot: {},
  live: false,
  quality: (() => {
    try {
      return localStorage.getItem(QUALITY_KEY) === 'final' ? 'final' : 'draft'
    } catch {
      return 'draft'
    }
  })(),
  liveSamples: 0,
  liveTarget: 0,
  queue: null
}))

export function setRenderQuality(quality: RenderQuality): void {
  try {
    localStorage.setItem(QUALITY_KEY, quality)
  } catch {
    // not remembered this time
  }
  useRenders.setState({ quality })
}

/** Camera view's Render switch (Render needs the Clay look, so it switches to Clay). */
export function setLiveRender(live: boolean): void {
  if (live && useUi.getState().shading !== 'clay') useUi.getState().setShading('clay')
  useRenders.setState({ live })
}

/** Which renders are already in the project folder (`folder`), by "shot:quality". */
const savedIn = new Map<string, string>()
const key = (shotId: string, quality: RenderQuality) => `${shotId}:${quality}`

/** A new or opened project: forget the previous one's renders. */
export function resetRenders(): void {
  savedIn.clear()
  useRenders.setState({ byShot: {}, queue: null })
}

/** Load the renders saved in a project folder. */
export async function loadRenders(folder: string): Promise<void> {
  const list = await window.secondTeam.listRenders(folder)
  for (const r of list) {
    const url = await window.secondTeam.readRender(folder, r.sceneId, r.shotId, r.quality)
    if (!url || useUi.getState().projectPath !== folder) continue
    savedIn.set(key(r.shotId, r.quality), folder)
    const { print, width, height, samples } = r.meta
    useRenders.setState((s) => ({ byShot: { ...s.byShot, [r.shotId]: { ...s.byShot[r.shotId], [r.quality]: { url, print, width, height, samples } } } }))
  }
}

async function write(folder: string, shotId: string, quality: RenderQuality, r: ShotRender): Promise<void> {
  const state = useDocument.getState()
  const sceneId = sceneOfShot(state, shotId).id
  const meta: RenderMeta = { print: r.print, width: r.width, height: r.height, samples: r.samples, date: new Date().toISOString() }
  const result = await window.secondTeam.writeRender(folder, sceneId, shotId, quality, r.url, meta)
  if ('ok' in result) savedIn.set(key(shotId, quality), folder)
}

/** Keep a finished render (and save it, if the project has a folder). */
export async function keepRender(shotId: string, quality: RenderQuality, render: ShotRender): Promise<void> {
  useRenders.setState((s) => ({ byShot: { ...s.byShot, [shotId]: { ...s.byShot[shotId], [quality]: render } } }))
  savedIn.delete(key(shotId, quality))
  const folder = useUi.getState().projectPath
  if (folder) await write(folder, shotId, quality, render)
}

/** After a save: write the renders that aren't in that folder yet (an unsaved project's, or after Save As). */
export async function persistRenders(folder: string): Promise<void> {
  const shots = new Set(Object.values(useDocument.getState().project.scenes).flatMap((s) => Object.keys(s.nodes)))
  for (const [shotId, renders] of Object.entries(useRenders.getState().byShot)) {
    if (!shots.has(shotId)) continue
    for (const quality of ['draft', 'final'] as const) {
      const r = renders[quality]
      if (r && savedIn.get(key(shotId, quality)) !== folder) await write(folder, shotId, quality, r)
    }
  }
}

/** The render to show for a shot right now (up to date with `print`), or null. */
export function renderFor(shotId: string, print: string): (ShotRender & { quality: RenderQuality }) | null {
  return currentRender(useRenders.getState().byShot[shotId], print)
}

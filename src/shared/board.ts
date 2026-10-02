// The storyboard (Milestone 8): which shots are on the board and in what order, what each panel
// says, and how panels fall onto pages. Pure, tested. The board has its own order across the
// whole project, so scenes can be intercut; reordering never renames shots.

import { compareShotNumbers } from './camera'
import type { CameraNode, Project, Scene } from './project'

export interface BoardShot {
  scene: Scene
  shot: CameraNode
}

/** Every shot in board order: the saved order first, then any shots not in it yet (by scene, then shot). */
export function boardShots(project: Project): BoardShot[] {
  const all: BoardShot[] = []
  const scenes = [...project.scenes].sort((a, b) => a.number - b.number)
  for (const scene of scenes) {
    const shots = Object.values(scene.nodes)
      .filter((n): n is CameraNode => n.type === 'camera')
      .sort((a, b) => compareShotNumbers(a.shotNumber, b.shotNumber))
    for (const shot of shots) all.push({ scene, shot })
  }
  const byId = new Map(all.map((b) => [b.shot.id, b]))
  const ordered: BoardShot[] = []
  for (const id of project.board.order) {
    const b = byId.get(id)
    if (b) {
      ordered.push(b)
      byId.delete(id)
    }
  }
  for (const b of all) if (byId.has(b.shot.id)) ordered.push(b)
  return ordered
}

/** The board order after moving one shot before another (or to the end when `beforeId` is null). */
export function moveOnBoard(order: string[], id: string, beforeId: string | null): string[] {
  const rest = order.filter((x) => x !== id)
  const at = beforeId === null ? rest.length : rest.indexOf(beforeId)
  rest.splice(at < 0 ? rest.length : at, 0, id)
  return rest
}

/** The panel's description: its own board text, or the shot's Frame description until it has one. */
export function panelDescription(shot: CameraNode): string {
  return shot.boardText ?? shot.description
}

/** 'Sc 01' or 'Sc 01 · INT. WAREHOUSE' */
export function sceneTag(scene: Pick<Scene, 'number' | 'name'>): string {
  const n = `Sc ${String(scene.number).padStart(2, '0')}`
  return scene.name.trim() ? `${n} · ${scene.name.trim()}` : n
}

export type BoardLayout = 'grid' | 'rows'

export const LAYOUT_COUNTS: Record<BoardLayout, number[]> = {
  grid: [2, 3, 6],
  rows: [2, 3, 4]
}

/** Split panels into pages. */
export function paginate<T>(items: T[], perPage: number): T[][] {
  const n = Math.max(1, Math.round(perPage))
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += n) pages.push(items.slice(i, i + n))
  return pages
}

/** '001 - 1A.png': the position on the board and the shot name, with anything unsafe for a file name removed. */
export function sequenceFileName(index: number, shotName: string): string {
  const safe = shotName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'shot'
  return `${String(index + 1).padStart(3, '0')} - ${safe}.png`
}

/** 'Storyboard 2026-10-02 14.05' (local time), for export names. */
export function exportStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `Storyboard ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`
}

/** 'Grid 3', 'Rows 4': appended to PDF names so different layouts don't collide. */
export function layoutLabel(layout: BoardLayout, perPage: number): string {
  return `${layout === 'grid' ? 'Grid' : 'Rows'} ${perPage}`
}

/** `name`, or `name (2)`, `name (3)`… : the first one `taken` says is free. */
export function freeName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name
  for (let n = 2; ; n++) if (!taken(`${name} (${n})`)) return `${name} (${n})`
}

import { describe, expect, it } from 'vitest'
import { boardShots, defaultBoardImage, exportStamp, freeName, layoutLabel, moveOnBoard, paginate, panelDescription, sceneTag, sequenceFileName } from './board'
import { createEmptyProject, type CameraNode, type Project, type Scene } from './project'

function shot(id: string, shotNumber: string, extra: Partial<CameraNode> = {}): CameraNode {
  return {
    id,
    type: 'camera',
    name: `Shot ${shotNumber}`,
    parentId: null,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    hidden: false,
    locked: false,
    shotNumber,
    focalLength: 35,
    focusDistance: null,
    subjectId: null,
    sizeOverride: null,
    angleOverride: null,
    lightingOverride: null,
    description: '',
    notes: '',
    circleTake: null,
    boardText: null,
    dialogue: '',
    environment: null,
    overrides: {},
    descriptions: {},
    ...extra
  }
}

function project(): Project {
  const p = createEmptyProject()
  const s1 = p.scenes[0]
  const s2: Scene = { ...structuredClone(s1), id: 's2', number: 2, name: 'EXT. ROOFTOP', nodes: {}, rootIds: [] }
  s1.nodes = { a: shot('a', '1A'), c: shot('c', '1C'), b: shot('b', '1B') }
  s2.nodes = { d: shot('d', '2A') }
  // Scenes deliberately out of number order in the list.
  p.scenes = [s2, s1]
  return p
}

const names = (p: Project) => boardShots(p).map((b) => b.shot.shotNumber)

describe('board order', () => {
  it('starts in scene order, then shot order', () => {
    expect(names(project())).toEqual(['1A', '1B', '1C', '2A'])
  })

  it('keeps its own order, intercutting scenes, and appends new shots', () => {
    const p = project()
    p.board.order = ['d', 'b', 'gone']
    // 'gone' was deleted; 'a' and 'c' aren't on the board yet.
    expect(names(p)).toEqual(['2A', '1B', '1A', '1C'])
  })

  it('moves a panel before another, or to the end', () => {
    expect(moveOnBoard(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
    expect(moveOnBoard(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a'])
    expect(moveOnBoard(['a', 'b'], 'x', 'b')).toEqual(['a', 'x', 'b'])
  })
})

describe('panels', () => {
  it('uses the Frame description until the board has its own', () => {
    expect(panelDescription(shot('a', '1A', { description: 'a detective waits' }))).toBe('a detective waits')
    expect(panelDescription(shot('a', '1A', { description: 'a detective waits', boardText: 'He hears a noise.' }))).toBe('He hears a noise.')
    expect(panelDescription(shot('a', '1A', { description: 'x', boardText: '' }))).toBe('')
  })

  it('labels scenes', () => {
    expect(sceneTag({ number: 3, name: '' })).toBe('Sc 03')
    expect(sceneTag({ number: 3, name: ' INT. WAREHOUSE ' })).toBe('Sc 03 · INT. WAREHOUSE')
  })

  it('splits panels into pages', () => {
    expect(paginate([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]])
    expect(paginate([1, 2], 6)).toEqual([[1, 2]])
    expect(paginate([], 2)).toEqual([])
  })

  it('names PNG sequence files in board order', () => {
    expect(sequenceFileName(0, '1A')).toBe('001 - 1A.png')
    expect(sequenceFileName(41, '12B')).toBe('042 - 12B.png')
    expect(sequenceFileName(2, 'a/b:c')).toBe('003 - a_b_c.png')
  })
})

describe('export names', () => {
  it('names exports by date, time and layout, never overwriting', () => {
    expect(exportStamp(new Date(2026, 9, 2, 9, 5))).toBe('Storyboard 2026-10-02 09.05')
    expect(layoutLabel('grid', 6)).toBe('Grid 6')
    expect(layoutLabel('rows', 3)).toBe('Rows 3')
    const existing = new Set(['A.pdf', 'A (2).pdf'])
    expect(freeName('B', (n) => existing.has(`${n}.pdf`))).toBe('B')
    expect(freeName('A', (n) => existing.has(`${n}.pdf`))).toBe('A (3)')
  })
})

describe('board picture default', () => {
  it('is Clay until a shot has a circle take, then AI', () => {
    const project = { scenes: [{ nodes: { a: { type: 'camera', circleTake: null }, b: { type: 'primitive' } } }] } as unknown as Parameters<typeof defaultBoardImage>[0]
    expect(defaultBoardImage(project)).toBe('clay')
    ;(project.scenes[0].nodes.a as unknown as { circleTake: string }).circleTake = 'take-1'
    expect(defaultBoardImage(project)).toBe('ai')
  })
})

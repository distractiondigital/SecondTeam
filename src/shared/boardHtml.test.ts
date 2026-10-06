import { describe, expect, it } from 'vitest'
import { boardHtml, escapeHtml, mixedPictures, pageInches, printedPanels, type BoardExportSpec, type BoardPanelData } from './boardHtml'

const panel = (n: number, takeId: string | null, extra: Partial<BoardPanelData> = {}): BoardPanelData => ({
  sceneId: 's1',
  shotId: `shot${n}`,
  takeId,
  shotName: `1${String.fromCharCode(64 + n)}`,
  sceneTag: 'Sc 01',
  specs: '35mm · Wide shot',
  description: '',
  dialogue: '',
  notes: '',
  ...extra
})

const spec = (over: Partial<BoardExportSpec> = {}): BoardExportSpec => ({
  layout: 'grid',
  perPage: 3,
  pageSize: 'letter',
  title: 'Zermatt Ep3',
  footer: '',
  source: 'ai',
  ratio: 2.39,
  panels: [panel(1, 't1'), panel(2, null), panel(3, 't3'), panel(4, 't4')],
  ...over
})

const pages = (html: string) => html.match(/class="page"/g)?.length ?? 0

describe('storyboard PDF pages', () => {
  it('puts the right number of panels on each page, with page numbers', () => {
    // Pictures are keyed by shot (the take, or the clay render for a shot without one).
    const html = boardHtml(spec(), { shot1: 'data:a', shot2: 'data:clay2', shot3: 'data:c', shot4: 'data:d' })
    expect(pages(html)).toBe(2)
    expect(html).toContain('Page 1 of 2')
    expect(html).toContain('Page 2 of 2')
    expect(html).toContain('<img src="data:a"')
    expect(html).toContain('<img src="data:clay2"')
    expect(html).not.toContain('Picture not available')
  })

  it('prints every shot, and says when some are AI and some clay', () => {
    expect(printedPanels(spec())).toHaveLength(4)
    expect(mixedPictures(spec())).toEqual({ ai: 3, clay: 1 })
    // All clay (no circle takes yet) or all AI, or the Clay board: nothing to say.
    expect(mixedPictures(spec({ panels: [panel(1, null), panel(2, null)] }))).toBeNull()
    expect(mixedPictures(spec({ panels: [panel(1, 't1')] }))).toBeNull()
    expect(mixedPictures(spec({ source: 'clay' }))).toBeNull()
  })

  it('escapes captions and shows dialogue in quotes', () => {
    const html = boardHtml(spec({ panels: [panel(1, 't1', { description: 'He <runs> & hides', dialogue: "Who's there?" })], title: 'A & B' }), {})
    expect(html).toContain('He &lt;runs&gt; &amp; hides')
    expect(html).toContain('“Who&#39;s there?”')
    expect(html).toContain('A &amp; B')
    expect(html).not.toContain('<runs>')
    expect(escapeHtml('"x"')).toBe('&quot;x&quot;')
  })

  it('uses landscape pages for the grid and portrait for rows', () => {
    expect(pageInches('letter', 'grid')).toEqual({ w: 11, h: 8.5 })
    expect(pageInches('a4', 'rows')).toEqual({ w: 8.27, h: 11.69 })
    expect(boardHtml(spec({ layout: 'rows', perPage: 4 }), {})).toContain('size: 8.5in 11in')
    expect(boardHtml(spec({ layout: 'grid', perPage: 6 }), {})).toContain('repeat(3,')
  })

  it('shows clay renders by shot, for every shot', () => {
    const s = spec({ source: 'clay' })
    expect(printedPanels(s)).toHaveLength(4)
    const html = boardHtml(s, { shot1: 'data:clay1', shot2: 'data:clay2', shot3: 'data:clay3' })
    expect(html).toContain('<img src="data:clay2"')
    expect(html).toContain('Picture not available') // shot4's render didn't arrive
  })

  it('adds the footer on every page when given', () => {
    const html = boardHtml(spec({ footer: 'Distraction Digital · v1' }), {})
    expect(html.match(/class="footer"/g)?.length).toBe(2)
  })
})

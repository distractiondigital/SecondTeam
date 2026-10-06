import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { isRecent, MAX_RECENT, parseRecent, withoutRecent, withRecent } from './recentProjects'

describe('recent projects', () => {
  it('reads the stored list, ignoring damage and duplicates', () => {
    expect(parseRecent(null)).toEqual([])
    expect(parseRecent('{nope')).toEqual([])
    expect(parseRecent('{"a": 1}')).toEqual([])
    expect(parseRecent(JSON.stringify(['C:\\P\\A.secondteam', 3, '', 'c:\\p\\a.secondteam', 'C:\\P\\B.secondteam']))).toEqual([
      'C:\\P\\A.secondteam',
      'C:\\P\\B.secondteam'
    ])
  })

  it('puts the latest first, once, and keeps ten', () => {
    // Real absolute folders for whichever computer runs the test (Windows or Mac).
    const projects = join(resolve(tmpdir()), 'Projects')
    const film = (n: number) => join(projects, `Film ${n}.secondteam`)
    let list: string[] = []
    for (let i = 0; i < 12; i++) list = withRecent(list, film(i))
    expect(list).toHaveLength(MAX_RECENT)
    expect(list[0]).toBe(film(11))
    list = withRecent(list, film(5).toLowerCase())
    expect(list[0].toLowerCase()).toBe(film(5).toLowerCase())
    expect(list.filter((p) => p.toLowerCase().endsWith('film 5.secondteam'))).toHaveLength(1)
    expect(isRecent(list, film(7))).toBe(true)
    expect(isRecent(list, join(resolve(tmpdir()), 'Elsewhere', 'Film 7.secondteam'))).toBe(false)
    expect(isRecent(withoutRecent(list, film(7)), film(7))).toBe(false)
  })
})

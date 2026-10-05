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
    let list: string[] = []
    for (let i = 0; i < 12; i++) list = withRecent(list, `C:\\Projects\\Film ${i}.secondteam`)
    expect(list).toHaveLength(MAX_RECENT)
    expect(list[0]).toBe('C:\\Projects\\Film 11.secondteam')
    list = withRecent(list, 'c:\\projects\\film 5.secondteam')
    expect(list[0].toLowerCase()).toBe('c:\\projects\\film 5.secondteam')
    expect(list.filter((p) => p.toLowerCase().endsWith('film 5.secondteam'))).toHaveLength(1)
    expect(isRecent(list, 'C:\\Projects\\Film 7.secondteam')).toBe(true)
    expect(isRecent(list, 'C:\\Elsewhere\\Film 7.secondteam')).toBe(false)
    expect(isRecent(withoutRecent(list, 'C:\\Projects\\Film 7.secondteam'), 'C:\\Projects\\Film 7.secondteam')).toBe(false)
  })
})

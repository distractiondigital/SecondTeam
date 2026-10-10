import { describe, expect, it } from 'vitest'
import { changeFps, clampFrames, clipAt, clipTimes, dropIndex, framesFor, insertClips, lengthLabel, missingShots, moveClip, sanitizeAnimatic, secondsFor, timecode, totalFrames, type AnimaticClip } from './animatic'

const clip = (id: string, shotId: string, frames: number): AnimaticClip => ({ id, shotId, frames })
const ids = (clips: AnimaticClip[]) => clips.map((c) => c.id)

describe('timecode', () => {
  it('counts frames at each rate', () => {
    expect(timecode(0, 24)).toBe('00:00:00:00')
    expect(timecode(23, 24)).toBe('00:00:00:23')
    expect(timecode(24, 24)).toBe('00:00:01:00')
    expect(timecode(25, 25)).toBe('00:00:01:00')
    expect(timecode(24, 25)).toBe('00:00:00:24')
    expect(timecode(30 * 61 + 5, 30)).toBe('00:01:01:05')
    expect(timecode(24 * 3600, 24)).toBe('01:00:00:00')
  })

  it('counts 23.976 like 24 (non-drop)', () => {
    expect(timecode(24, 23.976)).toBe('00:00:01:00')
    expect(timecode(24 * 60, 23.976)).toBe('00:01:00:00')
  })
})

describe('lengths', () => {
  it('snaps seconds to whole frames, at least one', () => {
    expect(framesFor(3, 24)).toBe(72)
    expect(framesFor(4.5, 24)).toBe(108)
    expect(framesFor(1, 23.976)).toBe(24)
    expect(framesFor(0, 24)).toBe(1)
    expect(secondsFor(72, 24)).toBe(3)
    expect(secondsFor(24, 23.976)).toBeCloseTo(1.001)
  })

  it('clamps lengths', () => {
    expect(clampFrames(0, 24)).toBe(1)
    expect(clampFrames(10.4, 24)).toBe(10)
    expect(clampFrames(1e9, 24)).toBe(600 * 24)
    expect(clampFrames(NaN, 24)).toBe(72)
  })

  it('labels lengths', () => {
    expect(lengthLabel(72, 24)).toBe('3.0 s')
    expect(lengthLabel(65 * 24, 24)).toBe('1:05.0')
  })

  it('keeps seconds when the frame rate changes', () => {
    const clips = [clip('a', 's1', 72), clip('b', 's2', 108)]
    expect(changeFps(clips, 24, 25).map((c) => c.frames)).toEqual([75, 113])
    expect(changeFps(changeFps(clips, 24, 30), 30, 24).map((c) => c.frames)).toEqual([72, 108])
  })
})

describe('timeline', () => {
  const clips = [clip('a', 's1', 72), clip('b', 's2', 48), clip('c', 's1', 24)]

  it('places clips end to end', () => {
    expect(clipTimes(clips).map((t) => [t.start, t.end])).toEqual([
      [0, 72],
      [72, 120],
      [120, 144]
    ])
    expect(totalFrames(clips)).toBe(144)
  })

  it('finds the clip at a frame', () => {
    expect(clipAt(clips, 0)?.clip.id).toBe('a')
    expect(clipAt(clips, 71)?.clip.id).toBe('a')
    expect(clipAt(clips, 72)?.clip.id).toBe('b')
    expect(clipAt(clips, 500)?.clip.id).toBe('c')
    expect(clipAt([], 0)).toBeNull()
  })

  it('inserts, moves and finds drop points', () => {
    expect(ids(insertClips(clips, [clip('d', 's3', 10)], 1))).toEqual(['a', 'd', 'b', 'c'])
    expect(ids(insertClips(clips, [clip('d', 's3', 10)], 99))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(moveClip(clips, 'c', 'a'))).toEqual(['c', 'a', 'b'])
    expect(ids(moveClip(clips, 'a', null))).toEqual(['b', 'c', 'a'])
    expect(moveClip(clips, 'x', null)).toBe(clips)
    expect(dropIndex(clips, 10)).toBe(0)
    expect(dropIndex(clips, 40)).toBe(1)
    expect(dropIndex(clips, 1000)).toBe(3)
  })

  it('lists shots not in the animatic, in order', () => {
    expect(missingShots(clips, ['s0', 's1', 's2', 's3'])).toEqual(['s0', 's3'])
  })
})

describe('loading', () => {
  it('drops clips of deleted shots and repairs the rest', () => {
    const a = sanitizeAnimatic(
      { fps: 25, clips: [clip('a', 's1', 50), clip('b', 'gone', 50), clip('a', 's1', 10), { id: 'c', shotId: 's2', frames: -3 }, null] },
      new Set(['s1', 's2'])
    )
    expect(a.fps).toBe(25)
    expect(a.clips).toEqual([clip('a', 's1', 50), clip('c', 's2', 1)])
  })

  it('defaults to an empty animatic at 24 fps', () => {
    expect(sanitizeAnimatic(undefined, new Set())).toEqual({ fps: 24, clips: [] })
    expect(sanitizeAnimatic({ fps: 60 }, new Set()).fps).toBe(24)
  })
})

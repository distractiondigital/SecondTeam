import { describe, expect, it } from 'vitest'
import { compareVersions, isPrerelease, newestRelease, parseVersion, type GithubRelease } from './updates'

describe('versions', () => {
  it('parses tags with or without v', () => {
    expect(parseVersion('v0.1.0-beta')).toEqual({ core: [0, 1, 0], pre: ['beta'] })
    expect(parseVersion('1.2.3')).toEqual({ core: [1, 2, 3], pre: [] })
    expect(parseVersion('0.1.0-beta.2')).toEqual({ core: [0, 1, 0], pre: ['beta', 2] })
    expect(parseVersion('latest')).toBeNull()
  })

  it('orders betas before their release', () => {
    const order = ['0.1.0-alpha', '0.1.0-beta', '0.1.0-beta.2', '0.1.0-beta.10', '0.1.0-rc.1', '0.1.0', '0.1.1', '0.2.0-beta', '0.2.0', '1.0.0']
    for (let i = 0; i < order.length - 1; i++) {
      expect(compareVersions(order[i], order[i + 1])).toBeLessThan(0)
      expect(compareVersions(order[i + 1], order[i])).toBeGreaterThan(0)
    }
    expect(compareVersions('v0.1.0-beta', '0.1.0-beta')).toBe(0)
  })

  it('knows a pre-release', () => {
    expect(isPrerelease('0.1.0-beta')).toBe(true)
    expect(isPrerelease('0.1.0')).toBe(false)
  })
})

describe('newest release', () => {
  const r = (tag: string, extra: Partial<GithubRelease> = {}): GithubRelease => ({ tag_name: tag, draft: false, prerelease: tag.includes('-'), ...extra })

  it('picks the newest newer release', () => {
    expect(newestRelease('0.1.0-beta', [r('v0.1.0-beta'), r('v0.2.0-beta'), r('v0.1.1-beta')])?.tag_name).toBe('v0.2.0-beta')
  })
  it('returns null when up to date', () => {
    expect(newestRelease('0.2.0-beta', [r('v0.1.0-beta'), r('v0.2.0-beta')])).toBeNull()
  })
  it('skips drafts', () => {
    expect(newestRelease('0.1.0-beta', [r('v0.3.0-beta', { draft: true }), r('v0.2.0-beta')])?.tag_name).toBe('v0.2.0-beta')
  })
  it('offers betas only to beta installs', () => {
    expect(newestRelease('1.0.0', [r('v1.1.0-beta'), r('v1.0.1')])?.tag_name).toBe('v1.0.1')
    expect(newestRelease('1.0.0', [r('v1.1.0-beta')])).toBeNull()
    expect(newestRelease('1.0.0-beta', [r('v1.0.0'), r('v1.1.0-beta')])?.tag_name).toBe('v1.1.0-beta')
  })
  it('ignores tags that are not versions', () => {
    expect(newestRelease('0.1.0', [r('nightly'), r('v0.1.1')])?.tag_name).toBe('v0.1.1')
  })
})

// App updates: version maths and the state the UI shows (pure, tested). The checking and
// downloading happen in the main process (src/main/updates.ts).

/** Where the releases live (the only place update checks go). */
export const RELEASES_OWNER = 'distractiondigital'
export const RELEASES_REPO = 'SecondTeam'
export const RELEASES_PAGE = `https://github.com/${RELEASES_OWNER}/${RELEASES_REPO}/releases`

export type UpdateStatus =
  | 'idle' // not checked yet (or checks are off)
  | 'checking'
  | 'none' // up to date
  | 'available'
  | 'downloading'
  | 'ready' // downloaded, waiting for "Restart and update"
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  /** This app's version. */
  current: string
  /** The newer version, when there is one. */
  version: string | null
  /** Its release notes (plain text or simple HTML from GitHub), when known. */
  notes: string | null
  /** Download progress, 0–100. */
  percent: number
  /** What went wrong, in plain words. */
  error: string | null
  /** Check when the app starts (the setting). */
  auto: boolean
  /** This build can download and install by itself (Windows installer); otherwise Download opens the release page. */
  canInstall: boolean
}

interface Version {
  core: [number, number, number]
  pre: (string | number)[] // empty for a release
}

/** Parse "v1.2.3", "0.1.0-beta", "0.1.0-beta.2"; null if it isn't a version. */
export function parseVersion(text: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(text.trim())
  if (!m) return null
  const pre = m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : []
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre }
}

/** Semantic-version order: negative if a is older than b, 0 if the same, positive if newer. Unparseable versions sort oldest. */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va || !vb) return (va ? 1 : 0) - (vb ? 1 : 0)
  for (let i = 0; i < 3; i++) if (va.core[i] !== vb.core[i]) return va.core[i] - vb.core[i]
  // A pre-release comes before its release (0.1.0-beta < 0.1.0).
  if (!va.pre.length || !vb.pre.length) return (va.pre.length ? -1 : 0) - (vb.pre.length ? -1 : 0)
  for (let i = 0; i < Math.max(va.pre.length, vb.pre.length); i++) {
    const x = va.pre[i]
    const y = vb.pre[i]
    if (x === undefined) return -1 // beta < beta.2
    if (y === undefined) return 1
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return x - y
    if (typeof x === 'number') return -1 // numbers before words
    if (typeof y === 'number') return 1
    return x < y ? -1 : 1
  }
  return 0
}

/** Is this a pre-release (beta, rc…)? */
export function isPrerelease(version: string): boolean {
  return (parseVersion(version)?.pre.length ?? 0) > 0
}

/** One release as GitHub's API lists it (only the fields we use). */
export interface GithubRelease {
  tag_name: string
  draft: boolean
  prerelease: boolean
  body?: string | null
  html_url?: string
}

/**
 * The newest release that's newer than `current`, or null. Drafts never count; pre-releases count
 * only while you're on one yourself (beta testers get betas, a stable install gets stable updates).
 */
export function newestRelease(current: string, releases: GithubRelease[]): GithubRelease | null {
  const betas = isPrerelease(current)
  let best: GithubRelease | null = null
  for (const r of releases) {
    if (r.draft || !parseVersion(r.tag_name)) continue
    if ((r.prerelease || isPrerelease(r.tag_name)) && !betas) continue
    if (compareVersions(r.tag_name, current) <= 0) continue
    if (!best || compareVersions(r.tag_name, best.tag_name) > 0) best = r
  }
  return best
}

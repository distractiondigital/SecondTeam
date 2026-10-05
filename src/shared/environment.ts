// A scene's environment: a simple sky that follows the time of day, and the colour of the ground.
// The sky is a gradient (zenith to horizon) behind the set plus a matching soft fill light; the
// scene's own lights stay the key light. Pure maths, tested in environment.test.ts.

export interface Environment {
  /** Hours, 0-24 (0 and 24 are both midnight). */
  time: number
  /** Ground (automatic floor) colour, '#rrggbb'. */
  ground: string
  /** Distance fog, 0 (clear) to 1 (thick fog). */
  fog: number
}

export const DEFAULT_ENVIRONMENT: Environment = { time: 12, ground: '#9a9a96', fog: 0 }

interface Key {
  time: number
  label: string
  /** For the prompt. */
  phrase: string
  zenith: string
  horizon: string
  /** Soft fill light: colour from the sky and its strength. */
  fill: string
  fillIntensity: number
}

// Keyframes round the clock; colours in between are blended.
const KEYS: Key[] = [
  { time: 0, label: 'Night', phrase: 'at night, dark night sky', zenith: '#03050c', horizon: '#0b1226', fill: '#3a4a78', fillIntensity: 0.12 },
  { time: 5, label: 'Dawn', phrase: 'at dawn, cool blue pre-dawn light', zenith: '#101a3c', horizon: '#4e5578', fill: '#6c78a8', fillIntensity: 0.22 },
  { time: 6.5, label: 'Sunrise', phrase: 'at sunrise, low warm golden light', zenith: '#3d5d92', horizon: '#f2a466', fill: '#e8b48a', fillIntensity: 0.4 },
  { time: 9, label: 'Morning', phrase: 'in the morning, clear daylight', zenith: '#4c84c8', horizon: '#bcd5ec', fill: '#c8dcf0', fillIntensity: 0.55 },
  { time: 12, label: 'Midday', phrase: 'at midday, bright daylight', zenith: '#3b7bcb', horizon: '#d2e3f2', fill: '#dce9f5', fillIntensity: 0.65 },
  { time: 15.5, label: 'Afternoon', phrase: 'in the afternoon, warm daylight', zenith: '#467ec3', horizon: '#dde0df', fill: '#e6e2d6', fillIntensity: 0.55 },
  { time: 18.5, label: 'Sunset', phrase: 'at sunset, warm golden-hour light', zenith: '#384d7c', horizon: '#f08a4a', fill: '#eaa070', fillIntensity: 0.4 },
  { time: 19.75, label: 'Dusk', phrase: 'at dusk, blue-hour twilight', zenith: '#18204a', horizon: '#6e5478', fill: '#5a5c94', fillIntensity: 0.22 },
  { time: 21, label: 'Night', phrase: 'at night, dark night sky', zenith: '#03050c', horizon: '#0b1226', fill: '#3a4a78', fillIntensity: 0.12 },
  { time: 24, label: 'Night', phrase: 'at night, dark night sky', zenith: '#03050c', horizon: '#0b1226', fill: '#3a4a78', fillIntensity: 0.12 }
]

export function clampTime(t: unknown): number {
  const n = typeof t === 'number' && Number.isFinite(t) ? t : DEFAULT_ENVIRONMENT.time
  return Math.min(24, Math.max(0, n))
}

const HEX = /^#[0-9a-f]{6}$/i

export function repairEnvironment(raw: unknown): Environment {
  const e = (raw && typeof raw === 'object' ? raw : {}) as Partial<Environment>
  return {
    time: clampTime(e.time),
    ground: typeof e.ground === 'string' && HEX.test(e.ground) ? e.ground.toLowerCase() : DEFAULT_ENVIRONMENT.ground,
    fog: typeof e.fog === 'number' && Number.isFinite(e.fog) ? Math.min(1, Math.max(0, e.fog)) : 0
  }
}

function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

/** The two keyframes around `time`, and how far between them (0-1). */
function around(time: number): { a: Key; b: Key; t: number } {
  const h = clampTime(time)
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i]
    const b = KEYS[i + 1]
    if (h >= a.time && h <= b.time) return { a, b, t: b.time === a.time ? 0 : (h - a.time) / (b.time - a.time) }
  }
  return { a: KEYS[0], b: KEYS[0], t: 0 }
}

export interface Sky {
  zenith: string
  horizon: string
  fill: string
  fillIntensity: number
}

/** Sky and fill colours at a time of day. */
export function skyAt(time: number): Sky {
  const { a, b, t } = around(time)
  return {
    zenith: mixHex(a.zenith, b.zenith, t),
    horizon: mixHex(a.horizon, b.horizon, t),
    fill: mixHex(a.fill, b.fill, t),
    fillIntensity: a.fillIntensity + (b.fillIntensity - a.fillIntensity) * t
  }
}

/** The nearest named time ('Sunset'). */
export function timeLabel(time: number): string {
  const { a, b, t } = around(time)
  return t < 0.5 ? a.label : b.label
}

/** For the prompt: 'at sunset, warm golden-hour light'. */
export function timePhrase(time: number): string {
  const { a, b, t } = around(time)
  return t < 0.5 ? a.phrase : b.phrase
}

/**
 * Fog density for three.js FogExp2 (per metre). Eased so the low end is a subtle haze:
 * 0.25 is a faint haze far off (~10% at 100 m), 0.5 hides 60% at 40 m, 1 limits you to ~10 m.
 */
export function fogDensity(fog: number): number {
  return fog <= 0 ? 0 : 0.2 * Math.pow(Math.min(1, fog), 3)
}

/** For the prompt: '', 'light haze', 'hazy atmosphere', 'thick fog'. */
export function fogPhrase(fog: number): string {
  if (fog < 0.15) return ''
  if (fog < 0.45) return 'light atmospheric haze'
  if (fog < 0.75) return 'hazy atmosphere, distant objects fading into haze'
  return 'thick fog, low visibility'
}

/** '18:30' */
export function clockText(time: number): string {
  const minutes = Math.round(clampTime(time) * 60) % (24 * 60)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

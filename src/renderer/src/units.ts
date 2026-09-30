// Display units. Everything is stored in metres; feet are only for showing and typing values.

export type Units = 'm' | 'ft'

export const METRES_PER_FOOT = 0.3048

/** Format a length in metres for display, e.g. "1.25" (m) or "4' 1.2\"" (ft). */
export function formatLength(metres: number, units: Units): string {
  if (units === 'm') return trimNumber(metres, 3)
  const totalInches = metres / METRES_PER_FOOT * 12
  const sign = totalInches < 0 ? '-' : ''
  const abs = Math.abs(totalInches)
  let feet = Math.floor(abs / 12)
  let inches = Math.round((abs - feet * 12) * 10) / 10
  if (inches >= 12) {
    feet += 1
    inches = 0
  }
  return `${sign}${feet}' ${trimNumber(inches, 1)}"`
}

/**
 * Parse what the user typed into metres. Accepts plain numbers in the current units,
 * or explicit units in either system: "2m", "150cm", "6'", "6' 2\"", "6ft 2in", "74in".
 * Returns null if it can't be understood.
 */
export function parseLength(text: string, units: Units): number | null {
  const s = text.trim().toLowerCase().replace(/,/g, '.')
  if (s === '') return null

  const plain = Number(s)
  if (Number.isFinite(plain)) return units === 'm' ? plain : plain * METRES_PER_FOOT

  const metric = s.match(/^(-?\d*\.?\d+)\s*(mm|cm|m)$/)
  if (metric) {
    const n = Number(metric[1])
    return metric[2] === 'mm' ? n / 1000 : metric[2] === 'cm' ? n / 100 : n
  }

  const imperial = s.match(/^(-)?\s*(?:(\d*\.?\d+)\s*(?:'|ft|feet|foot))?\s*(?:(\d*\.?\d+)\s*(?:"|in|inch|inches))?$/)
  if (imperial && (imperial[2] !== undefined || imperial[3] !== undefined)) {
    const feet = Number(imperial[2] ?? 0)
    const inches = Number(imperial[3] ?? 0)
    const metres = (feet + inches / 12) * METRES_PER_FOOT
    return imperial[1] ? -metres : metres
  }
  return null
}

export function trimNumber(n: number, decimals: number): string {
  const fixed = n.toFixed(decimals)
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
  return trimmed === '-0' ? '0' : trimmed
}

export function gridSpacing(units: Units): { cell: number; section: number } {
  return units === 'm' ? { cell: 1, section: 10 } : { cell: METRES_PER_FOOT, section: 10 * METRES_PER_FOOT }
}

export function moveSnap(units: Units): number {
  return units === 'm' ? 0.1 : METRES_PER_FOOT / 2
}

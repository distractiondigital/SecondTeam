import { useState } from 'react'
import { useUi } from '../state/uiStore'
import { formatLength, parseLength, trimNumber } from '../units'

export type NumberKind = 'length' | 'angle' | 'factor'

interface Props {
  label: string
  /** Stored value: metres for lengths, degrees for angles, plain number for factors. */
  value: number
  kind: NumberKind
  onCommit: (value: number) => void
  disabled?: boolean
  /** Lowest allowed value (in stored units). */
  min?: number
}

// A number box that commits on Enter or when you click away. Esc cancels.
// Lengths display in the chosen units and accept either system ("2m", "6' 2\"").
export default function NumberField({ label, value, kind, onCommit, disabled, min }: Props) {
  const units = useUi((s) => s.units)
  const [draft, setDraft] = useState<string | null>(null)

  const display =
    kind === 'length' ? formatLength(value, units) : kind === 'angle' ? `${trimNumber(value, 1)}°` : trimNumber(value, 3)

  const commit = () => {
    if (draft === null) return
    const text = draft.replace('°', '')
    const parsed = kind === 'length' ? parseLength(text, units) : Number(text.trim().replace(',', '.'))
    setDraft(null)
    if (parsed === null || !Number.isFinite(parsed)) return
    const clamped = min !== undefined ? Math.max(min, parsed) : parsed
    if (clamped !== value) onCommit(clamped)
  }

  return (
    <label className="number-field">
      <span className="number-label">{label}</span>
      <input
        type="text"
        value={draft ?? display}
        disabled={disabled}
        spellCheck={false}
        onFocus={(e) => {
          setDraft(display)
          e.currentTarget.select()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(null)
            // Skip the commit that blur would otherwise do.
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
          }
        }}
      />
    </label>
  )
}

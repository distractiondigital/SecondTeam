import { useRef, useState, type PointerEvent } from 'react'
import { useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { formatLength, METRES_PER_FOOT, parseLength, trimNumber } from '../units'

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
  /** Highest allowed value (in stored units). */
  max?: number
  /** How much one pixel of dragging changes the value (stored units). Sensible defaults per kind. */
  step?: number
}

const DRAG_THRESHOLD = 3 // pixels before a press becomes a drag

function defaultStep(kind: NumberKind, units: 'm' | 'ft'): number {
  if (kind === 'length') return units === 'm' ? 0.01 : METRES_PER_FOOT / 48 // 1 cm or ¼ inch
  if (kind === 'angle') return 0.5
  return 0.01
}

// A number box. Click to type (Enter or clicking away commits, Esc cancels), or press and drag
// left/right to scrub the value: Shift for fine steps, Ctrl for big ones. One drag is one undo step.
// Lengths display in the chosen units and accept either system ("2m", "6' 2\"").
export default function NumberField({ label, value, kind, onCommit, disabled, min, max, step }: Props) {
  const units = useUi((s) => s.units)
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrub = useRef<{ startX: number; start: number; total: number; dragging: boolean } | null>(null)
  /** Set right after a drag, so the click that follows doesn't start typing. */
  const justDragged = useRef(false)

  const display =
    kind === 'length' ? formatLength(value, units) : kind === 'angle' ? `${trimNumber(value, 1)}°` : trimNumber(value, 3)

  const clamp = (v: number) => {
    let out = v
    if (min !== undefined) out = Math.max(min, out)
    if (max !== undefined) out = Math.min(max, out)
    return out
  }

  const commit = () => {
    if (draft === null) return
    const text = draft.replace('°', '')
    const parsed = kind === 'length' ? parseLength(text, units) : Number(text.trim().replace(',', '.'))
    setDraft(null)
    if (parsed === null || !Number.isFinite(parsed)) return
    const clamped = clamp(parsed)
    if (clamped !== value) onCommit(clamped)
  }

  const editing = draft !== null

  const onPointerDown = (e: PointerEvent<HTMLLabelElement>) => {
    if (disabled || editing || e.button !== 0) return
    e.preventDefault() // don't focus the text yet: this might be a drag
    e.currentTarget.setPointerCapture(e.pointerId)
    scrub.current = { startX: e.clientX, start: value, total: 0, dragging: false }
  }

  const onPointerMove = (e: PointerEvent<HTMLLabelElement>) => {
    const s = scrub.current
    if (!s) return
    if (!s.dragging) {
      if (Math.abs(e.clientX - s.startX) < DRAG_THRESHOLD) return
      s.dragging = true
      useDocument.getState().beginGesture('scrub')
      e.currentTarget.requestPointerLock?.() // keep dragging past the edge of the screen
      s.total = e.clientX - s.startX
    } else {
      s.total += document.pointerLockElement ? e.movementX : e.clientX - s.startX - s.total
    }
    const size = (step ?? defaultStep(kind, units)) * (e.shiftKey ? 0.1 : e.ctrlKey ? 10 : 1)
    const next = clamp(Math.round((s.start + s.total * size) / size) * size)
    const rounded = Math.round(next * 100000) / 100000
    if (rounded !== value) onCommit(rounded)
  }

  const onPointerUp = (e: PointerEvent<HTMLLabelElement>) => {
    const s = scrub.current
    scrub.current = null
    if (!s) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (s.dragging) {
      justDragged.current = true
      if (document.pointerLockElement) document.exitPointerLock()
      useDocument.getState().endGesture('scrub')
    } else {
      // A plain click: start typing.
      inputRef.current?.focus()
    }
  }

  return (
    <label
      className={`number-field${editing ? ' editing' : ''}${disabled ? ' disabled' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(e) => {
        if (justDragged.current) {
          justDragged.current = false
          e.preventDefault()
        }
      }}
      title={disabled ? undefined : 'Drag left/right to change (Shift: fine, Ctrl: coarse), or click to type'}
    >
      <span className="number-label">{label}</span>
      <input
        ref={inputRef}
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

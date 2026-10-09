import { useEffect, useRef, useState } from 'react'
import { Flashlight, Lamp, LampDesk, LampFloor, Lightbulb, Sparkles, type LucideIcon } from 'lucide-react'
import type { PracticalKind } from '../../../shared/practicals'
import { addPractical } from '../state/actions'

// Lights ▸ Practical: lights that live in the set (shared/practicals.ts), added where you're looking.

const ITEMS: { label: string; hint: string; icon: LucideIcon; kind: PracticalKind; preset?: 'table' | 'floor' }[] = [
  { label: 'Table lamp', hint: 'Pools of light above and below the shade, a soft glow through it', icon: LampDesk, kind: 'lamp', preset: 'table' },
  { label: 'Floor lamp', hint: 'A tall lamp with a wider shade', icon: LampFloor, kind: 'lamp', preset: 'floor' },
  { label: 'Bare bulb', hint: 'A hanging bulb on its cord: small and hard', icon: Lightbulb, kind: 'bulb' },
  { label: 'Flashlight', hint: 'A narrow beam; rotate it to aim', icon: Flashlight, kind: 'flashlight' },
  { label: 'Fairy lights', hint: 'A strand of small bulbs; set its length, sag and bulbs', icon: Sparkles, kind: 'fairy' }
]

export default function PracticalMenu() {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState({ left: 0, top: 0 })
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="recent-menu" ref={box}>
      <button
        className={`tool-button${open ? ' active' : ''}`}
        title="Add a practical: a lamp, bulb, flashlight or fairy lights that lives in the set"
        onClick={(e) => {
          // Pinned to the window under the button (the toolbar would clip it).
          const b = e.currentTarget.getBoundingClientRect()
          setAt({ left: b.left, top: b.bottom + 4 })
          setOpen(!open)
        }}
      >
        <Lamp size={16} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="practical-popover" style={at}>
          <h3>Practicals</h3>
          {ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                className="practical-item"
                title={item.hint}
                onClick={() => {
                  setOpen(false)
                  addPractical(item.kind, item.preset)
                }}
              >
                <Icon size={15} strokeWidth={1.75} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

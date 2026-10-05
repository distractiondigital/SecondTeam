import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { useUi, type AiFold as Fold } from '../state/uiStore'

// A section of AI features that folds away, so the app stays uncluttered when you're not using
// the AI. Open or closed is remembered on this PC.

export default function AiFold({ fold, title, hint, children }: { fold: Fold; title: string; hint?: string; children: ReactNode }) {
  const open = useUi((s) => s.aiFolds[fold])
  return (
    <div className={`ai-fold${open ? ' open' : ''}`}>
      <button className="ai-fold-head" onClick={() => useUi.getState().setAiFold(fold, !open)} title={hint}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Sparkles size={13} />
        <span>{title}</span>
      </button>
      {open && <div className="ai-fold-body">{children}</div>}
    </div>
  )
}

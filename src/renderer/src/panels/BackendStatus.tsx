import { useEffect, useRef, useState } from 'react'
import { FileText, RotateCw } from 'lucide-react'
import { useGeneration } from '../state/generation'

// The AI engine's status light in the top bar. Click it for details, the log, or a restart.

const LABELS = {
  'not-installed': 'Not installed',
  starting: 'Starting…',
  ready: 'Ready',
  error: 'Error',
  stopped: 'Stopped'
} as const

export default function BackendStatus() {
  const status = useGeneration((s) => s.status)
  const models = useGeneration((s) => s.models)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const state = status?.state ?? 'starting'
  return (
    <div className="backend-status" ref={ref}>
      <button className={`backend-pill ${state}`} onClick={() => setOpen(!open)} title="AI engine (ComfyUI) status">
        <i /> AI: {LABELS[state]}
      </button>
      {open && (
        <div className="backend-menu">
          <p>{status?.message || 'Waiting for the AI engine…'}</p>
          {status?.comfyVersion && <p className="hint small">ComfyUI {status.comfyVersion}</p>}
          {state === 'ready' && (
            <p className="hint small">
              Models: {models.length ? models.map((m) => m.name).join(', ') : 'none installed'}
            </p>
          )}
          <div className="prop-actions tight">
            <button onClick={() => void window.secondTeam.openBackendLog()}>
              <FileText size={13} /> Open log
            </button>
            <button onClick={() => void window.secondTeam.restartBackend()} disabled={state === 'not-installed'}>
              <RotateCw size={13} /> Restart
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

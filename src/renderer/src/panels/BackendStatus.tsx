import { useEffect, useRef, useState } from 'react'
import { FileText, RotateCw, Settings, SlidersHorizontal, Wrench } from 'lucide-react'
import { useGeneration } from '../state/generation'
import { openEngineSettings, openWizard } from '../state/setup'

// The AI engine's status light in the top bar. Click it for details, the log, or a restart.

const LABELS = {
  'not-installed': 'Not installed',
  unavailable: 'Coming soon on Mac',
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
          {state === 'unavailable' && (
            <p className="hint small">
              Advanced: if you already run ComfyUI on this Mac (with the same models and the IP-Adapter add-on), you can connect it in
              Engine settings → Advanced.
            </p>
          )}
          <div className="prop-actions tight">
            {state === 'not-installed' ? (
              <button
                className="generate-button"
                onClick={() => {
                  setOpen(false)
                  openWizard('pc')
                }}
              >
                <Wrench size={13} /> Set up the AI engine…
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    setOpen(false)
                    openEngineSettings('generation')
                  }}
                  title="Model, style, style reference, strictness, takes, seed (the whole project)"
                >
                  <SlidersHorizontal size={13} /> Generation settings…
                </button>
                <button
                  onClick={() => {
                    setOpen(false)
                    openEngineSettings('engine')
                  }}
                >
                  <Settings size={13} /> Engine settings…
                </button>
              </>
            )}
          </div>
          <div className="prop-actions tight">
            <button onClick={() => void window.secondTeam.openBackendLog()}>
              <FileText size={13} /> Open log
            </button>
            <button onClick={() => void window.secondTeam.restartBackend()} disabled={state === 'not-installed' || state === 'unavailable'}>
              <RotateCw size={13} /> Restart
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

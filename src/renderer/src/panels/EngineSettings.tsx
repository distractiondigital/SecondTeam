import { useState } from 'react'
import { FileText, FolderOpen, Plus, RotateCw, ShieldCheck, Wrench, X } from 'lucide-react'
import { formatBytes } from '../../../shared/backendManifest'
import { useGeneration } from '../state/generation'
import { openWizard, pauseInstall, repair, startInstall, useSetup } from '../state/setup'

// The AI engine's settings: where it lives, what's installed (add a model you skipped), repair,
// the log, and (advanced) using a ComfyUI that's already running somewhere on this PC.

const STATE_LABEL = { installed: 'Installed', missing: 'Not installed', damaged: 'Damaged' } as const

export default function EngineSettings() {
  const open = useSetup((s) => s.settingsOpen)
  const info = useSetup((s) => s.info)
  const progress = useSetup((s) => s.progress)
  const error = useSetup((s) => s.error)
  const checking = useSetup((s) => s.checking)
  const status = useGeneration((s) => s.status)
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  if (!open || !info) return null

  const close = () => useSetup.setState({ settingsOpen: false })
  const busy = info.installing || checking
  const setExternal = async (value: string | null) => {
    setUrlError(null)
    const r = await window.secondTeam.setExternalComfy(value)
    if ('error' in r) setUrlError(r.error)
    else useSetup.setState({ info: r })
  }

  return (
    <div className="board-export-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="board-export engine-settings">
        <div className="board-export-head">
          <b>AI engine</b>
          <button className="pass-close" onClick={close} title="Close">
            <X size={16} />
          </button>
        </div>

        <div className={`engine-status ${status?.state ?? 'starting'}`}>
          <i />
          <span>{status?.message || 'Waiting for the AI engine…'}</span>
          {status?.comfyVersion && <span className="dim">ComfyUI {status.comfyVersion}</span>}
        </div>
        <div className="prop-actions tight">
          <button onClick={() => void window.secondTeam.restartBackend()} disabled={busy || status?.state === 'not-installed'}>
            <RotateCw size={13} /> Restart
          </button>
          <button onClick={() => void window.secondTeam.openBackendLog()}>
            <FileText size={13} /> Open log
          </button>
        </div>

        {info.externalUrl ? (
          <p className="hint small">
            Using the ComfyUI at <b>{info.externalUrl}</b> (Advanced, below). Second Team doesn’t start or update it, and it
            needs the same models and add-on installed.
          </p>
        ) : (
          <>
            <div className="prop-title prop-title-spaced">Location</div>
            <div className="setup-path">
              <span title={info.dir}>{info.dir}</span>
            </div>
            <div className="prop-actions tight">
              <button onClick={() => void window.secondTeam.openBackendFolder()}>
                <FolderOpen size={13} /> Open folder
              </button>
              <button disabled={busy} onClick={() => openWizard('location')}>
                Change…
              </button>
            </div>

            <div className="prop-title prop-title-spaced">Installed</div>
            <div className="engine-items">
              {info.items.map((i) => {
                const state = info.states[i.id]
                return (
                  <div key={i.id} className="engine-item">
                    <span className={`setup-tag ${state === 'installed' ? 'ok' : state === 'damaged' ? 'bad' : ''}`}>{STATE_LABEL[state]}</span>
                    <span className="engine-item-name" title={`${i.description} Licence: ${i.license}`}>
                      {i.name}
                    </span>
                    <span className="dim">{formatBytes(i.size)}</span>
                    {state === 'missing' && !i.required && (
                      <button className="small" disabled={busy} onClick={() => void startInstall([i.id])} title="Download and install it">
                        <Plus size={12} /> Add
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="prop-title prop-title-spaced">Repair</div>
            <p className="hint small">
              Checks every file and downloads again anything missing or damaged. The full check also re-reads every model
              (a few minutes).
            </p>
            <div className="prop-actions tight">
              <button disabled={busy} onClick={() => void repair(false)}>
                <Wrench size={13} /> Repair
              </button>
              <button disabled={busy} onClick={() => void repair(true)}>
                <ShieldCheck size={13} /> Full check
              </button>
              {busy && <button onClick={() => void pauseInstall()}>Stop</button>}
            </div>
            {progress && (
              <div className="setup-current">
                {progress.phase === 'finished'
                  ? progress.message
                  : progress.phase === 'paused'
                    ? progress.message
                    : progress.phase === 'unpack'
                      ? progress.message
                      : progress.message || `${progress.phase === 'verify' ? 'Checking' : 'Downloading'}…`}
                {busy && progress.overallTotal > 0 && (
                  <div className="setup-bar">
                    <i style={{ width: `${(progress.overallDone / progress.overallTotal) * 100}%` }} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {error && <p className="hint small take-error">{error}</p>}

        <details className="engine-advanced">
          <summary>Advanced</summary>
          <p className="hint small">
            Use a ComfyUI that’s already running on this PC (for development). It must have the same models and the
            IP-Adapter add-on.
          </p>
          {info.externalUrl ? (
            <button onClick={() => void setExternal(null)}>Stop using it: go back to the built-in engine</button>
          ) : (
            <div className="engine-url">
              <input className="name-input plain" placeholder="http://127.0.0.1:8188" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button disabled={!url.trim()} onClick={() => void setExternal(url)}>
                Use
              </button>
            </div>
          )}
          {urlError && <p className="hint small take-error">{urlError}</p>}
        </details>
      </div>
    </div>
  )
}

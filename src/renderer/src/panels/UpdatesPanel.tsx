import { ArrowDownCircle, Download, RefreshCw, RotateCcw, X } from 'lucide-react'
import { useUpdates } from '../state/updates'

// The version at the right of the toolbar: a button that opens the Updates panel, highlighted when
// a newer Second Team is available (checked on launch, unless turned off; src/main/updates.ts).

export function VersionBadge() {
  const state = useUpdates((s) => s.state)
  if (!state) return <span className="version" />
  const news = state.status === 'available' || state.status === 'downloading' || state.status === 'ready'
  return (
    <button
      className={`version version-button${news ? ' has-update' : ''}`}
      title={news ? `Second Team ${state.version} is available` : 'Version and updates'}
      onClick={() => useUpdates.setState({ open: true })}
    >
      {news ? (
        <>
          <ArrowDownCircle size={13} /> {state.status === 'ready' ? 'Restart to update' : 'Update'}
        </>
      ) : (
        `v${state.current}`
      )}
    </button>
  )
}

export default function UpdatesPanel() {
  const open = useUpdates((s) => s.open)
  const state = useUpdates((s) => s.state)
  if (!open || !state) return null
  const close = () => useUpdates.setState({ open: false })
  const api = window.secondTeam
  const busy = state.status === 'checking' || state.status === 'downloading'

  let message: string
  switch (state.status) {
    case 'checking':
      message = 'Checking for a newer version…'
      break
    case 'none':
      message = 'Second Team is up to date.'
      break
    case 'available':
      message = `Version ${state.version} is available.`
      break
    case 'downloading':
      message = `Downloading version ${state.version}…${state.percent > 0 ? ` ${state.percent}%` : ''}`
      break
    case 'ready':
      message = `Version ${state.version} is downloaded and ready to install.`
      break
    case 'error':
      message = state.error ?? 'Something went wrong while checking for updates.'
      break
    default:
      message = state.auto ? 'Not checked yet.' : 'Updates are checked only when you ask.'
  }

  return (
    <div className="board-export-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="board-export updates-panel">
        <div className="board-export-head">
          <b>Updates</b>
          <button className="pass-close" onClick={close} title="Close">
            <X size={16} />
          </button>
        </div>
        <p className="updates-current">This is Second Team {state.current}.</p>
        <p className={state.status === 'error' ? 'updates-message error' : 'updates-message'}>{message}</p>
        {state.status === 'downloading' && (
          <div className="updates-bar">
            <div style={{ width: `${state.percent}%` }} />
          </div>
        )}
        {state.notes && (state.status === 'available' || state.status === 'downloading' || state.status === 'ready') && (
          <div className="updates-notes">{state.notes}</div>
        )}
        {state.status === 'ready' && (
          <p className="hint small">
            Second Team closes (asking to save first), Windows asks to allow the installer, and the new version opens. Your projects and the AI engine are kept.
          </p>
        )}
        <div className="updates-actions">
          {state.status === 'available' && (
            <button className="generate-button" onClick={() => void api.downloadUpdate()}>
              <Download size={14} /> {state.canInstall ? 'Download' : 'Download from GitHub'}
            </button>
          )}
          {state.status === 'ready' && (
            <button className="generate-button" onClick={() => void api.installUpdate()}>
              <RotateCcw size={14} /> Restart and update
            </button>
          )}
          {(state.status === 'idle' || state.status === 'checking' || state.status === 'none' || state.status === 'error') && (
            <button className="look-button" disabled={busy} onClick={() => void api.checkForUpdates()}>
              <RefreshCw size={14} /> Check now
            </button>
          )}
        </div>
        <label className="prop-check">
          <input type="checkbox" checked={state.auto} onChange={(e) => void api.setCheckForUpdates(e.target.checked)} />
          Check for updates when Second Team starts
        </label>
        <p className="hint small">Only asks GitHub for the list of Second Team releases; nothing about you or your projects is sent.</p>
      </div>
    </div>
  )
}

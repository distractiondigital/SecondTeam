import { AlertTriangle, Check, FolderOpen, HardDrive, Pause, Play, X } from 'lucide-react'
import { formatBytes, type InstallItem } from '../../../shared/backendManifest'
import type { SetupInfo, SetupProgress } from '../../../shared/setup'
import { useGeneration } from '../state/generation'
import {
  chooseFolder,
  pauseInstall,
  resetToDefaultFolder,
  skipSetup,
  startInstall,
  useSetup,
  type WizardStep
} from '../state/setup'

// First-run setup of the AI engine: check this PC, choose where it goes (or point at files you
// already have), pick the models, download. Everything else in the app works without it.

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'pc', label: 'This PC' },
  { id: 'location', label: 'Location' },
  { id: 'models', label: 'Models' },
  { id: 'download', label: 'Download' }
]

const go = (step: WizardStep) => useSetup.setState({ step, error: null })

/** The pieces this install will add (required + ticked, minus what's already there). */
export function toInstall(info: SetupInfo, ticked: string[]): InstallItem[] {
  return info.items.filter((i) => (i.required || ticked.includes(i.id)) && info.states[i.id] !== 'installed')
}

/** Disk space still needed: room to unpack, minus what's already downloaded. */
export function spaceNeeded(info: SetupInfo, ticked: string[]): number {
  return toInstall(info, ticked).reduce((s, i) => s + Math.max(0, i.diskSize - (info.partial[i.id] ?? 0)), 0)
}

function Row({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  return (
    <div className={`setup-row ${ok ? (warn ? 'warn' : 'ok') : 'bad'}`}>
      {ok && !warn ? <Check size={15} /> : ok ? <AlertTriangle size={15} /> : <X size={15} />}
      <div>{children}</div>
    </div>
  )
}

function PcStep() {
  const check = useSetup((s) => s.check)
  if (!check) return <p className="hint">Checking this PC…</p>
  const gpu = check.gpu
  return (
    <>
      <Row ok={!check.gpuProblem} warn={Boolean(check.gpuNote)}>
        <b>{gpu ? gpu.name : 'Graphics card'}</b>
        {gpu && (
          <span className="dim">
            {' '}
            · {(gpu.vramMB / 1024).toFixed(0)} GB video memory · driver {gpu.driver}
          </span>
        )}
        {check.gpuProblem && <p className="setup-note">{check.gpuProblem}</p>}
        {check.gpuNote && <p className="setup-note">{check.gpuNote}</p>}
      </Row>
      <Row ok={check.unpacker !== null}>
        <b>{check.windows}</b>
        <p className="setup-note">
          {check.unpacker === 'tar'
            ? 'Can unpack the engine with Windows’ own tools.'
            : check.unpacker === '7zip'
              ? 'Will unpack the engine with 7-Zip.'
              : 'This Windows can’t unpack the engine by itself. Install 7-Zip (free, 7-zip.org), then come back.'}
        </p>
      </Row>
      <p className="hint small">
        The AI engine runs on this PC only: nothing you make is sent anywhere. It needs about 25 GB of disk space for
        the engine and both models.
      </p>
    </>
  )
}

function LocationStep() {
  const info = useSetup((s) => s.info)!
  const check = useSetup((s) => s.check)
  const ticked = useSetup((s) => s.ticked)
  const need = spaceNeeded(info, ticked)
  const free = check?.freeBytes ?? null
  return (
    <>
      <div className="prop-title">Install the AI engine and models in</div>
      <div className="setup-path">
        <HardDrive size={15} />
        <span title={info.dir}>{info.dir}</span>
      </div>
      <div className="prop-actions tight">
        <button onClick={() => void chooseFolder('install')}>
          <FolderOpen size={13} /> Change…
        </button>
        {!info.isDefaultDir && <button onClick={() => void resetToDefaultFolder()}>Use the default</button>}
      </div>
      {free !== null && (
        <Row ok={free >= need}>
          {formatBytes(free)} free on this drive
          {need > 0 && <span className="dim"> · needs about {formatBytes(need)}</span>}
          {free < need && <p className="setup-note">Not enough space: free some up, or choose a folder on another drive.</p>}
        </Row>
      )}
      {info.ready && (
        <Row ok>
          <b>Everything is already installed here.</b>
        </Row>
      )}
      <div className="setup-divider" />
      <div className="prop-title">Already have the files?</div>
      <p className="hint small">
        If this PC already has a copy (e.g. from the development setup), point at that folder instead: nothing is copied or
        downloaded, and any missing pieces can be added.
      </p>
      <div className="prop-actions tight">
        <button onClick={() => void chooseFolder('existing')}>
          <FolderOpen size={13} /> Use files I already have…
        </button>
      </div>
    </>
  )
}

function ModelsStep() {
  const info = useSetup((s) => s.info)!
  const ticked = useSetup((s) => s.ticked)
  const toggle = (id: string) =>
    useSetup.setState({ ticked: ticked.includes(id) ? ticked.filter((t) => t !== id) : [...ticked, id] })
  const total = toInstall(info, ticked).reduce((s, i) => s + i.size - (info.partial[i.id] ?? 0), 0)
  return (
    <>
      <div className="setup-items">
        {info.items.map((i) => {
          const installed = info.states[i.id] === 'installed'
          const on = installed || i.required || ticked.includes(i.id)
          return (
            <label key={i.id} className={`setup-item${i.required ? ' required' : ''}`}>
              <input type="checkbox" checked={on} disabled={installed || i.required} onChange={() => toggle(i.id)} />
              <div>
                <div>
                  <b>{i.name}</b> <span className="dim">· {formatBytes(i.size)}</span>
                  {installed && <span className="setup-tag ok">Installed</span>}
                  {!installed && i.required && <span className="setup-tag">Required</span>}
                  {!installed && (info.partial[i.id] ?? 0) > 0 && <span className="setup-tag">Partly downloaded</span>}
                </div>
                <div className="setup-desc">{i.description}</div>
                <div className="setup-licence">Licence: {i.license}</div>
              </div>
            </label>
          )
        })}
      </div>
      <p className="hint small">
        Every model here allows commercial use of what you make. To download: <b>{formatBytes(Math.max(0, total))}</b>
      </p>
    </>
  )
}

function Bar({ value }: { value: number }) {
  return (
    <div className="setup-bar">
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

function timeLeft(p: SetupProgress): string {
  if (p.speed <= 0) return ''
  const s = (p.overallTotal - p.overallDone) / p.speed
  if (s < 90) return 'less than 2 min left'
  if (s < 3600) return `about ${Math.round(s / 60)} min left`
  return `about ${(s / 3600).toFixed(1)} h left`
}

function DownloadStep() {
  const info = useSetup((s) => s.info)!
  const progress = useSetup((s) => s.progress)
  const ticked = useSetup((s) => s.ticked)
  const status = useGeneration((s) => s.status)
  const todo = toInstall(info, ticked)
  const current = progress?.id ? info.items.find((i) => i.id === progress.id) : null

  if (info.ready && !info.installing) {
    return (
      <>
        <Row ok>
          <b>The AI engine is installed.</b>
        </Row>
        <Row ok={status?.state !== 'error'} warn={status?.state !== 'ready'}>
          {status?.state === 'ready' ? 'Running and ready to generate.' : status?.message || 'Starting the AI engine…'}
          {status?.state === 'starting' && <p className="setup-note">The first start takes a minute or two.</p>}
        </Row>
      </>
    )
  }

  return (
    <>
      {!info.installing && !progress && (
        <p className="hint">
          Ready to download {todo.length} item{todo.length === 1 ? '' : 's'}. You can pause at any time, even close the app:
          it carries on from where it stopped.
        </p>
      )}
      {progress && progress.overallTotal > 0 && (
        <>
          <div className="setup-progress-head">
            <span>
              {formatBytes(progress.overallDone)} of {formatBytes(progress.overallTotal)}
            </span>
            <span className="dim">
              {progress.phase === 'download' && progress.speed > 0 && `${formatBytes(progress.speed)}/s · ${timeLeft(progress)}`}
            </span>
          </div>
          <Bar value={progress.overallDone / progress.overallTotal} />
        </>
      )}
      {info.installing && current && (
        <div className="setup-current">
          {progress?.phase === 'unpack'
            ? progress.message
            : progress?.phase === 'verify'
              ? `Checking ${current.name}…`
              : `Downloading ${current.name}`}
          {progress && progress.itemTotal > 0 && progress.phase !== 'unpack' && <Bar value={progress.itemDone / progress.itemTotal} />}
        </div>
      )}
      {progress?.phase === 'paused' && <p className="hint">{progress.message}</p>}
      <ul className="setup-list">
        {info.items
          .filter((i) => i.required || ticked.includes(i.id))
          .map((i) => (
            <li key={i.id} className={info.states[i.id] === 'installed' ? 'done' : progress?.id === i.id && info.installing ? 'now' : ''}>
              {info.states[i.id] === 'installed' ? <Check size={13} /> : <span className="setup-dot" />}
              {i.name} <span className="dim">· {formatBytes(i.size)}</span>
            </li>
          ))}
      </ul>
    </>
  )
}

export default function SetupWizard() {
  const open = useSetup((s) => s.wizardOpen)
  const step = useSetup((s) => s.step)
  const info = useSetup((s) => s.info)
  const check = useSetup((s) => s.check)
  const error = useSetup((s) => s.error)
  const ticked = useSetup((s) => s.ticked)
  if (!open || !info) return null

  const index = STEPS.findIndex((s) => s.id === step)
  const need = spaceNeeded(info, ticked)
  const enoughSpace = check?.freeBytes == null || check.freeBytes >= need
  const close = () => useSetup.setState({ wizardOpen: false })
  const done = info.ready && !info.installing

  let actions: React.ReactNode
  if (step === 'pc') {
    actions = <button className="generate-button" onClick={() => go('location')}>Next</button>
  } else if (step === 'location') {
    actions = (
      <>
        <button onClick={() => go('pc')}>Back</button>
        <button className="generate-button" onClick={() => go(info.ready ? 'download' : 'models')}>
          Next
        </button>
      </>
    )
  } else if (step === 'models') {
    actions = (
      <>
        <button onClick={() => go('location')}>Back</button>
        <button className="generate-button" onClick={() => go('download')}>
          Next
        </button>
      </>
    )
  } else if (done) {
    actions = (
      <button className="generate-button" onClick={close}>
        Start using Second Team
      </button>
    )
  } else if (info.installing) {
    actions = (
      <button onClick={() => void pauseInstall()}>
        <Pause size={13} /> Pause
      </button>
    )
  } else {
    actions = (
      <>
        <button onClick={() => go('models')}>Back</button>
        <button className="generate-button" disabled={!enoughSpace} onClick={() => void startInstall()} title={enoughSpace ? undefined : 'Not enough disk space'}>
          <Play size={13} /> {Object.keys(info.partial).length ? 'Carry on downloading' : 'Download'}
        </button>
      </>
    )
  }

  return (
    <div className="setup-backdrop">
      <div className="setup">
        <div className="setup-head">
          <div>
            <b>Set up the AI engine</b>
            <div className="dim small">So Second Team can turn your shots into pictures, on this PC.</div>
          </div>
          <div className="setup-steps">
            {STEPS.map((s, i) => (
              <span key={s.id} className={i === index ? 'active' : i < index ? 'past' : ''}>
                {i + 1}. {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="setup-body">
          {step === 'pc' && <PcStep />}
          {step === 'location' && <LocationStep />}
          {step === 'models' && <ModelsStep />}
          {step === 'download' && <DownloadStep />}
          {error && <p className="hint small take-error">{error}</p>}
        </div>
        <div className="setup-foot">
          {!done && (
            <button className="link-button" onClick={() => (info.installing ? close() : void skipSetup())} title="Everything except AI frames works without it">
              {info.installing ? 'Hide (keeps downloading)' : 'Set up later'}
            </button>
          )}
          <span className="setup-foot-actions">{actions}</span>
        </div>
      </div>
    </div>
  )
}

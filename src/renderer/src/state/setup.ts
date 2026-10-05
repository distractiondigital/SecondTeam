import { create } from 'zustand'
import type { SetupInfo, SetupProgress, SystemCheck } from '../../../shared/setup'
import { useGeneration } from './generation'

// The setup wizard and engine settings: what's installed where, this PC's check, and the progress
// of a running install or repair. The main process does the work (src/main/backend/installer.ts).

export type WizardStep = 'pc' | 'location' | 'models' | 'download'

interface SetupState {
  info: SetupInfo | null
  check: SystemCheck | null
  progress: SetupProgress | null
  /** Ids ticked in the Models step (required ones are always included by main). */
  ticked: string[]
  wizardOpen: boolean
  step: WizardStep
  settingsOpen: boolean
  /** A Repair / Full check is checking files (before any re-download starts). */
  checking: boolean
  error: string | null
}

export const useSetup = create<SetupState>(() => ({
  info: null,
  check: null,
  progress: null,
  ticked: [],
  wizardOpen: false,
  step: 'pc',
  settingsOpen: false,
  checking: false,
  error: null
}))

const api = () => window.secondTeam

function setInfo(info: SetupInfo): void {
  const before = useSetup.getState().info
  const first = before === null
  useSetup.setState({ info })
  // Models finished installing while the engine was already running: show them in the picker.
  if (before && !before.ready && info.ready) void window.secondTeam.installedModels().then((models) => useGeneration.setState({ models }))
  // Tick the default models the first time (and anything partly downloaded, so it resumes).
  if (first) useSetup.setState({ ticked: info.items.filter((i) => i.default || info.partial[i.id]).map((i) => i.id) })
}

/** Load the install state and listen for progress (once, at startup). Opens the wizard on first run. */
export function connectSetup(): () => void {
  void api()
    .setupInfo()
    .then((info) => {
      setInfo(info)
      if (!info.ready && !info.skipped && !info.externalUrl) openWizard('pc')
    })
  const offInfo = api().onSetupInfo(setInfo)
  const offProgress = api().onSetupProgress((progress) => {
    useSetup.setState({ progress, error: progress.phase === 'error' ? progress.message : null })
  })
  return () => {
    offInfo()
    offProgress()
  }
}

export function openWizard(step: WizardStep = 'pc'): void {
  useSetup.setState({ wizardOpen: true, step, settingsOpen: false, error: null })
  void refreshCheck()
}

export async function refreshCheck(): Promise<void> {
  useSetup.setState({ check: await api().checkSystem() })
}

export async function refreshInfo(): Promise<void> {
  setInfo(await api().setupInfo())
}

export async function chooseFolder(kind: 'install' | 'existing'): Promise<boolean> {
  useSetup.setState({ error: null })
  const r = await api().chooseBackendFolder(kind)
  if ('error' in r) {
    useSetup.setState({ error: r.error })
    return false
  }
  if ('cancelled' in r) return false
  setInfo(r.info)
  void refreshCheck() // free space is per drive
  return true
}

export async function resetToDefaultFolder(): Promise<void> {
  setInfo(await api().useDefaultBackendFolder())
  void refreshCheck()
}

export async function startInstall(ticked = useSetup.getState().ticked): Promise<void> {
  useSetup.setState({ error: null, progress: null })
  const r = await api().startSetup(ticked)
  if ('error' in r) useSetup.setState({ error: r.error })
  else void refreshInfo()
}

export async function pauseInstall(): Promise<void> {
  await api().pauseSetup()
}

export async function skipSetup(): Promise<void> {
  setInfo(await api().skipSetup(true))
  useSetup.setState({ wizardOpen: false })
}

export async function repair(full: boolean): Promise<void> {
  useSetup.setState({ error: null, progress: null, checking: true })
  try {
    const r = await api().repairBackend(full)
    if ('error' in r) useSetup.setState({ error: r.error })
  } finally {
    useSetup.setState({ checking: false })
    void refreshInfo()
  }
}

export function openEngineSettings(): void {
  useSetup.setState({ settingsOpen: true, error: null })
  void refreshInfo()
}

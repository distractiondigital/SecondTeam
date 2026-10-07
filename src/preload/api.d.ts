import type { BoardExportSpec } from '../shared/boardHtml'
import type { SetupInfo, SetupProgress, SystemCheck } from '../shared/setup'
import type { BackendStatus, GenerationEvent, GenerationJob, InstalledModel, TakeInfo, TakeMeta } from '../shared/takes'
import type { UpdateState } from '../shared/updates'
import type { RenderMeta, RenderQuality } from '../shared/renders'

// Shape of the bridge exposed to the UI as `window.secondTeam`.
export interface SecondTeamApi {
  /** 'mac' on a Mac (Cmd instead of Ctrl, AI coming soon), else 'win'. */
  platform: 'mac' | 'win'
  getVersion: () => Promise<string>
  /** Tell the main process whether there are unsaved changes (used when closing the window). */
  setUnsaved: (unsaved: boolean, projectName: string) => void
  /** Close the window without asking again (after a successful save). */
  closeNow: () => void
  /** Main asks the UI to save before closing. Returns an unsubscribe function. */
  onSaveAndClose: (callback: () => void) => () => void

  /** Save a shot's Render (PNG data URL) in the project folder (main/renderFiles.ts). */
  writeRender: (folder: string, sceneId: string, shotId: string, quality: RenderQuality, png: string, meta: RenderMeta) => Promise<{ ok: true } | { error: string }>
  /** Every saved Render in the project (details only). */
  listRenders: (folder: string) => Promise<{ sceneId: string; shotId: string; quality: RenderQuality; meta: RenderMeta }[]>
  /** One saved Render's picture as a data URL, or null. */
  readRender: (folder: string, sceneId: string, shotId: string, quality: RenderQuality) => Promise<string | null>

  /** App updates (main/updates.ts): the current state, and its changes. */
  getUpdateState: () => Promise<UpdateState>
  /** Look for a newer version now (shows any problem, unlike the quiet check on launch). */
  checkForUpdates: () => Promise<void>
  /** Download the newer version (Windows), or open its release page (Mac). */
  downloadUpdate: () => Promise<void>
  /** Close the window (asking about unsaved changes), install the downloaded version and reopen. */
  installUpdate: () => Promise<void>
  /** The "check when Second Team starts" setting. */
  setCheckForUpdates: (auto: boolean) => Promise<void>
  onUpdateState: (callback: (state: UpdateState) => void) => () => void

  /** Ask where to save. Creates Name.secondteam\ and returns its path, or null if cancelled. */
  saveProjectAs: (suggestedName: string) => Promise<{ path: string; name: string } | null>
  /** Ask which project folder to open. */
  openProject: () => Promise<{ path: string; json: string } | { error: string } | null>
  /** Write project.json into a folder previously chosen through saveProjectAs or openProject. */
  writeProject: (folder: string, json: string) => Promise<{ ok: true } | { error: string }>
  /** Projects opened or saved recently, newest first (exists = still on disk; savedAt in ms). */
  recentProjects: () => Promise<{ path: string; name: string; exists: boolean; savedAt: number | null }[]>
  /** Open a project from the recent list (main refuses anything not on its list). */
  openRecentProject: (folder: string) => Promise<{ path: string; json: string } | { error: string } | null>
  /** Take a project off the recent list (the folder itself is left alone). */
  forgetRecentProject: (folder: string) => Promise<void>

  /** The app-wide pose library (poses.json in %LOCALAPPDATA%\SecondTeam), or null if none yet. */
  loadPoseLibrary: () => Promise<string | null>
  savePoseLibrary: (json: string) => Promise<{ ok: true } | { error: string }>
  /** The app-wide style presets (styles.json in %LOCALAPPDATA%\SecondTeam), or null if none yet. */
  loadStyleLibrary: () => Promise<string | null>
  saveStyleLibrary: (json: string) => Promise<{ ok: true } | { error: string }>

  /**
   * Write a shot's render passes into <project>\scenes\<sceneId>\shots\<shotId>\passes\.
   * `files` maps a pass file name (clay.png… passes.json) to its content: PNGs as data URLs, JSON as text.
   */
  writePasses: (
    folder: string,
    sceneId: string,
    shotId: string,
    files: Record<string, string>
  ) => Promise<{ ok: true; path: string } | { error: string }>
  /** Open that passes folder in Explorer. */
  showPassFolder: (folder: string, sceneId: string, shotId: string) => Promise<{ ok: true } | { error: string }>

  /** The AI engine (managed ComfyUI). */
  backendStatus: () => Promise<BackendStatus>
  onBackendStatus: (callback: (status: BackendStatus) => void) => () => void
  restartBackend: () => Promise<void>
  openBackendLog: () => Promise<{ ok: true } | { error: string }>

  /** Human figure data: body.json, body.bin, proxies.json, proxies/<id>.bin|png. */
  readFigureFile: (name: string) => Promise<Uint8Array>

  /** Setup wizard / engine settings. */
  setupInfo: () => Promise<SetupInfo>
  onSetupInfo: (callback: (info: SetupInfo) => void) => () => void
  checkSystem: () => Promise<SystemCheck>
  /** 'install': where to put it; 'existing': a folder that already has the files. */
  chooseBackendFolder: (kind: 'install' | 'existing') => Promise<{ cancelled: true } | { ok: true; info: SetupInfo } | { error: string }>
  useDefaultBackendFolder: () => Promise<SetupInfo>
  /** Install the required pieces plus these ticked ids; progress arrives through onSetupProgress. */
  startSetup: (ticked: string[]) => Promise<{ ok: true } | { error: string }>
  pauseSetup: () => Promise<{ ok: true }>
  onSetupProgress: (callback: (p: SetupProgress) => void) => () => void
  skipSetup: (skipped: boolean) => Promise<SetupInfo>
  repairBackend: (full: boolean) => Promise<{ ok: true; repaired: string[] } | { error: string }>
  setExternalComfy: (url: string | null) => Promise<SetupInfo | { error: string }>
  openBackendFolder: () => Promise<void>
  /** Checkpoints from the manifest that are installed. */
  installedModels: () => Promise<InstalledModel[]>
  /** Start generating; progress arrives through onGenerationEvent. */
  generate: (job: GenerationJob) => Promise<{ ok: true }>
  cancelGeneration: () => Promise<void>
  onGenerationEvent: (callback: (event: GenerationEvent) => void) => () => void
  /** A shot's takes, newest first. */
  listTakes: (folder: string, sceneId: string, shotId: string) => Promise<TakeInfo[]>
  readTake: (
    folder: string,
    sceneId: string,
    shotId: string,
    takeId: string
  ) => Promise<{ image: string; meta: TakeMeta } | { error: string }>
  /** Move a take to the Recycle Bin. */
  deleteTake: (folder: string, sceneId: string, shotId: string, takeId: string) => Promise<{ ok: true } | { error: string }>

  /**
   * Pick images and copy them into the project (assets\cast|props\<id>\ or assets\style\).
   * `room` = how many more the entry can take. Returns the new file names.
   */
  addReferenceImages: (
    folder: string,
    kind: 'cast' | 'props' | 'style',
    ownerId: string | null,
    room: number
  ) => Promise<{ files: string[] } | { error: string }>
  /** Save the image on the clipboard (or image files copied in Explorer) into the project, like addReferenceImages. */
  pasteReferenceImages: (
    folder: string,
    kind: 'cast' | 'props' | 'style',
    ownerId: string | null,
    room: number
  ) => Promise<{ files: string[] } | { error: string }>
  /** A small JPEG data URL of a reference image, or null if it can't be read. */
  referenceThumbnail: (folder: string, kind: 'cast' | 'props' | 'style', ownerId: string | null, file: string) => Promise<string | null>

  /** Storyboard exports into the project's exports folder; returns the file or folder written. */
  exportBoardPdf: (folder: string, spec: BoardExportSpec) => Promise<{ ok: true; path: string } | { error: string }>
  exportBoardPngs: (folder: string, spec: BoardExportSpec) => Promise<{ ok: true; path: string } | { error: string }>
  /** Show an export in Explorer / open it (only inside the project's exports folder). */
  showExport: (folder: string, path: string) => Promise<void>
  openExport: (folder: string, path: string) => Promise<void>

  confirmDiscard: (projectName: string) => Promise<'save' | 'discard' | 'cancel'>
  showError: (message: string) => Promise<void>
}

declare global {
  interface Window {
    secondTeam: SecondTeamApi
  }
}

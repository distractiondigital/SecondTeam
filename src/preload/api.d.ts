import type { BoardExportSpec } from '../shared/boardHtml'
import type { BackendStatus, GenerationEvent, GenerationJob, InstalledModel, TakeInfo, TakeMeta } from '../shared/takes'

// Shape of the bridge exposed to the UI as `window.secondTeam`.
export interface SecondTeamApi {
  getVersion: () => Promise<string>
  /** Tell the main process whether there are unsaved changes (used when closing the window). */
  setUnsaved: (unsaved: boolean, projectName: string) => void
  /** Close the window without asking again (after a successful save). */
  closeNow: () => void
  /** Main asks the UI to save before closing. Returns an unsubscribe function. */
  onSaveAndClose: (callback: () => void) => () => void

  /** Ask where to save. Creates Name.secondteam\ and returns its path, or null if cancelled. */
  saveProjectAs: (suggestedName: string) => Promise<{ path: string; name: string } | null>
  /** Ask which project folder to open. */
  openProject: () => Promise<{ path: string; json: string } | { error: string } | null>
  /** Write project.json into a folder previously chosen through saveProjectAs or openProject. */
  writeProject: (folder: string, json: string) => Promise<{ ok: true } | { error: string }>

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

import { parseProject, ProjectFileError, serializeProject } from '../../../shared/project'
import { hasUnsavedChanges, useDocument } from './documentStore'
import { useAnimatic } from './animaticUi'
import { useUi } from './uiStore'
import { loadRenders, persistRenders, resetRenders } from './renders'

// New / Open / Save / Save As. The project's name is its folder name (Name.secondteam).

const api = () => window.secondTeam

export function projectDisplayName(projectPath: string | null): string {
  if (!projectPath) return useUi.getState().unsavedName
  const folder = projectPath.split(/[\\/]/).filter(Boolean).pop() ?? 'Untitled'
  return folder.replace(/\.secondteam$/i, '')
}

async function writeTo(folder: string): Promise<boolean> {
  const project = useDocument.getState().project
  const json = serializeProject({ ...project, name: projectDisplayName(folder) })
  const result = await api().writeProject(folder, json)
  if ('error' in result) {
    await api().showError(result.error)
    return false
  }
  useDocument.getState().markSaved(project)
  // Renders made before the first save, or kept from before a Save As, go into this folder.
  void persistRenders(folder)
  return true
}

export async function saveProjectAs(): Promise<boolean> {
  const result = await api().saveProjectAs(projectDisplayName(useUi.getState().projectPath))
  if (!result) return false
  useUi.getState().setProjectPath(result.path)
  return writeTo(result.path)
}

export async function saveProject(): Promise<boolean> {
  const path = useUi.getState().projectPath
  return path ? writeTo(path) : saveProjectAs()
}

/** If there are unsaved changes, ask Save / Don't Save / Cancel. Returns true if it's OK to continue. */
async function confirmLeave(): Promise<boolean> {
  if (!hasUnsavedChanges(useDocument.getState())) return true
  const choice = await api().confirmDiscard(projectDisplayName(useUi.getState().projectPath))
  if (choice === 'save') return saveProject()
  return choice === 'discard'
}

export async function newProject(): Promise<void> {
  if (!(await confirmLeave())) return
  useDocument.getState().newProject()
  resetRenders()
  // The board goes back to choosing AI or Clay by itself for each project.
  useUi.getState().setBoardImage(null)
  useAnimatic.getState().reset()
  useUi.getState().setProjectPath(null)
  useUi.getState().select([])
}

export async function openProject(): Promise<void> {
  if (!(await confirmLeave())) return
  await load(await api().openProject())
}

/** The demo scene that ships with the app, as a new unsaved project (Save asks where to keep it). */
export async function openDemoProject(): Promise<void> {
  if (!(await confirmLeave())) return
  const result = await api().openDemoProject()
  if ('error' in result) {
    await api().showError(result.error)
    return
  }
  try {
    const project = parseProject(result.json)
    useDocument.getState().loadProject(project)
    resetRenders()
    const ui = useUi.getState()
    ui.setBoardImage(null)
    useAnimatic.getState().reset()
    ui.setProjectPath(null, project.name)
    ui.select([])
    ui.dismissStart()
    // Shown lit: the golden-hour light is the point of it.
    ui.setShading('clay')
    ui.requestFrame()
  } catch (err) {
    await api().showError(err instanceof ProjectFileError ? err.message : `Couldn't open the demo scene: ${String(err)}`)
  }
}

/** Open a project from the recent list (start screen, or Open ▾ in the toolbar). */
export async function openRecentProject(folder: string): Promise<void> {
  if (!(await confirmLeave())) return
  await load(await api().openRecentProject(folder))
}

async function load(result: Awaited<ReturnType<Window['secondTeam']['openProject']>>): Promise<void> {
  if (!result) return
  if ('error' in result) {
    await api().showError(result.error)
    return
  }
  try {
    const project = parseProject(result.json)
    useDocument.getState().loadProject(project)
    resetRenders()
    useUi.getState().setBoardImage(null)
    useAnimatic.getState().reset()
    useUi.getState().setProjectPath(result.path)
    void loadRenders(result.path)
    useUi.getState().select([])
    useUi.getState().requestFrame()
  } catch (err) {
    const message = err instanceof ProjectFileError ? err.message : `Couldn't open the project: ${String(err)}`
    await api().showError(message)
  }
}

/** Keep the window title and the main process's "unsaved changes" flag up to date. */
export function syncWindowState(): () => void {
  let last = ''
  const update = () => {
    const name = projectDisplayName(useUi.getState().projectPath)
    const unsaved = hasUnsavedChanges(useDocument.getState())
    const title = `Second Team — ${name}${unsaved ? ' •' : ''}`
    if (title === last) return
    last = title
    document.title = title
    api().setUnsaved(unsaved, name)
  }
  update()
  const unsubDoc = useDocument.subscribe(update)
  const unsubUi = useUi.subscribe(update)
  const unsubClose = api().onSaveAndClose(async () => {
    if (await saveProject()) api().closeNow()
  })
  return () => {
    unsubDoc()
    unsubUi()
    unsubClose()
  }
}

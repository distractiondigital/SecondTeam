import { contextBridge, ipcRenderer } from 'electron'
import type { BackendStatus, GenerationEvent } from '../shared/takes'
import type { SecondTeamApi } from './api'

// The UI can only reach the Node side through the functions listed here.
const api: SecondTeamApi = {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  setUnsaved: (unsaved, projectName) => ipcRenderer.send('app:setUnsaved', unsaved, projectName),
  closeNow: () => ipcRenderer.send('app:closeNow'),
  onSaveAndClose: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('app:saveAndClose', listener)
    return () => ipcRenderer.removeListener('app:saveAndClose', listener)
  },

  saveProjectAs: (suggestedName) => ipcRenderer.invoke('project:saveAs', suggestedName),
  openProject: () => ipcRenderer.invoke('project:open'),
  writeProject: (folder, json) => ipcRenderer.invoke('project:write', folder, json),

  loadPoseLibrary: () => ipcRenderer.invoke('poses:load'),
  savePoseLibrary: (json) => ipcRenderer.invoke('poses:save', json),
  loadStyleLibrary: () => ipcRenderer.invoke('styles:load'),
  saveStyleLibrary: (json) => ipcRenderer.invoke('styles:save', json),

  writePasses: (folder, sceneId, shotId, files) => ipcRenderer.invoke('passes:write', folder, sceneId, shotId, files),
  showPassFolder: (folder, sceneId, shotId) => ipcRenderer.invoke('passes:showFolder', folder, sceneId, shotId),

  backendStatus: () => ipcRenderer.invoke('backend:status'),
  onBackendStatus: (callback) => {
    const listener = (_e: unknown, status: BackendStatus) => callback(status)
    ipcRenderer.on('backend:status', listener)
    return () => ipcRenderer.removeListener('backend:status', listener)
  },
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
  openBackendLog: () => ipcRenderer.invoke('backend:openLog'),
  installedModels: () => ipcRenderer.invoke('backend:models'),
  generate: (job) => ipcRenderer.invoke('generate:start', job),
  cancelGeneration: () => ipcRenderer.invoke('generate:cancel'),
  onGenerationEvent: (callback) => {
    const listener = (_e: unknown, event: GenerationEvent) => callback(event)
    ipcRenderer.on('generate:event', listener)
    return () => ipcRenderer.removeListener('generate:event', listener)
  },
  listTakes: (folder, sceneId, shotId) => ipcRenderer.invoke('takes:list', folder, sceneId, shotId),
  readTake: (folder, sceneId, shotId, takeId) => ipcRenderer.invoke('takes:read', folder, sceneId, shotId, takeId),
  deleteTake: (folder, sceneId, shotId, takeId) => ipcRenderer.invoke('takes:delete', folder, sceneId, shotId, takeId),

  addReferenceImages: (folder, kind, ownerId, room) => ipcRenderer.invoke('assets:add', folder, kind, ownerId, room),
  pasteReferenceImages: (folder, kind, ownerId, room) => ipcRenderer.invoke('assets:paste', folder, kind, ownerId, room),
  referenceThumbnail: (folder, kind, ownerId, file) => ipcRenderer.invoke('assets:thumb', folder, kind, ownerId, file),

  confirmDiscard: (projectName) => ipcRenderer.invoke('dialog:confirmDiscard', projectName),
  showError: (message) => ipcRenderer.invoke('dialog:error', message)
}

contextBridge.exposeInMainWorld('secondTeam', api)

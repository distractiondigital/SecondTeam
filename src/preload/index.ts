import { contextBridge, ipcRenderer } from 'electron'
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

  confirmDiscard: (projectName) => ipcRenderer.invoke('dialog:confirmDiscard', projectName),
  showError: (message) => ipcRenderer.invoke('dialog:error', message)
}

contextBridge.exposeInMainWorld('secondTeam', api)

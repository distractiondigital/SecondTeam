import { contextBridge, ipcRenderer } from 'electron'
import type { SecondTeamApi } from './api'

// The UI can only reach the Node side through the functions listed here.
const api: SecondTeamApi = {
  getVersion: () => ipcRenderer.invoke('app:getVersion')
}

contextBridge.exposeInMainWorld('secondTeam', api)

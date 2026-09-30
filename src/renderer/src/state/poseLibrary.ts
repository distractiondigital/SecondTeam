import { create } from 'zustand'
import { sanitizeSavedPoses, type Pose, type SavedPose } from '../../../shared/mannequin'
import { newId } from '../../../shared/project'

// The user's app-wide pose library, available in every project. Stored by the main process
// in %LOCALAPPDATA%\SecondTeam\poses.json and saved immediately after each change.
// (Poses saved into a project live in the project itself; see documentStore.)

interface PoseLibraryState {
  poses: SavedPose[]
  loaded: boolean
  load: () => Promise<void>
  add: (name: string, pose: Pose) => void
  remove: (id: string) => void
}

async function persist(poses: SavedPose[]): Promise<void> {
  const result = await window.secondTeam.savePoseLibrary(JSON.stringify({ version: 1, poses }, null, 2) + '\n')
  if ('error' in result) await window.secondTeam.showError(result.error)
}

export const usePoseLibrary = create<PoseLibraryState>()((set, get) => ({
  poses: [],
  loaded: false,

  load: async () => {
    const json = await window.secondTeam.loadPoseLibrary()
    let poses: SavedPose[] = []
    if (json) {
      try {
        poses = sanitizeSavedPoses(JSON.parse(json).poses)
      } catch {
        poses = []
      }
    }
    set({ poses, loaded: true })
  },

  add: (name, pose) => {
    const poses = [...get().poses, { id: newId(), name, pose: structuredClone(pose) }]
    set({ poses })
    void persist(poses)
  },

  remove: (id) => {
    const poses = get().poses.filter((p) => p.id !== id)
    set({ poses })
    void persist(poses)
  }
}))

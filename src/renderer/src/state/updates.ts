import { create } from 'zustand'
import type { UpdateState } from '../../../shared/updates'

// The app-update state from the main process (src/main/updates.ts), and whether the Updates panel
// is open.

interface UpdatesUi {
  state: UpdateState | null
  open: boolean
}

export const useUpdates = create<UpdatesUi>()(() => ({ state: null, open: false }))

/** Follow the main process's update state. Returns a disconnect function. */
export function connectUpdates(): () => void {
  void window.secondTeam.getUpdateState().then((state) => useUpdates.setState({ state }))
  return window.secondTeam.onUpdateState((state) => useUpdates.setState({ state }))
}

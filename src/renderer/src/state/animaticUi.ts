import { create } from 'zustand'

// The animatic's UI state (Milestone 18): where the playhead is, what's selected, whether it's
// playing. Not saved into project.json and not undoable; the edit itself is in the project.

const TIMELINE_KEY = 'secondteam.animaticTimeline'
const CAPTIONS_KEY = 'secondteam.animaticCaptions'

function remembered(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === 'on'
  } catch {
    return fallback
  }
}

function remember(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off')
  } catch {
    // Not remembered this time; still works.
  }
}

interface AnimaticUiState {
  /** The playhead (frames from the start). */
  playhead: number
  selectedClip: string | null
  /** The player is showing (over the board). */
  playerOpen: boolean
  playing: boolean
  /** The timeline strip under the board is open, not tucked away. Remembered on this PC. */
  timelineOpen: boolean
  /** The player shows each shot's dialogue as a caption. Remembered on this PC. */
  captions: boolean

  setPlayhead: (frame: number) => void
  selectClip: (id: string | null) => void
  openPlayer: (playing?: boolean) => void
  closePlayer: () => void
  setPlaying: (playing: boolean) => void
  setTimelineOpen: (open: boolean) => void
  setCaptions: (on: boolean) => void
  /** A new project: back to the start, nothing selected. */
  reset: () => void
}

export const useAnimatic = create<AnimaticUiState>()((set) => ({
  playhead: 0,
  selectedClip: null,
  playerOpen: false,
  playing: false,
  timelineOpen: remembered(TIMELINE_KEY, true),
  captions: remembered(CAPTIONS_KEY, true),

  setPlayhead: (frame) => set({ playhead: Math.max(0, Math.round(frame)) }),
  selectClip: (selectedClip) => set({ selectedClip }),
  openPlayer: (playing = true) => set({ playerOpen: true, playing }),
  closePlayer: () => set({ playerOpen: false, playing: false }),
  setPlaying: (playing) => set({ playing }),
  setTimelineOpen: (timelineOpen) => {
    remember(TIMELINE_KEY, timelineOpen)
    set({ timelineOpen })
  },
  setCaptions: (captions) => {
    remember(CAPTIONS_KEY, captions)
    set({ captions })
  },
  reset: () => set({ playhead: 0, selectedClip: null, playerOpen: false, playing: false })
}))

import { createContext } from 'react'

/** What SceneNodes is drawing (see SceneNodes.tsx). */
export interface SceneContext {
  /** Shot whose version of the set to draw; null = Master. */
  shotId: string | null
  /** A hidden copy for rendering: no interaction, selection or helpers. */
  passive: boolean
  /** Clay shading: Material colours, scene lights and sky on, shadows. */
  clay: boolean
}

export const SceneNodesContext = createContext<SceneContext>({ shotId: null, passive: false, clay: false })

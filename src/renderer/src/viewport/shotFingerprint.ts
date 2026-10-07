import { hashText } from '../../../shared/renders'
import { environmentFor, sceneForShot, sceneOfShot, useDocument } from '../state/documentStore'

// What a shot's picture depends on: the set as that shot sees it (minus names, notes and
// descriptions), its sky, the floor, the camera body and cast colours. Same fingerprint, same
// picture: thumbnails and Renders that match it are up to date.

/** Fields that never change how a shot looks (left out of its fingerprint). */
const NOT_VISUAL = new Set([
  'name',
  'description',
  'notes',
  'boardText',
  'dialogue',
  'circleTake',
  'locked',
  'propId',
  'descriptions',
  // A shot's own overrides are already applied to its nodes; the rest are readout/prompt settings.
  'overrides',
  'shotNumber',
  'subjectId',
  'sizeOverride',
  'angleOverride',
  'lightingOverride'
])

// Worked out once per version of the project (it only changes when the project does).
let cachedFor: unknown = null
const cache = new Map<string, string>()

function print(shotId: string, withCamera: boolean): string {
  const state = useDocument.getState()
  if (cachedFor !== state.project) {
    cachedFor = state.project
    cache.clear()
  }
  const k = `${shotId}:${withCamera}`
  const hit = cache.get(k)
  if (hit) return hit
  const result = compute(state, shotId, withCamera)
  cache.set(k, result)
  return result
}

function compute(state: ReturnType<typeof useDocument.getState>, shotId: string, withCamera: boolean): string {
  // Other shots' cameras never show in this one's picture; its own is left out of the set's print.
  const nodes = Object.values(sceneForShot(state, shotId)).filter((n) => n.type !== 'camera' || (withCamera && n.id === shotId))
  return hashText(
    JSON.stringify(
      {
        nodes,
        env: environmentFor(state, shotId),
        floor: sceneOfShot(state, shotId).floor,
        camera: withCamera ? state.project.camera : null,
        cast: state.project.cast.map((c) => [c.id, c.color])
      },
      (key, value) => (NOT_VISUAL.has(key) ? undefined : value)
    )
  )
}

/** Everything the shot's picture depends on, its camera included. */
export function shotFingerprint(shotId: string): string {
  return print(shotId, true)
}

/** The set as the shot sees it, without its camera (moving the camera doesn't change it). */
export function setFingerprint(shotId: string): string {
  return print(shotId, false)
}

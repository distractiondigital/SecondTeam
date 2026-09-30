import { sceneLabel } from '../../../shared/project'
import { activateShot } from '../state/actions'
import { activeScene, useDocument } from '../state/documentStore'

// Always says what you're editing: the scene's own set (Scene 01), or one shot's version of it.
export default function EditingBanner() {
  const sceneName = useDocument((s) => sceneLabel(activeScene(s)))
  const shot = useDocument((s) => {
    const n = s.activeShotId ? activeScene(s).nodes[s.activeShotId] : undefined
    return n?.type === 'camera' ? n : null
  })

  if (!shot) {
    return <div className="editing-banner master">Editing: {sceneName}</div>
  }
  return (
    <div className="editing-banner shot">
      Editing: <strong>Shot {shot.shotNumber}</strong> · changes apply to this shot only
      <button className="banner-link" onClick={() => activateShot(null)}>
        Back to {sceneName}
      </button>
    </div>
  )
}

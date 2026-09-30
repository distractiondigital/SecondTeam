import { activateShot } from '../state/actions'
import { activeScene, useDocument } from '../state/documentStore'

// Always says what you're editing: the Master scene, or one shot's version of the set.
export default function EditingBanner() {
  const shot = useDocument((s) => {
    const n = s.activeShotId ? activeScene(s).nodes[s.activeShotId] : undefined
    return n?.type === 'camera' ? n : null
  })

  if (!shot) {
    return <div className="editing-banner master">Editing: Master scene</div>
  }
  return (
    <div className="editing-banner shot">
      Editing: <strong>Shot {shot.shotNumber}</strong> · changes apply to this shot only
      <button className="banner-link" onClick={() => activateShot(null)}>
        Back to Master
      </button>
    </div>
  )
}

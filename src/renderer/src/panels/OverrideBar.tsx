import { ArrowUpToLine, Undo2 } from 'lucide-react'
import { overriddenFields, type OverridableField } from '../../../shared/overrides'
import { activeScene, useDocument } from '../state/documentStore'

// Shown in Properties when the object has been changed in the shot being edited:
// what changed, plus Revert to master / Push to master.

const FIELD_LABELS: Record<OverridableField, string> = {
  position: 'position',
  rotation: 'rotation',
  scale: 'size',
  anchor: 'anchor',
  hidden: 'hidden',
  color: 'colour',
  pose: 'pose',
  height: 'height',
  build: 'build',
  limits: 'joint limits',
  body: 'body',
  appearance: 'clothes and hair',
  expression: 'expression',
  hands: 'hands',
  stops: 'brightness',
  kelvin: 'colour temperature',
  softness: 'softness',
  shadows: 'shadows',
  coneAngle: 'cone angle',
  falloff: 'beam edge'
}

export default function OverrideBar({ id }: { id: string }) {
  const shot = useDocument((s) => {
    const n = s.activeShotId ? activeScene(s).nodes[s.activeShotId] : undefined
    return n?.type === 'camera' ? n : null
  })
  if (!shot) return null
  const fields = overriddenFields(shot.overrides, id)
  const doc = useDocument.getState()

  if (fields.length === 0) {
    return <div className="override-bar quiet">Following Master in Shot {shot.shotNumber}</div>
  }
  return (
    <div className="override-bar">
      <div>
        Changed in Shot {shot.shotNumber}: {fields.map((f) => FIELD_LABELS[f]).join(', ')}
      </div>
      <div className="override-actions">
        <button onClick={() => doc.revertOverride(id)} title="Throw away this shot's changes; follow the Master scene again">
          <Undo2 size={13} /> Revert to master
        </button>
        <button
          onClick={() => doc.pushOverrideToMaster(id)}
          title="Make this shot's version the Master; other shots that haven't changed it follow"
        >
          <ArrowUpToLine size={13} /> Push to master
        </button>
      </div>
    </div>
  )
}

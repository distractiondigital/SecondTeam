import { Maximize2, Minus, Video } from 'lucide-react'
import { deliveryFrame, opticsFor } from '../../../shared/camera'
import { stopLabel } from '../../../shared/depthOfField'
import type { CameraNode } from '../../../shared/project'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { formatLengthLabel } from '../units'
import { CTRL } from '../platform'
import { useFocusSummary } from './FocusControls'

// While a shot is being edited but not looked through: a small live view through its lens in the
// bottom-left corner of the viewport, so the set can be worked on while watching the frame. The
// picture itself is drawn into the 3D canvas underneath (viewport/PipRender.tsx), which also lets
// the mouse steer the camera from inside it, like camera view.

/** The shot the picture-in-picture shows, or null when it shouldn't show. */
export function usePipShot(): CameraNode | null {
  const shotId = useDocument((s) => s.activeShotId)
  const node = useDocument((s) => (shotId ? activeScene(s).nodes[shotId] : undefined))
  const looking = useUi((s) => s.lookThroughId !== null)
  const onSet = useUi((s) => s.view === 'set')
  return node?.type === 'camera' && !looking && onSet ? node : null
}

/** Tell the 3D canvas where the picture goes (null when it unmounts). Stable, so it runs only on mount / unmount. */
const reportElement = (el: HTMLDivElement | null) => useUi.getState().setPipElement(el)

export default function ShotPip() {
  const node = usePipShot()
  const open = useUi((s) => s.pipOpen)
  if (!node) return null
  if (!open) {
    return (
      <button className="shot-pip-tab" title="Show this shot's camera view in the corner" onClick={() => useUi.getState().setPipOpen(true)}>
        <Video size={13} /> Show {node.name}
      </button>
    )
  }
  return <PipWindow node={node} />
}

function PipWindow({ node }: { node: CameraNode }) {
  const kit = useDocument((s) => s.project.camera)
  const units = useUi((s) => s.units)
  const focus = useFocusSummary(node)
  const ratio = deliveryFrame(opticsFor(kit, node.focalLength)).ratio
  const enter = () => useUi.getState().setLookThrough(node.id)
  return (
    <div className="shot-pip">
      <div className="shot-pip-bar">
        <span className="shot-pip-label">
          <strong>{node.name}</strong> · {Math.round(node.focalLength * 10) / 10}mm · {stopLabel(node.aperture)} · Focus{' '}
          {Number.isFinite(focus.focus) ? formatLengthLabel(focus.focus, units) : '∞'}
          {focus.auto ? ' (auto)' : ''}
        </span>
        <button className="icon-button" title="Camera view (or double-click the picture)" onClick={enter}>
          <Maximize2 size={13} />
        </button>
        <button className="icon-button" title="Hide (a tab stays in the corner)" onClick={() => useUi.getState().setPipOpen(false)}>
          <Minus size={13} />
        </button>
      </div>
      <div
        className="shot-pip-picture"
        ref={reportElement}
        style={{ aspectRatio: String(ratio) }}
        title={`Hold the right mouse to look, with W A S D to move · scroll: dolly · ${CTRL}+scroll: zoom · double-click: camera view`}
        onDoubleClick={enter}
      />
    </div>
  )
}

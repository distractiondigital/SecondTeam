import { Crosshair } from 'lucide-react'
import { opticsFor } from '../../../shared/camera'
import { focusRange, rangeLabel, shotFocus, STOPS, stopLabel, type FocusRange } from '../../../shared/depthOfField'
import type { CameraNode } from '../../../shared/project'
import { lookThrough } from '../state/actions'
import { useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { formatLengthLabel, type Units } from '../units'

// The lens stop, focus and depth-of-field readout, shared by a shot's Properties (Lens) and the
// camera view's HUD.

export interface FocusSummary {
  /** Where the lens focuses (m along the axis; Infinity when there's nothing to focus on). */
  focus: number
  /** True when it follows the subject (no focus distance typed). */
  auto: boolean
  range: FocusRange
}

export function useFocusSummary(node: CameraNode): FocusSummary {
  const kit = useDocument((s) => s.project.camera)
  const subjectDepth = useUi((s) => s.shotInfo[node.id]?.subjectDepth)
  const focus = shotFocus(node.focusDistance, subjectDepth)
  return { focus, auto: node.focusDistance === null, range: focusRange(opticsFor(kit, node.focalLength), node.aperture, focus) }
}

/** "sharp 2.6–3.8 m". */
export function sharpLabel(s: FocusSummary, units: Units): string {
  return `sharp ${rangeLabel(s.range, (m) => formatLengthLabel(m, units))}`
}

export function StopSelect({ node, disabled, className }: { node: CameraNode; disabled?: boolean; className?: string }) {
  const stops = STOPS.includes(node.aperture) ? STOPS : [...STOPS, node.aperture].sort((a, b) => a - b)
  return (
    <select
      className={className ?? 'preset-select'}
      value={node.aperture}
      disabled={disabled}
      title="Lens stop: lower = shallower focus (more blur)"
      onChange={(e) => useDocument.getState().updateNode(node.id, { aperture: Number(e.target.value) })}
    >
      {stops.map((n) => (
        <option key={n} value={n}>
          {stopLabel(n)}
        </option>
      ))}
    </select>
  )
}

/** Click to focus: enters camera view if needed, then the next click in the frame sets the focus. */
export function FocusPickButton({ node, disabled, label }: { node: CameraNode; disabled?: boolean; label?: boolean }) {
  const picking = useUi((s) => s.focusPicking)
  return (
    <button
      className={`${label ? 'look-button' : 'icon-button'}${picking ? ' active' : ''}`}
      disabled={disabled}
      title="Click to focus: click anything in the frame (Esc cancels)"
      onClick={() => {
        if (useUi.getState().lookThroughId !== node.id) lookThrough(node.id)
        useUi.getState().setFocusPicking(!picking)
      }}
    >
      <Crosshair size={14} />
      {label && ' Pick'}
    </button>
  )
}

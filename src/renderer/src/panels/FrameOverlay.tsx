import { useEffect, useState, type RefObject } from 'react'
import { X } from 'lucide-react'
import { guideLabel, opticsFor, SENSOR_PRESETS } from '../../../shared/camera'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { formatLengthLabel } from '../units'
import { viewFit, type Rect } from '../viewport/viewFit'
import NumberField from './NumberField'
import { ALT, CTRL } from '../platform'

// Drawn over the viewport while looking through a shot camera: the delivery frame (everything
// outside it shaded), the other frame guides, optional rule of thirds, and the camera HUD.

const box = (r: Rect) => ({ left: r.x, top: r.y, width: r.width, height: r.height })

function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return size
}

export default function FrameOverlay({ container }: { container: RefObject<HTMLElement | null> }) {
  const lookId = useUi((s) => s.lookThroughId)
  const node = useDocument((s) => (lookId ? activeScene(s).nodes[lookId] : undefined))
  const info = useUi((s) => (lookId ? s.shotInfo[lookId] : undefined))
  const units = useUi((s) => s.units)
  const flySpeed = useUi((s) => s.flySpeed)
  const trackpad = useUi((s) => s.navMode === 'trackpad')
  const kit = useDocument((s) => s.project.camera)
  const { width, height } = useSize(container)
  if (!lookId || node?.type !== 'camera' || width === 0) return null

  const fit = viewFit(opticsFor(kit, node.focalLength), width, height)
  const d = fit.delivery
  const sensorName =
    kit.sensor.preset === 'custom' ? `${kit.sensor.width}×${kit.sensor.height} mm` : SENSOR_PRESETS[kit.sensor.preset].label
  const size = node.sizeOverride ?? info?.size?.label
  const angle = node.angleOverride ?? info?.angle
  const lighting = node.lightingOverride ?? info?.lighting

  return (
    <div className="frame-overlay">
      {/* The delivery frame; its huge shadow shades everything outside it. */}
      <div className="frame-delivery" style={box(d)}>
        <span className="frame-tag">{guideLabel(kit.delivery)}</span>
        {kit.thirds && (
          <>
            <div className="thirds v" style={{ left: '33.333%' }} />
            <div className="thirds v" style={{ left: '66.667%' }} />
            <div className="thirds h" style={{ top: '33.333%' }} />
            <div className="thirds h" style={{ top: '66.667%' }} />
          </>
        )}
      </div>
      {kit.delivery !== 'sensor' && <div className="frame-image" style={box(fit.image)} />}
      {fit.guides
        .filter((g) => g.id !== kit.delivery)
        .map((g) => (
          <div key={g.id} className="frame-guide" style={box(g.rect)}>
            <span className="frame-tag">{g.label}</span>
          </div>
        ))}

      <div className="hud hud-top">
        <span className="hud-shot">Shot {node.shotNumber}</span>
        <label className="hud-focal">
          <NumberField
            label="mm"
            value={node.focalLength}
            kind="factor"
            step={0.5}
            min={8}
            max={600}
            onCommit={(focalLength) => useDocument.getState().updateNode(node.id, { focalLength })}
          />
        </label>
        <span>{sensorName}</span>
        {kit.squeeze > 1 && <span>{kit.squeeze.toFixed(1)}× anamorphic</span>}
      </div>

      <button className="hud-exit" onClick={() => useUi.getState().setLookThrough(null)} title="Back to the free view (Esc, ` or Numpad 0)">
        <X size={14} /> Exit camera view
      </button>

      <div className="hud hud-bottom">
        {info && (
          <>
            <span>Height {formatLengthLabel(info.height, units)}</span>
            <span>Tilt {info.tilt.toFixed(1)}°</span>
            {Math.abs(info.roll) >= 0.5 && <span>Roll {info.roll.toFixed(1)}°</span>}
            {info.distance !== null && (
              <span>
                {info.subjectName}: {formatLengthLabel(info.distance, units)}
              </span>
            )}
          </>
        )}
        {(size || angle) && <span className="hud-size">{[size, angle].filter(Boolean).join(' · ')}</span>}
        {lighting && <span className="hud-lighting">{lighting}</span>}
      </div>

      <div className="hud hud-help">
        Hold right mouse (or {ALT} + left): look · +WASD move · Space up · C/Ctrl down · Q/E roll (Ctrl: level) ·{' '}
        {trackpad ? 'Two-finger swipe: dolly · Pinch: zoom' : `Scroll: dolly · ${CTRL}+scroll: zoom`} · ←/→ shots · Esc or `: exit · speed{' '}
        {flySpeed.toFixed(1)} m/s
      </div>
    </div>
  )
}

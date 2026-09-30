import { useState } from 'react'
import { Eye, Trash2 } from 'lucide-react'
import {
  GUIDE_PRESETS,
  guideLabel,
  guideRatio,
  panTiltRoll,
  rotationFromPanTiltRoll,
  SENSOR_PRESET_IDS,
  SENSOR_PRESETS,
  type SensorPreset
} from '../../../shared/camera'
import type { CameraNode, Vec3 } from '../../../shared/project'
import { deleteSelected, lookThrough } from '../state/actions'
import { activeScene, editedNodes, useDocument, type NodePatch } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { formatLengthLabel } from '../units'
import NumberField from './NumberField'

// Properties for a shot camera: shot number, placement (pan/tilt/roll), lens and sensor,
// frame guides and delivery frame, subject and the shot-size / angle readouts, notes.

const SIZE_LABELS = ['Extreme close-up', 'Close-up', 'Medium close-up', 'Medium shot', 'Medium wide shot', 'Wide shot', 'Extreme wide shot']
const ANGLE_LABELS = ['Eye level', 'Slight high angle', 'High angle', 'Overhead', 'Slight low angle', 'Low angle', "Worm's-eye", 'Eye level, Dutch']

function TextCommit(props: { value: string; placeholder?: string; className?: string; onCommit: (v: string) => void }) {
  return (
    <input
      key={props.value}
      className={props.className ?? 'name-input plain'}
      defaultValue={props.value}
      placeholder={props.placeholder}
      onBlur={(e) => {
        if (e.target.value !== props.value) props.onCommit(e.target.value)
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

export default function CameraProperties({ node }: { node: CameraNode }) {
  const doc = useDocument.getState()
  const update = (patch: NodePatch) => doc.updateNode(node.id, patch)
  const disabled = node.locked
  const info = useUi((s) => s.shotInfo[node.id])
  const lookingThrough = useUi((s) => s.lookThroughId === node.id)
  const units = useUi((s) => s.units)
  const nodes = useDocument((s) => activeScene(s).nodes)
  const [customGuide, setCustomGuide] = useState('')
  const ptr = panTiltRoll(node.rotation)

  const subjects = Object.values(nodes).filter((n) => n.type !== 'camera')
  const toggleGuide = (id: string, on: boolean) => {
    const guides = on ? [...node.guides, id] : node.guides.filter((g) => g !== id)
    update({ guides, delivery: !on && node.delivery === id ? 'sensor' : node.delivery })
  }
  const customGuides = node.guides.filter((g) => g.startsWith('custom:'))

  return (
    <>
      <div className="prop-section">
        <div className="camera-heading">
          <span className="prop-title">Shot</span>
          <TextCommit
            className="name-input shot-input"
            value={node.shotNumber}
            onCommit={(v) => v.trim() && update({ shotNumber: v.trim() })}
          />
          <button
            className={`look-button${lookingThrough ? ' active' : ''}`}
            onClick={() => lookThrough(lookingThrough ? null : node.id)}
            title="Look through this camera (Numpad 0)"
          >
            <Eye size={14} /> {lookingThrough ? 'Exit view' : 'Look through'}
          </button>
        </div>
      </div>

      <div className="prop-section">
        <div className="prop-title">Position</div>
        <div className="vec3-row">
          {node.position.map((v, i) => (
            <NumberField
              key={i}
              label={['X', 'Y', 'Z'][i]}
              value={v}
              kind="length"
              disabled={disabled}
              onCommit={(value) => {
                const position = [...node.position] as Vec3
                position[i] = value
                update({ position })
              }}
            />
          ))}
        </div>
        <div className="prop-title prop-title-spaced">Pan · Tilt · Roll</div>
        <div className="vec3-row">
          {(['pan', 'tilt', 'roll'] as const).map((k) => (
            <NumberField
              key={k}
              label={k[0].toUpperCase()}
              value={ptr[k]}
              kind="angle"
              disabled={disabled}
              onCommit={(value) => {
                const next = { ...ptr, [k]: value }
                update({ rotation: rotationFromPanTiltRoll(next.pan, next.tilt, next.roll) })
              }}
            />
          ))}
        </div>
      </div>

      <div className="prop-section">
        <div className="prop-title">Lens & sensor</div>
        <select
          className="preset-select"
          value={node.sensor.preset}
          disabled={disabled}
          onChange={(e) => {
            const preset = e.target.value as SensorPreset
            const size = preset === 'custom' ? node.sensor : SENSOR_PRESETS[preset]
            update({ sensor: { preset, width: size.width, height: size.height } })
          }}
        >
          {SENSOR_PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {SENSOR_PRESETS[id].label}
              {id !== 'custom' ? ` (${SENSOR_PRESETS[id].width} × ${SENSOR_PRESETS[id].height} mm)` : ''}
            </option>
          ))}
        </select>
        {node.sensor.preset === 'custom' && (
          <div className="vec3-row spaced">
            {(['width', 'height'] as const).map((k) => (
              <NumberField
                key={k}
                label={k === 'width' ? 'W mm' : 'H mm'}
                value={node.sensor[k]}
                kind="factor"
                disabled={disabled}
                onCommit={(value) => update({ sensor: { ...node.sensor, [k]: value } })}
              />
            ))}
          </div>
        )}
        <div className="vec3-row spaced">
          <NumberField
            label="Focal mm"
            value={node.focalLength}
            kind="factor"
            disabled={disabled}
            onCommit={(focalLength) => update({ focalLength })}
          />
          <NumberField
            label="Focus"
            value={node.focusDistance ?? 0}
            kind="length"
            disabled={disabled}
            onCommit={(v) => update({ focusDistance: v > 0 ? v : null })}
          />
        </div>
        <div className="prop-title prop-title-spaced">Anamorphic squeeze</div>
        <div className="slider-row">
          <input
            type="range"
            className="slider"
            min={1}
            max={2}
            step={0.1}
            value={node.squeeze}
            disabled={disabled}
            onChange={(e) => update({ squeeze: Number(e.target.value) })}
          />
          <span className="slider-end">{node.squeeze.toFixed(1)}×</span>
        </div>
      </div>

      <div className="prop-section">
        <div className="prop-title">Frame guides</div>
        <div className="guide-grid">
          {GUIDE_PRESETS.map((g) => (
            <label key={g.id} className="prop-check">
              <input
                type="checkbox"
                checked={node.guides.includes(g.id)}
                disabled={disabled}
                onChange={(e) => toggleGuide(g.id, e.target.checked)}
              />
              {g.label}
            </label>
          ))}
          {customGuides.map((g) => (
            <label key={g} className="prop-check">
              <input type="checkbox" checked disabled={disabled} onChange={() => toggleGuide(g, false)} />
              {guideLabel(g)}
            </label>
          ))}
        </div>
        <div className="slider-row spaced">
          <input
            className="name-input plain"
            placeholder="Custom ratio, e.g. 2.2"
            value={customGuide}
            onChange={(e) => setCustomGuide(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const id = `custom:${Number(customGuide.replace(',', '.'))}`
              if (guideRatio(id) !== null && !node.guides.includes(id)) toggleGuide(id, true)
              setCustomGuide('')
            }}
          />
        </div>
        <div className="prop-title prop-title-spaced" title="The frame that gets rendered and sent to the AI">
          Delivery frame
        </div>
        <select
          className="preset-select"
          value={node.delivery}
          disabled={disabled}
          onChange={(e) => update({ delivery: e.target.value })}
        >
          <option value="sensor">Full sensor</option>
          {node.guides.map((g) => (
            <option key={g} value={g}>
              {guideLabel(g)}
            </option>
          ))}
        </select>
        <label className="prop-check">
          <input type="checkbox" checked={node.thirds} disabled={disabled} onChange={(e) => update({ thirds: e.target.checked })} />
          Rule of thirds
        </label>
      </div>

      <div className="prop-section">
        <div className="prop-title">Subject & shot</div>
        <select
          className="preset-select"
          value={node.subjectId ?? ''}
          disabled={disabled}
          onChange={(e) => update({ subjectId: e.target.value || null })}
        >
          <option value="">Auto (nearest figure in frame)</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {info && (
          <div className="readouts">
            <span>Height {formatLengthLabel(info.height, units)}</span>
            <span>Tilt {info.tilt.toFixed(1)}°</span>
            {info.distance !== null && (
              <span>
                To {info.subjectName}: {formatLengthLabel(info.distance, units)}
              </span>
            )}
          </div>
        )}
        <div className="stacked spaced">
          <select
            className="preset-select"
            value={node.sizeOverride ?? ''}
            disabled={disabled}
            onChange={(e) => update({ sizeOverride: e.target.value || null })}
            title="Shot size (auto-detected from the subject, or choose one)"
          >
            <option value="">Auto: {info?.size?.label ?? '—'}</option>
            {SIZE_LABELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select
            className="preset-select"
            value={node.angleOverride ?? ''}
            disabled={disabled}
            onChange={(e) => update({ angleOverride: e.target.value || null })}
            title="Camera angle (auto-detected, or choose one)"
          >
            <option value="">Auto: {info?.angle ?? '—'}</option>
            {ANGLE_LABELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="prop-section">
        <div className="prop-title">Notes</div>
        <textarea
          key={node.id + node.notes}
          className="notes"
          defaultValue={node.notes}
          placeholder="Action, dialogue, lens notes…"
          onBlur={(e) => e.target.value !== node.notes && update({ notes: e.target.value })}
        />
      </div>

      <div className="prop-section prop-checks">
        <label>
          <input type="checkbox" checked={node.hidden} onChange={(e) => update({ hidden: e.target.checked })} />
          Hidden
        </label>
        <label>
          <input type="checkbox" checked={node.locked} onChange={(e) => update({ locked: e.target.checked })} />
          Locked
        </label>
      </div>
      <div className="prop-actions">
        <button onClick={deleteSelected}>
          <Trash2 size={14} /> Delete camera
        </button>
      </div>
    </>
  )
}

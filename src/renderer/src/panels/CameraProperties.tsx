import { useState } from 'react'
import { Eye, Trash2 } from 'lucide-react'
import {
  GUIDE_PRESETS,
  guideLabel,
  guideRatio,
  panTiltRoll,
  rotationFromPanTiltRoll,
  SENSOR_CAMERAS,
  sensorFormat,
  type CameraKit,
  type SensorFormat
} from '../../../shared/camera'
import type { CameraNode, Vec3 } from '../../../shared/project'
import { deleteSelected, lookThrough } from '../state/actions'
import { activeScene, editedNodes, useDocument, type NodePatch } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { formatLengthLabel } from '../units'
import AiFold from './AiFold'
import { FrameDescription, GenerateSection } from './GenerateSection'
import EnvironmentSection from './EnvironmentSection'
import NumberField from './NumberField'
import { FocusPickButton, StopSelect, useFocusSummary } from './FocusControls'
import { rangeLabel } from '../../../shared/depthOfField'

// Properties for a shot: its name, camera placement (pan/tilt/roll), lens, subject, the shot-size /
// angle readouts and notes. Below that, the project-wide camera body: sensor, squeeze, frame guides,
// delivery frame and thirds (the same for every shot).

const SIZE_LABELS = ['Extreme close-up', 'Close-up', 'Medium close-up', 'Medium shot', 'Medium wide shot', 'Wide shot', 'Extreme wide shot']
const ANGLE_LABELS = ['Eye level', 'Slight high angle', 'High angle', 'Overhead', 'Slight low angle', 'Low angle', "Worm's-eye", 'Eye level, Dutch']


export default function CameraProperties({ node }: { node: CameraNode }) {
  const doc = useDocument.getState()
  const update = (patch: NodePatch) => doc.updateNode(node.id, patch)
  const disabled = node.locked
  const info = useUi((s) => s.shotInfo[node.id])
  const lookingThrough = useUi((s) => s.lookThroughId === node.id)
  const units = useUi((s) => s.units)
  const focus = useFocusSummary(node)
  const nodes = useDocument((s) => activeScene(s).nodes)
  const ptr = panTiltRoll(node.rotation)

  const subjects = Object.values(nodes).filter((n) => n.type !== 'camera')

  return (
    <>
      <div className="prop-section">
        <div className="camera-heading">
          <span className="prop-title">Shot</span>
          <span className="shot-name" title="Shots are named in list order; drag them in the Shot list to reorder">
            {node.shotNumber}
          </span>
          <button
            className={`look-button${lookingThrough ? ' active' : ''}`}
            onClick={() => lookThrough(lookingThrough ? null : node.id)}
            title="Look through this camera (Numpad 0)"
          >
            <Eye size={14} /> {lookingThrough ? 'Exit view' : 'Look through'}
          </button>
        </div>
      </div>

      <FrameDescription node={node} />
      <AiFold fold="shot" title="AI generation" hint="Prompt, Generate and the passes for this shot (the whole project's settings are in the AI window)">
        <GenerateSection node={node} />
      </AiFold>

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
        <div className="prop-title">Lens</div>
        <div className="vec3-row">
          <NumberField
            label="Focal mm"
            value={node.focalLength}
            kind="factor"
            step={0.5}
            min={8}
            max={600}
            disabled={disabled}
            onCommit={(focalLength) => update({ focalLength })}
          />
          <NumberField
            label="Focus"
            value={node.focusDistance ?? (Number.isFinite(focus.focus) ? focus.focus : 0)}
            kind="length"
            disabled={disabled}
            onCommit={(v) => update({ focusDistance: v > 0 ? v : null })}
          />
        </div>
        <div className="lens-row">
          <StopSelect node={node} disabled={disabled} className="preset-select lens-stop" />
          <FocusPickButton node={node} disabled={disabled} label />
          {focus.auto ? (
            <span className="hint small">Focus follows the subject</span>
          ) : (
            <button className="look-button" disabled={disabled} title="Focus on the shot's subject again" onClick={() => update({ focusDistance: null })}>
              Auto
            </button>
          )}
        </div>
        <p className="hint small lens-dof">
          {Number.isFinite(focus.focus)
            ? `In focus ${rangeLabel(focus.range, (m) => formatLengthLabel(m, units))} · hyperfocal ${formatLengthLabel(focus.range.hyperfocal, units)}`
            : `Focused at infinity · hyperfocal ${formatLengthLabel(focus.range.hyperfocal, units)}`}
        </p>
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
        <div className="prop-title prop-title-spaced" title="Worked out from the scene's lights; type your own to override">
          Lighting
        </div>
        <input
          key={node.id + (node.lightingOverride ?? '')}
          className="name-input plain"
          defaultValue={node.lightingOverride ?? ''}
          placeholder={info?.lighting ? `Auto: ${info.lighting}` : 'Auto: (no lights in this scene)'}
          title={info?.lighting ? `Auto: ${info.lighting}` : undefined}
          disabled={disabled}
          onBlur={(e) => {
            const text = e.target.value.trim()
            if (text !== (node.lightingOverride ?? '')) update({ lightingOverride: text || null })
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {info?.lighting && !node.lightingOverride && <p className="hint small">{info.lighting}</p>}
      </div>

      <EnvironmentSection node={node} />

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

      <CameraBodySection />

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
          <Trash2 size={14} /> Delete shot
        </button>
      </div>
    </>
  )
}

/** The camera body and format: one setting for every shot in the project. */
function CameraBodySection() {
  const kit = useDocument((s) => s.project.camera)
  const updateKit = (patch: Partial<CameraKit>) => useDocument.getState().updateCameraKit(patch)
  const [customGuide, setCustomGuide] = useState('')
  const toggleGuide = (id: string, on: boolean) => {
    const guides = on ? [...kit.guides, id] : kit.guides.filter((g) => g !== id)
    updateKit({ guides, delivery: !on && kit.delivery === id ? 'sensor' : kit.delivery })
  }
  const customGuides = kit.guides.filter((g) => g.startsWith('custom:'))
  const format = sensorFormat(kit.sensor.preset)
  const camera = format && SENSOR_CAMERAS.find((c) => c.formats.includes(format))
  const brands = [...new Set(SENSOR_CAMERAS.map((c) => c.brand))]
  const pickFormat = (f: SensorFormat) => updateKit({ sensor: { preset: f.id, width: f.width, height: f.height } })

  return (
    <div className="camera-body">
      <div className="camera-body-heading">
        Camera body <span>whole project · shared by every shot</span>
      </div>
        <div className="prop-section">
          <div className="prop-title">Camera</div>
          <select
            className="preset-select"
            value={camera ? `${camera.brand}|${camera.camera}` : 'custom'}
            onChange={(e) => {
              if (e.target.value === 'custom') return updateKit({ sensor: { ...kit.sensor, preset: 'custom' } })
              const next = SENSOR_CAMERAS.find((c) => `${c.brand}|${c.camera}` === e.target.value)
              if (next) pickFormat(next.formats[0])
            }}
          >
            {brands.map((brand) => (
              <optgroup key={brand} label={brand === 'Film' ? 'Film formats' : brand}>
                {SENSOR_CAMERAS.filter((c) => c.brand === brand).map((c) => (
                  <option key={c.camera} value={`${c.brand}|${c.camera}`}>
                    {c.camera}
                    {c.formats.length === 1 ? ` (${c.formats[0].width} × ${c.formats[0].height} mm)` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value="custom">Custom size…</option>
          </select>
          {camera && camera.formats.length > 1 && (
            <>
              <div className="prop-title prop-title-spaced">Format</div>
              <select
                className="preset-select"
                value={kit.sensor.preset}
                onChange={(e) => {
                  const f = sensorFormat(e.target.value)
                  if (f) pickFormat(f)
                }}
              >
                {camera.formats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.format} ({f.width} × {f.height} mm)
                  </option>
                ))}
              </select>
            </>
          )}
          {kit.sensor.preset === 'custom' && (
            <div className="vec3-row spaced">
              {(['width', 'height'] as const).map((k) => (
                <NumberField
                  key={k}
                  label={k === 'width' ? 'W mm' : 'H mm'}
                  value={kit.sensor[k]}
                  kind="factor"
                  step={0.1}
                  min={1}
                  onCommit={(value) => updateKit({ sensor: { ...kit.sensor, [k]: value } })}
                />
              ))}
            </div>
          )}
          <div className="prop-title prop-title-spaced">Anamorphic squeeze</div>
          <div className="slider-row">
            <input
              type="range"
              className="slider"
              min={1}
              max={2}
              step={0.1}
              value={kit.squeeze}
              onChange={(e) => updateKit({ squeeze: Number(e.target.value) })}
            />
            <span className="slider-end">{kit.squeeze.toFixed(1)}×</span>
          </div>
        </div>

        <div className="prop-section">
          <div className="prop-title">Frame guides</div>
          <div className="guide-grid">
            {GUIDE_PRESETS.map((g) => (
              <label key={g.id} className="prop-check">
                <input
                  type="checkbox"
                  checked={kit.guides.includes(g.id)}
                  onChange={(e) => toggleGuide(g.id, e.target.checked)}
                />
                {g.label}
              </label>
            ))}
            {customGuides.map((g) => (
              <label key={g} className="prop-check">
                <input type="checkbox" checked onChange={() => toggleGuide(g, false)} />
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
                if (guideRatio(id) !== null && !kit.guides.includes(id)) toggleGuide(id, true)
                setCustomGuide('')
              }}
            />
          </div>
          <div className="prop-title prop-title-spaced" title="The frame that gets rendered and sent to the AI">
            Delivery frame
          </div>
          <select
            className="preset-select"
            value={kit.delivery}
            onChange={(e) => updateKit({ delivery: e.target.value })}
          >
            <option value="sensor">Full sensor</option>
            {kit.guides.map((g) => (
              <option key={g} value={g}>
                {guideLabel(g)}
              </option>
            ))}
          </select>
          <label className="prop-check">
            <input type="checkbox" checked={kit.thirds} onChange={(e) => updateKit({ thirds: e.target.checked })} />
            Rule of thirds
          </label>
        </div>
    </div>
  )
}

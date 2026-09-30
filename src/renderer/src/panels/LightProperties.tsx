import { Trash2 } from 'lucide-react'
import { panTiltRoll, rotationFromPanTiltRoll } from '../../../shared/camera'
import {
  KELVIN_PRESETS,
  kelvinToRgb,
  LIGHT_LABELS,
  MAX_CONE,
  MAX_KELVIN,
  MAX_STOPS,
  MIN_CONE,
  MIN_KELVIN,
  MIN_STOPS
} from '../../../shared/lighting'
import type { LightNode, Vec3 } from '../../../shared/project'
import { deleteSelected } from '../state/actions'
import { useDocument, type NodePatch } from '../state/documentStore'
import { GestureSlider } from './FigureProperties'
import NumberField from './NumberField'

// Properties for a light: where it is and where it points, brightness in stops, colour
// temperature, softness, shadows, and (spots) the beam.

const HINTS = {
  sun: 'Daylight from one direction. Only its angle matters, not where it sits.',
  point: 'A bare bulb: shines every way and falls off with distance.',
  spot: 'A beam: aim it with the rotate gizmo (E) or Pan/Tilt below.',
  ambient: 'Soft, even fill from the sky. It has no direction and casts no shadows.'
}

export default function LightProperties({ node }: { node: LightNode }) {
  const update = (patch: NodePatch) => useDocument.getState().updateNode(node.id, patch)
  const disabled = node.locked
  const aimed = node.kind === 'sun' || node.kind === 'spot'
  const ptr = panTiltRoll(node.rotation)
  const [r, g, b] = kelvinToRgb(node.kelvin)

  return (
    <>
      <div className="prop-section">
        <input
          key={node.id + node.name}
          className="name-input"
          defaultValue={node.name}
          onBlur={(e) => {
            const name = e.target.value.trim()
            if (name && name !== node.name) update({ name })
            else e.target.value = node.name
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <div className="prop-kind">{LIGHT_LABELS[node.kind]} light</div>
        <p className="hint small">{HINTS[node.kind]}</p>
      </div>

      {node.kind !== 'ambient' && (
        <div className="prop-section">
          {node.kind !== 'sun' && (
            <>
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
            </>
          )}
          {aimed && (
            <>
              <div className={`prop-title${node.kind === 'sun' ? '' : ' prop-title-spaced'}`}>Aim · Pan · Tilt</div>
              <div className="vec3-row">
                {(['pan', 'tilt'] as const).map((k) => (
                  <NumberField
                    key={k}
                    label={k === 'pan' ? 'Pan' : 'Tilt'}
                    value={ptr[k]}
                    kind="angle"
                    disabled={disabled}
                    onCommit={(value) => {
                      const next = { ...ptr, [k]: value }
                      update({ rotation: rotationFromPanTiltRoll(next.pan, next.tilt, 0) })
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="prop-section">
        <div className="prop-title" title="0 = a standard key; +1 stop is twice as bright, -1 half">
          Intensity (stops)
        </div>
        <div className="slider-row">
          <GestureSlider
            value={node.stops}
            min={MIN_STOPS}
            max={MAX_STOPS}
            step={0.1}
            disabled={disabled}
            onChange={(stops) => update({ stops })}
          />
          <div className="slider-value">
            <NumberField
              label=""
              value={node.stops}
              kind="factor"
              step={0.05}
              min={MIN_STOPS}
              max={MAX_STOPS}
              disabled={disabled}
              onCommit={(stops) => update({ stops })}
            />
          </div>
        </div>

        <div className="prop-title prop-title-spaced">Colour temperature</div>
        <div className="slider-row">
          <span className="kelvin-swatch" style={{ background: `rgb(${r * 255}, ${g * 255}, ${b * 255})` }} />
          <GestureSlider
            value={node.kelvin}
            min={MIN_KELVIN}
            max={MAX_KELVIN}
            step={50}
            disabled={disabled}
            onChange={(kelvin) => update({ kelvin })}
          />
          <div className="slider-value">
            <NumberField
              label="K"
              value={node.kelvin}
              kind="factor"
              step={25}
              min={MIN_KELVIN}
              max={MAX_KELVIN}
              disabled={disabled}
              onCommit={(kelvin) => update({ kelvin })}
            />
          </div>
        </div>
        <div className="kelvin-presets">
          {KELVIN_PRESETS.map((p) => (
            <button
              key={p.kelvin}
              className={node.kelvin === p.kelvin ? 'active' : ''}
              disabled={disabled}
              onClick={() => update({ kelvin: p.kelvin })}
              title={`${p.kelvin} K`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {node.kind !== 'ambient' && (
          <>
            <div className="prop-title prop-title-spaced" title="Soft light gives blurred shadow edges">
              Softness
            </div>
            <div className="slider-row">
              <span className="slider-end">Hard</span>
              <GestureSlider
                value={node.softness}
                min={0}
                max={1}
                step={0.01}
                disabled={disabled}
                onChange={(softness) => update({ softness })}
              />
              <span className="slider-end">Soft</span>
            </div>
            <label className="prop-check">
              <input
                type="checkbox"
                checked={node.shadows}
                disabled={disabled}
                onChange={(e) => update({ shadows: e.target.checked })}
              />
              Casts shadows
            </label>
          </>
        )}
      </div>

      {node.kind === 'spot' && (
        <div className="prop-section">
          <div className="prop-title">Beam</div>
          <div className="vec3-row">
            <NumberField
              label="Cone"
              value={node.coneAngle}
              kind="angle"
              min={MIN_CONE}
              max={MAX_CONE}
              disabled={disabled}
              onCommit={(coneAngle) => update({ coneAngle })}
            />
          </div>
          <div className="prop-title prop-title-spaced">Beam edge</div>
          <div className="slider-row">
            <span className="slider-end">Sharp</span>
            <GestureSlider
              value={node.falloff}
              min={0}
              max={1}
              step={0.01}
              disabled={disabled}
              onChange={(falloff) => update({ falloff })}
            />
            <span className="slider-end">Soft</span>
          </div>
        </div>
      )}

      <div className="prop-section prop-checks">
        <label>
          <input type="checkbox" checked={node.hidden} onChange={(e) => update({ hidden: e.target.checked })} />
          Off (hidden)
        </label>
        <label>
          <input type="checkbox" checked={node.locked} onChange={(e) => update({ locked: e.target.checked })} />
          Locked
        </label>
      </div>
      <div className="prop-actions">
        <button onClick={deleteSelected}>
          <Trash2 size={14} /> Delete light
        </button>
      </div>
    </>
  )
}

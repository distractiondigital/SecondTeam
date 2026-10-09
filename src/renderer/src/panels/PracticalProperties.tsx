import { Trash2 } from 'lucide-react'
import { panTiltRoll, rotationFromPanTiltRoll } from '../../../shared/camera'
import { KELVIN_PRESETS, kelvinToRgb, MAX_KELVIN, MAX_STOPS, MIN_KELVIN, MIN_STOPS } from '../../../shared/lighting'
import { PRACTICAL_LABELS, PRACTICAL_RANGES } from '../../../shared/practicals'
import type { PracticalNode, Vec3 } from '../../../shared/project'
import { deleteSelected } from '../state/actions'
import { useDocument, type NodePatch } from '../state/documentStore'
import { LinkSection } from './CastProps'
import { GestureSlider } from './FigureProperties'
import NumberField from './NumberField'

// Properties for a practical (shared/practicals.ts): on/off, brightness and colour temperature like
// a light, its colour, and its own shape (a lamp's height and shade, a bulb's cord, a flashlight's
// beam, a strand's length, sag and bulbs). Its light follows its shape.

const HINTS: Record<PracticalNode['kind'], string> = {
  lamp: 'The bulb lights straight out of the shade (pools above and below); the shade glows with the light that gets through.',
  bulb: 'A bare bulb on its cord: small, hard light every way.',
  flashlight: 'A narrow beam. Aim it with the rotate gizmo (E) or Pan/Tilt below.',
  fairy: 'A strand of small bulbs. Its light comes from a few soft lights along it.'
}

/** A labelled slider with a typed value (metres, degrees or a count). */
function Slider(props: { label: string; title?: string; value: number; min: number; max: number; step: number; unit: string; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <>
      <div className="prop-title prop-title-spaced" title={props.title}>
        {props.label}
      </div>
      <div className="slider-row">
        <GestureSlider value={props.value} min={props.min} max={props.max} step={props.step} disabled={props.disabled} onChange={props.onChange} />
        <div className="slider-value">
          <NumberField label={props.unit} value={props.value} kind="factor" step={props.step} min={props.min} max={props.max} disabled={props.disabled} onCommit={props.onChange} />
        </div>
      </div>
    </>
  )
}

export default function PracticalProperties({ node }: { node: PracticalNode }) {
  const update = (patch: NodePatch) => useDocument.getState().updateNode(node.id, patch)
  const disabled = node.locked
  const [r, g, b] = kelvinToRgb(node.kelvin)
  const ptr = panTiltRoll(node.rotation)
  const label = node.kind === 'lamp' ? (node.height > 1 ? 'Floor lamp' : 'Table lamp') : PRACTICAL_LABELS[node.kind]
  const size = PRACTICAL_RANGES.size[node.kind]

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
        <div className="prop-kind">{label} · practical</div>
        <p className="hint small">{HINTS[node.kind]}</p>
        <label className="prop-check">
          <input type="checkbox" checked={node.on} disabled={disabled} onChange={(e) => update({ on: e.target.checked })} />
          On
        </label>
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
        {node.kind === 'flashlight' && (
          <>
            <div className="prop-title prop-title-spaced">Aim · Pan · Tilt</div>
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

      <div className="prop-section">
        <div className="prop-title" title="0 lights a subject 2 m away like a standard key; +1 stop is twice as bright, -1 half">
          Brightness (stops)
        </div>
        <div className="slider-row">
          <GestureSlider value={node.stops} min={MIN_STOPS} max={MAX_STOPS} step={0.1} disabled={disabled} onChange={(stops) => update({ stops })} />
          <div className="slider-value">
            <NumberField label="" value={node.stops} kind="factor" step={0.05} min={MIN_STOPS} max={MAX_STOPS} disabled={disabled} onCommit={(stops) => update({ stops })} />
          </div>
        </div>
        <div className="prop-title prop-title-spaced">Colour temperature</div>
        <div className="slider-row">
          <span className="kelvin-swatch" style={{ background: `rgb(${r * 255}, ${g * 255}, ${b * 255})` }} />
          <GestureSlider value={node.kelvin} min={MIN_KELVIN} max={MAX_KELVIN} step={50} disabled={disabled} onChange={(kelvin) => update({ kelvin })} />
          <div className="slider-value">
            <NumberField label="K" value={node.kelvin} kind="factor" step={25} min={MIN_KELVIN} max={MAX_KELVIN} disabled={disabled} onCommit={(kelvin) => update({ kelvin })} />
          </div>
        </div>
        <div className="kelvin-presets">
          {KELVIN_PRESETS.map((p) => (
            <button key={p.kelvin} className={node.kelvin === p.kelvin ? 'active' : ''} disabled={disabled} onClick={() => update({ kelvin: p.kelvin })} title={`${p.kelvin} K`}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="prop-check">
          <input type="checkbox" checked={node.shadows} disabled={disabled} onChange={(e) => update({ shadows: e.target.checked })} />
          Casts shadows
        </label>
      </div>

      <div className="prop-section">
        <label className="prop-inline">
          <span className="prop-title">{node.kind === 'lamp' ? 'Shade colour' : node.kind === 'fairy' ? 'Wire colour' : node.kind === 'bulb' ? 'Cord colour' : 'Body colour'}</span>
          <input
            type="color"
            value={node.color}
            disabled={disabled}
            onFocus={() => useDocument.getState().beginGesture('color')}
            onBlur={() => useDocument.getState().endGesture('color')}
            onChange={(e) => update({ color: e.target.value })}
          />
        </label>

        {node.kind === 'lamp' && (
          <>
            <Slider label="Height" value={node.height} {...range(PRACTICAL_RANGES.height.lamp)} step={0.01} unit="m" disabled={disabled} onChange={(height) => update({ height })} />
            <Slider label="Shade width" value={node.size} min={size[0]} max={size[1]} step={0.01} unit="m" disabled={disabled} onChange={(v) => update({ size: v })} />
            <div className="prop-title prop-title-spaced">Shade shape</div>
            <div className="segmented">
              {(['drum', 'cone'] as const).map((shape) => (
                <button key={shape} className={node.shape === shape ? 'active' : ''} disabled={disabled} onClick={() => update({ shape })}>
                  {shape === 'drum' ? 'Drum' : 'Cone'}
                </button>
              ))}
            </div>
            <div className="prop-title prop-title-spaced" title="How much light the shade holds back: a sheer shade glows brightly, a thick one barely">
              Shade thickness · {Math.round(node.density * 100)}%
            </div>
            <div className="slider-row">
              <span className="slider-end">Sheer</span>
              <GestureSlider value={node.density} min={0} max={1} step={0.01} disabled={disabled} onChange={(density) => update({ density })} />
              <span className="slider-end">Thick</span>
            </div>
          </>
        )}
        {node.kind === 'bulb' && (
          <>
            <Slider label="Bulb size" value={node.size} min={size[0]} max={size[1]} step={0.005} unit="m" disabled={disabled} onChange={(v) => update({ size: v })} />
            <Slider label="Cord length" title="0 = no cord" value={node.height} {...range(PRACTICAL_RANGES.height.bulb)} step={0.05} unit="m" disabled={disabled} onChange={(height) => update({ height })} />
          </>
        )}
        {node.kind === 'flashlight' && (
          <>
            <Slider label="Beam angle" value={node.coneAngle} {...range(PRACTICAL_RANGES.coneAngle)} step={1} unit="°" disabled={disabled} onChange={(coneAngle) => update({ coneAngle })} />
            <Slider label="Lens size" value={node.size} min={size[0]} max={size[1]} step={0.005} unit="m" disabled={disabled} onChange={(v) => update({ size: v })} />
          </>
        )}
        {node.kind === 'fairy' && (
          <>
            <Slider label="Length" value={node.length} {...range(PRACTICAL_RANGES.length)} step={0.1} unit="m" disabled={disabled} onChange={(length) => update({ length })} />
            <Slider label="Sag" title="How far the middle hangs below the ends" value={node.sag} {...range(PRACTICAL_RANGES.sag)} step={0.01} unit="m" disabled={disabled} onChange={(sag) => update({ sag })} />
            <Slider label="Bulbs" value={node.count} {...range(PRACTICAL_RANGES.count)} step={1} unit="" disabled={disabled} onChange={(count) => update({ count })} />
          </>
        )}
      </div>

      <LinkSection node={node} />

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
          <Trash2 size={14} /> Delete practical
        </button>
      </div>
    </>
  )
}

const range = ([min, max]: [number, number]) => ({ min, max })

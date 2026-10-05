import { useEffect, useState } from 'react'
import { ArrowLeft, FlipHorizontal2, FolderInput, Library, RotateCcw, Trash2 } from 'lucide-react'
import {
  JOINTS,
  jointLimit,
  MAX_HEIGHT,
  MIN_HEIGHT,
  POSE_PRESETS,
  PRESET_NAMES,
  proportions,
  type JointName,
  type PresetName,
  type SavedPose
} from '../../../shared/mannequin'
import {
  ageSlider,
  ageYears,
  EXPRESSIONS,
  HAND_SHAPES,
  partColor,
  type AppearancePart,
  type HandShape,
  type BodySliders,
  type FigureAppearance,
  type GarmentSlot,
  type ProxyKind
} from '../../../shared/humanBody'
import type { MannequinNode, Vec3 } from '../../../shared/project'
import { useDocument } from '../state/documentStore'
import { usePoseLibrary } from '../state/poseLibrary'
import { useUi } from '../state/uiStore'
import { METRES_PER_FOOT, type Units } from '../units'
import { useCtrlHeld } from '../viewport/gizmoShared'
import { useCatalogue } from '../viewport/humanData'
import NumberField from './NumberField'

// Properties for posable figures: the whole-figure section and the joint-posing section.

/** A slider where one drag is one undo step. */
export function GestureSlider(props: {
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  useEffect(() => {
    // End the gesture even if the mouse is released outside the slider.
    const end = () => useDocument.getState().endGesture('slider')
    window.addEventListener('pointerup', end)
    return () => window.removeEventListener('pointerup', end)
  }, [])
  return (
    <input
      type="range"
      className="slider"
      min={props.min}
      max={props.max}
      step={props.step}
      value={props.value}
      disabled={props.disabled}
      onPointerDown={() => useDocument.getState().beginGesture('slider')}
      onChange={(e) => props.onChange(Number(e.target.value))}
    />
  )
}

/** Hold Ctrl on the height slider to land on whole inches (feet mode) or whole centimetres (metres). */
function snapHeight(metres: number, units: Units): number {
  const unit = units === 'ft' ? METRES_PER_FOOT / 12 : 0.01
  return Math.round(metres / unit) * unit
}

/** Quick bodies: they only set the sliders (and height), so everything stays adjustable. */
const BODY_PRESETS: { label: string; body: Partial<BodySliders>; height?: number }[] = [
  { label: 'Man', body: { gender: 1, age: 0.5, muscle: 0.5, weight: 0.5 }, height: 1.78 },
  { label: 'Woman', body: { gender: 0, age: 0.5, muscle: 0.5, weight: 0.5 }, height: 1.65 },
  { label: 'Child (8)', body: { age: ageSlider(8), muscle: 0.5, weight: 0.5 }, height: 1.28 },
  { label: 'Teenager (15)', body: { age: ageSlider(15), muscle: 0.5, weight: 0.45 }, height: 1.65 },
  { label: 'Elderly (75)', body: { age: ageSlider(75), muscle: 0.35, weight: 0.55 }, height: 1.68 },
  { label: 'Athletic', body: { age: ageSlider(28), muscle: 0.85, weight: 0.45 } },
  { label: 'Heavy', body: { muscle: 0.4, weight: 0.95 } },
  { label: 'Slim', body: { muscle: 0.4, weight: 0.15 } }
]

/** Picker rows for the human's look: what's worn in each part, and its colour. */
const LOOK_ROWS: { part: AppearancePart; label: string; kind: ProxyKind; slot?: GarmentSlot }[] = [
  { part: 'hair', label: 'Hair', kind: 'hair' },
  { part: 'outfit', label: 'Outfit', kind: 'clothes', slot: 'outfit' },
  { part: 'top', label: 'Top', kind: 'clothes', slot: 'top' },
  { part: 'bottom', label: 'Bottom', kind: 'clothes', slot: 'bottom' },
  { part: 'outer', label: 'Outerwear', kind: 'clothes', slot: 'outer' },
  { part: 'shoes', label: 'Shoes', kind: 'clothes', slot: 'shoes' },
  { part: 'hat', label: 'Hat', kind: 'clothes', slot: 'hat' }
]

function LookSection({ node, disabled }: { node: MannequinNode; disabled: boolean }) {
  const doc = useDocument.getState()
  const catalogue = useCatalogue()
  const figureColor = useDocument((s) => (node.castId ? s.project.cast.find((c) => c.id === node.castId)?.color : undefined)) ?? node.color
  const a = node.appearance
  const set = (patch: Partial<FigureAppearance>) => doc.updateNode(node.id, { appearance: { ...a, ...patch } })
  const choose = (row: (typeof LOOK_ROWS)[number], id: string) => {
    if (row.kind === 'hair') return set({ hair: id || null })
    const garments = { ...a.garments }
    if (id) garments[row.slot!] = id
    else delete garments[row.slot!]
    // A full outfit and a separate top/bottom don't mix.
    if (id && row.slot === 'outfit') {
      delete garments.top
      delete garments.bottom
    }
    if (id && (row.slot === 'top' || row.slot === 'bottom')) delete garments.outfit
    set({ garments })
  }
  const recolor = (part: AppearancePart, color: string | null) => {
    const colors = { ...a.colors }
    if (color) colors[part] = color
    else delete colors[part]
    set({ colors })
  }
  return (
    <>
      <div className="prop-title prop-title-spaced">Face & hands</div>
      <div className="look-rows">
        <div className="look-row two">
          <span className="look-label">Expression</span>
          <select className="name-input plain" value={node.expression} disabled={disabled} onChange={(e) => doc.updateNode(node.id, { expression: e.target.value })}>
            {Object.entries(EXPRESSIONS).map(([key, e]) => (
              <option key={key} value={key}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        {(['left', 'right'] as const).map((side) => (
          <div key={side} className="look-row two">
            <span className="look-label">{side === 'left' ? 'Left hand' : 'Right hand'}</span>
            <select
              className="name-input plain"
              value={node.hands[side]}
              disabled={disabled}
              onChange={(e) => doc.updateNode(node.id, { hands: { ...node.hands, [side]: e.target.value as HandShape } })}
            >
              {Object.entries(HAND_SHAPES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="prop-title prop-title-spaced">Look</div>
      <div className="look-rows">
        {LOOK_ROWS.map((row) => {
          const options = catalogue.filter((i) => i.kind === row.kind && (row.slot ? i.slot === row.slot : true))
          if (!options.length) return null
          const value = row.kind === 'hair' ? (a.hair ?? '') : (a.garments[row.slot!] ?? '')
          const own = a.colors[row.part] !== undefined
          return (
            <div key={row.part} className="look-row">
              <span className="look-label">{row.label}</span>
              <select className="name-input plain" value={value} disabled={disabled} onChange={(e) => choose(row, e.target.value)}>
                <option value="">None</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                type="color"
                value={partColor(a, row.part, figureColor)}
                disabled={disabled}
                title={own ? 'Its own colour' : 'Following the figure’s colour (a shade of it); pick to set its own'}
                onFocus={() => doc.beginGesture('lookColor')}
                onBlur={() => doc.endGesture('lookColor')}
                onChange={(e) => recolor(row.part, e.target.value)}
              />
              <button
                className="look-reset"
                disabled={disabled || !own}
                title="Back to a shade of the figure’s colour"
                onClick={() => recolor(row.part, null)}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

/** The human body sliders (MakeHuman's macro sliders). */
function BodySection({ node, disabled }: { node: MannequinNode; disabled: boolean }) {
  const doc = useDocument.getState()
  const set = (patch: Partial<BodySliders>) => doc.updateNode(node.id, { body: { ...node.body, ...patch } })
  const slider = (key: keyof BodySliders, label: string, low: string, high: string, readout?: string) => (
    <>
      <div className="prop-title prop-title-spaced">
        {label} {readout && <span className="dim">{readout}</span>}
      </div>
      <div className="slider-row">
        <span className="slider-end">{low}</span>
        <GestureSlider value={node.body[key]} min={0} max={1} step={0.005} disabled={disabled} onChange={(v) => set({ [key]: v })} />
        <span className="slider-end">{high}</span>
      </div>
    </>
  )
  return (
    <>
      <select
        className="name-input plain prop-title-spaced"
        value=""
        disabled={disabled}
        onChange={(e) => {
          const preset = BODY_PRESETS.find((p) => p.label === e.target.value)
          if (!preset) return
          doc.updateNode(node.id, { body: { ...node.body, ...preset.body }, ...(preset.height ? { height: preset.height } : {}) })
        }}
      >
        <option value="">Body preset…</option>
        {BODY_PRESETS.map((p) => (
          <option key={p.label}>{p.label}</option>
        ))}
      </select>
      {slider('gender', 'Gender', 'Female', 'Male')}
      {slider('age', 'Age', 'Baby', 'Old', `${Math.round(ageYears(node.body.age))} years`)}
      {slider('muscle', 'Muscle', 'Soft', 'Muscular')}
      {slider('weight', 'Weight', 'Thin', 'Heavy')}
    </>
  )
}

export function FigureSection({ node }: { node: MannequinNode }) {
  const doc = useDocument.getState()
  const castName = useDocument((s) => (node.castId ? s.project.cast.find((c) => c.id === node.castId)?.name : undefined))
  const projectPoses = useDocument((s) => s.project.poses)
  const libraryPoses = usePoseLibrary((s) => s.poses)
  const units = useUi((s) => s.units)
  const ctrlHeld = useCtrlHeld()
  const disabled = node.locked
  return (
    <>
      <div className="prop-section">
        <div className="prop-title">Style</div>
        <div className="segmented">
          {(['human', 'mannequin'] as const).map((style) => (
            <button
              key={style}
              className={node.style === style ? 'active' : ''}
              disabled={disabled}
              onClick={() => doc.updateNode(node.id, { style })}
              title={style === 'human' ? 'A realistic person (body sliders below)' : 'The art mannequin'}
            >
              {style === 'human' ? 'Human' : 'Mannequin'}
            </button>
          ))}
        </div>
        {castName && (
          <p className="hint small">
            Body and look are shared with <b>{castName}</b>: changing them here changes every figure linked to {castName} (inside a shot it's just
            this shot).
          </p>
        )}
        {node.style === 'human' && <BodySection node={node} disabled={disabled} />}
        {node.style === 'human' && <LookSection node={node} disabled={disabled} />}
        <div className="prop-title prop-title-spaced" title="Hold Ctrl while dragging the slider for whole inches (ft) or centimetres (m)">
          Height
        </div>
        <div className="slider-row">
          <GestureSlider
            value={node.height}
            min={MIN_HEIGHT}
            max={MAX_HEIGHT}
            step={0.001}
            disabled={disabled}
            onChange={(height) => doc.updateNode(node.id, { height: ctrlHeld ? snapHeight(height, units) : height })}
          />
          <div className="slider-value">
            <NumberField
              label=""
              value={node.height}
              kind="length"
              disabled={disabled}
              onCommit={(height) => doc.updateNode(node.id, { height })}
            />
          </div>
        </div>
        {node.style === 'mannequin' && (
          <>
            <div className="prop-title prop-title-spaced">Build</div>
            <div className="slider-row">
              <span className="slider-end">Slim</span>
              <GestureSlider
                value={node.build}
                min={0}
                max={1}
                step={0.01}
                disabled={disabled}
                onChange={(build) => doc.updateNode(node.id, { build })}
              />
              <span className="slider-end">Broad</span>
            </div>
          </>
        )}
      </div>

      <div className="prop-section">
        <div className="prop-title">Pose</div>
        <select
          className="preset-select"
          value=""
          disabled={disabled}
          onChange={(e) => applyChoice(node.id, e.target.value)}
        >
          <option value="">Apply a preset…</option>
          <optgroup label="Built-in">
            {PRESET_NAMES.map((name) => (
              <option key={name} value={`builtin:${name}`}>
                {POSE_PRESETS[name].label}
              </option>
            ))}
          </optgroup>
          {projectPoses.length > 0 && (
            <optgroup label="This project">
              {projectPoses.map((p) => (
                <option key={p.id} value={`project:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
          {libraryPoses.length > 0 && (
            <optgroup label="My library">
              {libraryPoses.map((p) => (
                <option key={p.id} value={`library:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <div className="prop-actions tight">
          <button disabled={disabled} onClick={() => doc.mirrorPose(node.id)} title="Swap the left and right side of the pose">
            <FlipHorizontal2 size={14} /> Mirror L↔R
          </button>
          <button disabled={disabled} onClick={() => doc.applyPreset(node.id, 'standing')} title="Back to a relaxed standing pose">
            <RotateCcw size={14} /> Reset pose
          </button>
        </div>
        <label className="prop-check" title="Keep every joint inside a natural human range. Turn off to cheat a pose for the lens.">
          <input
            type="checkbox"
            checked={node.limits}
            disabled={disabled}
            onChange={(e) => doc.updateNode(node.id, { limits: e.target.checked })}
          />
          Joint limits
        </label>
        <p className="hint small">Click a body part to pose that joint.</p>
      </div>

      <SavedPoses node={node} />
    </>
  )
}

/** Apply a choice from the preset menu: "builtin:<name>", "project:<id>" or "library:<id>". */
function applyChoice(figureId: string, value: string): void {
  const [source, key] = value.split(':')
  const doc = useDocument.getState()
  if (source === 'builtin') doc.applyPreset(figureId, key as PresetName)
  const saved =
    source === 'project'
      ? doc.project.poses.find((p) => p.id === key)
      : source === 'library'
        ? usePoseLibrary.getState().poses.find((p) => p.id === key)
        : undefined
  if (saved) doc.setPose(figureId, saved.pose)
}

/** Save the current pose, and manage saved poses in the project and the app-wide library. */
function SavedPoses({ node }: { node: MannequinNode }) {
  const [name, setName] = useState('')
  const projectPoses = useDocument((s) => s.project.poses)
  const libraryPoses = usePoseLibrary((s) => s.poses)
  const doc = useDocument.getState()
  const library = usePoseLibrary.getState()
  const trimmed = name.trim()

  const save = (where: 'project' | 'library') => {
    if (!trimmed) return
    if (where === 'project') doc.addProjectPose(trimmed, node.pose)
    else library.add(trimmed, node.pose)
    setName('')
  }

  const row = (pose: SavedPose, where: 'project' | 'library') => (
    <div key={pose.id} className="saved-pose">
      <button
        className="saved-pose-name"
        title="Apply this pose to the selected figure"
        disabled={node.locked}
        onClick={() => doc.setPose(node.id, pose.pose)}
      >
        {pose.name}
      </button>
      <button
        className="icon-button"
        title={where === 'project' ? 'Copy to my library (all projects)' : 'Copy into this project'}
        onClick={() =>
          where === 'project' ? library.add(pose.name, pose.pose) : doc.addProjectPose(pose.name, pose.pose)
        }
      >
        {where === 'project' ? <Library size={14} /> : <FolderInput size={14} />}
      </button>
      <button
        className="icon-button"
        title="Delete this saved pose"
        onClick={() => (where === 'project' ? doc.deleteProjectPose(pose.id) : library.remove(pose.id))}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )

  return (
    <div className="prop-section">
      <div className="prop-title">Saved poses</div>
      <input
        className="name-input plain"
        placeholder="Name this pose…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save('project')}
      />
      <div className="prop-actions tight">
        <button disabled={!trimmed} onClick={() => save('project')} title="Save into this project (travels with the project folder)">
          <FolderInput size={14} /> Save to project
        </button>
        <button disabled={!trimmed} onClick={() => save('library')} title="Save into your library (available in every project)">
          <Library size={14} /> Save to library
        </button>
      </div>
      {projectPoses.length > 0 && (
        <>
          <div className="saved-pose-heading">This project</div>
          {projectPoses.map((p) => row(p, 'project'))}
        </>
      )}
      {libraryPoses.length > 0 && (
        <>
          <div className="saved-pose-heading">My library</div>
          {libraryPoses.map((p) => row(p, 'library'))}
        </>
      )}
    </div>
  )
}

export function JointProperties({ node, joint }: { node: MannequinNode; joint: JointName }) {
  const doc = useDocument.getState()
  const disabled = node.locked
  const rotation = node.pose.joints[joint]
  const limit = node.limits ? jointLimit(joint) : null
  const height = proportions(node.height, node.build).height

  return (
    <>
      <div className="prop-section">
        <button className="back-link" onClick={() => useUi.getState().selectJoint(null)} title="Back to the whole figure (Esc)">
          <ArrowLeft size={14} /> {node.name}
        </button>
        <div className="joint-name">{JOINTS[joint].label}</div>
      </div>

      <div className="prop-section">
        <div className="prop-title" title="X bends forward/back, Y twists, Z swings to the side">
          Rotation
        </div>
        <div className="vec3-row">
          {rotation.map((v, i) => (
            <NumberField
              key={i}
              label={['X', 'Y', 'Z'][i]}
              value={v}
              kind="angle"
              disabled={disabled}
              onCommit={(value) => {
                const next = [...rotation] as Vec3
                next[i] = value
                doc.setJointRotation(node.id, joint, next)
              }}
            />
          ))}
        </div>
        {limit && (
          <p className="hint small">
            Range: X {limit.x[0]}…{limit.x[1]}°, Y {limit.y[0]}…{limit.y[1]}°, Z {limit.z[0]}…{limit.z[1]}°
          </p>
        )}
      </div>

      {joint === 'pelvis' && (
        <div className="prop-section">
          <div className="prop-title" title="Moves the hips from their standing position, e.g. down for sitting">
            Hip offset
          </div>
          <div className="vec3-row">
            {node.pose.pelvisOffset.map((v, i) => (
              <NumberField
                key={i}
                label={['X', 'Y', 'Z'][i]}
                value={v * height}
                kind="length"
                disabled={disabled}
                onCommit={(metres) => {
                  const next = [...node.pose.pelvisOffset] as Vec3
                  next[i] = metres / height
                  doc.setPelvisOffset(node.id, next)
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="prop-actions">
        <button disabled={disabled} onClick={() => doc.resetJoint(node.id, joint)}>
          <RotateCcw size={14} /> Reset joint
        </button>
      </div>
    </>
  )
}

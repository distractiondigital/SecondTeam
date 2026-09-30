import { useEffect } from 'react'
import { ArrowLeft, FlipHorizontal2, RotateCcw } from 'lucide-react'
import {
  JOINTS,
  jointLimit,
  MAX_HEIGHT,
  MIN_HEIGHT,
  POSE_PRESETS,
  PRESET_NAMES,
  proportions,
  type JointName,
  type PresetName
} from '../../../shared/mannequin'
import type { MannequinNode, Vec3 } from '../../../shared/project'
import { useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import NumberField from './NumberField'

// Properties for posable figures: the whole-figure section and the joint-posing section.

/** A slider where one drag is one undo step. */
function GestureSlider(props: {
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  useEffect(() => {
    // End the gesture even if the mouse is released outside the slider.
    const end = () => useDocument.getState().endGesture()
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
      onPointerDown={() => useDocument.getState().beginGesture()}
      onChange={(e) => props.onChange(Number(e.target.value))}
    />
  )
}

export function FigureSection({ node }: { node: MannequinNode }) {
  const doc = useDocument.getState()
  const disabled = node.locked
  return (
    <>
      <div className="prop-section">
        <div className="prop-title">Height</div>
        <div className="slider-row">
          <GestureSlider
            value={node.height}
            min={MIN_HEIGHT}
            max={MAX_HEIGHT}
            step={0.01}
            disabled={disabled}
            onChange={(height) => doc.updateNode(node.id, { height })}
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
      </div>

      <div className="prop-section">
        <div className="prop-title">Pose</div>
        <select
          className="preset-select"
          value=""
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value) doc.applyPreset(node.id, e.target.value as PresetName)
          }}
        >
          <option value="">Apply a preset…</option>
          {PRESET_NAMES.map((name) => (
            <option key={name} value={name}>
              {POSE_PRESETS[name].label}
            </option>
          ))}
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
    </>
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

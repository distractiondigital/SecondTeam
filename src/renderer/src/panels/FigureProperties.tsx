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
import type { MannequinNode, Vec3 } from '../../../shared/project'
import { useDocument } from '../state/documentStore'
import { usePoseLibrary } from '../state/poseLibrary'
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
  const projectPoses = useDocument((s) => s.project.poses)
  const libraryPoses = usePoseLibrary((s) => s.poses)
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

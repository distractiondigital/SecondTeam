import { Lock, Sparkles, Unlock } from 'lucide-react'
import { DEFAULT_NEGATIVE, MAX_TAKES, strictnessToControl, type GenerationSettings } from '../../../shared/prompt'
import type { CameraNode } from '../../../shared/project'
import { useDocument } from '../state/documentStore'
import { currentModel, generateBlocker, generateShot, shotPrompt, useGeneration } from '../state/generation'
import { useUi } from '../state/uiStore'
import NumberField from './NumberField'
import ReferenceImages from './ReferenceImages'

// In a shot's Properties: what's in the frame, the prompt that will be sent, and Generate.
// Below the camera body: the project-wide generation settings (model, style, strictness…).

export function GenerateSection({ node }: { node: CameraNode }) {
  // Re-render when anything that feeds the prompt or the blocker changes.
  useDocument((s) => s.project)
  useUi((s) => s.shotInfo[node.id])
  useUi((s) => s.projectPath)
  useGeneration((s) => s.status)
  useGeneration((s) => s.job)
  useGeneration((s) => s.models)
  const prompt = shotPrompt(node.id)
  const blocker = generateBlocker()
  const running = useGeneration((s) => s.job?.shotId === node.id)

  return (
    <div className="prop-section">
      <div className="prop-title">Frame description</div>
      <textarea
        key={node.id + node.description}
        className="notes"
        defaultValue={node.description}
        placeholder="What's in the frame, e.g. a detective in a trench coat waits in an empty warehouse"
        disabled={node.locked}
        onBlur={(e) =>
          e.target.value !== node.description && useDocument.getState().updateNode(node.id, { description: e.target.value })
        }
      />
      <div className="prop-title prop-title-spaced" title="Built from the description, shot size and angle, lens, lighting and the project style">
        Prompt
      </div>
      <p className="prompt-preview">{prompt || '—'}</p>
      <div className="prop-actions">
        <button
          className="generate-button"
          disabled={Boolean(blocker)}
          onClick={() => void generateShot(node.id)}
          title={blocker ?? 'Render the passes and generate takes for this shot'}
        >
          <Sparkles size={14} /> {running ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {blocker && !running && <p className="hint small">{blocker}</p>}
    </div>
  )
}

export function GenerationSettingsSection() {
  const g = useDocument((s) => s.project.generation)
  const style = useDocument((s) => s.project.styleText)
  const styleImages = useDocument((s) => s.project.styleImages)
  const models = useGeneration((s) => s.models)
  const model = useGeneration(() => currentModel())
  const update = (patch: Partial<GenerationSettings>) => useDocument.getState().updateGeneration(patch)
  // Setting any ControlNet value by hand switches strictness to Custom.
  const control = (patch: Partial<GenerationSettings>) => update({ ...patch, strictness: null })

  return (
    <div className="camera-body">
      <div className="camera-body-heading">
        Generation <span>whole project · used by every shot</span>
      </div>
      <div className="prop-section">
        <div className="prop-title">Model</div>
        <select
          className="preset-select"
          value={model?.file ?? ''}
          disabled={!models.length}
          onChange={(e) => update({ checkpoint: e.target.value })}
        >
          {!models.length && <option value="">No models yet (the AI engine isn't ready)</option>}
          {models.map((m) => (
            <option key={m.file} value={m.file}>
              {m.name}
            </option>
          ))}
        </select>
        {model && (
          <p className="hint small">
            {model.style} Licence: {model.license} (commercial use allowed).
          </p>
        )}

        <div className="prop-title prop-title-spaced">Style</div>
        <input
          key={style}
          className="name-input plain"
          defaultValue={style}
          placeholder="e.g. moody 16mm film still, green tint · or · pencil sketchbook drawing"
          onBlur={(e) => useDocument.getState().setStyleText(e.target.value.trim())}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />

        <div className="prop-title prop-title-spaced" title="Images that set the look of every shot: a film still, an artbook page, a sketch. Applied gently, together with the Style text.">
          Style reference
        </div>
        <ReferenceImages kind="style" ownerId={null} images={styleImages} onChange={(images) => useDocument.getState().setStyleImages(images)} />
        {styleImages.length > 0 && (
          <div className="slider-row">
            <span className="slider-end">Subtle</span>
            <input
              type="range"
              className="slider"
              min={0}
              max={1}
              step={0.05}
              value={g.styleStrength}
              onPointerDown={() => useDocument.getState().beginGesture('styleStrength')}
              onPointerUp={() => useDocument.getState().endGesture('styleStrength')}
              onChange={(e) => update({ styleStrength: Number(e.target.value) })}
            />
            <span className="slider-end">Strong</span>
          </div>
        )}

        <div className="prop-title prop-title-spaced" title="How closely the image follows the shapes of your set (the depth pass). Figures follow their pose skeletons at any setting.">
          Strictness {g.strictness === null && <span className="dim">· Custom</span>}
        </div>
        <div className="slider-row">
          <span className="slider-end">Loose</span>
          <input
            type="range"
            className="slider"
            min={0}
            max={1}
            step={0.05}
            value={g.strictness ?? 0.5}
            onPointerDown={() => useDocument.getState().beginGesture('strictness')}
            onPointerUp={() => useDocument.getState().endGesture('strictness')}
            onChange={(e) => {
              const s = Number(e.target.value)
              update({ strictness: s, ...strictnessToControl(s) })
            }}
          />
          <span className="slider-end">Traces blocking</span>
        </div>

        <div className="vec3-row spaced">
          <NumberField
            label="Takes"
            value={g.takes}
            kind="factor"
            step={1}
            min={1}
            max={MAX_TAKES}
            onCommit={(takes) => update({ takes: Math.round(takes) })}
          />
          <NumberField
            label="Seed"
            value={g.seed}
            kind="factor"
            step={1}
            min={0}
            onCommit={(seed) => update({ seed: Math.round(seed), seedLocked: true })}
          />
          <button
            className={`seed-lock${g.seedLocked ? ' active' : ''}`}
            onClick={() => update({ seedLocked: !g.seedLocked })}
            title={g.seedLocked ? 'Seed locked: every Generate starts from this seed' : 'Seed unlocked: a new random seed each Generate'}
          >
            {g.seedLocked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
        </div>

        <details className="advanced">
          <summary>Advanced</summary>
          <div className="vec3-row spaced">
            <NumberField label="Steps" value={g.steps} kind="factor" step={1} min={1} max={150} onCommit={(steps) => update({ steps: Math.round(steps) })} />
            <NumberField label="CFG" value={g.cfg} kind="factor" step={0.5} min={1} max={20} onCommit={(cfg) => update({ cfg })} />
          </div>
          <div className="prop-title prop-title-spaced" title="ControlNet: how strongly, and over which part of the steps, the depth pass guides the image">
            Depth guide · strength · start · end
          </div>
          <div className="vec3-row">
            <NumberField label="Str" value={g.strength} kind="factor" step={0.05} min={0} max={1.5} onCommit={(strength) => control({ strength })} />
            <NumberField label="Start" value={g.start} kind="factor" step={0.05} min={0} max={1} onCommit={(start) => control({ start })} />
            <NumberField label="End" value={g.end} kind="factor" step={0.05} min={0} max={1} onCommit={(end) => control({ end })} />
          </div>
          <div className="prop-title prop-title-spaced" title="How firmly figures follow their pose skeletons (the pose pass). Skipped when no figure is in frame.">
            Pose guide · strength · end
          </div>
          <div className="vec3-row">
            <NumberField label="Str" value={g.poseStrength} kind="factor" step={0.05} min={0} max={1.5} onCommit={(poseStrength) => update({ poseStrength })} />
            <NumberField label="End" value={g.poseEnd} kind="factor" step={0.05} min={0} max={1} onCommit={(poseEnd) => update({ poseEnd })} />
          </div>
          <div className="prop-title prop-title-spaced" title="Cast and props: how soft the edge of each one's area is (pixels), and at what point in the steps their reference images stop guiding. Raise Feather or lower End if one character's look leaks onto another.">
            Cast & props · feather · reference end
          </div>
          <div className="vec3-row">
            <NumberField label="Feather" value={g.feather} kind="factor" step={1} min={0} max={64} onCommit={(feather) => update({ feather: Math.round(feather) })} />
            <NumberField label="End" value={g.referenceEnd} kind="factor" step={0.05} min={0.1} max={1} onCommit={(referenceEnd) => update({ referenceEnd })} />
          </div>
          <div className="prop-title prop-title-spaced">Negative prompt</div>
          <textarea
            key={g.negative}
            className="notes"
            defaultValue={g.negative}
            onBlur={(e) => e.target.value !== g.negative && update({ negative: e.target.value })}
          />
          {g.negative !== DEFAULT_NEGATIVE && (
            <button className="link-button" onClick={() => update({ negative: DEFAULT_NEGATIVE })}>
              Reset to default
            </button>
          )}
        </details>
      </div>
    </div>
  )
}

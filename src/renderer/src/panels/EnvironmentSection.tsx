import { clockText, skyAt, timeLabel } from '../../../shared/environment'
import type { CameraNode } from '../../../shared/project'
import { activeScene, environmentFor, useDocument } from '../state/documentStore'

// A shot's environment: time of day (sky + fill in the Clay look, and the prompt) and the ground
// colour. It belongs to the scene; "This shot" gives the shot its own, like other per-shot changes.

// The slider's track shows the sky round the clock.
const TRACK = `linear-gradient(to right, ${Array.from({ length: 25 }, (_, h) => skyAt(h).horizon).join(', ')})`

export default function EnvironmentSection({ node }: { node: CameraNode }) {
  const doc = useDocument.getState()
  const scene = useDocument((s) => activeScene(s))
  const env = useDocument((s) => environmentFor(s, node.id))
  const own = Boolean(node.environment)
  const set = (patch: Parameters<typeof doc.setEnvironment>[1]) => doc.setEnvironment(node.id, patch)
  const sceneName = `Scene ${String(scene.number).padStart(2, '0')}`

  return (
    <div className="prop-section">
      <div className="prop-title">Environment</div>
      <div className="segmented env-scope">
        <button
          className={own ? '' : 'active'}
          onClick={() => doc.setShotOwnEnvironment(node.id, false)}
          title={`Use ${sceneName}'s time of day and ground (changes here change every shot that follows the scene)`}
        >
          {sceneName}
        </button>
        <button
          className={own ? 'active' : ''}
          onClick={() => doc.setShotOwnEnvironment(node.id, true)}
          title={`Give shot ${node.shotNumber} its own time of day and ground`}
        >
          This shot only
        </button>
      </div>

      <div className="prop-title prop-title-spaced">
        Time of day{' '}
        <span className="dim">
          {clockText(env.time)} · {timeLabel(env.time)}
        </span>
      </div>
      <input
        type="range"
        className="slider env-time"
        style={{ background: TRACK }}
        min={0}
        max={24}
        step={0.25}
        value={env.time}
        onPointerDown={() => doc.beginGesture('envTime')}
        onPointerUp={() => doc.endGesture('envTime')}
        onChange={(e) => set({ time: Number(e.target.value) })}
      />
      <div className="env-ticks">
        <span>Night</span>
        <span>Sunrise</span>
        <span>Midday</span>
        <span>Sunset</span>
        <span>Night</span>
      </div>

      <label className="prop-inline prop-title-spaced">
        <span className="prop-title">Ground</span>
        <input
          type="color"
          value={env.ground}
          onFocus={() => doc.beginGesture('envGround')}
          onBlur={() => doc.endGesture('envGround')}
          onChange={(e) => set({ ground: e.target.value })}
        />
      </label>
      <p className="hint small">Seen in Clay shading, camera view and clay renders; the time of day also goes into the prompt.</p>
    </div>
  )
}

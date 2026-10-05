import { MIN_SCALE, type Anchor, type SceneNode, type Vec3 } from '../../../shared/project'
import { PRIMITIVES, supportsAnchor } from '../../../shared/primitives'
import { deleteSelected, groupSelected, ungroupSelected } from '../state/actions'
import { activeScene, editedNodes, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import CameraProperties from './CameraProperties'
import { EntityProperties, LinkSection } from './CastProps'
import LightProperties from './LightProperties'
import OverrideBar from './OverrideBar'
import { FigureSection, JointProperties } from './FigureProperties'
import NumberField, { type NumberKind } from './NumberField'

const AXES = ['X', 'Y', 'Z'] as const
const SIZE_LABELS = ['W', 'H', 'D'] as const
const MIN_SIZE = 0.001 // metres

const ANCHOR_OPTIONS: { anchor: Anchor; label: string; title: string }[] = [
  { anchor: 'bottom', label: 'Bottom', title: 'Scale and rotate from the base. Growing it taller keeps it on the floor.' },
  { anchor: 'center', label: 'Middle', title: 'Scale and rotate from the centre.' },
  { anchor: 'top', label: 'Top', title: 'Scale and rotate from the top, e.g. something hanging from a ceiling.' }
]

function Vec3Row(props: {
  title: string
  labels: readonly string[]
  values: Vec3
  kind: NumberKind
  disabled: boolean
  onChange: (next: Vec3) => void
  /** Which components to show (e.g. a plane has no height). */
  show?: [boolean, boolean, boolean]
  min?: number
}) {
  return (
    <div className="prop-section">
      <div className="prop-title">{props.title}</div>
      <div className="vec3-row">
        {props.values.map((v, i) =>
          props.show && !props.show[i] ? null : (
            <NumberField
              key={i}
              label={props.labels[i]}
              value={v}
              kind={props.kind}
              disabled={props.disabled}
              min={props.min}
              onCommit={(value) => {
                const next = [...props.values] as Vec3
                next[i] = value
                props.onChange(next)
              }}
            />
          )
        )}
      </div>
    </div>
  )
}

function NodeProperties({ node }: { node: SceneNode }) {
  const update = useDocument.getState().updateNode
  const disabled = node.locked
  const isPrimitive = node.type === 'primitive'
  const base = isPrimitive ? PRIMITIVES[node.primitive].baseSize : null

  return (
    <>
      <div className="prop-section">
        <input
          key={node.id + node.name}
          className="name-input"
          defaultValue={node.name}
          onBlur={(e) => {
            const name = e.target.value.trim()
            if (name && name !== node.name) update(node.id, { name })
            else e.target.value = node.name
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <div className="prop-kind">
          {node.type === 'primitive' ? PRIMITIVES[node.primitive].label : node.type === 'mannequin' ? 'Figure' : 'Group'}
        </div>
      </div>

      <LinkSection node={node} />

      <Vec3Row
        title="Position"
        labels={AXES}
        values={node.position}
        kind="length"
        disabled={disabled}
        onChange={(position) => update(node.id, { position })}
      />
      <Vec3Row
        title="Rotation"
        labels={AXES}
        values={node.rotation}
        kind="angle"
        disabled={disabled}
        onChange={(rotation) => update(node.id, { rotation })}
      />
      {base ? (
        <Vec3Row
          title="Size"
          labels={SIZE_LABELS}
          values={node.scale.map((s, i) => s * base[i]) as Vec3}
          kind="length"
          disabled={disabled}
          min={MIN_SIZE}
          show={base.map((b) => b > 0) as [boolean, boolean, boolean]}
          onChange={(size) =>
            update(node.id, { scale: size.map((s, i) => (base[i] > 0 ? s / base[i] : node.scale[i])) as Vec3 })
          }
        />
      ) : node.type === 'mannequin' ? (
        <FigureSection node={node} />
      ) : (
        <Vec3Row
          title="Scale"
          labels={AXES}
          values={node.scale}
          kind="factor"
          disabled={disabled}
          min={MIN_SCALE}
          onChange={(scale) => update(node.id, { scale })}
        />
      )}

      {node.type === 'primitive' && supportsAnchor(node.primitive) && (
        <div className="prop-section">
          <div className="prop-inline">
            <span className="prop-title" title="The point the object scales and rotates around. Its position is this point.">
              Anchor
            </span>
            <div className="segmented">
              {ANCHOR_OPTIONS.map((o) => (
                <button
                  key={o.anchor}
                  className={node.anchor === o.anchor ? 'active' : ''}
                  disabled={disabled}
                  title={o.title}
                  onClick={() => useDocument.getState().setAnchor(node.id, o.anchor)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {(node.type === 'primitive' || node.type === 'mannequin') && (
        <div className="prop-section">
          <label className="prop-inline">
            <span className="prop-title">Material</span>
            <input
              type="color"
              value={node.color}
              disabled={disabled}
              // The picker sends many changes while you drag; record them as one undo step.
              onFocus={() => useDocument.getState().beginGesture('color')}
              onBlur={() => useDocument.getState().endGesture('color')}
              onChange={(e) => update(node.id, { color: e.target.value })}
            />
          </label>
        </div>
      )}

      <div className="prop-section prop-checks">
        <label>
          <input type="checkbox" checked={node.hidden} onChange={(e) => update(node.id, { hidden: e.target.checked })} />
          Hidden
        </label>
        <label>
          <input type="checkbox" checked={node.locked} onChange={(e) => update(node.id, { locked: e.target.checked })} />
          Locked
        </label>
      </div>

      <div className="prop-actions">
        {node.type === 'group' && <button onClick={ungroupSelected}>Ungroup</button>}
        <button onClick={deleteSelected}>Delete</button>
      </div>
    </>
  )
}

export default function PropertiesPanel() {
  const selection = useUi((s) => s.selection)
  const selectedJoint = useUi((s) => s.selectedJoint)
  const nodes = useDocument((s) => editedNodes(s))
  const live = selection.filter((id) => id in nodes)
  const single = live.length === 1 ? nodes[live[0]] : null
  const entity = useUi((s) => s.entity)

  if (entity && live.length === 0) {
    return (
      <aside className="panel properties">
        <div className="panel-header">{entity.kind === 'cast' ? 'Cast member' : 'Prop'}</div>
        <div className="panel-body">
          <EntityProperties kind={entity.kind} id={entity.id} />
        </div>
      </aside>
    )
  }

  if (single?.type === 'camera') {
    return (
      <aside className="panel properties">
        <div className="panel-header">Camera</div>
        <div className="panel-body">
          <CameraProperties node={single} />
        </div>
      </aside>
    )
  }

  if (single?.type === 'light') {
    return (
      <aside className="panel properties">
        <div className="panel-header">Light</div>
        <div className="panel-body">
          <OverrideBar id={single.id} />
          <LightProperties node={single} />
        </div>
      </aside>
    )
  }

  if (single?.type === 'mannequin' && selectedJoint) {
    return (
      <aside className="panel properties">
        <div className="panel-header">Pose joint</div>
        <div className="panel-body">
          <OverrideBar id={single.id} />
          <JointProperties node={single} joint={selectedJoint} />
        </div>
      </aside>
    )
  }

  return (
    <aside className="panel properties">
      <div className="panel-header">Properties</div>
      <div className="panel-body">
        {live.length === 0 && <p className="hint">Nothing selected. Click an object in the viewport or the outliner.</p>}
        {live.length === 1 && (
          <>
            <OverrideBar id={live[0]} />
            <NodeProperties node={nodes[live[0]]} />
          </>
        )}
        {live.length > 1 && (
          <>
            <p className="hint">
              {live.length} objects selected. Move (W) or rotate (E) them together with the gizmo; group them (Ctrl+G) to keep them together or scale them.
            </p>
            <div className="prop-actions">
              <button onClick={groupSelected}>Group</button>
              <button onClick={deleteSelected}>Delete</button>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}

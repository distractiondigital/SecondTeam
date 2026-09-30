import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { sceneLabel, type CastMember, type Prop, type SceneNode } from '../../../shared/project'
import { useDocument } from '../state/documentStore'
import { useUi, type LeftTab } from '../state/uiStore'
import Outliner from './Outliner'
import ReferenceImages from './ReferenceImages'

// Cast and Props: the project's characters and story objects, each with a description and
// reference images, linked to figures and objects in the set. The left column gets tabs
// (Outliner | Cast | Props); a selected entry is edited in Properties.

const TABS: { tab: LeftTab; label: string }[] = [
  { tab: 'outliner', label: 'Outliner' },
  { tab: 'cast', label: 'Cast' },
  { tab: 'props', label: 'Props' }
]

export default function LeftTabs() {
  const tab = useUi((s) => s.leftTab)
  return (
    <div className="left-tabs">
      <div className="tab-bar">
        {TABS.map((t) => (
          <button key={t.tab} className={tab === t.tab ? 'active' : ''} onClick={() => useUi.getState().setLeftTab(t.tab)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'outliner' ? <Outliner /> : <EntityList kind={tab === 'cast' ? 'cast' : 'prop'} />}
    </div>
  )
}

/** Every figure / object linked to an entry, across all scenes. */
function useLinks(kind: 'cast' | 'prop', id: string): { sceneId: string; sceneName: string; node: SceneNode }[] {
  const scenes = useDocument((s) => s.project.scenes)
  return useMemo(
    () =>
      scenes.flatMap((scene) =>
        Object.values(scene.nodes)
          .filter((n) =>
            kind === 'cast' ? n.type === 'mannequin' && n.castId === id : (n.type === 'primitive' || n.type === 'group') && n.propId === id
          )
          .map((node) => ({ sceneId: scene.id, sceneName: sceneLabel(scene), node }))
      ),
    [scenes, kind, id]
  )
}

function EntityList({ kind }: { kind: 'cast' | 'prop' }) {
  const entries = useDocument((s) => (kind === 'cast' ? s.project.cast : s.project.props))
  const selected = useUi((s) => (s.entity?.kind === kind ? s.entity.id : null))
  const add = () => {
    const doc = useDocument.getState()
    const id = kind === 'cast' ? doc.addCast() : doc.addProp()
    useUi.getState().selectEntity({ kind, id })
  }
  return (
    <aside className="panel outliner">
      <div className="panel-header entity-header">
        <span>{kind === 'cast' ? 'Cast' : 'Props'}</span>
        <button className="tool-button" onClick={add} title={kind === 'cast' ? 'New cast member' : 'New prop'}>
          <Plus size={14} /> New
        </button>
      </div>
      <div className="panel-body">
        {entries.length === 0 && (
          <p className="hint">
            {kind === 'cast'
              ? 'No cast yet. Add a character, give them a description and reference photos, then link figures to them.'
              : 'No props yet. Add a story object (a car, a briefcase…), then link objects or groups in the set to it.'}
          </p>
        )}
        {entries.map((e) => (
          <EntityRow key={e.id} kind={kind} entry={e} selected={selected === e.id} />
        ))}
      </div>
    </aside>
  )
}

function EntityRow({ kind, entry, selected }: { kind: 'cast' | 'prop'; entry: CastMember | Prop; selected: boolean }) {
  const links = useLinks(kind, entry.id)
  return (
    <div
      className={`outliner-row entity-row${selected ? ' selected' : ''}`}
      onClick={() => useUi.getState().selectEntity({ kind, id: entry.id })}
      title={entry.description || undefined}
    >
      {'color' in entry && <i className="cast-dot" style={{ background: entry.color }} />}
      <span className="row-name">{entry.name}</span>
      <span className="entity-meta">
        {[entry.images.length ? `${entry.images.length} ref` : '', links.length ? `${links.length} linked` : 'not linked']
          .filter(Boolean)
          .join(' · ')}
      </span>
    </div>
  )
}

/** A cast member or prop, in Properties. */
export function EntityProperties({ kind, id }: { kind: 'cast' | 'prop'; id: string }) {
  const entry = useDocument((s) => (kind === 'cast' ? s.project.cast : s.project.props).find((e) => e.id === id))
  const links = useLinks(kind, id)
  const sceneId = useDocument((s) => s.sceneId)
  if (!entry) return <p className="hint">This entry was deleted.</p>
  const doc = useDocument.getState()
  const update = (patch: Partial<CastMember>) => (kind === 'cast' ? doc.updateCast(id, patch) : doc.updateProp(id, patch))

  return (
    <>
      <div className="prop-section">
        <input
          key={entry.id + entry.name}
          className="name-input"
          defaultValue={entry.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== entry.name && update({ name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <div className="prop-kind">{kind === 'cast' ? 'Cast member' : 'Prop'}</div>
      </div>

      <div className="prop-section">
        <div className="prop-title" title="Used as this one's own prompt, applied only to its part of the frame. Describe how it looks, not who it is.">
          Description
        </div>
        <textarea
          key={entry.id + entry.description}
          className="notes"
          defaultValue={entry.description}
          placeholder={kind === 'cast' ? 'e.g. woman in her 20s, curly dark hair, olive raincoat' : 'e.g. battered brown leather briefcase'}
          onBlur={(e) => e.target.value !== entry.description && update({ description: e.target.value })}
        />
      </div>

      <div className="prop-section">
        <div className="prop-title" title="Photos or drawings of how this should look. They guide only this one's part of the frame.">
          Reference images
        </div>
        <ReferenceImages kind={kind === 'cast' ? 'cast' : 'props'} ownerId={id} images={entry.images} onChange={(images) => update({ images })} />
        <div className="prop-title prop-title-spaced" title="How strongly the reference images shape the look. Lower it if the look leaks onto others.">
          Reference strength
        </div>
        <div className="slider-row">
          <input
            type="range"
            className="slider"
            min={0}
            max={1.5}
            step={0.05}
            value={entry.strength}
            onPointerDown={() => doc.beginGesture('strength')}
            onPointerUp={() => doc.endGesture('strength')}
            onChange={(e) => update({ strength: Number(e.target.value) })}
          />
          <span className="slider-end">{entry.strength.toFixed(2)}</span>
        </div>
      </div>

      {'color' in entry && (
        <div className="prop-section">
          <label className="prop-inline">
            <span className="prop-title">Viewport colour</span>
            <input
              type="color"
              value={(entry as CastMember).color}
              onFocus={() => doc.beginGesture('castColor')}
              onBlur={() => doc.endGesture('castColor')}
              onChange={(e) => update({ color: e.target.value })}
            />
          </label>
        </div>
      )}

      <div className="prop-section">
        <div className="prop-title">Linked to</div>
        {links.length === 0 && (
          <p className="hint small">
            Nothing yet. Select a {kind === 'cast' ? 'figure' : 'object or group'} in the set and choose this in its Properties.
          </p>
        )}
        {links.map((l) => (
          <button
            key={l.node.id}
            className="link-row"
            disabled={l.sceneId !== sceneId}
            title={l.sceneId !== sceneId ? 'In another scene' : 'Select it'}
            onClick={() => useUi.getState().select([l.node.id])}
          >
            {l.node.name} <span className="dim">· {l.sceneName}</span>
          </button>
        ))}
      </div>

      <div className="prop-actions">
        <button
          onClick={() => {
            doc[kind === 'cast' ? 'deleteCast' : 'deleteProp'](id)
            useUi.getState().selectEntity(null)
          }}
          title={links.length ? `Also unlinks ${links.length} ${kind === 'cast' ? 'figure' : 'object'}${links.length === 1 ? '' : 's'}` : undefined}
        >
          <Trash2 size={14} /> Delete {kind === 'cast' ? 'cast member' : 'prop'}
        </button>
      </div>
    </>
  )
}

/** In a figure's / object's / group's Properties: what it is for the AI. */
export function LinkSection({ node }: { node: SceneNode }) {
  const isFigure = node.type === 'mannequin'
  const kind = isFigure ? 'cast' : 'prop'
  const entries = useDocument((s) => (isFigure ? s.project.cast : s.project.props))
  const linkedId = node.type === 'mannequin' ? node.castId : node.type === 'primitive' || node.type === 'group' ? node.propId : null
  const description = 'description' in node ? node.description : ''
  const [desc, setDesc] = useState(description)
  useEffect(() => setDesc(description), [description, node.id])
  if (node.type !== 'mannequin' && node.type !== 'primitive' && node.type !== 'group') return null
  const doc = useDocument.getState()
  const link = (id: string | null) => doc.updateNode(node.id, isFigure ? { castId: id } : { propId: id })

  return (
    <div className="prop-section">
      <div className="prop-title" title={isFigure ? 'Which character this figure is' : 'Which story object this is'}>
        {isFigure ? 'Cast' : 'Prop'}
      </div>
      <div className="link-select">
        <select
          className="preset-select"
          value={linkedId ?? ''}
          disabled={node.locked}
          onChange={(e) => {
            if (e.target.value === '__new') {
              const id = isFigure ? doc.addCast({ name: node.name }) : doc.addProp({ name: node.name })
              link(id)
              useUi.getState().setLeftTab(isFigure ? 'cast' : 'props')
            } else {
              link(e.target.value || null)
            }
          }}
        >
          <option value="">{isFigure ? 'Not a cast member' : 'Not a prop'}</option>
          {entries.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
          <option value="__new">{isFigure ? 'New cast member…' : 'New prop…'}</option>
        </select>
        {linkedId && (
          <button className="seed-lock" title="Edit it" onClick={() => useUi.getState().selectEntity({ kind, id: linkedId })}>
            <Pencil size={13} />
          </button>
        )}
      </div>
      {!linkedId && (
        <>
          <div className="prop-title prop-title-spaced" title="Optional: its own prompt, applied only to its part of the frame">
            Description
          </div>
          <input
            className="name-input plain"
            value={desc}
            disabled={node.locked}
            placeholder={isFigure ? 'e.g. a waiter in a white jacket' : 'e.g. a rusty oil drum'}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => desc !== description && doc.updateNode(node.id, { description: desc })}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </>
      )}
    </div>
  )
}

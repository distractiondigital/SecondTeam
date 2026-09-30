import { useState, type MouseEvent } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, Folder, Lock, LockOpen, PersonStanding } from 'lucide-react'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'

// The object list: a tree of the scene's objects and groups.

function RenameInput({ id, name }: { id: string; name: string }) {
  const [text, setText] = useState(name)
  const finish = (save: boolean) => {
    const trimmed = text.trim()
    if (save && trimmed && trimmed !== name) useDocument.getState().updateNode(id, { name: trimmed })
    useUi.getState().setRenamingId(null)
  }
  return (
    <input
      className="rename-input"
      autoFocus
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      onClick={(e) => e.stopPropagation()}
    />
  )
}

function OutlinerRow({ id, depth, inHidden }: { id: string; depth: number; inHidden: boolean }) {
  const node = useDocument((s) => activeScene(s).nodes[id])
  const selected = useUi((s) => s.selection.includes(id))
  const renaming = useUi((s) => s.renamingId === id)
  const [expanded, setExpanded] = useState(true)
  if (!node) return null

  const onRowClick = (e: MouseEvent) => {
    const ui = useUi.getState()
    if (e.ctrlKey || e.shiftKey) ui.toggleSelected(id)
    else ui.select([id])
  }
  const toggle = (e: MouseEvent, key: 'hidden' | 'locked') => {
    e.stopPropagation()
    useDocument.getState().updateNode(id, { [key]: !node[key] })
  }

  const isGroup = node.type === 'group'
  return (
    <>
      <div
        className={`outliner-row${selected ? ' selected' : ''}${node.hidden || inHidden ? ' dim' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={onRowClick}
        onDoubleClick={() => useUi.getState().setRenamingId(id)}
      >
        {isGroup ? (
          <button
            className="icon-button expander"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="expander" />
        )}
        {node.type === 'group' ? (
          <Folder size={14} className="row-icon" />
        ) : node.type === 'mannequin' ? (
          <PersonStanding size={14} className="row-icon" style={{ color: node.color }} />
        ) : (
          <span className="color-chip" style={{ background: node.color }} />
        )}
        {renaming ? <RenameInput id={id} name={node.name} /> : <span className="row-name">{node.name}</span>}
        <button
          className="icon-button row-toggle"
          title={node.hidden ? 'Show (H)' : 'Hide (H)'}
          onClick={(e) => toggle(e, 'hidden')}
        >
          {node.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button
          className={`icon-button row-toggle${node.locked ? ' on' : ''}`}
          title={node.locked ? 'Unlock' : 'Lock (can’t be clicked or moved in the viewport)'}
          onClick={(e) => toggle(e, 'locked')}
        >
          {node.locked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
      </div>
      {isGroup && expanded && node.childIds.map((c) => (
          <OutlinerRow key={c} id={c} depth={depth + 1} inHidden={inHidden || node.hidden} />
        ))}
    </>
  )
}

export default function Outliner() {
  const sceneName = useDocument((s) => activeScene(s).name)
  const rootIds = useDocument((s) => activeScene(s).rootIds)
  return (
    <aside className="panel outliner">
      <div className="panel-header">Outliner · {sceneName}</div>
      <div className="panel-body" onClick={(e) => e.target === e.currentTarget && useUi.getState().select([])}>
        {rootIds.length === 0 ? (
          <p className="hint">The set is empty. Use Add in the toolbar to place a box, plane or other shape.</p>
        ) : (
          rootIds.map((id) => <OutlinerRow key={id} id={id} depth={0} inHidden={false} />)
        )}
      </div>
    </aside>
  )
}

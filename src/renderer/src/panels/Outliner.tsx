import { createContext, memo, useContext, useMemo, useState, type DragEvent, type MouseEvent } from 'react'
import { ChevronDown, Clapperboard, ChevronRight, Eye, EyeOff, Folder, Lock, LockOpen, PersonStanding } from 'lucide-react'
import { activeScene, editedNodes, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import ScenePicker from './ScenePicker'
import { LIGHT_ICONS } from './lightIcons'
import { kelvinToRgb, type LightKind } from '../../../shared/lighting'
import { addKey } from '../platform'

function LightIcon({ kind, kelvin }: { kind: LightKind; kelvin: number }) {
  const Icon = LIGHT_ICONS[kind]
  const [r, g, b] = kelvinToRgb(kelvin)
  return <Icon size={14} className="row-icon" style={{ color: `rgb(${r * 255}, ${g * 255}, ${b * 255})` }} />
}

// The object list: a tree of the scene's objects and groups.
//   click             select           Ctrl+click   add / remove one
//   Shift+click       select a range (from the last clicked row, in list order)
//   drag a row        reorder it, or drop it on the middle of a group to put it inside
//                     (dragging a selected row moves the whole selection)

type DropZone = 'before' | 'after' | 'into'
interface DropTarget {
  id: string | null // null = the empty space below the list (end of the top level)
  zone: DropZone
}

/** Shared between the rows: which groups are collapsed, the drop target, the visible order. */
interface OutlinerShared {
  collapsed: Set<string>
  toggleCollapsed: (id: string) => void
  drop: DropTarget | null
  setDrop: (t: DropTarget | null) => void
  visibleOrder: () => string[]
}
const Shared = createContext<OutlinerShared | null>(null)

/** The rows being dragged (module-level: drag events don't carry objects). */
let dragging: string[] = []
/** The row a Shift+click range starts from. */
let anchorId: string | null = null

/** Is `id` one of `ids`, or inside one of them? */
function insideAny(id: string, ids: string[]): boolean {
  const nodes = activeScene(useDocument.getState()).nodes
  for (let at: string | null = id; at; at = nodes[at]?.parentId ?? null) if (ids.includes(at)) return true
  return false
}

/** Where a drop lands: the group it goes into and the item it goes before (null = at the end). */
function dropPlace(target: DropTarget): { parentId: string | null; beforeId: string | null } {
  if (target.id === null) return { parentId: null, beforeId: null }
  const scene = activeScene(useDocument.getState())
  const node = scene.nodes[target.id]
  if (target.zone === 'into') return { parentId: target.id, beforeId: null }
  const parent = node.parentId ? scene.nodes[node.parentId] : null
  const siblings = parent?.type === 'group' ? parent.childIds : scene.rootIds
  const beforeId = target.zone === 'before' ? target.id : (siblings[siblings.indexOf(target.id) + 1] ?? null)
  return { parentId: node.parentId, beforeId }
}

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

const OutlinerRow = memo(function OutlinerRow({ id, depth, inHidden }: { id: string; depth: number; inHidden: boolean }) {
  const node = useDocument((s) => editedNodes(s)[id])
  const changedInShot = useDocument((s) => {
    const shot = s.activeShotId ? activeScene(s).nodes[s.activeShotId] : undefined
    return shot?.type === 'camera' && id in shot.overrides
  })
  const selected = useUi((s) => s.selection.includes(id))
  const renaming = useUi((s) => s.renamingId === id)
  const shared = useContext(Shared)!
  const expanded = !shared.collapsed.has(id)
  if (!node || node.type === 'camera') return null
  const isGroup = node.type === 'group'

  const onRowClick = (e: MouseEvent) => {
    const ui = useUi.getState()
    if (e.shiftKey && anchorId) {
      const order = shared.visibleOrder()
      const [from, to] = [order.indexOf(anchorId), order.indexOf(id)].sort((a, b) => a - b)
      if (from >= 0) {
        const range = order.slice(from, to + 1)
        ui.select(addKey(e) ? [...new Set([...ui.selection, ...range])] : range)
        return
      }
    }
    anchorId = id
    if (addKey(e)) ui.toggleSelected(id)
    else ui.select([id])
  }

  const onDragStart = (e: DragEvent) => {
    const selection = useUi.getState().selection
    const nodes = activeScene(useDocument.getState()).nodes
    dragging = selection.includes(id) ? selection.filter((x) => nodes[x] && nodes[x].type !== 'camera') : [id]
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', node.name)
  }
  const onDragOver = (e: DragEvent) => {
    if (dragging.length === 0) return
    const box = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - box.top) / box.height
    const zone: DropZone = isGroup ? (y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'into') : y < 0.5 ? 'before' : 'after'
    // Nothing can go inside something being dragged (a group can't go inside itself).
    if (insideAny(id, dragging) && (zone === 'into' || !dragging.includes(id))) {
      if (shared.drop) shared.setDrop(null)
      return
    }
    e.preventDefault()
    e.stopPropagation()
    if (shared.drop?.id !== id || shared.drop.zone !== zone) shared.setDrop({ id, zone })
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const target = shared.drop
    shared.setDrop(null)
    if (!target || dragging.length === 0) return
    const { parentId, beforeId } = dropPlace(target)
    useDocument.getState().moveNodes(dragging, parentId, beforeId)
    if (parentId && shared.collapsed.has(parentId)) shared.toggleCollapsed(parentId)
    dragging = []
  }
  const dropClass = shared.drop?.id === id ? ` drop-${shared.drop.zone}` : ''
  const toggle = (e: MouseEvent, key: 'hidden' | 'locked') => {
    e.stopPropagation()
    useDocument.getState().updateNode(id, { [key]: !node[key] })
  }

  return (
    <>
      <div
        className={`outliner-row${selected ? ' selected' : ''}${node.hidden || inHidden ? ' dim' : ''}${dropClass}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={onRowClick}
        onDoubleClick={() => useUi.getState().setRenamingId(id)}
        draggable={!renaming}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={() => {
          dragging = []
          shared.setDrop(null)
        }}
      >
        {isGroup ? (
          <button
            className="icon-button expander"
            onClick={(e) => {
              e.stopPropagation()
              shared.toggleCollapsed(id)
            }}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="expander" />
        )}
        {node.type === 'group' ? (
          <Folder size={14} className="row-icon" />
        ) : node.type === 'light' ? (
          <LightIcon kind={node.kind} kelvin={node.kelvin} />
        ) : node.type === 'mannequin' ? (
          <PersonStanding size={14} className="row-icon" style={{ color: node.color }} />
        ) : (
          <span className="color-chip" style={{ background: node.color }} />
        )}
        {renaming ? <RenameInput id={id} name={node.name} /> : <span className="row-name">{node.name}</span>}
        {changedInShot && (
          <span className="shot-badge" title="Changed in this shot">
            <Clapperboard size={12} />
          </span>
        )}
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
})

export default function Outliner() {
  // Cameras belong to their shots (see the Shot list), so they aren't listed here.
  // (A string, so posing or moving things doesn't re-list the whole Outliner: only adding, removing
  // or reordering at the top level does.)
  const setIdsKey = useDocument((s) => {
    const scene = activeScene(s)
    return scene.rootIds.filter((id) => scene.nodes[id]?.type !== 'camera').join('|')
  })
  const setIds = useMemo(() => (setIdsKey ? setIdsKey.split('|') : []), [setIdsKey])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [drop, setDrop] = useState<DropTarget | null>(null)
  const shared = useMemo<OutlinerShared>(() => ({
    collapsed,
    toggleCollapsed: (id) =>
      setCollapsed((c) => {
        const next = new Set(c)
        if (!next.delete(id)) next.add(id)
        return next
      }),
    drop,
    setDrop,
    // The rows as listed (open groups' contents included), for Shift+click ranges.
    visibleOrder: () => {
      const scene = activeScene(useDocument.getState())
      const walk = (id: string): string[] => {
        const n = scene.nodes[id]
        if (!n || n.type === 'camera') return []
        return n.type === 'group' && !collapsed.has(id) ? [id, ...n.childIds.flatMap(walk)] : [id]
      }
      return scene.rootIds.flatMap(walk)
    }
  }), [collapsed, drop])
  const endDrop = drop !== null && drop.id === null
  return (
    <aside className="panel outliner">
      <div className="panel-header">
        <ScenePicker />
      </div>
      <div
        className={`panel-body${endDrop ? ' drop-end' : ''}`}
        onClick={(e) => e.target === e.currentTarget && useUi.getState().select([])}
        // The empty space below the rows: the end of the top level.
        onDragOver={(e) => {
          if (dragging.length === 0) return
          e.preventDefault()
          if (!endDrop) setDrop({ id: null, zone: 'after' })
        }}
        onDragLeave={(e) => {
          if (e.target === e.currentTarget && endDrop) setDrop(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDrop(null)
          if (dragging.length) useDocument.getState().moveNodes(dragging, null, null)
          dragging = []
        }}
      >
        <Shared.Provider value={shared}>
          {setIds.length === 0 ? (
            <p className="hint">The set is empty. Use Add in the toolbar to place a box, plane or other shape.</p>
          ) : (
            setIds.map((id) => <OutlinerRow key={id} id={id} depth={0} inHidden={false} />)
          )}
        </Shared.Provider>
      </div>
    </aside>
  )
}

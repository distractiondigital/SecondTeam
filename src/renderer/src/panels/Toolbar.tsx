import type { ReactNode } from 'react'
import {
  Box,
  Cone,
  Cylinder,
  FilePlus,
  FolderOpen,
  Magnet,
  Move3d,
  Pill,
  Redo2,
  Rotate3d,
  Save,
  Scale3d,
  Circle,
  Square,
  Undo2,
  type LucideIcon
} from 'lucide-react'
import { PRIMITIVE_TYPES, type PrimitiveType } from '../../../shared/project'
import { PRIMITIVES } from '../../../shared/primitives'
import { addPrimitive, redo, undo } from '../state/actions'
import { useDocument } from '../state/documentStore'
import { newProject, openProject, saveProject, saveProjectAs } from '../state/projectIO'
import { useUi, type GizmoMode } from '../state/uiStore'

const PRIMITIVE_ICONS: Record<PrimitiveType, LucideIcon> = {
  box: Box,
  cylinder: Cylinder,
  sphere: Circle,
  plane: Square,
  capsule: Pill,
  cone: Cone
}

const GIZMO_MODES: { mode: GizmoMode; label: string; key: string; icon: LucideIcon }[] = [
  { mode: 'translate', label: 'Move', key: 'W', icon: Move3d },
  { mode: 'rotate', label: 'Rotate', key: 'E', icon: Rotate3d },
  { mode: 'scale', label: 'Scale', key: 'R', icon: Scale3d }
]

function ToolButton(props: {
  icon: LucideIcon
  label: string
  title: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  showLabel?: boolean
}) {
  const Icon = props.icon
  return (
    <button
      className={`tool-button${props.active ? ' active' : ''}`}
      title={props.title}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      <Icon size={16} strokeWidth={1.75} />
      {props.showLabel !== false && <span>{props.label}</span>}
    </button>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tool-group" aria-label={label}>
      <span className="tool-group-label">{label}</span>
      {children}
    </div>
  )
}

export default function Toolbar() {
  const gizmoMode = useUi((s) => s.gizmoMode)
  const snapping = useUi((s) => s.snapping)
  const units = useUi((s) => s.units)
  const canUndo = useDocument((s) => s.past.length > 0)
  const canRedo = useDocument((s) => s.future.length > 0)
  const ui = useUi.getState

  return (
    <div className="toolbar">
      <Group label="File">
        <ToolButton icon={FilePlus} label="New" title="New project (Ctrl+N)" onClick={newProject} showLabel={false} />
        <ToolButton icon={FolderOpen} label="Open" title="Open project (Ctrl+O)" onClick={openProject} showLabel={false} />
        <ToolButton icon={Save} label="Save" title="Save (Ctrl+S)" onClick={saveProject} showLabel={false} />
        <button className="tool-button text-only" title="Save as… (Ctrl+Shift+S)" onClick={saveProjectAs}>
          Save as…
        </button>
      </Group>

      <Group label="Edit">
        <ToolButton icon={Undo2} label="Undo" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} showLabel={false} />
        <ToolButton icon={Redo2} label="Redo" title="Redo (Ctrl+Y)" onClick={redo} disabled={!canRedo} showLabel={false} />
      </Group>

      <Group label="Add">
        {PRIMITIVE_TYPES.map((type) => (
          <ToolButton
            key={type}
            icon={PRIMITIVE_ICONS[type]}
            label={PRIMITIVES[type].label}
            title={`Add ${PRIMITIVES[type].label.toLowerCase()}`}
            onClick={() => addPrimitive(type)}
          />
        ))}
      </Group>

      <Group label="Gizmo">
        {GIZMO_MODES.map((g) => (
          <ToolButton
            key={g.mode}
            icon={g.icon}
            label={g.label}
            title={`${g.label} (${g.key})`}
            active={gizmoMode === g.mode}
            onClick={() => ui().setGizmoMode(g.mode)}
            showLabel={false}
          />
        ))}
        <ToolButton
          icon={Magnet}
          label="Snap"
          title={`Snapping ${snapping ? 'on' : 'off'} (Shift+Tab): ${units === 'm' ? '0.1 m' : '½ ft'}, 15°, 0.1× scale`}
          active={snapping}
          onClick={() => ui().toggleSnapping()}
        />
      </Group>

      <Group label="Units">
        <div className="segmented">
          <button className={units === 'm' ? 'active' : ''} onClick={() => ui().setUnits('m')}>
            m
          </button>
          <button className={units === 'ft' ? 'active' : ''} onClick={() => ui().setUnits('ft')}>
            ft
          </button>
        </div>
      </Group>
    </div>
  )
}

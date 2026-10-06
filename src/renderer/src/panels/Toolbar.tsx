import type { ReactNode } from 'react'
import {
  Mouse,
  Palette,
  Touchpad,
  Box,
  Cone,
  Cylinder,
  Eye,
  FilePlus,
  FolderOpen,
  Magnet,
  Move3d,
  PersonStanding,
  Pill,
  Redo2,
  Rotate3d,
  Save,
  Scale3d,
  Circle,
  Square,
  SaveAll,
  Undo2,
  type LucideIcon
} from 'lucide-react'
import { PRIMITIVE_TYPES, type PrimitiveType } from '../../../shared/project'
import { PRIMITIVES } from '../../../shared/primitives'
import { addLight, addMannequin, addPrimitive, redo, toggleCameraView, undo } from '../state/actions'
import { LIGHT_KINDS, LIGHT_LABELS } from '../../../shared/lighting'
import { LIGHT_ICONS } from './lightIcons'
import { useDocument } from '../state/documentStore'
import { newProject, openProject, saveProject, saveProjectAs } from '../state/projectIO'
import { RecentMenu } from './RecentProjects'
import { useUi, type GizmoMode, type SnapMode } from '../state/uiStore'
import type { Units } from '../units'
import { CTRL } from '../platform'

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

const LIGHT_DESCRIPTIONS = {
  sun: 'a sun (daylight from one direction; only its angle matters)',
  point: 'a point light (a bare bulb)',
  spot: 'a spot light (a beam with a cone)',
  ambient: 'an ambient fill (soft, even light from the sky)'
}

const HOLD_CTRL = `Hold ${CTRL} while dragging to flip grid snapping on or off. Shift+Tab cycles modes.`

const SNAP_OPTIONS: { mode: SnapMode; label: string; title: (units: Units) => string }[] = [
  { mode: 'off', label: 'Off', title: () => `No snapping. ${HOLD_CTRL}` },
  {
    mode: 'grid',
    label: 'Grid',
    title: (units) => `Move in ${units === 'm' ? '0.1 m' : '½ ft'} steps, rotate in 15° steps, scale in 0.1 steps. ${HOLD_CTRL}`
  },
  {
    mode: 'surface',
    label: 'Surface',
    title: () =>
      `When moving, an object's sides click flush against the floor and nearby objects (within 15 cm). ${HOLD_CTRL}`
  }
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
    <div className={`tool-group ${label.toLowerCase()}`} aria-label={label}>
      <span className="tool-group-label">{label}</span>
      {children}
    </div>
  )
}

/** `boardOnly`: the storyboard needs only file and undo tools. */
export default function Toolbar({ boardOnly = false }: { boardOnly?: boolean }) {
  const gizmoMode = useUi((s) => s.gizmoMode)
  const snapMode = useUi((s) => s.snapMode)
  const lookingThrough = useUi((s) => s.lookThroughId !== null)
  const shading = useUi((s) => s.shading)
  const units = useUi((s) => s.units)
  const navMode = useUi((s) => s.navMode)
  const figureColors = useUi((s) => s.figureColors)
  const canUndo = useDocument((s) => s.past.length > 0)
  const canRedo = useDocument((s) => s.future.length > 0)
  const ui = useUi.getState

  return (
    <div className="toolbar">
      <Group label="File">
        <ToolButton icon={FilePlus} label="New" title="New project (Ctrl+N)" onClick={newProject} showLabel={false} />
        <ToolButton icon={FolderOpen} label="Open" title="Open project (Ctrl+O)" onClick={openProject} showLabel={false} />
        <RecentMenu />
        <ToolButton icon={Save} label="Save" title="Save (Ctrl+S)" onClick={saveProject} showLabel={false} />
        <ToolButton icon={SaveAll} label="Save as" title="Save as… (Ctrl+Shift+S)" onClick={saveProjectAs} showLabel={false} />
      </Group>

      <Group label="Edit">
        <ToolButton icon={Undo2} label="Undo" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} showLabel={false} />
        <ToolButton icon={Redo2} label="Redo" title="Redo (Ctrl+Y)" onClick={redo} disabled={!canRedo} showLabel={false} />
      </Group>
      {!boardOnly && (
        <>
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
            <ToolButton icon={PersonStanding} label="Figure" title="Add a posable figure" onClick={addMannequin} />
          </Group>

          <Group label="Lights">
            {LIGHT_KINDS.map((kind) => (
              <ToolButton
                key={kind}
                icon={LIGHT_ICONS[kind]}
                label={LIGHT_LABELS[kind]}
                title={`Add ${LIGHT_DESCRIPTIONS[kind]}`}
                onClick={() => addLight(kind)}
                showLabel={false}
              />
            ))}
          </Group>

          <Group label="View">
            <div className="segmented">
              <button
                className={shading === 'work' ? 'active' : ''}
                title="Work shading: object colours under even light"
                onClick={() => ui().setShading('work')}
              >
                Work
              </button>
              <button
                className={shading === 'clay' ? 'active' : ''}
                title="Clay shading: surfaces in their Material colours, lit by the scene's lights and sky, with shadows (automatic in camera view)"
                onClick={() => ui().setShading('clay')}
              >
                Clay
              </button>
            </div>
            <ToolButton
              icon={Palette}
              label="Figure colours"
              title={
                figureColors
                  ? 'Figure colours on: each person in their own colour (viewport only). Click for natural colours.'
                  : 'Show each person in their own colour, to tell them apart while blocking (viewport only; renders stay natural)'
              }
              active={figureColors}
              onClick={() => ui().setFigureColors(!figureColors)}
              showLabel={false}
            />
            <ToolButton
              icon={Eye}
              label="Camera view"
              title={lookingThrough ? 'Back to the free view (Numpad 0)' : 'Look through the selected camera (Numpad 0)'}
              active={lookingThrough}
              onClick={toggleCameraView}
              showLabel={false}
            />
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
          </Group>

          <Group label="Snap">
            <Magnet size={15} strokeWidth={1.75} className="tool-group-icon" />
            <div className="segmented">
              {SNAP_OPTIONS.map((o) => (
                <button
                  key={o.mode}
                  className={snapMode === o.mode ? 'active' : ''}
                  title={o.title(units)}
                  onClick={() => ui().setSnapMode(o.mode)}
                >
                  {o.label}
                </button>
              ))}
            </div>
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
            {/* Mouse or trackpad navigation (one button: click to switch). */}
            <button
              className="tool-button narrow-icon"
              onClick={() => ui().setNavMode(navMode === 'mouse' ? 'trackpad' : 'mouse')}
              title={
                navMode === 'mouse'
                  ? 'Mouse controls: middle-drag orbits, scroll zooms. Click for trackpad controls (two-finger swipe orbits, Shift + swipe pans, pinch zooms).'
                  : 'Trackpad controls: two-finger swipe orbits, Shift + swipe pans, pinch zooms. Click for mouse controls.'
              }
            >
              {navMode === 'mouse' ? <Mouse size={15} strokeWidth={1.75} /> : <Touchpad size={15} strokeWidth={1.75} />}
            </button>
          </Group>
        </>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { JOINTS } from '../../shared/mannequin'
import { useShortcuts } from './hooks/useShortcuts'
import BoardView from './panels/BoardView'
import LeftTabs from './panels/CastProps'
import PropertiesPanel from './panels/PropertiesPanel'
import ShotList from './panels/ShotList'
import TakeStrip from './panels/TakeStrip'
import Toolbar from './panels/Toolbar'
import { activeScene, useDocument } from './state/documentStore'
import { connectGeneration } from './state/generation'
import { connectSetup } from './state/setup'
import EngineSettings from './panels/EngineSettings'
import SetupWizard from './panels/SetupWizard'
import { usePoseLibrary } from './state/poseLibrary'
import { useStyleLibrary } from './state/styleLibrary'
import { projectDisplayName, syncWindowState } from './state/projectIO'
import { useUi } from './state/uiStore'
import Viewport from './viewport/Viewport'
import { ALT, CTRL } from './platform'

/** What's selected, e.g. "Figure 1 › Left elbow", plus hints for the current mode. */
function StatusBar() {
  const selection = useUi((s) => s.selection)
  const joint = useUi((s) => s.selectedJoint)
  const mode = useUi((s) => s.gizmoMode)
  const navMode = useUi((s) => s.navMode)
  const node = useDocument((s) => (selection.length === 1 ? activeScene(s).nodes[selection[0]] : undefined))

  let readout = ''
  const navigation =
    navMode === 'trackpad'
      ? `Two-finger swipe: orbit · Shift+swipe: pan · Pinch: zoom · ${ALT}+drag: orbit (Shift: pan)`
      : `Middle-drag: orbit · Shift+middle-drag: pan · Scroll: zoom · ${ALT}+drag: orbit (Shift: pan)`
  let hints = `${navigation} · Right-drag + WASD: fly · Click: select (double-click: inside a group) · Drag: box select (Shift add, ${CTRL} remove) · W/E/R: move/rotate/scale · F: frame · ${CTRL}+D: duplicate · Del: delete · ${CTRL}+G: group`
  if (node) readout = node.name
  else if (selection.length > 1) readout = `${selection.length} objects`
  if (node?.type === 'mannequin') {
    if (joint) {
      readout += ` › ${JOINTS[joint].label}`
      const grabbable = /^(wrist|ankle|pelvis)/.test(joint)
      hints =
        grabbable && mode === 'translate'
          ? 'Hold the ball and move the mouse · while holding: W/S away/closer, Shift faster, Space snapping on/off · E: rotate instead · Esc: back to the figure'
          : `Drag the rings to rotate this joint · Hold ${CTRL}: 15° steps${grabbable ? ' · W: drag it to a spot instead' : ''} · Click another body part to pose it · Esc: back to the figure`
    } else {
      hints = 'Click a body part to pose its joint (a hand, foot or the hips + W: drag it to a spot) · W/E: move/rotate the figure · Look at, presets and planted hands/feet in Properties'
    }
  }

  return (
    <footer className="statusbar">
      {readout && <span className="status-readout">{readout}</span>}
      {hints}
    </footer>
  )
}

export default function App() {
  const [version, setVersion] = useState('')
  const projectPath = useUi((s) => s.projectPath)
  const view = useUi((s) => s.view)

  useEffect(() => {
    window.secondTeam.getVersion().then(setVersion)
    void usePoseLibrary.getState().load()
    void useStyleLibrary.getState().load()
    const disconnect = connectGeneration()
    const disconnectSetup = connectSetup()
    const unsync = syncWindowState()
    return () => {
      disconnect()
      disconnectSetup()
      unsync()
    }
  }, [])
  useShortcuts()

  return (
    <div className="app">
      <header className="topbar">
        <span className="app-name">Second Team</span>
        <span className="project-name">{projectDisplayName(projectPath)}</span>
        <div className="segmented view-switch" title="The 3D set, or the storyboard">
          <button className={view === 'set' ? 'active' : ''} onClick={() => useUi.getState().setView('set')}>
            Set
          </button>
          <button className={view === 'board' ? 'active' : ''} onClick={() => useUi.getState().setView('board')}>
            Board
          </button>
        </div>
        <Toolbar boardOnly={view === 'board'} />
        <span className="version">{version && `v${version}`}</span>
      </header>
      {view === 'board' && <BoardView />}
      {/* The set stays mounted (hidden) under the board, so its 3D scene doesn't have to rebuild. */}
      <div className="workspace" style={view === 'board' ? { display: 'none' } : undefined}>
        <div className="left-column">
          <LeftTabs />
          <ShotList />
        </div>
        <main className="viewport">
          <Viewport />
          <TakeStrip />
        </main>
        <PropertiesPanel />
      </div>
      <StatusBar />
      <EngineSettings />
      <SetupWizard />
    </div>
  )
}

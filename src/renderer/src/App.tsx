import { useEffect, useState } from 'react'
import { JOINTS } from '../../shared/mannequin'
import { useShortcuts } from './hooks/useShortcuts'
import Outliner from './panels/Outliner'
import PropertiesPanel from './panels/PropertiesPanel'
import ShotList from './panels/ShotList'
import Toolbar from './panels/Toolbar'
import { activeScene, useDocument } from './state/documentStore'
import { usePoseLibrary } from './state/poseLibrary'
import { projectDisplayName, syncWindowState } from './state/projectIO'
import { useUi } from './state/uiStore'
import Viewport from './viewport/Viewport'

/** What's selected, e.g. "Figure 1 › Left elbow", plus hints for the current mode. */
function StatusBar() {
  const selection = useUi((s) => s.selection)
  const joint = useUi((s) => s.selectedJoint)
  const node = useDocument((s) => (selection.length === 1 ? activeScene(s).nodes[selection[0]] : undefined))

  let readout = ''
  let hints =
    'Middle-drag: orbit · Shift+middle-drag: pan · Scroll: zoom · Click: select (double-click: inside a group) · W/E/R: move/rotate/scale · F: frame · Ctrl+D: duplicate · Del: delete · Ctrl+G: group'
  if (node) readout = node.name
  else if (selection.length > 1) readout = `${selection.length} objects`
  if (node?.type === 'mannequin') {
    if (joint) {
      readout += ` › ${JOINTS[joint].label}`
      hints = 'Drag the rings to rotate this joint · Hold Ctrl: 15° steps · Click another body part to pose it · Esc: back to the figure'
    } else {
      hints = 'Click a body part to pose its joint · W/E: move/rotate the figure · Height and presets in Properties'
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

  useEffect(() => {
    window.secondTeam.getVersion().then(setVersion)
    void usePoseLibrary.getState().load()
    return syncWindowState()
  }, [])
  useShortcuts()

  return (
    <div className="app">
      <header className="topbar">
        <span className="app-name">Second Team</span>
        <span className="project-name">{projectDisplayName(projectPath)}</span>
        <Toolbar />
        <span className="version">{version && `v${version}`}</span>
      </header>
      <div className="workspace">
        <div className="left-column">
          <Outliner />
          <ShotList />
        </div>
        <main className="viewport">
          <Viewport />
        </main>
        <PropertiesPanel />
      </div>
      <StatusBar />
    </div>
  )
}

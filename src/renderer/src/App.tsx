import { useEffect, useState } from 'react'
import { useShortcuts } from './hooks/useShortcuts'
import Outliner from './panels/Outliner'
import PropertiesPanel from './panels/PropertiesPanel'
import Toolbar from './panels/Toolbar'
import { projectDisplayName, syncWindowState } from './state/projectIO'
import { useUi } from './state/uiStore'
import Viewport from './viewport/Viewport'

export default function App() {
  const [version, setVersion] = useState('')
  const projectPath = useUi((s) => s.projectPath)

  useEffect(() => {
    window.secondTeam.getVersion().then(setVersion)
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
        <Outliner />
        <main className="viewport">
          <Viewport />
        </main>
        <PropertiesPanel />
      </div>
      <footer className="statusbar">
        Middle-drag: orbit · Shift+middle-drag: pan · Scroll: zoom · Click: select (double-click: inside a group) · W/E/R:
        move/rotate/scale · F: frame · Ctrl+D: duplicate · Del: delete · Ctrl+G: group
      </footer>
    </div>
  )
}

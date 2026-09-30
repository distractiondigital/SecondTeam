import { useEffect, useState } from 'react'
import Viewport from './viewport/Viewport'

export default function App() {
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.secondTeam.getVersion().then(setVersion)
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <span className="app-name">Second Team</span>
        <span className="status">Empty scene · grid 1 m</span>
        <span className="version">{version && `v${version}`}</span>
      </header>
      <main className="viewport">
        <Viewport />
      </main>
    </div>
  )
}

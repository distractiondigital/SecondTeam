import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { sceneLabel } from '../../../shared/project'
import { deleteCurrentScene, newScene, switchScene } from '../state/actions'
import { activeScene, useDocument } from '../state/documentStore'

// The Outliner header: which scene you're in, plus New / Duplicate / Rename / Delete scene and
// the scene's render floor setting.

function RenameForm({ onDone }: { onDone: () => void }) {
  const scene = useDocument((s) => activeScene(s))
  const [number, setNumber] = useState(String(scene.number))
  const [name, setName] = useState(scene.name)
  const save = () => {
    const n = Number(number)
    useDocument.getState().renameScene(Number.isFinite(n) && n >= 1 ? n : scene.number, name)
    onDone()
  }
  return (
    <div className="scene-rename" onKeyDown={(e) => e.key === 'Enter' && save()}>
      <label>
        Scene
        <input className="scene-number-input" value={number} autoFocus onChange={(e) => setNumber(e.target.value)} />
      </label>
      <input
        className="name-input plain"
        placeholder="Title, e.g. INT. KITCHEN – NIGHT"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <p className="hint small">Changing the number renames its shots (3A → 5A).</p>
      <div className="prop-actions tight">
        <button onClick={save}>
          <Check size={13} /> Save
        </button>
        <button onClick={onDone}>Cancel</button>
      </div>
    </div>
  )
}

export default function ScenePicker() {
  const scenes = useDocument((s) => s.project.scenes)
  const current = useDocument((s) => s.sceneId)
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const scene = scenes.find((s) => s.id === current) ?? scenes[0]

  // Close when clicking elsewhere.
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false)
        setRenaming(false)
      }
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const run = (action: () => void) => {
    action()
    setOpen(false)
  }

  return (
    <div className="scene-picker" ref={ref}>
      <button className="scene-picker-button" onClick={() => setOpen(!open)} title="Switch, add or rename scenes">
        <span>{sceneLabel(scene)}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="scene-menu">
          {renaming ? (
            <RenameForm
              onDone={() => {
                setRenaming(false)
                setOpen(false)
              }}
            />
          ) : (
            <>
              {scenes.map((s) => (
                <button
                  key={s.id}
                  className={`scene-menu-item${s.id === current ? ' current' : ''}`}
                  onClick={() => run(() => switchScene(s.id))}
                >
                  {s.id === current ? <Check size={13} /> : <span className="menu-icon-space" />}
                  {sceneLabel(s)}
                </button>
              ))}
              <div className="menu-divider" />
              <button className="scene-menu-item" onClick={() => run(() => newScene(false))}>
                <Plus size={13} /> New scene
              </button>
              <button
                className="scene-menu-item"
                onClick={() => run(() => newScene(true))}
                title="A new scene with a copy of this scene's set (no shots)"
              >
                <Copy size={13} /> Duplicate scene
              </button>
              <button className="scene-menu-item" onClick={() => setRenaming(true)}>
                <Pencil size={13} /> Rename scene…
              </button>
              <button
                className="scene-menu-item"
                onClick={() => useDocument.getState().setSceneFloor(!scene.floor)}
                title="Render passes and Shot list thumbnails include an endless floor at ground level. Turn it off for a rooftop, or when you've built your own ground."
              >
                {scene.floor ? <Check size={13} /> : <span className="menu-icon-space" />}
                Floor in renders
              </button>
              <button
                className="scene-menu-item danger"
                disabled={scenes.length < 2}
                onClick={() => run(() => void deleteCurrentScene())}
                title={scenes.length < 2 ? 'A project needs at least one scene' : undefined}
              >
                <Trash2 size={13} /> Delete scene
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

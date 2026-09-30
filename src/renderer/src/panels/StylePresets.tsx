import { useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { useDocument } from '../state/documentStore'
import { useGeneration } from '../state/generation'
import { useStyleLibrary } from '../state/styleLibrary'

// Style presets: save the current style prompt under a name and load it in any project
// (like saved poses). A preset remembers the model it was made with, and loading it switches
// to that model if it's installed.

export default function StylePresets() {
  const presets = useStyleLibrary((s) => s.presets)
  const styleText = useDocument((s) => s.project.styleText)
  const checkpoint = useDocument((s) => s.project.generation.checkpoint)
  const models = useGeneration((s) => s.models)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const current = presets.find((p) => p.text === styleText)

  const load = (id: string) => {
    const p = presets.find((x) => x.id === id)
    if (!p) return
    const doc = useDocument.getState()
    doc.setStyleText(p.text)
    if (p.checkpoint && models.some((m) => m.file === p.checkpoint)) doc.updateGeneration({ checkpoint: p.checkpoint })
  }
  const save = () => {
    useStyleLibrary.getState().save(name, styleText, checkpoint)
    setNaming(false)
    setName('')
  }

  return (
    <div className="style-presets">
      <div className="link-select">
        <select
          className="preset-select"
          value={current?.id ?? ''}
          onChange={(e) => e.target.value && load(e.target.value)}
          title="Style presets are saved on this PC and work in every project"
        >
          <option value="">{presets.length ? (current ? current.name : 'Load a style preset…') : 'No style presets yet'}</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          className="seed-lock"
          disabled={!styleText.trim()}
          onClick={() => {
            setName(current?.name ?? '')
            setNaming(true)
          }}
          title="Save the current style as a preset (a preset with the same name is replaced)"
        >
          <Save size={13} />
        </button>
        {current && (
          <button className="seed-lock" onClick={() => useStyleLibrary.getState().remove(current.id)} title={`Delete the preset "${current.name}"`}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {naming && (
        <div className="link-select spaced">
          <input
            className="name-input plain"
            autoFocus
            value={name}
            placeholder="Preset name, e.g. Gritty crime drama"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) save()
              if (e.key === 'Escape') setNaming(false)
            }}
          />
          <button className="seed-lock" disabled={!name.trim()} onClick={save} title="Save">
            <Save size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { ClipboardPaste, ImagePlus, X } from 'lucide-react'
import { MAX_REFERENCE_IMAGES } from '../../../shared/project'
import { useUi } from '../state/uiStore'

// Reference image thumbnails with add / remove, for a cast member, a prop, or the project style.
// Adding copies the picked files into the project folder; removing only takes them off the list
// (the file stays, so undo can bring it back).

type Kind = 'cast' | 'props' | 'style'

const cache = new Map<string, string | null>()

function useThumbnail(kind: Kind, ownerId: string | null, file: string): string | null | undefined {
  const folder = useUi((s) => s.projectPath)
  const key = `${folder}|${kind}|${ownerId}|${file}`
  const [thumb, setThumb] = useState<string | null | undefined>(cache.get(key))
  useEffect(() => {
    if (!folder) return
    if (cache.has(key)) return setThumb(cache.get(key))
    let live = true
    void window.secondTeam.referenceThumbnail(folder, kind, ownerId, file).then((t) => {
      cache.set(key, t)
      if (live) setThumb(t)
    })
    return () => {
      live = false
    }
  }, [folder, key, kind, ownerId, file])
  return thumb
}

function Thumb(props: { kind: Kind; ownerId: string | null; file: string; onRemove: () => void }) {
  const thumb = useThumbnail(props.kind, props.ownerId, props.file)
  return (
    <div className="ref-thumb" title={props.file}>
      {thumb ? <img src={thumb} alt="" /> : <span className="dim">{thumb === null ? 'missing' : '…'}</span>}
      <button className="ref-remove" onClick={props.onRemove} title="Remove from the list">
        <X size={11} />
      </button>
    </div>
  )
}

export default function ReferenceImages(props: {
  kind: Kind
  ownerId: string | null
  images: string[]
  onChange: (images: string[]) => void
  /** Ctrl+V pastes here (when not typing in a text box). */
  pasteShortcut?: boolean
}) {
  const folder = useUi((s) => s.projectPath)
  const [error, setError] = useState<string | null>(null)
  const room = MAX_REFERENCE_IMAGES - props.images.length

  const add = async () => {
    if (!folder) return
    setError(null)
    const r = await window.secondTeam.addReferenceImages(folder, props.kind, props.ownerId, room)
    if ('error' in r) setError(r.error)
    else if (r.files.length) props.onChange([...props.images, ...r.files])
  }

  const paste = async () => {
    if (!folder) return
    setError(null)
    const r = await window.secondTeam.pasteReferenceImages(folder, props.kind, props.ownerId, room)
    if ('error' in r) setError(r.error)
    else if (r.files.length) props.onChange([...props.images, ...r.files])
  }

  // Ctrl+V while this is showing (and you're not typing text) pastes an image in.
  const { pasteShortcut } = props
  useEffect(() => {
    if (!pasteShortcut) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'v' || e.shiftKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      void paste()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className="ref-images">
      <div className="ref-grid">
        {props.images.map((file) => (
          <Thumb
            key={file}
            kind={props.kind}
            ownerId={props.ownerId}
            file={file}
            onRemove={() => props.onChange(props.images.filter((f) => f !== file))}
          />
        ))}
        {room > 0 && (
          <button
            className="ref-add"
            onClick={() => void add()}
            disabled={!folder}
            title={folder ? `Add up to ${room} more image${room === 1 ? '' : 's'} (PNG or JPEG)` : 'Save the project first'}
          >
            <ImagePlus size={16} />
          </button>
        )}
        {room > 0 && (
          <button
            className="ref-add"
            onClick={() => void paste()}
            disabled={!folder}
            title={
              folder
                ? `Paste an image from the clipboard${props.pasteShortcut ? ' (Ctrl+V)' : ''}: copied from a browser, a screenshot, or image files copied in Explorer`
                : 'Save the project first'
            }
          >
            <ClipboardPaste size={16} />
          </button>
        )}
      </div>
      {!folder && <p className="hint small">Save the project to add reference images.</p>}
      {error && <p className="hint small take-error">{error}</p>}
    </div>
  )
}

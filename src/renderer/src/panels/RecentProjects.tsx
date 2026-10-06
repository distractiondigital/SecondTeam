import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, FilePlus, FolderOpen, X } from 'lucide-react'
import logo from '../../../../build/icon.png'
import { COPYRIGHT, CREDITS } from '../../../shared/credits'
import { useDocument } from '../state/documentStore'
import { newProject, openProject, openRecentProject } from '../state/projectIO'
import { useUi } from '../state/uiStore'

// Recent projects: the start panel shown over the empty viewport when the app opens, and the
// Open ▾ menu in the toolbar. The list itself lives in the main process (recent.json).

type Recent = Awaited<ReturnType<Window['secondTeam']['recentProjects']>>[number]

function useRecent(reloadKey: unknown): [Recent[], () => void] {
  const [list, setList] = useState<Recent[]>([])
  const load = () => {
    window.secondTeam.recentProjects().then(setList, () => setList([]))
  }
  useEffect(load, [reloadKey])
  return [list, load]
}

function when(ms: number | null): string {
  if (ms === null) return 'Not found'
  const d = new Date(ms)
  const days = Math.floor((Date.now() - ms) / 86_400_000)
  if (days < 1) return `Today, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  if (days < 2) return 'Yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function RecentList({ list, onOpen, onForget }: { list: Recent[]; onOpen: (r: Recent) => void; onForget: (r: Recent) => void }) {
  if (list.length === 0) return <p className="hint">Projects you open or save show up here.</p>
  return (
    <ul className="recent-list">
      {list.map((r) => (
        <li key={r.path} className={r.exists ? '' : 'missing'}>
          <button className="recent-open" disabled={!r.exists} onClick={() => onOpen(r)} title={r.path}>
            <span className="recent-name">{r.name}</span>
            <span className="recent-path">{r.path}</span>
          </button>
          <span className="recent-when">{when(r.savedAt)}</span>
          <button className="icon-button" title="Remove from this list (the folder is left alone)" onClick={() => onForget(r)}>
            <X size={13} />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Who made what the app is built on (src/shared/credits.ts), in place of the start screen's list. */
function Credits({ onBack }: { onBack: () => void }) {
  return (
    <div className="start-credits">
      <button className="start-link" onClick={onBack}>
        <ArrowLeft size={13} /> Back
      </button>
      {CREDITS.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <ul>
            {section.items.map((c) => (
              <li key={c.name}>
                <span className="credit-name">{c.name}</span>
                {c.by && <span className="credit-by"> by {c.by}</span>}
                <span className="credit-license">{c.license}</span>
                {c.note && <div className="credit-note">{c.note}</div>}
                <div className="credit-url">{c.url}</div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Over the empty viewport when the app starts; goes away once you open, start or add anything. */
export function StartScreen() {
  const dismissed = useUi((s) => s.startDismissed)
  const projectPath = useUi((s) => s.projectPath)
  const edited = useDocument((s) => s.past.length > 0)
  const [list, reload] = useRecent(null)
  const [credits, setCredits] = useState(false)
  if (dismissed || projectPath || edited) return null
  const close = () => useUi.getState().dismissStart()
  return (
    <div className="start-screen">
      <div className="start-brand">
        <img src={logo} alt="" draggable={false} />
        <div>
          <h2>Second Team</h2>
          <div className="start-version">Version {__APP_VERSION__}</div>
        </div>
      </div>
      {credits ? (
        <Credits onBack={() => setCredits(false)} />
      ) : (
        <>
          <div className="start-actions">
            <button
              className="generate-button"
              onClick={async () => {
                await newProject()
                close()
              }}
            >
              <FilePlus size={15} /> New project
            </button>
            <button className="generate-button" onClick={() => void openProject()}>
              <FolderOpen size={15} /> Open…
            </button>
          </div>
          <h3>Recent projects</h3>
          <RecentList
            list={list}
            onOpen={(r) => void openRecentProject(r.path)}
            onForget={async (r) => {
              await window.secondTeam.forgetRecentProject(r.path)
              reload()
            }}
          />
        </>
      )}
      <div className="start-footer">
        <span>{COPYRIGHT}</span>
        {!credits && (
          <button className="start-link" onClick={() => setCredits(true)}>
            Credits
          </button>
        )}
      </div>
    </div>
  )
}

/** The ▾ next to Open in the toolbar. */
export function RecentMenu() {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState({ left: 0, top: 0 })
  const [list, reload] = useRecent(open)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="recent-menu" ref={box}>
      <button
        className={`tool-button narrow${open ? ' active' : ''}`}
        title="Recent projects"
        onClick={(e) => {
          // Pinned to the window under the button (the toolbar would clip it).
          const b = e.currentTarget.getBoundingClientRect()
          setAt({ left: b.left, top: b.bottom + 4 })
          setOpen(!open)
        }}
      >
        <ChevronDown size={13} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="recent-popover" style={at}>
          <h3>Recent projects</h3>
          <RecentList
            list={list}
            onOpen={(r) => {
              setOpen(false)
              void openRecentProject(r.path)
            }}
            onForget={async (r) => {
              await window.secondTeam.forgetRecentProject(r.path)
              reload()
            }}
          />
        </div>
      )}
    </div>
  )
}

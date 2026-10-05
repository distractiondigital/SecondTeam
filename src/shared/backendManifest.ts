// The AI backend's pinned manifest (backend/manifest.json): ComfyUI portable, the models and the
// ComfyUI add-ons, each with its URL, size, SHA256 and licence. These are the rules the setup
// wizard and the installer share: what can be installed, what's required, where each piece
// lives inside the backend folder, and when it counts as installed. Pure; tested.

interface Downloadable {
  id: string
  name: string
  url: string
  sha256: string
  /** Bytes to download. */
  size: number
  license: string
  licenseUrl: string
  notes?: string
}

export interface EngineEntry extends Downloadable {
  version: string
  /** The folder inside the archive that holds the portable install. */
  archiveFolder: string
  /** Bytes on disk once unpacked (for the free-space check). */
  installedSize: number
}

export type ModelKind = 'checkpoint' | 'controlnet' | 'ipadapter' | 'clip_vision'

export interface ModelEntry extends Downloadable {
  kind: ModelKind
  family: string
  file: string
  /** Under ComfyUI\models\. */
  folder: string
  commercial: boolean
  style: string
  default?: boolean
  required?: boolean
}

export interface AddonEntry extends Downloadable {
  version: string
  archiveFolder: string
  /** Under ComfyUI\custom_nodes\. */
  folder: string
  default?: boolean
}

export interface Manifest {
  manifestVersion: number
  comfyui: EngineEntry
  models: ModelEntry[]
  customNodes: AddonEntry[]
}

export type ItemKind = 'engine' | ModelKind | 'addon'

/** One thing the wizard can install. */
export interface InstallItem {
  id: string
  name: string
  kind: ItemKind
  /** Download size in bytes. */
  size: number
  /** Disk space needed while installing (archives need room to unpack). */
  diskSize: number
  license: string
  licenseUrl: string
  /** What it's for, in plain words. */
  description: string
  /** Generation can't work without it, so it can't be unticked. */
  required: boolean
  /** Ticked when the wizard opens. */
  default: boolean
}

export function installItems(m: Manifest): InstallItem[] {
  const engine: InstallItem = {
    id: m.comfyui.id,
    name: `${m.comfyui.name} ${m.comfyui.version}`,
    kind: 'engine',
    size: m.comfyui.size,
    diskSize: m.comfyui.size + m.comfyui.installedSize,
    license: m.comfyui.license,
    licenseUrl: m.comfyui.licenseUrl,
    description: 'The AI engine (runs hidden in the background).',
    required: true,
    default: true
  }
  const models = m.models.map(
    (x): InstallItem => ({
      id: x.id,
      name: x.name,
      kind: x.kind,
      size: x.size,
      diskSize: x.size,
      license: x.license,
      licenseUrl: x.licenseUrl,
      description: x.style,
      required: Boolean(x.required),
      default: Boolean(x.required || x.default)
    })
  )
  // The continuity workflow uses the IP-Adapter add-on on every take, so add-ons are required.
  const addons = m.customNodes.map(
    (x): InstallItem => ({
      id: x.id,
      name: x.name,
      kind: 'addon',
      size: x.size,
      diskSize: x.size * 4,
      license: x.license,
      licenseUrl: x.licenseUrl,
      description: 'Add-on that lets the engine use reference images.',
      required: true,
      default: true
    })
  )
  return [engine, ...models, ...addons]
}

/** The ids to install: everything required plus what's ticked (unknown ids dropped). */
export function chosenIds(items: InstallItem[], ticked: string[]): string[] {
  return items.filter((i) => i.required || ticked.includes(i.id)).map((i) => i.id)
}

/** A choice is usable only with at least one checkpoint (the model that draws the picture). */
export function hasCheckpoint(items: InstallItem[], ids: string[]): boolean {
  return items.some((i) => i.kind === 'checkpoint' && ids.includes(i.id))
}

/** What's on disk for one item, relative to the backend folder ('/' separated). */
export type Check =
  | { path: string; kind: 'exists' }
  | { path: string; kind: 'size'; size: number; sha256: string }
  | { path: string; kind: 'text'; text: string }

/** The files that show an item is installed. */
export function itemChecks(m: Manifest, id: string): Check[] {
  if (id === m.comfyui.id) {
    return [
      { path: 'python_embeded/python.exe', kind: 'exists' },
      { path: 'ComfyUI/main.py', kind: 'exists' }
    ]
  }
  const model = m.models.find((x) => x.id === id)
  if (model) return [{ path: `ComfyUI/models/${model.folder}/${model.file}`, kind: 'size', size: model.size, sha256: model.sha256 }]
  const addon = m.customNodes.find((x) => x.id === id)
  if (addon) return [{ path: `ComfyUI/custom_nodes/${addon.folder}/.secondteam-version`, kind: 'text', text: addon.version }]
  return []
}

export type ItemState = 'installed' | 'missing' | 'damaged'

/** How the disk looks for a path (the installer reads the real files; tests pass fakes). */
export interface Probe {
  /** Size in bytes, or null if there's no such file. */
  size(path: string): number | null
  read(path: string): string | null
}

export function itemState(m: Manifest, id: string, probe: Probe): ItemState {
  const checks = itemChecks(m, id)
  if (!checks.length) return 'missing'
  let anyPresent = false
  let ok = true
  for (const c of checks) {
    const size = probe.size(c.path)
    if (size === null) {
      ok = false
      continue
    }
    anyPresent = true
    if (c.kind === 'size' && size !== c.size) ok = false
    if (c.kind === 'text' && probe.read(c.path)?.trim() !== c.text) ok = false
  }
  return ok ? 'installed' : anyPresent ? 'damaged' : 'missing'
}

/** Whether generation can run from this folder: the engine, every required piece and a checkpoint. */
export function readyToGenerate(m: Manifest, states: Record<string, ItemState>): boolean {
  const items = installItems(m)
  const installed = (id: string) => states[id] === 'installed'
  return items.filter((i) => i.required).every((i) => installed(i.id)) && items.some((i) => i.kind === 'checkpoint' && installed(i.id))
}

export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`
  return `${Math.max(1, Math.round(n / 1e3))} KB`
}

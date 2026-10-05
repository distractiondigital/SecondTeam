import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { createWriteStream, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, type WriteStream } from 'fs'
import { createServer } from 'net'
import { join } from 'path'
import type { BackendStatus } from '../../shared/takes'

export type { BackendStatus }

// Runs the ComfyUI in the backend folder (see settings.ts) as a hidden background process on a free
// localhost port: starts it, checks it's answering, restarts it if it crashes (a few times), and
// stops it (with everything it started) when the app quits. Its output goes to a log file.
// Advanced: with an external URL it uses a ComfyUI that's already running and only checks on it.

const START_TIMEOUT = 240_000 // the first start can take a while (it compiles and caches)
const MAX_RESTARTS = 3

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port'))))
    })
  })
}

export class ComfyProcess {
  private child: ChildProcess | null = null
  private log: WriteStream | null = null
  private stopping = false
  /** Processes we stopped on purpose (their exit isn't a crash). */
  private killed = new WeakSet<ChildProcess>()
  private restarts = 0
  private status: BackendStatus

  private externalUrl: string | null = null

  constructor(
    private comfyDir: string,
    logDir: string,
    private readonly onStatus: (status: BackendStatus) => void
  ) {
    mkdirSync(logDir, { recursive: true })
    this.status = { state: 'stopped', message: '', url: null, comfyVersion: null, logFile: join(logDir, 'comfyui.log') }
    this.pidFile = join(logDir, 'comfyui.pid')
  }

  private readonly pidFile: string

  /** A ComfyUI left behind by a previous run that didn't shut down cleanly (e.g. a dev reload). */
  private killLeftover(): void {
    try {
      const pid = Number(readFileSync(this.pidFile, 'utf-8'))
      const found = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true, encoding: 'utf-8' })
      if (pid > 0 && /python\.exe/i.test(found.stdout ?? '')) {
        spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
      }
    } catch {
      // no leftover
    }
    rmSync(this.pidFile, { force: true })
  }

  get dir(): string {
    return this.comfyDir
  }

  get external(): string | null {
    return this.externalUrl
  }

  /** Point at another folder (or an external ComfyUI) and start again. */
  async configure(dir: string, externalUrl: string | null): Promise<void> {
    this.stop()
    this.comfyDir = dir
    this.externalUrl = externalUrl
    this.restarts = 0
    await new Promise((r) => setTimeout(r, 300))
    await this.start()
  }

  get current(): BackendStatus {
    return this.status
  }

  private set(patch: Partial<BackendStatus>): void {
    this.status = { ...this.status, ...patch }
    this.onStatus(this.status)
  }

  get python(): string {
    return join(this.comfyDir, 'python_embeded', 'python.exe')
  }

  get installed(): boolean {
    return existsSync(this.python) && existsSync(join(this.comfyDir, 'ComfyUI', 'main.py'))
  }

  async start(): Promise<void> {
    if (this.child) return
    if (this.externalUrl) return this.useExternal(this.externalUrl)
    if (!this.installed) {
      this.set({
        state: 'not-installed',
        message: "The AI engine isn't set up yet. Click Set up the AI engine below.",
        url: null
      })
      return
    }
    this.stopping = false
    this.killLeftover()
    const port = await freePort()
    const url = `http://127.0.0.1:${port}`
    this.set({ state: 'starting', message: 'Starting the AI engine…', url: null })

    this.log?.end()
    this.log = this.openLog()
    this.log.write(`[Second Team] starting ComfyUI on ${url} at ${new Date().toISOString()}\n`)
    const child = spawn(
      this.python,
      [
        '-s',
        join('ComfyUI', 'main.py'),
        '--listen',
        '127.0.0.1',
        '--port',
        String(port),
        '--preview-method',
        'auto',
        '--disable-auto-launch'
      ],
      { cwd: this.comfyDir, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }
    )
    this.child = child
    if (child.pid) writeFileSync(this.pidFile, String(child.pid))
    child.stdout?.pipe(this.log, { end: false })
    child.stderr?.pipe(this.log, { end: false })
    child.on('exit', (code) => {
      this.log?.write(`\n[Second Team] ComfyUI exited (code ${code})\n`)
      if (this.killed.has(child)) {
        if (this.stopping && !this.child) this.set({ state: 'stopped', message: 'Stopped', url: null })
        return
      }
      if (this.child === child) this.child = null
      if (this.restarts < MAX_RESTARTS) {
        this.restarts++
        this.set({ state: 'starting', message: `The AI engine stopped; restarting (${this.restarts}/${MAX_RESTARTS})…`, url: null })
        void this.start()
      } else {
        this.set({ state: 'error', message: 'The AI engine keeps stopping. Open the log for details.', url: null })
      }
    })

    // Wait until it answers.
    const deadline = Date.now() + START_TIMEOUT
    while (this.child === child && Date.now() < deadline) {
      try {
        const res = await fetch(`${url}/system_stats`)
        if (res.ok) {
          const stats = (await res.json()) as { system?: { comfyui_version?: string } }
          this.set({ state: 'ready', message: 'Ready', url, comfyVersion: stats.system?.comfyui_version ?? null })
          return
        }
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    if (this.child === child) {
      this.set({ state: 'error', message: "The AI engine didn't start in time. Open the log for details.", url: null })
      this.kill()
    }
  }

  /** A ComfyUI someone else runs: check it answers, nothing to start or stop. */
  private async useExternal(url: string): Promise<void> {
    this.stopping = false
    this.set({ state: 'starting', message: `Connecting to ${url}…`, url: null })
    try {
      const res = await fetch(`${url}/system_stats`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const stats = (await res.json()) as { system?: { comfyui_version?: string } }
      if (this.externalUrl === url) this.set({ state: 'ready', message: `Using the ComfyUI at ${url}`, url, comfyVersion: stats.system?.comfyui_version ?? null })
    } catch (err) {
      if (this.externalUrl === url) this.set({ state: 'error', message: `No ComfyUI answered at ${url} (${(err as Error).message}).`, url: null })
    }
  }

  /**
   * The log file, emptied. Right after a restart the previous engine can still hold it open for a
   * moment, so retry briefly, then fall back to a second file rather than logging nothing.
   */
  private openLog(): WriteStream {
    const pause = new Int32Array(new SharedArrayBuffer(4))
    for (const file of [this.status.logFile, this.status.logFile.replace(/\.log$/, '-2.log')]) {
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const stream = createWriteStream('', { fd: openSync(file, 'w') })
          stream.on('error', () => undefined) // never let logging take the app down
          if (file !== this.status.logFile) this.status = { ...this.status, logFile: file }
          return stream
        } catch {
          Atomics.wait(pause, 0, 0, 200)
        }
      }
    }
    const nowhere = createWriteStream('', { fd: openSync('NUL', 'w') })
    nowhere.on('error', () => undefined)
    return nowhere
  }

  /** Stop ComfyUI and everything it started. Synchronous, so it's safe while the app quits. */
  stop(): void {
    this.stopping = true
    this.kill()
    if (this.externalUrl) this.set({ state: 'stopped', message: 'Stopped', url: null })
  }

  async restart(): Promise<void> {
    this.stop()
    this.restarts = 0
    await new Promise((r) => setTimeout(r, 500))
    await this.start()
  }

  private kill(): void {
    const child = this.child
    this.child = null
    if (!child) return
    this.killed.add(child)
    if (child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    rmSync(this.pidFile, { force: true })
  }
}

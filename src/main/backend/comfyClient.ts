// Talks to a running ComfyUI over its local HTTP + WebSocket API: upload an image, queue a
// workflow, follow its progress and live previews, fetch the result, interrupt.

export interface ComfyImageRef {
  filename: string
  subfolder: string
  type: string
}

export type ComfyMessage =
  | { type: 'progress'; promptId: string | null; value: number; max: number }
  | { type: 'finished'; promptId: string }
  | { type: 'failed'; promptId: string; message: string }
  | { type: 'interrupted'; promptId: string }
  | { type: 'preview'; promptId: string | null; mime: string; data: Uint8Array }

/**
 * A binary WebSocket frame. ComfyUI sends previews as [event u32][image type u32][image bytes],
 * or (newer) [4][metadata length u32][JSON metadata][image bytes] with the prompt id in the metadata.
 */
export function parseBinaryMessage(buffer: ArrayBuffer): ComfyMessage | null {
  if (buffer.byteLength < 8) return null
  const view = new DataView(buffer)
  const event = view.getUint32(0)
  if (event === 1) {
    const mime = view.getUint32(4) === 2 ? 'image/png' : 'image/jpeg'
    return { type: 'preview', promptId: null, mime, data: new Uint8Array(buffer, 8) }
  }
  if (event === 4) {
    const length = view.getUint32(4)
    if (8 + length > buffer.byteLength) return null
    let meta: { prompt_id?: string; image_type?: string } = {}
    try {
      meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, length)))
    } catch {
      // keep going without metadata
    }
    return {
      type: 'preview',
      promptId: meta.prompt_id ?? null,
      mime: meta.image_type ?? 'image/jpeg',
      data: new Uint8Array(buffer, 8 + length)
    }
  }
  return null
}

/** A text WebSocket message, reduced to what the app needs. */
export function parseTextMessage(text: string): ComfyMessage | null {
  let msg: { type?: string; data?: Record<string, unknown> }
  try {
    msg = JSON.parse(text)
  } catch {
    return null
  }
  const d = msg.data ?? {}
  const promptId = typeof d.prompt_id === 'string' ? d.prompt_id : null
  switch (msg.type) {
    case 'progress':
      return { type: 'progress', promptId, value: Number(d.value) || 0, max: Number(d.max) || 1 }
    case 'executing':
      // node === null means the whole prompt has finished.
      return d.node === null && promptId ? { type: 'finished', promptId } : null
    case 'execution_success':
      return promptId ? { type: 'finished', promptId } : null
    case 'execution_error':
      return promptId
        ? { type: 'failed', promptId, message: String(d.exception_message ?? 'The AI engine reported an error.').trim() }
        : null
    case 'execution_interrupted':
      return promptId ? { type: 'interrupted', promptId } : null
    default:
      return null
  }
}

export class ComfyClient {
  readonly clientId = crypto.randomUUID()
  private socket: WebSocket | null = null
  private listeners = new Set<(m: ComfyMessage) => void>()

  constructor(readonly baseUrl: string) {}

  /** Open the WebSocket (once) and resolve when it's connected. */
  connect(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.baseUrl.replace(/^http/, 'ws')}/ws?clientId=${this.clientId}`)
      ws.binaryType = 'arraybuffer'
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error("Couldn't connect to the AI engine."))
      ws.onclose = () => {
        if (this.socket === ws) this.socket = null
      }
      ws.onmessage = (e) => {
        const m = typeof e.data === 'string' ? parseTextMessage(e.data) : parseBinaryMessage(e.data as ArrayBuffer)
        if (m) for (const l of this.listeners) l(m)
      }
      this.socket = ws
    })
  }

  onMessage(listener: (m: ComfyMessage) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close(): void {
    this.socket?.close()
    this.socket = null
  }

  /** Put an image in ComfyUI's input folder (replacing one of the same name). Returns its name. */
  async upload(name: string, png: Buffer): Promise<string> {
    const form = new FormData()
    form.append('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), name)
    form.append('overwrite', 'true')
    form.append('type', 'input')
    const res = await fetch(`${this.baseUrl}/upload/image`, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`Uploading the depth pass failed (HTTP ${res.status}).`)
    const body = (await res.json()) as { name: string; subfolder?: string }
    return body.subfolder ? `${body.subfolder}/${body.name}` : body.name
  }

  /** Queue a filled-in workflow. Returns its prompt id. */
  async queue(prompt: unknown): Promise<string> {
    const res = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, client_id: this.clientId })
    })
    const body = (await res.json().catch(() => ({}))) as {
      prompt_id?: string
      error?: { message?: string; details?: string }
      node_errors?: Record<string, { errors?: { message?: string; details?: string }[] }>
    }
    if (!res.ok || !body.prompt_id) {
      const nodeError = Object.values(body.node_errors ?? {})[0]?.errors?.[0]
      const detail = nodeError ? `${nodeError.message}: ${nodeError.details}` : body.error?.details || body.error?.message
      throw new Error(`The AI engine rejected the job${detail ? ` (${detail})` : ''}.`)
    }
    return body.prompt_id
  }

  /** The images a finished prompt produced at `outputNode`. */
  async outputs(promptId: string, outputNode: string): Promise<ComfyImageRef[]> {
    const res = await fetch(`${this.baseUrl}/history/${encodeURIComponent(promptId)}`)
    const body = (await res.json()) as Record<string, { outputs?: Record<string, { images?: ComfyImageRef[] }> }>
    return body[promptId]?.outputs?.[outputNode]?.images ?? []
  }

  async image(ref: ComfyImageRef): Promise<Buffer> {
    const q = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder, type: ref.type })
    const res = await fetch(`${this.baseUrl}/view?${q}`)
    if (!res.ok) throw new Error(`Fetching the image failed (HTTP ${res.status}).`)
    return Buffer.from(await res.arrayBuffer())
  }

  /** Model files ComfyUI can see in one of its model folders (e.g. 'checkpoints'). */
  async models(folder: string): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/models/${encodeURIComponent(folder)}`)
    return res.ok ? ((await res.json()) as string[]) : []
  }

  /** Stop whatever is running now and drop our queued prompts. */
  async interrupt(queued: string[]): Promise<void> {
    if (queued.length) {
      await fetch(`${this.baseUrl}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete: queued })
      }).catch(() => undefined)
    }
    await fetch(`${this.baseUrl}/interrupt`, { method: 'POST' }).catch(() => undefined)
  }
}

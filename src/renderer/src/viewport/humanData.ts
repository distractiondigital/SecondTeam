import { useEffect, useState } from 'react'
import { parseBody, type BodyData, type BodyJson } from '../../../shared/humanBody'

// The human figures' body data, loaded once from the main process (the UI can't read files).

let loading: Promise<BodyData> | null = null
let loaded: BodyData | null = null

export function loadBodyData(): Promise<BodyData> {
  loading ??= (async () => {
    const [json, bin] = await Promise.all([window.secondTeam.readFigureFile('body.json'), window.secondTeam.readFigureFile('body.bin')])
    const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer
    loaded = parseBody(JSON.parse(new TextDecoder().decode(json)) as BodyJson, buffer)
    return loaded
  })()
  return loading
}

/** The body data, or null until it has loaded. */
export function useBodyData(): BodyData | null {
  const [data, setData] = useState<BodyData | null>(loaded)
  useEffect(() => {
    if (!data) void loadBodyData().then(setData)
  }, [data])
  return data
}

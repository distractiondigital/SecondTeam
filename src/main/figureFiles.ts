import { app, ipcMain } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'

// The human figures' data (figures/ in the app: MakeHuman CC0/CC-BY data converted by
// scripts/figures/). The UI can't read files itself, so it asks for them here. Only the body
// files, the proxy catalogue and files named like proxies/<id>.bin|png can be read.

const FIXED = new Set(['body.json', 'body.bin', 'proxies.json'])
const PROXY = /^proxies\/[a-z0-9-]+\.(bin|png)$/

export function registerFigureIpc(): void {
  ipcMain.handle('figures:read', async (_e, name: string) => {
    if (typeof name !== 'string' || (!FIXED.has(name) && !PROXY.test(name))) throw new Error(`Unknown figure file: ${name}`)
    return readFile(join(app.getAppPath(), 'figures', ...name.split('/')))
  })
}

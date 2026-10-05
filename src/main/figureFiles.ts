import { app, ipcMain } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'

// The human figures' body data (figures/ in the app: MakeHuman CC0 data converted by
// scripts/figures/build-figure-data.mjs). The UI can't read files itself, so it asks for them here.
// Only these fixed files can be read.

const FILES = new Set(['body.json', 'body.bin'])

export function registerFigureIpc(): void {
  ipcMain.handle('figures:read', async (_e, name: string) => {
    if (!FILES.has(name)) throw new Error(`Unknown figure file: ${name}`)
    return readFile(join(app.getAppPath(), 'figures', name))
  })
}

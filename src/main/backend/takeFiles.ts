import { nativeImage, shell } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readdir, readFile, rename, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { isSafeId } from '../../shared/passes'
import type { TakeInfo, TakeMeta } from '../../shared/takes'
import { isApproved } from '../projectFiles'

// A shot's takes live in its project folder:
//   Name.secondteam\scenes\<sceneId>\shots\<shotId>\takes\<takeId>.png  (+ .json sidecar, .thumb.jpg)
// Take ids start with the date and time, so sorting by name is sorting by age.

const THUMB_WIDTH = 320

export function takesFolder(folder: string, sceneId: unknown, shotId: unknown): string {
  if (!isApproved(folder)) throw new Error('Save the project first: takes are stored inside the project folder.')
  if (!isSafeId(sceneId) || !isSafeId(shotId)) throw new Error('That shot has an unexpected id.')
  return join(resolve(folder), 'scenes', sceneId, 'shots', shotId, 'takes')
}

/** e.g. 20260930-014512-a3 (local time, plus a little randomness). */
export function newTakeId(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return `${stamp}-${Math.random().toString(36).slice(2, 6)}`
}

async function writeAtomic(target: string, data: Buffer | string): Promise<void> {
  await writeFile(`${target}.tmp`, data)
  await rename(`${target}.tmp`, target)
}

function thumbnailOf(png: Buffer): Buffer {
  const image = nativeImage.createFromBuffer(png)
  return image.resize({ width: THUMB_WIDTH, quality: 'good' }).toJPEG(82)
}

const dataUrl = (mime: string, data: Buffer) => `data:${mime};base64,${data.toString('base64')}`

export async function saveTake(dir: string, meta: TakeMeta, png: Buffer): Promise<TakeInfo> {
  await mkdir(dir, { recursive: true })
  const thumb = thumbnailOf(png)
  await writeAtomic(join(dir, `${meta.id}.png`), png)
  await writeAtomic(join(dir, `${meta.id}.thumb.jpg`), thumb)
  await writeAtomic(join(dir, `${meta.id}.json`), JSON.stringify(meta, null, 2) + '\n')
  return infoOf(meta, thumb)
}

function infoOf(meta: TakeMeta, thumb: Buffer): TakeInfo {
  return {
    id: meta.id,
    shotId: meta.shot.id,
    createdAt: meta.createdAt,
    seed: meta.seed,
    checkpoint: meta.model.name,
    thumbnail: dataUrl('image/jpeg', thumb)
  }
}

/** A shot's takes, newest first. */
export async function listTakes(dir: string): Promise<TakeInfo[]> {
  if (!existsSync(dir)) return []
  const ids = (await readdir(dir))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .filter(isSafeId)
    .sort()
    .reverse()
  const takes: TakeInfo[] = []
  for (const id of ids) {
    try {
      const meta = JSON.parse(await readFile(join(dir, `${id}.json`), 'utf-8')) as TakeMeta
      const thumbPath = join(dir, `${id}.thumb.jpg`)
      const thumb = existsSync(thumbPath) ? await readFile(thumbPath) : thumbnailOf(await readFile(join(dir, `${id}.png`)))
      takes.push(infoOf({ ...meta, id }, thumb))
    } catch {
      // A damaged or half-written take: skip it.
    }
  }
  return takes
}

/** Move a take (image, thumbnail, sidecar) to the Recycle Bin, so a mistake can still be undone there. */
export async function deleteTake(dir: string, id: unknown): Promise<void> {
  if (!isSafeId(id)) throw new Error('Unexpected take id.')
  for (const ext of ['.png', '.thumb.jpg', '.json']) {
    const file = join(dir, `${id}${ext}`)
    if (existsSync(file)) await shell.trashItem(file)
  }
}

/** The full image and sidecar of one take. */
export async function readTake(dir: string, id: unknown): Promise<{ image: string; meta: TakeMeta }> {
  if (!isSafeId(id)) throw new Error('Unexpected take id.')
  const [png, json] = await Promise.all([readFile(join(dir, `${id}.png`)), readFile(join(dir, `${id}.json`), 'utf-8')])
  return { image: dataUrl('image/png', png), meta: JSON.parse(json) as TakeMeta }
}

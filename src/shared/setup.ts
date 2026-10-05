// Types shared by the setup wizard / engine settings (renderer) and the installer (main).

import type { InstallItem, ItemState } from './backendManifest'

export interface GpuInfo {
  name: string
  /** e.g. '595.79' */
  driver: string
  vramMB: number
}

export interface SystemCheck {
  /** The first NVIDIA card, or null if none was found. */
  gpu: GpuInfo | null
  /** A plain-language problem with the graphics card, or null if it looks fine. */
  gpuProblem: string | null
  /** A milder note (e.g. little video memory). */
  gpuNote: string | null
  /** Free space on the drive of the chosen folder, in bytes (null if unknown). */
  freeBytes: number | null
  /** 'Windows 11 (build 26200)' */
  windows: string
  /** What unpacks the engine's .7z archive: Windows' own tar, 7-Zip, or nothing usable. */
  unpacker: 'tar' | '7zip' | null
}

export interface SetupInfo {
  /** Where the engine and models live (or will). */
  dir: string
  isDefaultDir: boolean
  /** A ComfyUI the app uses instead of its own (advanced), or null. */
  externalUrl: string | null
  /** The user chose "Set up later". */
  skipped: boolean
  items: InstallItem[]
  states: Record<string, ItemState>
  /** Bytes already downloaded towards each item (a paused download). */
  partial: Record<string, number>
  /** Everything needed to generate is installed. */
  ready: boolean
  /** An install is running right now. */
  installing: boolean
}

export type SetupPhase = 'download' | 'verify' | 'unpack' | 'finished' | 'paused' | 'error'

export interface SetupProgress {
  phase: SetupPhase
  /** The item being worked on. */
  id: string | null
  itemDone: number
  itemTotal: number
  /** Bytes, across everything being downloaded in this run. */
  overallDone: number
  overallTotal: number
  /** Bytes per second (download phase). */
  speed: number
  message: string
}

/** A full check of an install: anything that isn't right. */
export interface VerifyResult {
  states: Record<string, ItemState>
  /** Items whose checksum didn't match (full check only). */
  damaged: string[]
}

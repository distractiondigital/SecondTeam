import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { cleanComfyUrl, gpuVendorName, prefersOpenGl, defaultBackendDir, parseSettings } from './settings'

describe('app settings', () => {
  it('keeps the engine in AppData when installed, and in the repo in development', () => {
    // (built with join, so it reads the same with Windows or Mac folder separators)
    const appData = join('C:', 'Users', 'Me', 'AppData', 'Local', 'SecondTeam')
    expect(defaultBackendDir(true, join('C:', 'Program Files', 'Second Team', 'resources', 'app.asar'), appData)).toBe(join(appData, 'backend'))
    expect(defaultBackendDir(false, join('C:', 'Dev', 'Second Team'))).toBe(join('C:', 'Dev', 'Second Team', 'ComfyUI'))
  })

  it('repairs a missing or damaged settings file', () => {
    const defaults = { backendDir: null, externalComfyUrl: null, setupSkipped: false, checkForUpdates: true, gpuVendor: null, openGlFailed: false }
    expect(parseSettings(null)).toEqual(defaults)
    expect(parseSettings('{not json')).toEqual(defaults)
    expect(parseSettings('[1]').backendDir).toBeNull()
    expect(parseSettings(JSON.stringify({ backendDir: 'D:\\AI\\Second Team', setupSkipped: true }))).toEqual({
      backendDir: 'D:\\AI\\Second Team',
      externalComfyUrl: null,
      setupSkipped: true,
      checkForUpdates: true,
      gpuVendor: null,
      openGlFailed: false
    })
  })

  it('checks for updates unless turned off', () => {
    expect(parseSettings(JSON.stringify({ checkForUpdates: false })).checkForUpdates).toBe(false)
    expect(parseSettings(JSON.stringify({ checkForUpdates: 'no' })).checkForUpdates).toBe(true)
  })

  it('only accepts a ComfyUI on this machine', () => {
    expect(cleanComfyUrl('http://127.0.0.1:8188/')).toBe('http://127.0.0.1:8188')
    expect(cleanComfyUrl('http://localhost:8188')).toBe('http://localhost:8188')
    expect(cleanComfyUrl('https://example.com:8188')).toBeNull()
    expect(cleanComfyUrl('file:///C:/x')).toBeNull()
    expect(cleanComfyUrl('')).toBeNull()
  })

  it('uses OpenGL only on NVIDIA cards on Windows, and never again after it crashed', () => {
    expect(gpuVendorName(0x10de)).toBe('nvidia')
    expect(gpuVendorName(0x8086)).toBe('intel')
    expect(prefersOpenGl({ gpuVendor: 'nvidia', openGlFailed: false }, 'win32')).toBe(true)
    expect(prefersOpenGl({ gpuVendor: 'nvidia', openGlFailed: true }, 'win32')).toBe(false)
    expect(prefersOpenGl({ gpuVendor: 'amd', openGlFailed: false }, 'win32')).toBe(false)
    expect(prefersOpenGl({ gpuVendor: null, openGlFailed: false }, 'win32')).toBe(false)
    expect(prefersOpenGl({ gpuVendor: 'nvidia', openGlFailed: false }, 'darwin')).toBe(false)
    expect(parseSettings(JSON.stringify({ gpuVendor: '../x' })).gpuVendor).toBeNull()
  })
})

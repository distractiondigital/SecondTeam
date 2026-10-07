import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { warmUpPathTracer } from './pathTrace'

// A little after the app opens, compile the Render's path tracer in the background (pathTrace.ts),
// so pressing Render later starts at once. Only where compiling is quick (OpenGL, Metal): on
// Direct3D it can stall the app for many seconds, so there it waits until a Render is asked for.

const DELAY = 2500 // ms after the 3D view first appears

export default function PathTraceWarmup() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const context = gl.getContext()
    const info = context.getExtension('WEBGL_debug_renderer_info')
    const renderer = info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    if (/Direct3D|D3D/i.test(renderer)) return
    const timer = setTimeout(() => void warmUpPathTracer(gl), DELAY)
    return () => clearTimeout(timer)
  }, [gl])
  return null
}

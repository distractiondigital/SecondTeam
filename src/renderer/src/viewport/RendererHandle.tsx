import { useEffect } from 'react'
import type { WebGLRenderer } from 'three'
import { useThree } from '@react-three/fiber'

// Shares the viewport's WebGL renderer with code outside the 3D canvas (e.g. the Render passes
// button), which has no other way to reach it.

let current: WebGLRenderer | null = null

export function getRenderer(): WebGLRenderer | null {
  return current
}

export default function RendererHandle() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    current = gl
    return () => {
      if (current === gl) current = null
    }
  }, [gl])
  return null
}

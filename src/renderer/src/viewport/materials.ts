import { PMREMGenerator, type Texture, type WebGLRenderer } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { MaterialKind } from '../../../shared/project'

// How each Material kind looks in the viewport, thumbnails and clay renders (render passes ignore
// it). Kept simple and readable rather than physically exact: these are previs stand-ins.

export interface MaterialLook {
  roughness: number
  metalness: number
  /** Below 1: see-through (glass). */
  opacity: number
  /** Lit by its own colour (glowing), 0–1. */
  glow: number
  castShadow: boolean
  /** How much it reflects a soft studio around it (metal is black without something to reflect). */
  reflect: number
}

export const MATERIAL_LOOKS: Record<MaterialKind, MaterialLook> = {
  matte: { roughness: 0.92, metalness: 0, opacity: 1, glow: 0, castShadow: true, reflect: 0 },
  glossy: { roughness: 0.25, metalness: 0, opacity: 1, glow: 0, castShadow: true, reflect: 0.5 },
  metal: { roughness: 0.3, metalness: 1, opacity: 1, glow: 0, castShadow: true, reflect: 1 },
  glass: { roughness: 0.05, metalness: 0, opacity: 0.35, glow: 0, castShadow: false, reflect: 0.8 },
  glowing: { roughness: 0.6, metalness: 0, opacity: 1, glow: 1, castShadow: false, reflect: 0 },
  // Curtains, frosted glass, diffusion: light gets through, dimmed by its density (a partial shadow,
  // see diffusionShadow in SceneNodes) and glowing on the far side (softShadows.ts ST_TRANSLUCENT).
  diffusion: { roughness: 0.95, metalness: 0, opacity: 1, glow: 0, castShadow: true, reflect: 0 }
}

export const MATERIAL_LABELS: Record<MaterialKind, string> = { matte: 'Matte', glossy: 'Glossy', metal: 'Metal', glass: 'Glass', glowing: 'Glow', diffusion: 'Diffusion' }

/** Diffusion densities to start from (how much light is held back). */
export const DENSITY_PRESETS = [
  { label: 'Sheer curtain', density: 0.15 },
  { label: '¼ grid', density: 0.3 },
  { label: '½ grid', density: 0.5 },
  { label: 'Full grid', density: 0.7 },
  { label: 'Heavy', density: 0.85 }
]

const studios = new WeakMap<WebGLRenderer, Texture>()

/** A soft studio for shiny materials to reflect (three.js's RoomEnvironment), made once per renderer. */
export function studioReflections(gl: WebGLRenderer): Texture {
  let texture = studios.get(gl)
  if (!texture) {
    const pmrem = new PMREMGenerator(gl)
    texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    studios.set(gl, texture)
  }
  return texture
}

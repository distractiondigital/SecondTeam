import { useEffect, useMemo } from 'react'
import { CanvasTexture, EquirectangularReflectionMapping, SRGBColorSpace } from 'three'
import { fogDensity, skyAt, type Environment } from '../../../shared/environment'

// The Clay look's surroundings: a sky gradient for the time of day (scene background, so it never
// gets in the way of clicks, shadows or the depth/ID passes) and a soft fill light in the sky's
// colour. The scene's own lights stay the key.

/** A tall strip mapped round the camera: zenith at the top, horizon in the middle, ground haze below. */
function skyTexture(env: Environment): CanvasTexture {
  const sky = skyAt(env.time)
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 512
  const ctx = canvas.getContext('2d')!
  // Rows run from straight up (top) to straight down (bottom); the horizon is the middle.
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  // Most of the change sits in the lowest 30° or so, where a level camera actually looks:
  // horizon glow fading quickly into the sky colour, which keeps deepening towards the zenith.
  for (let e = 0; e <= 90; e += 2) {
    g.addColorStop(0.5 - e / 180, mix(sky.horizon, sky.zenith, Math.pow(e / 90, 0.6)))
  }
  // Below the horizon (seen past the floor's edge, or with the floor off): haze into dim ground.
  for (let e = 2; e <= 90; e += 4) {
    g.addColorStop(0.5 + e / 180, mix(sky.horizon, mix(env.ground, '#000000', 0.5), Math.pow(e / 90, 0.5)))
  }
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 4, 512)
  const texture = new CanvasTexture(canvas)
  texture.mapping = EquirectangularReflectionMapping
  texture.colorSpace = SRGBColorSpace
  return texture
}

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

export default function EnvironmentView({ env }: { env: Environment }) {
  const texture = useMemo(() => skyTexture(env), [env])
  useEffect(() => () => texture.dispose(), [texture])
  const sky = skyAt(env.time)
  return (
    <>
      <primitive attach="background" object={texture} />
      {/* Distance fog in the horizon's colour, so far things melt into the sky. */}
      {env.fog > 0 && <fogExp2 attach="fog" args={[sky.horizon, fogDensity(env.fog)]} />}
      <hemisphereLight args={[sky.fill, env.ground, sky.fillIntensity]} userData={{ envLight: true }} />
    </>
  )
}

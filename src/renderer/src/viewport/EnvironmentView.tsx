import { useEffect, useMemo } from 'react'
import { CanvasTexture, EquirectangularReflectionMapping, SRGBColorSpace } from 'three'
import { skyAt, type Environment } from '../../../shared/environment'

// The Clay look's surroundings: a sky gradient for the time of day (scene background, so it never
// gets in the way of clicks, shadows or the depth/ID passes) and a soft fill light in the sky's
// colour. The scene's own lights stay the key.

/** A tall strip mapped round the camera: zenith at the top, horizon in the middle, ground haze below. */
function skyTexture(env: Environment): CanvasTexture {
  const sky = skyAt(env.time)
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, sky.zenith)
  g.addColorStop(0.42, sky.horizon)
  g.addColorStop(0.5, sky.horizon)
  // Below the horizon (only seen past the floor's edge, or with the floor off): dim haze.
  g.addColorStop(0.56, mix(sky.horizon, env.ground, 0.6))
  g.addColorStop(1, mix(env.ground, '#000000', 0.5))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 4, 256)
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
      <hemisphereLight args={[sky.fill, env.ground, sky.fillIntensity]} userData={{ envLight: true }} />
    </>
  )
}

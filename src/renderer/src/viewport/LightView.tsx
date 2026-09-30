import { useMemo } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute, MathUtils, Object3D } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { kelvinToRgb, threeIntensity } from '../../../shared/lighting'
import type { LightNode } from '../../../shared/project'
import { useUi } from '../state/uiStore'
import { handleNodeClick, handleNodeDoubleClick, noRaycast, SELECTION_COLOR } from './selection'

// A light in the set: the actual three.js light (only switched on in Clay shading) and a small
// icon so you can see, pick and aim it (a helper: never in renders). Sun and spot shine down
// the node's local -Z, so rotating the node aims them.

const SUN_DISTANCE = 25 // the sun's shadow camera sits this far "behind" the node
const SUN_SHADOW_HALF = 12 // metres of set covered by the sun's shadows, each way
const HELPER = { helper: true }

function lines(points: number[]): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(points, 3))
  return g
}

/** Outline of a cone of `angle` degrees, `length` long, pointing down -Z. */
function coneOutline(angle: number, length: number): BufferGeometry {
  const r = Math.tan(MathUtils.degToRad(angle / 2)) * length
  const pts: number[] = []
  const n = 24
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    pts.push(Math.cos(a0) * r, Math.sin(a0) * r, -length, Math.cos(a1) * r, Math.sin(a1) * r, -length)
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    pts.push(0, 0, 0, Math.cos(a) * r, Math.sin(a) * r, -length)
  }
  return lines(pts)
}

const SUN_ARROW = lines([0, 0, 0, 0, 0, -0.7, 0, 0, -0.7, 0.06, 0, -0.58, 0, 0, -0.7, -0.06, 0, -0.58])

interface Props {
  node: LightNode
  selected: boolean
  clickable: boolean
  /** Lights only shine in Clay shading. */
  lit: boolean
  /** A hidden per-shot copy: no icon. */
  passive: boolean
}

export default function LightView({ node, selected, clickable, lit, passive }: Props) {
  const target = useMemo(() => new Object3D(), [])
  // Like camera bodies, light icons stay out of the frame while looking through a camera.
  const inCameraView = useUi((s) => s.lookThroughId !== null)
  const color = useMemo(() => new Color(...kelvinToRgb(node.kelvin)), [node.kelvin])
  const iconColor = selected ? SELECTION_COLOR : '#' + color.getHexString()
  const intensity = threeIntensity(node.kind, node.stops)
  // Variance shadow maps: radius blurs the edge (hard 1 … soft 12).
  const shadowRadius = 1 + node.softness * 11
  const cone = useMemo(() => coneOutline(node.coneAngle, 0.8), [node.coneAngle])

  const pick = {
    raycast: clickable ? undefined : noRaycast,
    onClick: clickable ? (e: ThreeEvent<MouseEvent>) => handleNodeClick(e, node.id) : undefined,
    onDoubleClick: clickable ? (e: ThreeEvent<MouseEvent>) => handleNodeDoubleClick(e, node.id) : undefined
  }
  const shadow = {
    castShadow: node.shadows,
    'shadow-bias': -0.0002,
    'shadow-normalBias': 0.01,
    'shadow-radius': shadowRadius,
    'shadow-blurSamples': 16
  }

  return (
    <>
      {lit && node.kind === 'sun' && (
        <>
          <primitive object={target} position={[0, 0, 0]} />
          <directionalLight
            position={[0, 0, SUN_DISTANCE]}
            target={target}
            color={color}
            intensity={intensity}
            {...shadow}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-SUN_SHADOW_HALF}
            shadow-camera-right={SUN_SHADOW_HALF}
            shadow-camera-top={SUN_SHADOW_HALF}
            shadow-camera-bottom={-SUN_SHADOW_HALF}
            shadow-camera-near={1}
            shadow-camera-far={SUN_DISTANCE * 2.5}
          />
        </>
      )}
      {lit && node.kind === 'spot' && (
        <>
          <primitive object={target} position={[0, 0, -1]} />
          <spotLight
            target={target}
            color={color}
            intensity={intensity}
            angle={MathUtils.degToRad(node.coneAngle / 2)}
            penumbra={node.falloff}
            decay={2}
            distance={0}
            {...shadow}
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
        </>
      )}
      {lit && node.kind === 'point' && (
        <pointLight color={color} intensity={intensity} decay={2} distance={0} {...shadow} />
      )}
      {lit && node.kind === 'ambient' && <hemisphereLight args={[color, '#3a3a3a', intensity]} />}

      {!passive && !inCameraView && (
        <group userData={HELPER}>
          {/* Something to click: a small bulb for every kind of light. */}
          <mesh {...pick}>
            <sphereGeometry args={[node.kind === 'ambient' ? 0.14 : 0.08, 16, 12]} />
            <meshBasicMaterial color={iconColor} />
          </mesh>
          {node.kind === 'sun' && (
            <>
              <mesh rotation={[0, 0, 0]}>
                <torusGeometry args={[0.16, 0.012, 8, 32]} />
                <meshBasicMaterial color={iconColor} />
              </mesh>
              <lineSegments geometry={SUN_ARROW}>
                <lineBasicMaterial color={iconColor} />
              </lineSegments>
            </>
          )}
          {node.kind === 'spot' && (
            <lineSegments geometry={cone}>
              <lineBasicMaterial color={iconColor} transparent opacity={0.8} />
            </lineSegments>
          )}
          {node.kind === 'ambient' && (
            <mesh>
              <sphereGeometry args={[0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshBasicMaterial color={iconColor} wireframe transparent opacity={0.6} />
            </mesh>
          )}
        </group>
      )}
    </>
  )
}

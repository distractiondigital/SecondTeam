import { useMemo } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute, MathUtils, Object3D } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { kelvinToRgb, threeIntensity } from '../../../shared/lighting'
import type { LightNode } from '../../../shared/project'
import { useUi } from '../state/uiStore'
import { SPOT_SHADOW_FAR, SPOT_SHADOW_NEAR } from './softShadows'
import { handleNodeClick, handleNodeDoubleClick, noRaycast, SELECTION_COLOR } from './selection'

// A light in the set: the actual three.js light (only switched on in Clay shading) and a small
// icon so you can see, pick and aim it (a helper: never in renders). Sun and spot shine down
// the node's local -Z, so rotating the node aims them.

const SUN_DISTANCE = 25 // the sun's shadow camera sits this far "behind" the node
const SUN_SHADOW_HALF = 12 // metres of set covered by the sun's shadows, each way
const SUN_NEAR = 1
const SUN_FAR = SUN_DISTANCE * 2.5
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

/** A circle of `radius` in the plane square to `axis` ('z': facing down -Z, like a spot's lens). */
function circle(radius: number, axis: 'x' | 'y' | 'z'): BufferGeometry {
  const pts: number[] = []
  const n = 48
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    const p = (a: number) => {
      const c = Math.cos(a) * radius
      const s = Math.sin(a) * radius
      return axis === 'z' ? [c, s, 0] : axis === 'y' ? [c, 0, s] : [0, c, s]
    }
    pts.push(...p(a0), ...p(a1))
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
  // Soft shadows from the light's real size (softShadows.ts reads it from shadow.radius).
  const halfCone = MathUtils.degToRad(node.coneAngle / 2)
  const shadowRadius =
    node.kind === 'sun'
      ? ((SUN_FAR - SUN_NEAR) * Math.tan(MathUtils.degToRad(node.size))) / (2 * SUN_SHADOW_HALF)
      : node.kind === 'spot'
        ? -node.size / (2 * Math.tan(Math.min(halfCone, MathUtils.degToRad(80))))
        : node.size
  const cone = useMemo(() => coneOutline(node.coneAngle, 0.8), [node.coneAngle])
  // The source's real size, shown while selected: a disc for a spot, a sphere outline for a bulb.
  const sizeOutline = useMemo(() => {
    if (node.kind !== 'point' && node.kind !== 'spot') return []
    const r = node.size / 2
    return node.kind === 'spot' ? [circle(r, 'z')] : [circle(r, 'x'), circle(r, 'y'), circle(r, 'z')]
  }, [node.kind, node.size])

  const pick = {
    raycast: clickable ? undefined : noRaycast,
    onClick: clickable ? (e: ThreeEvent<MouseEvent>) => handleNodeClick(e, node.id) : undefined,
    onDoubleClick: clickable ? (e: ThreeEvent<MouseEvent>) => handleNodeDoubleClick(e, node.id) : undefined
  }
  // For the soft-light shading (softShadows.ts): the sun's angular radius as a sine, a lamp's radius.
  const source = { sourceSize: node.kind === 'sun' ? Math.sin(MathUtils.degToRad(node.size / 2)) : node.size / 2 }
  const shadow = {
    userData: source,
    castShadow: node.shadows,
    // Shadows are cast by front faces (castFromFrontFaces); the receiver-plane bias in
    // softShadows.ts keeps flat surfaces clean, this small offset curved ones.
    'shadow-bias': node.kind === 'sun' ? -0.00008 : -0.00015,
    'shadow-normalBias': 0,
    'shadow-radius': shadowRadius
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
            shadow-mapSize-width={4096}
            shadow-mapSize-height={4096}
            shadow-camera-left={-SUN_SHADOW_HALF}
            shadow-camera-right={SUN_SHADOW_HALF}
            shadow-camera-top={SUN_SHADOW_HALF}
            shadow-camera-bottom={-SUN_SHADOW_HALF}
            shadow-camera-near={SUN_NEAR}
            shadow-camera-far={SUN_FAR}
          />
        </>
      )}
      {lit && node.kind === 'spot' && (
        <>
          <primitive object={target} position={[0, 0, -1]} />
          {/* At the icon (three.js puts a new spot light 1 m up by default, which skewed its aim). */}
          <spotLight
            position={[0, 0, 0]}
            target={target}
            color={color}
            intensity={intensity}
            angle={MathUtils.degToRad(node.coneAngle / 2)}
            penumbra={node.falloff}
            decay={2}
            distance={0}
            {...shadow}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-near={SPOT_SHADOW_NEAR}
            shadow-camera-far={SPOT_SHADOW_FAR}
          />
        </>
      )}
      {lit && node.kind === 'point' && (
        <pointLight
          color={color}
          intensity={intensity}
          decay={2}
          distance={0}
          {...shadow}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={0.05}
          shadow-camera-far={60}
        />
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
          {selected &&
            sizeOutline.map((g, i) => (
              <lineSegments key={i} geometry={g}>
                <lineBasicMaterial color={iconColor} transparent opacity={0.45} />
              </lineSegments>
            ))}
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

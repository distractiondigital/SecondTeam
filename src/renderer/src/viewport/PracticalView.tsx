import { useEffect, useMemo } from 'react'
import { BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, FrontSide, LineCurve3, MathUtils, Object3D, SphereGeometry, TubeGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Outlines } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { kelvinToRgb, threeIntensity } from '../../../shared/lighting'
import { glowLevel, practicalRig, type RigLight, type RigPart } from '../../../shared/practicals'
import type { PracticalNode } from '../../../shared/project'
import { lightShadowProps } from './LightView'
import { handleNodeClick, handleNodeDoubleClick, noRaycast, SELECTION_COLOR } from './selection'

// A practical in the set (shared/practicals.ts): its shapes, and its lights as ordinary three.js
// lights (only switched on in Clay shading, like the scene's lights), so Clay's soft shadows and the
// Render's light conversion treat them exactly like any other light. Glowing parts (the bulb, a lens,
// the shade lit from inside) are marked `glowOnly`: the Render shows them but doesn't let them light
// the set as well, since the practical's lights already carry that light.

/** A lamp's base and stem (its colour setting is the shade's). */
const LAMP_BASE = '#3a3532'

interface Props {
  node: PracticalNode
  selected: boolean
  clickable: boolean
  /** Lights only shine in Clay shading. */
  lit: boolean
}

/** A part's shape as geometry (kept while its measurements don't change). */
function partGeometry(part: RigPart): BufferGeometry {
  switch (part.shape) {
    case 'cylinder':
      return new CylinderGeometry(part.radiusTop, part.radiusBottom, part.height, 40, 1, part.open)
    case 'sphere':
      return new SphereGeometry(part.radius, 24, 16)
    case 'tube': {
      const pts = part.points.map((p) => new Vector3(...p))
      const curve = pts.length === 2 ? new LineCurve3(pts[0], pts[1]) : new CatmullRomCurve3(pts)
      return new TubeGeometry(curve, Math.max(2, pts.length * 3), part.radius, 6, false)
    }
    case 'spheres': {
      // One mesh for every bulb (cheap to draw, and the Render reads it like any other mesh).
      const one = new SphereGeometry(part.radius, 8, 6)
      const all = mergeGeometries(part.positions.map((p) => one.clone().translate(...p)))
      one.dispose()
      return all ?? new BufferGeometry()
    }
  }
}

function PartMesh({ part, node, selected, clickable, colors }: { part: RigPart; node: PracticalNode; selected: boolean; clickable: boolean; colors: { light: Color; shade: Color; body: Color; levels: { glow: number; shade: number } } }) {
  const key = JSON.stringify(part)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => partGeometry(part), [key])
  useEffect(() => () => geometry.dispose(), [geometry])
  const position = part.shape === 'cylinder' || part.shape === 'sphere' ? part.position : undefined
  const rotation = part.shape === 'cylinder' ? part.rotation : undefined
  const glow = part.look === 'glow'
  const shade = part.look === 'shade'
  const pick = {
    raycast: clickable ? undefined : noRaycast,
    onClick: clickable ? (e: ThreeEvent<MouseEvent>) => handleNodeClick(e, node.id) : undefined,
    onDoubleClick: clickable ? (e: ThreeEvent<MouseEvent>) => handleNodeDoubleClick(e, node.id) : undefined
  }
  return (
    <mesh geometry={geometry} position={position} rotation={rotation} castShadow={!glow && !shade} receiveShadow={!glow} userData={glow || shade ? { glowOnly: true } : undefined} {...pick}>
      <meshStandardMaterial
        color={glow ? (colors.levels.glow > 0 ? colors.light : '#d8d8d8') : part.look === 'shade' ? colors.shade : colors.body}
        roughness={glow ? 0.3 : shade ? 0.95 : 0.55}
        emissive={glow ? colors.light : shade ? colors.shade.clone().multiply(colors.light) : '#000000'}
        emissiveIntensity={glow ? colors.levels.glow : shade ? colors.levels.shade : 0}
        side={shade ? DoubleSide : FrontSide}
        userData={glow || shade ? { glowOnly: true } : undefined}
      />
      {selected && <Outlines thickness={3} color={SELECTION_COLOR} userData={{ helper: true }} />}
    </mesh>
  )
}

function RigLightView({ light, node, colors }: { light: RigLight; node: PracticalNode; colors: { light: Color; shade: Color } }) {
  const target = useMemo(() => new Object3D(), [])
  const color = light.tinted ? colors.light.clone().multiply(colors.shade) : colors.light
  const intensity = threeIntensity(light.kind, node.stops) * light.share
  const shadow = lightShadowProps(light.kind, light.size, light.coneAngle, light.castShadow)
  if (light.kind === 'point') {
    return (
      <pointLight
        position={light.position}
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
    )
  }
  const at = light.position
  const d = light.direction
  return (
    <>
      <primitive object={target} position={[at[0] + d[0], at[1] + d[1], at[2] + d[2]]} />
      <spotLight
        position={at}
        target={target}
        color={color}
        intensity={intensity}
        angle={Math.min(MathUtils.degToRad(light.coneAngle / 2), Math.PI / 2 - 0.01)}
        penumbra={light.falloff}
        decay={2}
        distance={0}
        {...shadow}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.02}
        shadow-camera-far={60}
      />
    </>
  )
}

export default function PracticalView({ node, selected, clickable, lit }: Props) {
  const rig = useMemo(() => practicalRig(node), [node])
  const colors = useMemo(
    () => ({
      light: new Color(...kelvinToRgb(node.kelvin)),
      shade: new Color(node.color),
      body: new Color(node.kind === 'lamp' ? LAMP_BASE : node.color),
      levels: glowLevel(node)
    }),
    [node]
  )
  return (
    <>
      {rig.parts.map((part, i) => (
        <PartMesh key={i} part={part} node={node} selected={selected} clickable={clickable} colors={colors} />
      ))}
      {lit && rig.lights.map((light, i) => <RigLightView key={i} light={light} node={node} colors={colors} />)}
    </>
  )
}

import { memo, useContext, useEffect, useMemo } from 'react'
import { DoubleSide, FrontSide } from 'three'
import { Outlines } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { PrimitiveNode, SceneNode } from '../../../shared/project'
import { sceneForShot, sceneOfShot, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import CameraView from './CameraView'
import { getGeometry } from './geometries'
import LightView from './LightView'
import PracticalView from './PracticalView'
import { partialShadowMaterials, translucentMaterial } from './softShadows'
import { MATERIAL_LOOKS, studioReflections } from './materials'
import HumanFigure from './HumanFigure'
import MannequinView from './MannequinView'
import { SceneNodesContext } from './sceneContext'
import { handleNodeClick, handleNodeDoubleClick, noRaycast, SELECTION_COLOR, toRadians } from './selection'

// Draws the set as one shot sees it: the Master scene plus that shot's changes.
// The viewport draws the shot being edited; ShotScenes draws a hidden copy per shot
// ("passive": no clicking, no selection, no helpers) for thumbnails and readouts.
//
// In Clay shading every surface is the same matte grey, the scene's lights shine and cast
// shadows; in Work shading objects show their colours and the scene's lights are off.


interface NodeViewProps {
  id: string
  /** Selected directly or through a parent group. */
  inSelection: boolean
  /** Locked directly or through a parent group. */
  inLocked: boolean
}

const NodeView = memo(function NodeView({ id, inSelection, inLocked }: NodeViewProps) {
  const { shotId, passive, clay } = useContext(SceneNodesContext)
  const node = useDocument((s) => sceneForShot(s, shotId)[id]) as SceneNode | undefined
  const selectedHere = useUi((s) => !passive && s.selection.includes(id))
  const gl = useThree((s) => s.gl)
  const selected = selectedHere || inSelection
  if (!node) return null

  const locked = inLocked || node.locked
  const clickable = !passive && !locked && !node.hidden
  const common = {
    name: id,
    position: node.position,
    rotation: toRadians(node.rotation),
    scale: node.scale,
    visible: !node.hidden
  }

  if (node.type === 'group') {
    return (
      <group {...common}>
        {node.childIds.map((childId) => (
          <NodeView key={childId} id={childId} inSelection={selected} inLocked={locked} />
        ))}
      </group>
    )
  }

  if (node.type === 'mannequin') {
    return (
      <group {...common}>
        {node.style === 'human' ? (
          <HumanFigure node={node} selected={selected} clickable={clickable} passive={passive} clay={clay} />
        ) : (
          <MannequinView node={node} selected={selected} clickable={clickable} passive={passive} clay={clay} />
        )}
      </group>
    )
  }

  if (node.type === 'camera') {
    return <group {...common}>{!passive && <CameraView node={node} selected={selected} clickable={clickable} />}</group>
  }

  if (node.type === 'light') {
    return (
      <group {...common}>
        <LightView node={node} selected={selected} clickable={clickable} lit={clay} passive={passive} />
      </group>
    )
  }

  if (node.type === 'practical') {
    return (
      <group {...common}>
        <PracticalView node={node} selected={selected} clickable={clickable} lit={clay} />
      </group>
    )
  }

  return <PrimitiveView node={node} common={common} selected={selected} clickable={clickable} clay={clay} />
})

/** A shape (box, cylinder…) in its Material: matte, glossy, metal, glass, glowing or diffusion. */
function PrimitiveView({ node, common, selected, clickable, clay }: { node: PrimitiveNode; common: Record<string, unknown>; selected: boolean; clickable: boolean; clay: boolean }) {
  const gl = useThree((s) => s.gl)
  const look = MATERIAL_LOOKS[node.material] ?? MATERIAL_LOOKS.matte
  const reflections = look.reflect > 0 ? studioReflections(gl) : null
  const diffusion = node.material === 'diffusion'
  // Diffusion: light through it (1 − density) shows on the far side, and its shadow holds back
  // `density` of the light (softShadows.ts). Values in uniforms, so the Density slider is smooth.
  const transmission = useMemo(() => ({ value: 0.5 }), [])
  const density = useMemo(() => ({ value: 0.5 }), [])
  const shadowMaterials = useMemo(() => (diffusion ? partialShadowMaterials(density) : null), [diffusion, density])
  useEffect(() => () => {
    shadowMaterials?.depth.dispose()
    shadowMaterials?.distance.dispose()
  }, [shadowMaterials])
  transmission.value = 1 - node.density
  density.value = node.density
  return (
    <mesh
      {...common}
      geometry={getGeometry(node.primitive, node.anchor)}
      castShadow={clay && look.castShadow}
      receiveShadow={clay}
      customDepthMaterial={shadowMaterials?.depth}
      customDistanceMaterial={shadowMaterials?.distance}
      userData={diffusion ? { diffusion: node.density } : undefined}
      raycast={clickable ? undefined : noRaycast}
      onClick={clickable ? (e) => handleNodeClick(e, node.id) : undefined}
      onDoubleClick={clickable ? (e) => handleNodeDoubleClick(e, node.id) : undefined}
    >
      <meshStandardMaterial
        // (A fresh material when the kind changes: Diffusion adds to the shader.)
        key={diffusion ? 'diffusion' : 'plain'}
        ref={(m) => {
          if (m && diffusion && !('ST_TRANSLUCENT' in (m.defines ?? {}))) translucentMaterial(m, transmission)
        }}
        color={node.color}
        roughness={node.material === 'matte' && !clay ? 0.85 : look.roughness}
        envMap={reflections}
        envMapIntensity={look.reflect}
        metalness={look.metalness}
        transparent={look.opacity < 1}
        opacity={look.opacity}
        depthWrite={look.opacity >= 1}
        side={node.primitive === 'plane' || look.opacity < 1 || diffusion ? DoubleSide : FrontSide}
        emissive={selected ? SELECTION_COLOR : look.glow ? node.color : '#000000'}
        emissiveIntensity={selected ? 0.12 + look.glow * 0.8 : look.glow}
      />
      {/* With screenspace off (the default), drei's Outlines thickness is in screen pixels. */}
      {selected && <Outlines thickness={3} color={SELECTION_COLOR} userData={{ helper: true }} />}
    </mesh>
  )
}

export default function SceneNodes({
  shotId,
  passive = false,
  clay
}: {
  shotId: string | null
  passive?: boolean
  clay: boolean
}) {
  const rootIds = useDocument((s) => sceneOfShot(s, shotId).rootIds)
  const context = useMemo(() => ({ shotId, passive, clay }), [shotId, passive, clay])
  return (
    <SceneNodesContext.Provider value={context}>
      {rootIds.map((id) => (
        <NodeView key={id} id={id} inSelection={false} inLocked={false} />
      ))}
    </SceneNodesContext.Provider>
  )
}

/** Does this shot's version of the set have any light switched on? */
export function hasLights(nodes: Record<string, SceneNode>): boolean {
  return Object.values(nodes).some((n) => (n.type === 'light' || (n.type === 'practical' && n.on)) && !n.hidden)
}

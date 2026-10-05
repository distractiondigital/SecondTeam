import { createContext, memo, useContext, useMemo } from 'react'
import { DoubleSide, FrontSide } from 'three'
import { Outlines } from '@react-three/drei'
import type { SceneNode } from '../../../shared/project'
import { sceneForShot, sceneOfShot, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import CameraView from './CameraView'
import { getGeometry } from './geometries'
import LightView from './LightView'
import HumanFigure from './HumanFigure'
import MannequinView from './MannequinView'
import { handleNodeClick, handleNodeDoubleClick, noRaycast, SELECTION_COLOR, toRadians } from './selection'

// Draws the set as one shot sees it: the Master scene plus that shot's changes.
// The viewport draws the shot being edited; ShotScenes draws a hidden copy per shot
// ("passive": no clicking, no selection, no helpers) for thumbnails and readouts.
//
// In Clay shading every surface is the same matte grey, the scene's lights shine and cast
// shadows; in Work shading objects show their colours and the scene's lights are off.

interface SceneContext {
  /** Shot whose version of the set to draw; null = Master. */
  shotId: string | null
  /** A hidden copy for rendering: no interaction, selection or helpers. */
  passive: boolean
  /** Clay shading: Material colours, scene lights and sky on, shadows. */
  clay: boolean
}

export const SceneNodesContext = createContext<SceneContext>({ shotId: null, passive: false, clay: false })

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

  return (
    <mesh
      {...common}
      geometry={getGeometry(node.primitive, node.anchor)}
      castShadow={clay}
      receiveShadow={clay}
      raycast={clickable ? undefined : noRaycast}
      onClick={clickable ? (e) => handleNodeClick(e, id) : undefined}
      onDoubleClick={clickable ? (e) => handleNodeDoubleClick(e, id) : undefined}
    >
      <meshStandardMaterial
        color={node.color}
        roughness={clay ? 0.92 : 0.85}
        metalness={0}
        side={node.primitive === 'plane' ? DoubleSide : FrontSide}
        emissive={selected ? SELECTION_COLOR : '#000000'}
        emissiveIntensity={selected ? 0.12 : 0}
      />
      {/* With screenspace off (the default), drei's Outlines thickness is in screen pixels. */}
      {selected && <Outlines thickness={3} color={SELECTION_COLOR} userData={{ helper: true }} />}
    </mesh>
  )
})

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
  return Object.values(nodes).some((n) => n.type === 'light' && !n.hidden)
}

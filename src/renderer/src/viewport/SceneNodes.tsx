import { memo } from 'react'
import { DoubleSide, FrontSide } from 'three'
import { Outlines } from '@react-three/drei'
import type { SceneNode } from '../../../shared/project'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { getGeometry } from './geometries'
import CameraView from './CameraView'
import MannequinView from './MannequinView'
import { handleNodeClick, handleNodeDoubleClick, noRaycast, SELECTION_COLOR, toRadians } from './selection'

interface NodeViewProps {
  id: string
  /** Selected directly or through a parent group. */
  inSelection: boolean
  /** Locked directly or through a parent group. */
  inLocked: boolean
}

const NodeView = memo(function NodeView({ id, inSelection, inLocked }: NodeViewProps) {
  const node = useDocument((s) => activeScene(s).nodes[id]) as SceneNode | undefined
  const selected = useUi((s) => s.selection.includes(id)) || inSelection
  if (!node) return null

  const locked = inLocked || node.locked
  const clickable = !locked && !node.hidden
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
        <MannequinView node={node} selected={selected} clickable={clickable} />
      </group>
    )
  }

  if (node.type === 'camera') {
    return (
      <group {...common}>
        <CameraView node={node} selected={selected} clickable={clickable} />
      </group>
    )
  }

  return (
    <mesh
      {...common}
      geometry={getGeometry(node.primitive, node.anchor)}
      raycast={clickable ? undefined : noRaycast}
      onClick={clickable ? (e) => handleNodeClick(e, id) : undefined}
      onDoubleClick={clickable ? (e) => handleNodeDoubleClick(e, id) : undefined}
    >
      <meshStandardMaterial
        color={node.color}
        roughness={0.85}
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

export default function SceneNodes() {
  const rootIds = useDocument((s) => activeScene(s).rootIds)
  return (
    <>
      {rootIds.map((id) => (
        <NodeView key={id} id={id} inSelection={false} inLocked={false} />
      ))}
    </>
  )
}

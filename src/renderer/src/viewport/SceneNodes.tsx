import { memo } from 'react'
import { DoubleSide, FrontSide, MathUtils } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { Outlines } from '@react-three/drei'
import type { Scene, SceneNode, Vec3 } from '../../../shared/project'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { getGeometry } from './geometries'

const SELECTION_COLOR = '#f2a33a'
const CLICK_DRAG_TOLERANCE = 4 // pixels; a bigger mouse move counts as a drag, not a click

const toRadians = (rotation: Vec3): Vec3 => rotation.map((d) => MathUtils.degToRad(d)) as Vec3

/** Outermost group containing this node (clicking an object in a group selects the group). */
function outermostAncestor(scene: Scene, id: string): string {
  let current = scene.nodes[id]
  while (current?.parentId && scene.nodes[current.parentId]) current = scene.nodes[current.parentId]
  return current?.id ?? id
}

function handleClick(e: ThreeEvent<MouseEvent>, id: string): void {
  e.stopPropagation()
  if (e.delta > CLICK_DRAG_TOLERANCE) return
  const scene = activeScene(useDocument.getState())
  const target = outermostAncestor(scene, id)
  const ui = useUi.getState()
  if (e.ctrlKey || e.shiftKey) ui.toggleSelected(target)
  else ui.select([target])
}

function handleDoubleClick(e: ThreeEvent<MouseEvent>, id: string): void {
  // Double-click drills into a group and selects the object itself.
  e.stopPropagation()
  useUi.getState().select([id])
}

const noRaycast = () => null

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

  const clickable = !locked && !node.hidden
  return (
    <mesh
      {...common}
      geometry={getGeometry(node.primitive, node.anchor)}
      raycast={clickable ? undefined : noRaycast}
      onClick={clickable ? (e) => handleClick(e, id) : undefined}
      onDoubleClick={clickable ? (e) => handleDoubleClick(e, id) : undefined}
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
      {selected && <Outlines thickness={3} color={SELECTION_COLOR} />}
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

import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { deliveryFrame, opticsFor } from '../../../shared/camera'
import type { CameraNode } from '../../../shared/project'
import { lookThrough } from '../state/actions'
import { useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { useFocusSummary } from '../panels/FocusControls'
import { handleNodeClick, handleNodeDoubleClick, noRaycast, SELECTION_COLOR } from './selection'

// How a shot camera looks in the set: a small body and lens, a frustum drawn to the delivery
// frame, and a label with the shot number and lens. Everything here is a helper: it's hidden
// in thumbnails and renders, and while looking through any camera.

const FRUSTUM_LENGTH = 1.2 // metres, when no focus distance is set
const BODY_COLOR = '#3b3e45'
const LINE_COLOR = '#9aa0ab'
const FOCUS_COLOR = '#7fd3ff' // near / far limits of sharpness
const HELPER = { helper: true }

/** A rectangle square to the lens at `depth`, covering the frame there. */
function planeGeometry(frameW: number, frameH: number, focal: number, depth: number): BufferGeometry {
  const w = (frameW / 2 / focal) * depth
  const h = (frameH / 2 / focal) * depth
  const c = [
    [-w, -h, -depth],
    [w, -h, -depth],
    [w, h, -depth],
    [-w, h, -depth]
  ]
  const lines: number[] = []
  for (let i = 0; i < 4; i++) lines.push(...c[i], ...c[(i + 1) % 4])
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(lines, 3))
  return g
}

const MAX_PLANE = 60 // metres: a far limit beyond this (or infinite) isn't drawn

function frustumGeometry(halfW: number, halfH: number, depth: number): BufferGeometry {
  const c = [
    [-halfW, -halfH, -depth],
    [halfW, -halfH, -depth],
    [halfW, halfH, -depth],
    [-halfW, halfH, -depth]
  ]
  const lines: number[] = []
  for (const p of c) lines.push(0, 0, 0, ...p) // lens to corners
  for (let i = 0; i < 4; i++) lines.push(...c[i], ...c[(i + 1) % 4]) // frame
  // Small "up" triangle above the frame, so you can tell which way is up.
  const t = halfW * 0.25
  lines.push(-t, halfH * 1.08, -depth, 0, halfH * 1.08 + t, -depth, 0, halfH * 1.08 + t, -depth, t, halfH * 1.08, -depth)
  lines.push(t, halfH * 1.08, -depth, -t, halfH * 1.08, -depth)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(lines, 3))
  return g
}

interface Props {
  node: CameraNode
  selected: boolean
  clickable: boolean
}

export default function CameraView({ node, selected, clickable }: Props) {
  // In camera view, all camera bodies and frustums are hidden so the frame shows only the set.
  const lookingThrough = useUi((s) => s.lookThroughId !== null)
  const kit = useDocument((s) => s.project.camera)
  const frame = deliveryFrame(opticsFor(kit, node.focalLength))
  // Selected, the frustum reaches the focus plane (its subject's when focus is automatic), with
  // the near and far limits of sharpness drawn faintly.
  const focus = useFocusSummary(node)
  const focusDepth = Number.isFinite(focus.focus) && focus.focus < MAX_PLANE ? focus.focus : null
  const depth = (selected ? focusDepth : node.focusDistance) ?? FRUSTUM_LENGTH
  const nearDepth = selected && focusDepth !== null ? focus.range.near : null
  const farDepth = selected && focusDepth !== null && focus.range.far < MAX_PLANE ? focus.range.far : null
  const near = useMemo(() => (nearDepth ? planeGeometry(frame.width, frame.height, node.focalLength, nearDepth) : null), [nearDepth, frame.width, frame.height, node.focalLength])
  const far = useMemo(() => (farDepth ? planeGeometry(frame.width, frame.height, node.focalLength, farDepth) : null), [farDepth, frame.width, frame.height, node.focalLength])
  const halfW = (frame.width / 2 / node.focalLength) * depth
  const halfH = (frame.height / 2 / node.focalLength) * depth
  const geometry = useMemo(() => frustumGeometry(halfW, halfH, depth), [halfW, halfH, depth])

  if (lookingThrough) return null

  const color = selected ? SELECTION_COLOR : LINE_COLOR
  const pick = {
    raycast: clickable ? undefined : noRaycast,
    onClick: clickable ? (e: ThreeEvent<MouseEvent>) => handleNodeClick(e, node.id) : undefined,
    onDoubleClick: clickable
      ? (e: ThreeEvent<MouseEvent>) => {
          handleNodeDoubleClick(e, node.id)
          lookThrough(node.id)
        }
      : undefined
  }

  return (
    <group userData={HELPER}>
      {/* Body sits behind the lens point; the lens points down -Z. */}
      <mesh position={[0, 0, 0.13]} {...pick}>
        <boxGeometry args={[0.12, 0.14, 0.2]} />
        <meshStandardMaterial
          color={BODY_COLOR}
          roughness={0.6}
          emissive={selected ? SELECTION_COLOR : '#000000'}
          emissiveIntensity={selected ? 0.35 : 0}
        />
      </mesh>
      <mesh position={[0, 0, 0.0]} rotation={[Math.PI / 2, 0, 0]} {...pick}>
        <cylinderGeometry args={[0.035, 0.045, 0.07, 20]} />
        <meshStandardMaterial color="#23252a" roughness={0.4} />
      </mesh>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color={color} transparent opacity={selected ? 1 : 0.7} />
      </lineSegments>
      {near && (
        <lineSegments geometry={near}>
          <lineBasicMaterial color={FOCUS_COLOR} transparent opacity={0.45} />
        </lineSegments>
      )}
      {far && (
        <lineSegments geometry={far}>
          <lineBasicMaterial color={FOCUS_COLOR} transparent opacity={0.45} />
        </lineSegments>
      )}
      <Html position={[0, 0.12, 0.13]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`camera-label${selected ? ' selected' : ''}`}>
          {node.shotNumber} · {Math.round(node.focalLength)}mm
        </div>
      </Html>
    </group>
  )
}

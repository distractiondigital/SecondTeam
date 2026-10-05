import { useEffect, useMemo, type ReactNode } from 'react'
import { CapsuleGeometry, Color, SphereGeometry, type BufferGeometry } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { Outlines } from '@react-three/drei'
import { proportions, type JointName, type Proportions } from '../../../shared/mannequin'
import type { MannequinNode, Vec3 } from '../../../shared/project'
import { useUi } from '../state/uiStore'
import { useDocument } from '../state/documentStore'
import { CLICK_DRAG_TOLERANCE, handleNodeClick, handleNodeDoubleClick, noRaycast, SELECTION_COLOR, toRadians } from './selection'

// A smooth artist's mannequin: nested joint groups (forward kinematics) with simple
// capsule and ellipsoid body parts. Each joint group is named "<figureId>:<joint>" so the
// joint gizmo can find it. Each body part knows which joint moves it (clicking it selects
// that joint once the figure is selected).

const UNIT_SPHERE = new SphereGeometry(1, 24, 16)

/** Named empty points on the head, used for the pose (OpenPose) render in Milestone 5. */
const HEAD_MARKERS: { name: string; at: (s: number) => Vec3 }[] = [
  { name: 'nose', at: (s) => [0, 0.42 * s, 0.47 * s] },
  { name: 'eyeL', at: (s) => [0.17 * s, 0.55 * s, 0.38 * s] },
  { name: 'eyeR', at: (s) => [-0.17 * s, 0.55 * s, 0.38 * s] },
  { name: 'earL', at: (s) => [0.41 * s, 0.5 * s, 0] },
  { name: 'earR', at: (s) => [-0.41 * s, 0.5 * s, 0] }
]

interface Geometries {
  neck: BufferGeometry
  upperArm: BufferGeometry
  forearm: BufferGeometry
  thigh: BufferGeometry
  shin: BufferGeometry
}

/** Capsule of total length `length` (end to end) and radius `r`, centred on the origin. */
function capsule(r: number, length: number): BufferGeometry {
  return new CapsuleGeometry(r, Math.max(0.001, length - 2 * r), 6, 16)
}

function useGeometries(p: Proportions): Geometries {
  const geometries = useMemo(
    () => ({
      neck: capsule(p.neckRadius, p.headY - p.neckY + p.neckRadius),
      upperArm: capsule(p.upperArmRadius, p.upperArm + p.upperArmRadius),
      forearm: capsule(p.forearmRadius, p.forearm + p.forearmRadius),
      thigh: capsule(p.thighRadius, p.hipY - p.kneeY + p.thighRadius),
      shin: capsule(p.shinRadius, p.kneeY - p.ankleY + p.shinRadius)
    }),
    [p]
  )
  useEffect(() => () => Object.values(geometries).forEach((g) => g.dispose()), [geometries])
  return geometries
}

interface Props {
  node: MannequinNode
  /** The figure (or a group containing it) is selected. */
  selected: boolean
  clickable: boolean
  /** A hidden per-shot copy: no joint highlighting. */
  passive?: boolean
  /** Clay shading: matte grey, casts and receives shadows. */
  clay?: boolean
  /** Invisible: only for clicking body parts and placing joints (a human body is drawn instead). */
  ghost?: boolean
}

export default function MannequinView({ node, selected, clickable, passive = false, clay = false, ghost = false }: Props) {
  const { id, pose } = node
  const p = useMemo(() => proportions(node.height, node.build), [node.height, node.build])
  const g = useGeometries(p)
  const selectedJoint = useUi((s) =>
    !passive && s.selection.length === 1 && s.selection[0] === id ? s.selectedJoint : null
  )
  // A figure linked to a cast member wears that cast member's colour.
  const castColor = useDocument((s) => (node.castId ? s.project.cast.find((c) => c.id === node.castId)?.color : undefined))
  const bodyColor = castColor ?? node.color
  const ballColor = useMemo(() => '#' + new Color(bodyColor).multiplyScalar(0.72).getHexString(), [bodyColor])

  const onClick = (e: ThreeEvent<MouseEvent>, joint: JointName) => {
    const ui = useUi.getState()
    const figureIsSelected = ui.selection.length === 1 && ui.selection[0] === id
    if (figureIsSelected && !e.ctrlKey && !e.shiftKey) {
      e.stopPropagation()
      if (e.delta <= CLICK_DRAG_TOLERANCE) ui.selectJoint(joint)
    } else {
      handleNodeClick(e, id)
    }
  }

  /** One body part, moved by `joint`. */
  const part = (joint: JointName, key: string, geometry: BufferGeometry, position: Vec3, scale?: Vec3, ball = false) => {
    const highlighted = selectedJoint === joint
    return (
      <mesh
        key={key}
        geometry={geometry}
        castShadow={clay && !ghost}
        receiveShadow={clay && !ghost}
        position={position}
        scale={scale}
        userData={{ joint, helper: ghost }}
        raycast={clickable ? undefined : noRaycast}
        onClick={clickable ? (e) => onClick(e, joint) : undefined}
        onDoubleClick={clickable ? (e) => handleNodeDoubleClick(e, id) : undefined}
      >
        <meshStandardMaterial
          visible={!ghost}
          color={ball ? ballColor : bodyColor}
          roughness={clay ? 0.92 : 0.7}
          metalness={0}
          emissive={highlighted || selected ? SELECTION_COLOR : '#000000'}
          emissiveIntensity={highlighted ? 0.55 : selected ? 0.1 : 0}
        />
        {!ghost && (selected || highlighted) && (
          <Outlines thickness={highlighted ? 3 : 2} color={SELECTION_COLOR} userData={{ helper: true }} />
        )}
      </mesh>
    )
  }

  const ellipsoid = (joint: JointName, key: string, center: Vec3, radii: Vec3) =>
    part(joint, key, UNIT_SPHERE, center, radii)
  const ball = (joint: JointName, key: string, r: number) => part(joint, key, UNIT_SPHERE, [0, 0, 0], [r, r, r], true)

  const joint = (name: JointName, position: Vec3, children: ReactNode) => (
    <group name={`${id}:${name}`} position={position} rotation={toRadians(pose.joints[name])}>
      {children}
    </group>
  )

  const arm = (side: 'L' | 'R') => {
    const s = side === 'L' ? 1 : -1
    const shoulder = `shoulder${side}` as JointName
    const elbow = `elbow${side}` as JointName
    const wrist = `wrist${side}` as JointName
    return joint(
      shoulder,
      [s * p.shoulderHalf, p.shoulderY - p.chestY, 0],
      <>
        {ball(shoulder, 'ball', p.upperArmRadius * 1.25)}
        {part(shoulder, 'upper', g.upperArm, [0, -p.upperArm / 2, 0])}
        {joint(
          elbow,
          [0, -p.upperArm, 0],
          <>
            {ball(elbow, 'ball', p.forearmRadius * 1.15)}
            {part(elbow, 'fore', g.forearm, [0, -p.forearm / 2, 0])}
            {joint(
              wrist,
              [0, -p.forearm, 0],
              <>
                {ball(wrist, 'ball', p.forearmRadius * 0.85)}
                {ellipsoid(wrist, 'hand', [0, -p.hand * 0.5, 0.004 * p.height], [
                  p.forearmRadius * 0.6,
                  p.hand * 0.52,
                  p.forearmRadius * 1.35
                ])}
              </>
            )}
          </>
        )}
      </>
    )
  }

  const leg = (side: 'L' | 'R') => {
    const s = side === 'L' ? 1 : -1
    const hip = `hip${side}` as JointName
    const knee = `knee${side}` as JointName
    const ankle = `ankle${side}` as JointName
    const thigh = p.hipY - p.kneeY
    const shin = p.kneeY - p.ankleY
    return joint(
      hip,
      [s * p.hipHalf, p.hipY - p.pelvisY, 0],
      <>
        {part(hip, 'thigh', g.thigh, [0, -thigh / 2, 0])}
        {joint(
          knee,
          [0, -thigh, 0],
          <>
            {ball(knee, 'ball', p.shinRadius * 1.2)}
            {part(knee, 'shin', g.shin, [0, -shin / 2, 0])}
            {joint(
              ankle,
              [0, -shin, 0],
              ellipsoid(ankle, 'foot', [0, -p.ankleY * 0.45, p.footLength * 0.28], [
                p.shinRadius * 0.95,
                p.ankleY * 0.6,
                p.footLength * 0.55
              ])
            )}
          </>
        )}
      </>
    )
  }

  const hs = p.headSize
  const [ox, oy, oz] = pose.pelvisOffset
  return joint(
    'pelvis',
    [ox * p.height, p.pelvisY + oy * p.height, oz * p.height],
    <>
      {ellipsoid('pelvis', 'hips', [0, -0.015 * p.height, 0], [p.pelvisWidth / 2, 0.075 * p.height, p.torsoDepth * 0.48])}
      {leg('L')}
      {leg('R')}
      {joint(
        'spine',
        [0, p.spineY - p.pelvisY, 0],
        <>
          {ellipsoid('spine', 'waist', [0, (p.chestY - p.spineY) / 2, 0], [
            p.waistWidth / 2,
            ((p.chestY - p.spineY) / 2) * 1.35,
            p.torsoDepth * 0.44
          ])}
          {joint(
            'chest',
            [0, p.chestY - p.spineY, 0],
            <>
              {ellipsoid('chest', 'ribs', [0, (p.neckY - p.chestY) * 0.42, 0.004 * p.height], [
                p.chestWidth / 2,
                (p.neckY - p.chestY) * 0.62,
                p.torsoDepth / 2
              ])}
              {arm('L')}
              {arm('R')}
              {joint(
                'neck',
                [0, p.neckY - p.chestY, 0],
                <>
                  {part('neck', 'neck', g.neck, [0, (p.headY - p.neckY) / 2, 0])}
                  {joint(
                    'head',
                    [0, p.headY - p.neckY, 0],
                    <>
                      {ellipsoid('head', 'skull', [0, hs * 0.5, 0], [hs * 0.4, hs * 0.5, hs * 0.45])}
                      {ellipsoid('head', 'nose', [0, hs * 0.4, hs * 0.44], [hs * 0.06, hs * 0.09, hs * 0.07])}
                      {HEAD_MARKERS.map((m) => (
                        <object3D key={m.name} name={`${id}:kp:${m.name}`} position={m.at(hs)} />
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  )
}

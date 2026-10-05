import { useEffect, useMemo } from 'react'
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Euler,
  MathUtils,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3
} from 'three'
import { boneRest, morph, targetWeights, type BodyData, type BodySliders } from '../../../shared/humanBody'
import { JOINTS, JOINT_NAMES, type JointName, type Pose } from '../../../shared/mannequin'
import { SELECTION_COLOR } from './selection'
import { useBodyData } from './humanData'

// A realistic human (MakeHuman CC0 body) posed by the same 17-joint skeleton as the mannequin.
// The body is built for the figure's sliders; each rig bone that matches one of our joints takes
// that joint's world rotation, corrected for the rig's rest pose (its arms hang in an A-pose and
// its spine/legs aren't perfectly straight, while our rest pose is straight up and down).

/** Rig bone ← our joint. Bones not listed follow their parent (fingers, clavicles, toes). */
const BONE_JOINT: Record<string, JointName> = {
  pelvis: 'pelvis',
  spine_01: 'spine',
  spine_03: 'chest',
  neck_01: 'neck',
  head: 'head',
  upperarm_l: 'shoulderL',
  lowerarm_l: 'elbowL',
  hand_l: 'wristL',
  upperarm_r: 'shoulderR',
  lowerarm_r: 'elbowR',
  hand_r: 'wristR',
  thigh_l: 'hipL',
  calf_l: 'kneeL',
  foot_l: 'ankleL',
  thigh_r: 'hipR',
  calf_r: 'kneeR',
  foot_r: 'ankleR'
}

const UP = new Vector3(0, 1, 0)
const DOWN = new Vector3(0, -1, 0)
/** Where each mapped bone points in our rest pose (feet keep the rig's own direction). */
function restDirection(bone: string): Vector3 | null {
  if (bone.startsWith('foot')) return null
  if (/^(pelvis|spine|neck|head)/.test(bone)) return UP
  return DOWN
}

/** Our joints' world rotations for a pose (forward kinematics over the joint tree). */
function jointWorld(pose: Pose): Record<JointName, Quaternion> {
  const out = {} as Record<JointName, Quaternion>
  for (const j of JOINT_NAMES) {
    const [x, y, z] = pose.joints[j]
    const local = new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(x), MathUtils.degToRad(y), MathUtils.degToRad(z), 'XYZ'))
    const parent = JOINTS[j].parent
    out[j] = parent ? out[parent].clone().multiply(local) : local
  }
  return out
}

interface Built {
  mesh: SkinnedMesh
  bones: Map<string, Bone>
  /** Rest-pose correction per bone (rotation that straightens it into our rest pose). */
  corrections: Map<string, Quaternion>
  /** Decimetres → metres at the requested height. */
  scale: number
  ground: number
}

/** Mesh + skeleton for one body shape (decimetre units, as in the data). */
function build(body: BodyData, sliders: BodySliders, height: number): Built {
  const positions = morph(body, targetWeights(sliders))
  const rest = boneRest(body, positions)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(body.bodyIndices, 1))
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(body.skinIndex), 4))
  geometry.setAttribute('skinWeight', new BufferAttribute(Float32Array.from(body.skinWeight, (w) => w / 255), 4))
  geometry.computeVertexNormals()

  const bones = new Map<string, Bone>()
  const corrections = new Map<string, Quaternion>()
  for (const def of body.bones) {
    const bone = new Bone()
    bone.name = def.name
    const r = rest.get(def.name)!
    const parentHead = def.parent ? rest.get(def.parent)!.head : [0, 0, 0]
    bone.position.set(r.head[0] - parentHead[0], r.head[1] - parentHead[1], r.head[2] - parentHead[2])
    if (def.parent) bones.get(def.parent)!.add(bone)
    bones.set(def.name, bone)
    const target = restDirection(def.name)
    const dir = new Vector3(r.tail[0] - r.head[0], r.tail[1] - r.head[1], r.tail[2] - r.head[2])
    corrections.set(def.name, target && dir.lengthSq() > 0 ? new Quaternion().setFromUnitVectors(dir.normalize(), target) : new Quaternion())
  }

  const material = undefined // set by the component
  const mesh = new SkinnedMesh(geometry, material)
  const root = bones.get(body.bones[0].name)!
  mesh.add(root)
  mesh.updateMatrixWorld(true)
  mesh.bind(new Skeleton([...bones.values()]))
  mesh.castShadow = true
  mesh.receiveShadow = true

  // Ground and natural height from the body itself (soles to crown).
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < body.bodyIndices.length; i++) {
    const y = positions[body.bodyIndices[i] * 3 + 1]
    if (y < lo) lo = y
    if (y > hi) hi = y
  }
  return { mesh, bones, corrections, scale: height / (hi - lo), ground: lo }
}

/** Put the rig into our pose. */
function applyPose(b: Built, body: BodyData, pose: Pose, height: number): void {
  const joints = jointWorld(pose)
  const world = new Map<string, Quaternion>()
  for (const def of body.bones) {
    const joint = BONE_JOINT[def.name]
    let w: Quaternion
    if (joint) w = joints[joint].clone().multiply(b.corrections.get(def.name)!)
    // The middle of the spine shares the bend between lower back and chest.
    else if (def.name === 'spine_02') w = joints.spine.clone().slerp(joints.chest, 0.5).multiply(b.corrections.get(def.name)!)
    else w = def.parent ? world.get(def.parent)!.clone() : new Quaternion()
    world.set(def.name, w)
  }

  for (const def of body.bones) {
    const bone = b.bones.get(def.name)!
    const parentWorld = def.parent ? world.get(def.parent)! : new Quaternion()
    bone.quaternion.copy(parentWorld.clone().invert().multiply(world.get(def.name)!))
  }
  // Pelvis shift, as a fraction of the figure's height (like the mannequin).
  const pelvis = b.bones.get('pelvis')
  if (pelvis) {
    pelvis.userData.rest ??= pelvis.position.clone()
    const [ox, oy, oz] = pose.pelvisOffset
    // Metres → this mesh's units (decimetres scaled to the figure's height).
    pelvis.position.copy(pelvis.userData.rest as Vector3).add(new Vector3(ox, oy, oz).multiplyScalar(height / b.scale))
  }
}

interface Props {
  sliders: BodySliders
  height: number
  pose: Pose
  color: string
  selected: boolean
}

export default function HumanView({ sliders, height, pose, color, selected }: Props) {
  const body = useBodyData()
  const key = `${sliders.gender}|${sliders.age}|${sliders.muscle}|${sliders.weight}|${height}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const built = useMemo(() => (body ? build(body, sliders, height) : null), [body, key])
  useEffect(() => () => built?.mesh.geometry.dispose(), [built])
  useEffect(() => {
    if (built && body) applyPose(built, body, pose, height)
  }, [built, body, pose, height])
  if (!built) return null
  const s = built.scale
  return (
    <group scale={[s, s, s]} position={[0, -built.ground * s, 0]}>
      <primitive object={built.mesh}>
        <meshStandardMaterial
          attach="material"
          color={color}
          roughness={0.75}
          metalness={0}
          emissive={selected ? SELECTION_COLOR : '#000000'}
          emissiveIntensity={selected ? 0.12 : 0}
        />
      </primitive>
    </group>
  )
}

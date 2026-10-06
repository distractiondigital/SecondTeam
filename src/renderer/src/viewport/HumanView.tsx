import { useEffect, useMemo } from 'react'
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Euler,
  FrontSide,
  MathUtils,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3
} from 'three'
import { fitProxy, partColor, partOf, proxySkin, visibleBody, wornIds, type BodyData, type FigureAppearance, type Hands, HAND_CURL, type HumanFit, figureSkin, type FigureColoring } from '../../../shared/humanBody'
import { JOINTS, JOINT_NAMES, type JointName, type Pose } from '../../../shared/mannequin'
import { SELECTION_COLOR } from './selection'
import { useBodyData, useProxies, type LoadedProxy } from './humanData'

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

const DOWN = new Vector3(0, -1, 0)
/**
 * Where each mapped bone points in our rest pose. Only the limbs are straightened (the rig's arms
 * hang in an A-pose, its legs slightly apart); the spine, neck and head keep the body's natural
 * posture: straightening them tipped the upper body forward, more so for men (stronger pelvis tilt).
 */
function restDirection(bone: string): Vector3 | null {
  if (bone.startsWith('foot') || /^(pelvis|spine|neck|head)/.test(bone)) return null
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
  /** Axis each finger bone bends around (rest-pose space): across the knuckles, or for the thumb across its base. */
  curlAxes: Map<string, Vector3>
}

const FINGER = /^(index|middle|ring|pinky)_0([123])_([lr])$/
const THUMB = /^thumb_0([123])_([lr])$/
/** How the thumb's bend is spread over its three joints. */
const THUMB_SHARE = [0.4, 0.6, 0.7]

/** Bend axes for the fingers of both hands, from where the knuckles sit on this body. */
function curlAxes(rest: HumanFit['rest']): Map<string, Vector3> {
  const out = new Map<string, Vector3>()
  for (const side of ['l', 'r'] as const) {
    const at = (name: string) => new Vector3(...rest.get(`${name}_${side}`)!.head)
    // Across the knuckles, index → little finger; bending around it curls the fingers into the palm.
    const across = at('pinky_01').sub(at('index_01')).normalize()
    // A rotation axis mirrored to the other side must also flip to give the mirrored bend.
    if (side === 'r') across.negate()
    const handDir = at('middle_01').sub(at('hand')).normalize()
    // The fingers fan out (the index sits ~20° off square to the knuckle line), so each bone
    // hinges around the part of the knuckle line square to itself; otherwise curling swings
    // the outer fingers sideways and they cross over their neighbours.
    for (const finger of ['index', 'middle', 'ring', 'pinky'])
      for (const k of [1, 2, 3]) {
        const r = rest.get(`${finger}_0${k}_${side}`)!
        const dir = new Vector3(...r.tail).sub(new Vector3(...r.head)).normalize()
        out.set(`${finger}_0${k}_${side}`, across.clone().addScaledVector(dir, -across.dot(dir)).normalize())
      }
    // The thumb: swing in toward the palm (around the palm's normal), roll around its own length,
    // then bend. Values in HAND_CURL were found by searching for where a fist's thumb tip lands
    // (over the index finger). Mirroring the left hand's rotations onto the right flips plain
    // directions (thumbDir, bendAxis) but not the palm normal, which is a cross product of two of them.
    const palmRaw = new Vector3().crossVectors(at('pinky_01').sub(at('index_01')).normalize(), handDir).normalize()
    const thumbDir = at('thumb_02').sub(at('thumb_01')).normalize()
    const bendAxis = new Vector3().crossVectors(thumbDir, palmRaw).normalize()
    const flip = side === 'r' ? -1 : 1
    out.set(`thumb_swing_${side}`, palmRaw)
    out.set(`thumb_roll_${side}`, thumbDir.multiplyScalar(flip))
    out.set(`thumb_bend_${side}`, bendAxis.multiplyScalar(flip))
  }
  return out
}

/** A finger bone's bend for this hand shape (degrees), or 0. */
function fingerBend(bone: string, hands: Hands): number {
  const f = FINGER.exec(bone)
  if (f) {
    const curl = HAND_CURL[f[3] === 'l' ? hands.left : hands.right]
    return (f[1] === 'index' && curl.index ? curl.index : curl.fingers)[+f[2] - 1]
  }
  return 0
}

/** Mesh + skeleton for one body shape (decimetre units, as in the data). */
function build(body: BodyData, fit: HumanFit): Built {
  const { positions, rest } = fit

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
  mesh.frustumCulled = false // its bounds are the rest pose; a posed arm could be culled

  return { mesh, bones, corrections, scale: fit.scale, ground: fit.ground, curlAxes: curlAxes(rest) }
}

/** Put the rig into our pose. */
function applyPose(b: Built, body: BodyData, pose: Pose, height: number, hands: Hands): void {
  const joints = jointWorld(pose)
  const world = new Map<string, Quaternion>()
  for (const def of body.bones) {
    const joint = BONE_JOINT[def.name]
    let w: Quaternion
    if (joint) w = joints[joint].clone().multiply(b.corrections.get(def.name)!)
    // The middle of the spine shares the bend between lower back and chest.
    else if (def.name === 'spine_02') w = joints.spine.clone().slerp(joints.chest, 0.5).multiply(b.corrections.get(def.name)!)
    else w = def.parent ? world.get(def.parent)!.clone() : new Quaternion()
    // Fingers: bend each joint for the hand shape (rest-pose space, so it follows the hand).
    const bend = fingerBend(def.name, hands)
    const axis = b.curlAxes.get(def.name)
    // The thumb: its base swings in and rolls, then each joint takes its share of the bend.
    const thumb = THUMB.exec(def.name)
    if (thumb) {
      const t = HAND_CURL[thumb[2] === 'l' ? hands.left : hands.right].thumb
      const turn = (k: string, deg: number) =>
        w.multiply(new Quaternion().setFromAxisAngle(b.curlAxes.get(`thumb_${k}_${thumb[2]}`)!, MathUtils.degToRad(deg)))
      if (thumb[1] === '1') {
        turn('swing', t.swing)
        turn('roll', t.roll)
      }
      turn('bend', t.bend * THUMB_SHARE[+thumb[1] - 1])
    }
    if (bend && axis) w.multiply(new Quaternion().setFromAxisAngle(axis, MathUtils.degToRad(bend)))
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

/** One worn item (eyes, eyebrows, hair, a garment), fitted to this body and bent by its skeleton. */
function ProxyMesh({ body, fit, built, item, color, selected }: { body: BodyData; fit: HumanFit; built: Built; item: LoadedProxy; color: string; selected: boolean }) {
  const mesh = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(fitProxy(item.data, fit.positions), 3))
    if (item.data.uv.length) geometry.setAttribute('uv', new BufferAttribute(item.data.uv, 2))
    geometry.setIndex(new BufferAttribute(item.data.indices, 1))
    const { skinIndex, skinWeight } = proxySkin(item.data, body)
    geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4))
    geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4))
    geometry.computeVertexNormals()
    const m = new SkinnedMesh(geometry)
    // Same skeleton and bind as the body (passing the bind matrix keeps its rest pose intact).
    m.bind(built.mesh.skeleton, built.mesh.bindMatrix)
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    return m
  }, [body, fit, built, item])
  useEffect(() => () => mesh.geometry.dispose(), [mesh])
  const masked = item.mask !== null
  return (
    <primitive object={mesh}>
      <meshStandardMaterial
        attach="material"
        color={color}
        roughness={item.data.info.kind === 'eyes' ? 0.35 : 0.8}
        metalness={0}
        alphaMap={item.mask}
        map={item.map}
        alphaTest={masked ? 0.5 : 0}
        side={masked ? DoubleSide : FrontSide}
        emissive={selected ? SELECTION_COLOR : '#000000'}
        emissiveIntensity={selected ? 0.12 : 0}
      />
    </primitive>
  )
}

interface Props {
  fit: HumanFit
  pose: Pose
  hands: Hands
  /** The figure's own (unique) colour, used when `coloring` is the overlay. */
  color: string
  /** Natural colours (skin tone, plain garments) or the figure-colour overlay. */
  coloring: FigureColoring
  appearance: FigureAppearance
  selected: boolean
}

/** Which colour a worn item takes. */
function itemColor(item: LoadedProxy, appearance: FigureAppearance, color: string, coloring: FigureColoring): string {
  // A textured item (the eyes) shows its picture's own colours, even with the Figure colours overlay.
  if (item.map) return '#ffffff'
  const part = partOf(item.data.info)
  return part ? partColor(appearance, part, color, coloring, item.data.info.id) : color
}

export default function HumanView({ fit, pose, hands, color, coloring, appearance, selected }: Props) {
  const body = useBodyData()
  const built = useMemo(() => (body ? build(body, fit) : null), [body, fit])
  useEffect(() => () => built?.mesh.geometry.dispose(), [built])
  const items = useProxies(wornIds(appearance))
  // Hide the skin under the clothes being worn (so it can't poke through).
  useEffect(() => {
    if (!built || !body) return
    const worn = (items ?? []).filter((i) => i.data.info.kind === 'clothes').map((i) => i.data)
    built.mesh.geometry.setIndex(new BufferAttribute(visibleBody(body, worn), 1))
  }, [built, body, items])
  const height = fit.proportions.height
  useEffect(() => {
    if (built && body) applyPose(built, body, pose, height, hands)
  }, [built, body, pose, height, hands])
  if (!built || !body) return null
  const s = built.scale
  return (
    <group scale={[s, s, s]} position={[0, -built.ground * s, 0]}>
      <primitive object={built.mesh}>
        <meshStandardMaterial
          attach="material"
          color={figureSkin(appearance, color, coloring)}
          roughness={0.75}
          metalness={0}
          emissive={selected ? SELECTION_COLOR : '#000000'}
          emissiveIntensity={selected ? 0.12 : 0}
        />
      </primitive>
      {(items ?? []).map((item) => (
        <ProxyMesh key={item.data.info.id} body={body} fit={fit} built={built} item={item} color={itemColor(item, appearance, color, coloring)} selected={selected} />
      ))}
    </group>
  )
}

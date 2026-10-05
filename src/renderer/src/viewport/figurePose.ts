import { useContext, useMemo } from 'react'
import { Matrix4, Vector3 } from 'three'
import { fitHuman, type BodyData, type HumanFit } from '../../../shared/humanBody'
import { proportions, type Pose, type Proportions } from '../../../shared/mannequin'
import { effectivePose, eyePoint, forwardKinematics, type LookAt } from '../../../shared/posing'
import type { MannequinNode, SceneNode } from '../../../shared/project'
import { worldMatrix } from '../../../shared/transforms'
import { sceneForShot, useDocument } from '../state/documentStore'
import { bodyDataNow } from './humanData'
import { SceneNodesContext } from './sceneContext'

// A figure's proportions (a human's come from its fitted body) and the pose that gets drawn:
// its stored pose with planted hands/feet and look-at applied (shared/posing.ts).

const fits = new Map<string, HumanFit>()

/** A human body fitted to these sliders (cached: the same body is fitted once). */
export function fitFor(data: BodyData, node: Pick<MannequinNode, 'body' | 'height' | 'expression'>): HumanFit {
  const key = JSON.stringify([node.body, node.height, node.expression])
  let fit = fits.get(key)
  if (!fit) {
    fit = fitHuman(data, node.body, node.height, node.expression)
    if (fits.size > 64) fits.delete(fits.keys().next().value!)
    fits.set(key, fit)
  }
  return fit
}

/** Where a figure's joints sit: its human body's, or the mannequin's own. Null while a human's data loads. */
export function figureProportions(node: MannequinNode): Proportions | null {
  if (node.style !== 'human') return proportions(node.height, node.build)
  const data = bodyDataNow()
  return data ? fitFor(data, node).proportions : null
}

/** Where a look-at target is in the world (null = nothing to look at). */
export function lookTargetWorld(lookAt: LookAt | null, nodes: Record<string, SceneNode>, shotId: string | null): Vector3 | null {
  if (!lookAt) return null
  if (lookAt.kind === 'point') return new Vector3(...lookAt.position)
  const id = lookAt.kind === 'camera' ? shotId : lookAt.id
  const target = id ? nodes[id] : undefined
  if (!target || (lookAt.kind === 'camera' && target.type !== 'camera')) return null
  const world = worldMatrix(nodes, target.id)
  if (target.type === 'mannequin') {
    // Another figure: its eyes.
    const p = figureProportions(target)
    if (!p) return new Vector3().setFromMatrixPosition(world)
    return eyePoint(forwardKinematics(target.pose, p), p).applyMatrix4(world)
  }
  if (target.type === 'primitive' && target.anchor === 'bottom') {
    // Its middle, not its foot.
    return new Vector3(0, 0.5, 0).applyMatrix4(world)
  }
  return new Vector3().setFromMatrixPosition(world)
}

/** The look-at target in the figure's own space, as a short string (so React only redraws when it moves). */
function lookKey(node: MannequinNode, nodes: Record<string, SceneNode>, shotId: string | null): string {
  if (!node.lookAt || !nodes[node.id]) return ''
  const target = lookTargetWorld(node.lookAt, nodes, shotId)
  if (!target) return ''
  const local = target.applyMatrix4(new Matrix4().copy(worldMatrix(nodes, node.id)).invert())
  return local.toArray().map((v) => v.toFixed(4)).join(',')
}

/**
 * The pose to draw for a figure in the scene being drawn (live view or a shot's hidden copy),
 * given its proportions. `node` null = nothing to do (returns null).
 */
export function useEffectivePose(node: MannequinNode | null, p: Proportions): Pose | null {
  const { shotId } = useContext(SceneNodesContext)
  const key = useDocument((s) => (node?.lookAt ? lookKey(node, sceneForShot(s, shotId), shotId) : ''))
  return useMemo(() => {
    if (!node) return null
    const target = key ? new Vector3(...(key.split(',').map(Number) as [number, number, number])) : null
    return effectivePose(node, p, target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.pose, node?.plants, node?.limits, p, key])
}

import { Mesh, SkinnedMesh, type Object3D } from 'three'
import type { SceneNode } from '../../../shared/project'

// The set's surfaces, for rays that land on things (light aim lines, snapping hands and feet):
// everything drawn, plus figures' posing shapes (a human's invisible skeleton stands in for its
// body: much cheaper to hit). Helpers, hidden things, cameras and lights are left out.

export function setSurfaces(scene: Object3D, nodes: Record<string, SceneNode>, exclude: string[] = []): Mesh[] {
  const out: Mesh[] = []
  for (const node of Object.values(nodes)) {
    if (node.type === 'camera' || node.type === 'light' || node.parentId || exclude.includes(node.id)) continue
    scene.getObjectByName(node.id)?.traverse((o) => {
      if (!(o instanceof Mesh) || o instanceof SkinnedMesh) return
      if (o.userData.joint) {
        // A figure's posing shapes: skip any inside an excluded figure (nested in a group).
        for (let at: Object3D | null = o; at; at = at.parent) if (exclude.includes(at.name.split(':')[0])) return
        out.push(o)
        return
      }
      for (let at: Object3D | null = o; at; at = at.parent) {
        if (at.userData.helper || !at.visible || exclude.includes(at.name)) return
      }
      out.push(o)
    })
  }
  return out
}

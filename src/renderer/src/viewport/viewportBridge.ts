// Lets UI outside the 3D canvas (e.g. the toolbar) ask the viewport simple questions.
// The viewport fills these in when it mounts.

export const viewportBridge = {
  /** The point on the floor the view is orbiting around, as [x, z] in metres. */
  getGroundPoint: (): [number, number] => [0, 0],
  /** True while the gizmo is being dragged (and just after), so releasing it isn't treated as a click. */
  gizmoBusy: false
}

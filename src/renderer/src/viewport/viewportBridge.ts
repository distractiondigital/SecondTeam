// Lets UI outside the 3D canvas (e.g. the toolbar) ask the viewport simple questions.
// The viewport fills these in when it mounts.

export const viewportBridge = {
  /** Where something added from the toolbar goes, [x, y, z] in metres (shared/placement.ts). */
  getDropPoint: (): [number, number, number] => [0, 0, 0],
  /** Where the viewport camera is and how it's turned (XYZ Euler degrees); new shot cameras start here. */
  getViewPose: (): { position: [number, number, number]; rotation: [number, number, number] } => ({
    position: [0, 1.6, 5],
    rotation: [0, 0, 0]
  }),
  /** True while the gizmo is being dragged (and just after), so releasing it isn't treated as a click. */
  gizmoBusy: false,
  /** True while (and just after) a box-select drag, so its release isn't treated as a click. */
  boxSelecting: false,
  /** True while a grab ball is held (hands, feet, hips, look-at point); other shortcuts stay quiet. */
  grabbing: false,
  /** True just after an Alt-drag (orbit, pan or look), so its release isn't a click. */
  suppressClick: false,
  /** True while flying a shot camera (right mouse held); other shortcuts stay quiet. */
  flying: false
}
